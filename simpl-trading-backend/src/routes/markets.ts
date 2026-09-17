import type { FastifyInstance } from "fastify";
import {
  getMarketPerformance,
  topBy,
  WINDOWS,
  type Window,
} from "../marketPerformance.js";
import { SP500 } from "../data/sp500.js";
import { RATE_LIMITS } from "../rateLimits.js";

/**
 * Public market-browsing routes behind the Education tab. Unauthenticated for
 * the same reason as routes/alpaca.ts — this is identical for every user and
 * derived from nothing session-specific.
 *
 * Every list here is ranked strictly inside the S&P 500 (data/sp500.ts). See
 * marketPerformance.ts for why that universe is the feature rather than a
 * whole-market screener.
 */

const PREVIEW_COUNT = 3;
const MAX_LIMIT = 100;

const parseWindow = (raw: string | undefined): Window =>
  (WINDOWS as readonly string[]).includes(raw ?? "") ? (raw as Window) : "1Y";

const clampLimit = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_LIMIT) : fallback;
};

/**
 * Sections we can't fill without a data source we don't have yet. Returned as
 * real structure rather than omitted, so the screen renders an honest "not
 * available" state instead of the section silently not existing — and so
 * wiring it up later is a data change, not a UI change.
 */
const UNAVAILABLE_SECTIONS = [
  {
    id: "largest-companies",
    title: "Largest Companies",
    subtitle: "Ranked by market capitalization",
    available: false as const,
    reason:
      "Ranking by market cap needs a market-cap feed for every symbol. Finnhub's free tier restricts company profiles to a small allowlist, so this stays empty until that plan is upgraded.",
  },
];

export async function marketsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Everything the Education screen needs to render all its section previews
   * in ONE call — the screen shows a handful of rows per section, so making it
   * fetch each section separately would be several round trips for one view.
   */
  app.get("/overview", RATE_LIMITS.marketsOverview, async () => {
    const perf = await getMarketPerformance();
    return {
      asOf: perf.asOf,
      universe: perf.universe,
      windows: WINDOWS,
      sections: {
        companies: {
          id: "companies",
          title: "The S&P 500",
          subtitle: `${perf.universe.size} of the largest US companies`,
          available: true,
          preview: SP500.slice(0, PREVIEW_COUNT),
          total: SP500.length,
        },
        sectors: {
          id: "sectors",
          title: "Sector Performance",
          subtitle: "How the 11 GICS sectors have moved",
          available: true,
          // Sorted best-first on the default window so the preview shows the
          // same three rows the expanded view opens with.
          preview: [...perf.sectors]
            .filter((s) => s.returns["1Y"] !== null)
            .sort((a, b) => (b.returns["1Y"] as number) - (a.returns["1Y"] as number))
            .slice(0, PREVIEW_COUNT),
          total: perf.sectors.length,
        },
        stocks: {
          id: "stocks",
          title: "Stock Performance",
          subtitle: "S&P 500 members by price return",
          available: true,
          preview: topBy(perf, "1Y", PREVIEW_COUNT),
          total: perf.universe.priced,
        },
      },
      unavailable: UNAVAILABLE_SECTIONS,
    };
  });

  /** Expanded "Stock Performance" — ?window=1M|3M|YTD|1Y&limit=n */
  app.get<{ Querystring: { window?: string; limit?: string } }>("/performance", RATE_LIMITS.markets, async (req) => {
    const perf = await getMarketPerformance();
    const window = parseWindow(req.query.window);
    return {
      asOf: perf.asOf,
      window,
      windows: WINDOWS,
      universe: perf.universe,
      results: topBy(perf, window, clampLimit(req.query.limit, 50)),
    };
  });

  /** Expanded "Sector Performance" — every sector, ranked on ?window. */
  app.get<{ Querystring: { window?: string } }>("/sectors", RATE_LIMITS.markets, async (req) => {
    const perf = await getMarketPerformance();
    const window = parseWindow(req.query.window);
    return {
      asOf: perf.asOf,
      window,
      windows: WINDOWS,
      // Equal-weighted, NOT cap-weighted — the standard sector index is
      // cap-weighted, and we have no market caps. Stated in the payload so the
      // screen can label it honestly rather than implying it matches an index.
      weighting: "equal" as const,
      results: [...perf.sectors].sort((a, b) => {
        const av = a.returns[window];
        const bv = b.returns[window];
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      }),
    };
  });

  /**
   * Expanded "The S&P 500" — the full constituent list, alphabetical, with
   * whatever performance we have. Paged because 503 rows is a lot to hand a
   * phone at once. ?sector= filters to one GICS sector.
   */
  app.get<{ Querystring: { limit?: string; offset?: string; sector?: string } }>(
    "/companies",
    RATE_LIMITS.markets,
    async (req) => {
      const perf = await getMarketPerformance();
      const bySymbol = new Map(perf.symbols.map((s) => [s.symbol, s]));

      const sector = req.query.sector?.trim();
      const filtered = sector ? SP500.filter((e) => e.sector === sector) : SP500;

      const offset = Math.max(0, Number(req.query.offset) || 0);
      const limit = clampLimit(req.query.limit, 50);

      return {
        asOf: perf.asOf,
        total: filtered.length,
        offset,
        limit,
        results: filtered.slice(offset, offset + limit).map((entry) => {
          const priced = bySymbol.get(entry.symbol);
          return {
            ...entry,
            lastPrice: priced?.lastPrice ?? null,
            returns: priced?.returns ?? null,
          };
        }),
      };
    },
  );
}
