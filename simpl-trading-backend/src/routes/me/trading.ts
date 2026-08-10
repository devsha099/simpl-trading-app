import type { FastifyInstance } from "fastify";
import { alpaca, AlpacaError } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser } from "../../db/accounts.js";

type Position = {
  symbol: string;
  qty: string;
  qty_available?: string;
  current_price: string;
};

/**
 * Session-derived trading data and actions — the Alpaca account id is
 * ALWAYS looked up from req.user.id via alpaca_accounts, never accepted from
 * the client (the security boundary, CLAUDE.md §3). Replaces the URL-based
 * /api/alpaca/accounts/:id/* routes (dev-only, hardcoded ACCOUNT_ID) for
 * real per-user use — see CLAUDE.md §11's "ownership and personalization"
 * milestone. routes/alpaca.ts is removed once nothing depends on it anymore.
 */
export async function tradingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/account", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });
    return alpaca.getTradingAccount(account.alpacaAccountId);
  });

  /** Current holdings. */
  app.get("/positions", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });
    return alpaca.getPositions(account.alpacaAccountId);
  });

  /**
   * Orders. ?status=open (default) | closed | all — closed is what the
   * Trade History screen uses (filled/canceled/expired orders).
   */
  app.get<{ Querystring: { status?: string } }>("/orders", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });
    const status = req.query.status === "closed" || req.query.status === "all" ? req.query.status : "open";
    return alpaca.getOrders(account.alpacaAccountId, status);
  });

  /**
   * Place a fractional order — buy or sell, market/limit/stop. Same
   * validation as the old URL-based route: notional XOR qty, limit/stop
   * orders need their price, sells are checked against current holdings
   * first (no short selling).
   */
  app.post<{
    Body: {
      symbol?: string;
      side?: "buy" | "sell";
      type?: "market" | "limit" | "stop";
      notional?: string;
      qty?: string;
      limit_price?: string;
      stop_price?: string;
    };
  }>("/orders", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });
    const accountId = account.alpacaAccountId;

    const symbol = (req.body?.symbol ?? "").toUpperCase();
    const side = req.body?.side ?? "buy";
    const type = req.body?.type ?? "market";
    const { notional, qty, limit_price, stop_price } = req.body ?? {};

    if (!symbol) {
      return reply.code(400).send({ error: "missing_symbol", message: "Provide a symbol." });
    }
    if (side !== "buy" && side !== "sell") {
      return reply.code(400).send({ error: "invalid_side", message: 'side must be "buy" or "sell".' });
    }
    if (!notional && !qty) {
      return reply.code(400).send({ error: "invalid_amount", message: "Provide either notional or qty." });
    }
    if (notional && qty) {
      return reply.code(400).send({ error: "invalid_amount", message: "Provide notional or qty, not both." });
    }
    if (type === "limit" && !limit_price) {
      return reply.code(400).send({ error: "missing_limit_price", message: "Limit orders need a limit_price." });
    }
    if (type === "stop" && !stop_price) {
      return reply.code(400).send({ error: "missing_stop_price", message: "Stop orders need a stop_price." });
    }

    const insufficientSharesError = {
      error: "insufficient_shares",
      message: `You don't have enough ${symbol} to sell that much.`,
    };

    if (side === "sell") {
      const positions = (await alpaca.getPositions(accountId)) as Position[];
      const position = positions.find((p) => p.symbol === symbol);
      const available = Number(position?.qty_available ?? position?.qty ?? 0);
      const requestedShares = qty ? Number(qty) : Number(notional) / Number(position?.current_price ?? NaN);

      if (!position || !Number.isFinite(requestedShares) || requestedShares > available) {
        return reply.code(400).send(insufficientSharesError);
      }
    }

    const order: Record<string, string> = {
      symbol,
      side,
      type,
      time_in_force: "day",
      ...(qty ? { qty } : { notional: notional as string }),
      ...(limit_price ? { limit_price } : {}),
      ...(stop_price ? { stop_price } : {}),
    };

    try {
      const result = await alpaca.createOrder(accountId, order);
      return reply.code(201).send(result);
    } catch (err) {
      if (side === "sell" && err instanceof AlpacaError) {
        const bodyText = JSON.stringify(err.body).toLowerCase();
        if (bodyText.includes("insufficient")) {
          return reply.code(400).send(insufficientSharesError);
        }
      }
      throw err;
    }
  });
}
