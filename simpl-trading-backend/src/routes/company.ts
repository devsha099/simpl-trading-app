import type { FastifyInstance } from "fastify";
import { getBasicFinancials, getCompanyProfile, getStatements } from "../companyData.js";
import { FinnhubError } from "../finnhub.js";
import { isStatementKind, type Frequency, type StatementKind } from "../data/statementLayout.js";

/**
 * Company profile + fundamentals, under /api/company. Public, not
 * account-scoped — same reasoning as routes/alpaca.ts's market-data routes:
 * it's the same data for every user, nothing to authenticate. Backs the
 * stock screen's Company Info and Financials tabs (CLAUDE.md §5); Alpaca
 * itself provides neither (§13), so this goes through Finnhub instead — see
 * finnhub.ts and companyData.ts.
 *
 * Rate-limited tighter than the global default (see index.ts): Finnhub's
 * free tier is 60 calls/min for the ENTIRE app, and companyData.ts's 24h
 * cache only helps for repeated symbols — a client walking distinct tickers
 * misses the cache every time and would otherwise drain the whole quota
 * unauthenticated. 30/min still covers any plausible human browsing.
 */
const COMPANY_RATE_LIMIT = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

/**
 * Symbols the current Finnhub key can actually pull full statements for.
 *
 * TEMPORARY, and it lives here rather than in the app on purpose: it's a
 * property of the billing plan, not of the product, so it must be
 * changeable without shipping a mobile release. Delete this constant and the
 * `availableSymbols` field the moment the plan covers the whole market —
 * a stale allowlist that names symbols which no longer work (or omits ones
 * that now do) is worse than saying nothing.
 *
 * Measured against the live key, not assumed. Finnhub 403s identically for
 * "outside your plan" and "no such symbol," so this can't be derived from a
 * response — only probed.
 */
const STATEMENT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "WMT", "PFE"];

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { symbol: string } }>("/:symbol/profile", COMPANY_RATE_LIMIT, async (req, reply) => {
    try {
      const profile = await getCompanyProfile(req.params.symbol);
      if (!profile) {
        return reply.code(404).send({
          error: "no_profile",
          message: `No company info available for "${req.params.symbol.toUpperCase()}".`,
        });
      }
      return profile;
    } catch (err) {
      if (err instanceof FinnhubError && err.status === 0) {
        return reply.code(503).send({ error: "company_data_unavailable" });
      }
      throw err;
    }
  });

  app.get<{ Params: { symbol: string } }>("/:symbol/financials", COMPANY_RATE_LIMIT, async (req, reply) => {
    try {
      const financials = await getBasicFinancials(req.params.symbol);
      if (!financials) {
        return reply.code(404).send({
          error: "no_financials",
          message: `No financial data available for "${req.params.symbol.toUpperCase()}".`,
        });
      }
      return financials;
    } catch (err) {
      if (err instanceof FinnhubError && err.status === 0) {
        return reply.code(503).send({ error: "company_data_unavailable" });
      }
      throw err;
    }
  });

  /**
   * Full standardized statements — ?statement=ic|bs|cf&freq=annual|quarterly.
   * Returns EVERY available period in one response so the client can switch
   * years instantly instead of refetching per period.
   */
  app.get<{ Params: { symbol: string }; Querystring: { statement?: string; freq?: string } }>(
    "/:symbol/statements",
    COMPANY_RATE_LIMIT,
    async (req, reply) => {
      const symbol = req.params.symbol.toUpperCase();
      const requested = req.query.statement ?? "";
      const statement: StatementKind = isStatementKind(requested) ? requested : "ic";
      const frequency: Frequency = req.query.freq === "quarterly" ? "quarterly" : "annual";

      try {
        const statements = await getStatements(symbol, statement, frequency);
        if (!statements) {
          return reply.code(404).send({
            error: "no_statements",
            message: `No ${frequency} statements available for ${symbol}.`,
          });
        }
        return statements;
      } catch (err) {
        if (err instanceof FinnhubError) {
          if (err.status === 0) return reply.code(503).send({ error: "company_data_unavailable" });
          // Finnhub 403s BOTH for a symbol outside the plan's allowlist and
          // for one that doesn't exist, with an identical body — so this
          // can't claim the company is unknown. It reports the limit that is
          // actually knowable, and says which symbols do work rather than
          // leaving the user to guess by trial and error.
          if (err.status === 403) {
            return reply.code(402).send({
              error: "statements_not_in_plan",
              message: `Full statements aren't available for ${symbol} on the current Finnhub plan.`,
              availableSymbols: STATEMENT_SYMBOLS,
            });
          }
        }
        throw err;
      }
    },
  );
}
