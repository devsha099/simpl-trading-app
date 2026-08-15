import type { FastifyInstance } from "fastify";
import { alpaca, AlpacaError } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser } from "../../db/accounts.js";
import { getSupabaseAdmin } from "../../supabase.js";
import { createTransferSchema, linkBankSchema } from "../../schemas/banking.js";

/**
 * Banking: link/unlink a bank (Alpaca ACH relationship) and move money
 * (Alpaca transfers). Same security shape as trading.ts — the Alpaca
 * account id is ALWAYS derived from req.user.id, and the client never
 * sees an Alpaca relationship id or full bank account number (masked to
 * last 4 before anything leaves this file).
 *
 * Nothing here is stored in our DB: bank links and transfer history live
 * at Alpaca and are fetched live, exactly like holdings (CLAUDE.md §3).
 */

type AchRelationship = {
  id: string;
  status: string; // QUEUED | APPROVED | PENDING | REJECTED | CANCEL_REQUESTED
  bank_account_type?: string;
  bank_account_number?: string;
  nickname?: string;
  created_at?: string;
};

type AlpacaTransfer = {
  id: string;
  status: string;
  amount: string;
  direction: "INCOMING" | "OUTGOING";
  created_at: string;
  reason?: string | null;
};

/** Relationship statuses that count as "this account has a linked bank". */
const LIVE_RELATIONSHIP_STATUSES = new Set(["QUEUED", "APPROVED", "PENDING"]);

/** Transfers Alpaca still lets us cancel (not yet sent to clearing). */
const CANCELABLE_TRANSFER_STATUSES = new Set(["QUEUED", "APPROVAL_PENDING", "PENDING"]);

async function findLiveRelationship(accountId: string): Promise<AchRelationship | null> {
  const relationships = (await alpaca.listAchRelationships(accountId)) as AchRelationship[];
  return relationships.find((r) => LIVE_RELATIONSHIP_STATUSES.has(r.status)) ?? null;
}

/** What the app sees of a bank link — never the full account number or Alpaca id. */
function toBankView(rel: AchRelationship) {
  return {
    nickname: rel.nickname ?? "Linked bank",
    bankAccountType: rel.bank_account_type ?? "CHECKING",
    last4: (rel.bank_account_number ?? "").slice(-4),
    status: rel.status,
    createdAt: rel.created_at ?? null,
  };
}

/**
 * Collapse Alpaca's nine transfer statuses into the four the UI shows.
 * Raw status rides along for detail views/debugging.
 */
function transferBucket(status: string): "pending" | "complete" | "rejected" | "canceled" {
  if (status === "COMPLETE") return "complete";
  if (status === "REJECTED" || status === "RETURNED") return "rejected";
  if (status === "CANCELED") return "canceled";
  return "pending"; // QUEUED, APPROVAL_PENDING, PENDING, SENT_TO_CLEARING, APPROVED
}

function toTransferView(t: AlpacaTransfer) {
  return {
    id: t.id,
    direction: t.direction === "INCOMING" ? "deposit" : "withdraw",
    amount: t.amount,
    status: transferBucket(t.status),
    rawStatus: t.status,
    cancelable: CANCELABLE_TRANSFER_STATUSES.has(t.status),
    reason: t.reason ?? null,
    createdAt: t.created_at,
  };
}

