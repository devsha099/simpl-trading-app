import type { FastifyInstance } from "fastify";
import { getBasicFinancials, getCompanyProfile } from "../companyData.js";
import { FinnhubError } from "../finnhub.js";

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
}
