import type { FastifyInstance } from "fastify";
import { alpaca, AlpacaError } from "../../src/alpaca.js";
import { alpacaData } from "../../src/alpaca-data.js";

type Position = {
  symbol: string;
  qty: string;
  qty_available?: string;
  current_price: string;
};

/**
 * Routes under /api/alpaca. These are your first proof-of-life endpoints.
 * Later, real product routes (open account, fund, search, buy, sell) live here too.
 */
export async function alpacaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Connectivity test. Hit this first.
   * On a fresh sandbox it returns [] — an empty array means auth worked.
   * A 401 means your keys are wrong or missing.
   */
  app.get("/accounts", async () => {
    return alpaca.listAccounts();
  });

  /**
   * Creates a throwaway sandbox brokerage account so you have something to
   * fund and trade against in later steps. Sandbox only — do not expose this
   * shape to real users; real onboarding collects this data through your UI.
   */
  app.post("/test-account", async (_req, reply) => {
    const suffix = Date.now();
    const payload = {
      contact: {
        email_address: `test+${suffix}@example.com`,
        phone_number: "+15551234567",
        street_address: ["123 Main St"],
        city: "San Francisco",
        state: "CA",
        postal_code: "94105",
        country: "USA",
      },
      identity: {
        given_name: "Test",
        family_name: "User",
        date_of_birth: "1990-01-01",
        tax_id: "666-55-4321",
        tax_id_type: "USA_SSN",
        country_of_citizenship: "USA",
        country_of_birth: "USA",
        country_of_tax_residence: "USA",
        funding_source: ["employment_income"],
      },
      disclosures: {
        is_control_person: false,
        is_affiliated_exchange_or_finra: false,
        is_politically_exposed: false,
        immediate_family_exposed: false,
      },
      agreements: [
        {
          agreement: "customer_agreement",
          signed_at: new Date().toISOString(),
          ip_address: "127.0.0.1",
        },
      ],
    };

    const account = await alpaca.createAccount(payload);
    return reply.code(201).send(account);
  });

  // ---------------------------------------------------------------------------
  // Phase 1 core loop: check status -> fund -> buy -> hold
  // All routes take the Alpaca account id in the URL.
  // ---------------------------------------------------------------------------

  /**
   * Check onboarding/KYC status for one account.
   * Look for "status":"ACTIVE" — you must be ACTIVE before funding or trading.
   */
  app.get<{ Params: { id: string } }>("/accounts/:id", async (req) => {
    return alpaca.getAccount(req.params.id);
  });

  /**
   * Check tradable cash + buying power. Run this after funding to confirm the
   * money landed (look at "cash" and "buying_power").
   */
  app.get<{ Params: { id: string } }>("/accounts/:id/trading", async (req) => {
    return alpaca.getTradingAccount(req.params.id);
  });

  /**
   * Fund the account with sandbox virtual money.
   * Reuses an existing ACH relationship if one exists, otherwise creates a
   * test one. Optional JSON body: { "amount": "1000" }.
   */
  app.post<{ Params: { id: string }; Body: { amount?: string } }>(
    "/accounts/:id/fund",
    async (req, reply) => {
      const accountId = req.params.id;
      const amount = req.body?.amount ?? "1000";

      const existing = (await alpaca.listAchRelationships(accountId)) as
        | Array<{ id: string }>
        | undefined;

      let relationshipId: string;
      if (existing && existing.length > 0) {
        relationshipId = existing[0].id;
      } else {
        const rel = (await alpaca.createAchRelationship(accountId, {
          account_owner_name: "Test User",
          bank_account_type: "CHECKING",
          bank_account_number: "123456789012",
          bank_routing_number: "121000358",
          nickname: "Test Checking",
        })) as { id: string };
        relationshipId = rel.id;
      }

      const transfer = await alpaca.createTransfer(accountId, {
        transfer_type: "ach",
        relationship_id: relationshipId,
        amount,
        direction: "INCOMING",
      });
      return reply.code(201).send(transfer);
    },
  );

  /**
   * Latest best bid/ask for a symbol. The client polls this on an interval —
   * there's no push/streaming here, just a plain GET.
   */
  app.get<{ Params: { symbol: string } }>("/quotes/:symbol", async (req) => {
    return alpacaData.getLatestQuote(req.params.symbol);
  });

  /**
   * Latest best bid/ask for several symbols in one call, e.g. a watchlist.
   * ?symbols=AAPL,MSFT
   */
  app.get<{ Querystring: { symbols?: string } }>("/quotes", async (req, reply) => {
    const symbols = (req.query.symbols ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) {
      return reply.code(400).send({ error: "missing_symbols", message: "Provide ?symbols=A,B,C." });
    }
    return alpacaData.getLatestQuotes(symbols);
  });

  /**
   * Last traded price + %-change since previous close, for several symbols
   * in one call. ?symbols=AAPL,MSFT — used for watchlist rows.
   */
  app.get<{ Querystring: { symbols?: string } }>("/snapshots", async (req, reply) => {
    const symbols = (req.query.symbols ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) {
      return reply.code(400).send({ error: "missing_symbols", message: "Provide ?symbols=A,B,C." });
    }
    return alpacaData.getSnapshots(symbols);
  });

  /**
   * Place a fractional order — buy or sell, market/limit/stop. Accepts
   * EITHER a dollar amount (notional) or a share quantity (qty), never both.
   * Limit orders require limit_price; stop orders require stop_price.
   * Sells are checked against current holdings first — no short selling.
   * Note: fractional orders are day-only, and market/limit orders fill
   * during regular US market hours (9:30am–4pm ET, weekdays).
   */
  app.post<{
    Params: { id: string };
    Body: {
      symbol?: string;
      side?: "buy" | "sell";
      type?: "market" | "limit" | "stop";
      notional?: string;
      qty?: string;
      limit_price?: string;
      stop_price?: string;
    };
  }>("/accounts/:id/orders", async (req, reply) => {
    const accountId = req.params.id;
    const symbol = (req.body?.symbol ?? "AAPL").toUpperCase();
    const side = req.body?.side ?? "buy";
    const type = req.body?.type ?? "market";
    const { notional, qty, limit_price, stop_price } = req.body ?? {};

    if (side !== "buy" && side !== "sell") {
      return reply
        .code(400)
        .send({ error: "invalid_side", message: 'side must be "buy" or "sell".' });
    }
    if (!notional && !qty) {
      return reply
        .code(400)
        .send({ error: "invalid_amount", message: "Provide either notional or qty." });
    }
    if (notional && qty) {
      return reply
        .code(400)
        .send({ error: "invalid_amount", message: "Provide notional or qty, not both." });
    }
    if (type === "limit" && !limit_price) {
      return reply
        .code(400)
        .send({ error: "missing_limit_price", message: "Limit orders need a limit_price." });
    }
    if (type === "stop" && !stop_price) {
      return reply
        .code(400)
        .send({ error: "missing_stop_price", message: "Stop orders need a stop_price." });
    }

    const insufficientSharesError = {
      error: "insufficient_shares",
      message: `You don't have enough ${symbol} to sell that much.`,
    };

    if (side === "sell") {
      const positions = (await alpaca.getPositions(accountId)) as Position[];
      const position = positions.find((p) => p.symbol === symbol);
      const available = Number(position?.qty_available ?? position?.qty ?? 0);
      const requestedShares = qty
        ? Number(qty)
        : Number(notional) / Number(position?.current_price ?? NaN);

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

  /** View holdings for one account. */
  app.get<{ Params: { id: string } }>("/accounts/:id/positions", async (req) => {
    return alpaca.getPositions(req.params.id);
  });
}
