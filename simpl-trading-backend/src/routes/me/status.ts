import type { FastifyInstance } from "fastify";
import { alpaca } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser, updateAccountStatus } from "../../db/accounts.js";

/**
 * Onboarding only ever writes account_status once, at creation time — nothing
 * else was polling Alpaca afterward, so a real approval (SUBMITTED -> ACTIVE)
 * never made it back into our own DB. The pending screen's "Check status" and
 * the app's router state machine both call this instead of reading the
 * (possibly stale) alpaca_accounts row directly, so they see Alpaca's live
 * status and self-heal the DB copy when it's changed.
 */
export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.id;

    const existing = await getAccountForUser(userId);
    if (!existing) {
      return reply.code(404).send({ error: "not_onboarded" });
    }

    const account = (await alpaca.getAccount(existing.alpacaAccountId)) as { status: string };

    if (account.status !== existing.accountStatus) {
      await updateAccountStatus(userId, account.status);
    }

    return reply.code(200).send({ status: account.status });
  });
}