export async function bankingRoutes(app: FastifyInstance): Promise<void> {
  /** The linked bank account, or { bank: null } if none is linked. */
  app.get("/bank", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const rel = await findLiveRelationship(account.alpacaAccountId);
    return { bank: rel ? toBankView(rel) : null };
  });

  /**
   * Link a bank by routing + account number. Alpaca allows one active ACH
   * relationship per account, so an existing live link is a 409 — the app
   * tells the user to remove the current bank first.
   */
  app.post("/bank", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const parsed = linkBankSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const input = parsed.data;

    const existing = await findLiveRelationship(account.alpacaAccountId);
    if (existing) {
      return reply.code(409).send({
        error: "bank_already_linked",
        message: "A bank account is already linked. Remove it before adding a new one.",
      });
    }

    // Owner name comes from the signed-up profile, never the client — a
    // session can only ever link a bank under its own verified identity.
    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", req.user!.id)
      .single();
    if (profileError || !profile?.first_name || !profile?.last_name) {
      return reply.code(400).send({
        error: "incomplete_profile",
        message: "Your profile is missing a name. Complete sign up first.",
      });
    }

    const rel = (await alpaca.createAchRelationship(account.alpacaAccountId, {
      account_owner_name: `${profile.first_name} ${profile.last_name}`,
      bank_account_type: input.bankAccountType,
      bank_account_number: input.accountNumber,
      bank_routing_number: input.routingNumber,
      ...(input.nickname ? { nickname: input.nickname } : {}),
    })) as AchRelationship;

    return reply.code(201).send({ bank: toBankView(rel) });
  });

  /** Unlink the bank. The relationship id is looked up, never client-sent. */
  app.delete("/bank", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const rel = await findLiveRelationship(account.alpacaAccountId);
    if (!rel) {
      return reply.code(404).send({ error: "no_bank_linked", message: "No bank account is linked." });
    }

    await alpaca.deleteAchRelationship(account.alpacaAccountId, rel.id);
    return { ok: true };
  });

  /** Deposit/withdrawal history, newest first. */
  app.get("/transfers", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const transfers = (await alpaca.listTransfers(account.alpacaAccountId)) as AlpacaTransfer[];
    // Sort on parsed time, not the raw string: Alpaca returns UTC ("...Z")
    // from the list endpoint but an offset ("...-04:00") from create, and
    // those two formats don't compare correctly as strings.
    return transfers
      .slice()
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(toTransferView);
  });

  /**
   * Move money. Deposits pull from the linked bank; withdrawals push to it,
   * capped at cash_withdrawable — Alpaca's already-settled (T+1) figure —
   * so unsettled proceeds can't be pulled out. Alpaca enforces the same
   * rule; checking here just turns it into a clear message instead of a
   * raw rejection.
   */
  app.post("/transfers", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const parsed = createTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { direction, amount } = parsed.data;

    const rel = await findLiveRelationship(account.alpacaAccountId);
    if (!rel) {
      return reply.code(400).send({
        error: "no_bank_linked",
        message: "Link a bank account before transferring money.",
      });
    }

    if (direction === "withdraw") {
      const trading = (await alpaca.getTradingAccount(account.alpacaAccountId)) as {
        cash_withdrawable?: string;
      };
      const withdrawable = Number(trading.cash_withdrawable ?? 0);
      if (Number(amount) > withdrawable) {
        return reply.code(400).send({
          error: "insufficient_settled_cash",
          message: `Only $${withdrawable.toFixed(2)} has settled and is available to withdraw. Sale proceeds settle the next business day (T+1).`,
        });
      }
    }

    try {
      const transfer = (await alpaca.createTransfer(account.alpacaAccountId, {
        transfer_type: "ach",
        relationship_id: rel.id,
        amount,
        direction: direction === "deposit" ? "INCOMING" : "OUTGOING",
        timing: "immediate",
      })) as AlpacaTransfer;
      return reply.code(201).send(toTransferView(transfer));
    } catch (err) {
      // Surface Alpaca's own insufficient-funds rejection as the same clear
      // message as the pre-check (covers races where settled cash moved
      // between our check and Alpaca's).
      if (err instanceof AlpacaError && direction === "withdraw") {
        const bodyText = JSON.stringify(err.body).toLowerCase();
        if (bodyText.includes("insufficient") || bodyText.includes("withdrawable")) {
          return reply.code(400).send({
            error: "insufficient_settled_cash",
            message: "That's more than your settled cash. Sale proceeds settle the next business day (T+1).",
          });
        }
      }
      throw err;
    }
  });

  /**
   * Cancel a transfer that hasn't reached clearing. The id names one of the
   * USER'S OWN transfers by construction — Alpaca scopes the delete to the
   * session-derived account, so someone else's transfer id just 404s.
   */
  app.delete<{ Params: { id: string } }>(
    "/transfers/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const account = await getAccountForUser(req.user!.id);
      if (!account) return reply.code(404).send({ error: "not_onboarded" });

      try {
        await alpaca.cancelTransfer(account.alpacaAccountId, req.params.id);
      } catch (err) {
        if (err instanceof AlpacaError && err.status === 404) {
          return reply.code(404).send({
            error: "not_cancelable",
            message: "This transfer can't be canceled — it may already be processing.",
          });
        }
        throw err;
      }
      return { ok: true };
    },
  );
}
