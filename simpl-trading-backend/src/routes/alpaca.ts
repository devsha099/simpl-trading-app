import type { FastifyInstance } from "fastify";
import { alpacaData } from "../alpaca-data.js";
import { lookupAsset, searchAssets } from "../assetSearch.js";

/**
 * Market-data routes under /api/alpaca. NOT account-scoped — quotes and
 * snapshots are the same for every user, so there's no session to derive
 * anything from and nothing sensitive to protect.
 *
 * The account-scoped dev routes that used to live here (test-account,
 * fund, orders-by-URL-id, etc.) were Phase 1 scaffolding, long superseded
 * by the session-derived /api/me/* routes — deleted 2026-08-11 when real
 * banking (/api/me/bank + /api/me/transfers) replaced the last of them.
 */
export async function alpacaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Latest best bid/ask + last trade for a symbol, with a `reliable` flag
   * (see alpaca-data.ts's isReliableQuote — filters odd-lot/implausibly-wide
   * ticks). The client polls this on an interval — there's no
   * push/streaming here, just a plain GET.
   */
  app.get<{ Params: { symbol: string } }>("/quotes/:symbol", async (req) => {
    return alpacaData.getQuoteDetail(req.params.symbol);
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
   * Ticker/company-name autocomplete for adding to a watchlist. ?q=ms
   * matches symbols and names starting with or containing the query,
   * ranked (exact symbol first). Empty query returns [] rather than 400 —
   * the client calls this reactively as the user types.
   */
  app.get<{ Querystring: { q?: string } }>("/assets/search", async (req) => {
    return searchAssets(req.query.q ?? "");
  });

  /**
   * Authoritative "does this ticker exist and is it tradable" check, used
   * right before adding a symbol to a watchlist (CLAUDE.md's stock-search
   * next-step, and the fix for untradable garbage like "BAAAAA" getting
   * added with no validation at all).
   */
  app.get<{ Params: { symbol: string } }>("/assets/:symbol", async (req, reply) => {
    const asset = await lookupAsset(req.params.symbol);
    if (!asset) {
      return reply.code(404).send({
        error: "unknown_symbol",
        message: `"${req.params.symbol.toUpperCase()}" isn't a recognized ticker.`,
      });
    }
    return asset;
  });
}
