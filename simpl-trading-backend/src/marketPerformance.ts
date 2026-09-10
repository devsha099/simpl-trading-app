import { alpacaData, type DailyBar } from "./alpaca-data.js";
import { GICS_SECTORS, SP500, SP500_SYMBOLS } from "./data/sp500.js";

/**
 * Price performance for the S&P 500 and its sectors, computed from Alpaca
 * daily bars — the data behind the Education tab's market sections.
 *
 * Deliberately NOT a "top gainers" feed. Alpaca's own screener/movers endpoint
 * works, but what it actually returns is penny stocks and warrants (measured
 * live: a warrant at $0.0276 up 176%, another at $0.39 up 95%) — precisely the
 * micro-caps that Trade Limits' market-cap floor exists to keep users away
 * from (CLAUDE.md §17). Ranking inside a fixed large-cap universe makes that
 * structurally impossible rather than relying on a filter someone might relax.
 */

export const WINDOWS = ["1M", "3M", "YTD", "1Y"] as const;
export type Window = (typeof WINDOWS)[number];

export type Returns = Record<Window, number | null>;

export type SymbolPerformance = {
  symbol: string;
  name: string;
  sector: string;
  lastPrice: number;
  returns: Returns;
};

export type SectorPerformance = {
  sector: string;
  /** How many index members had enough history to price this sector. */
  count: number;
  returns: Returns;
};

export type MarketPerformance = {
  computedAt: string;
  asOf: string | null;
  universe: { name: string; size: number; priced: number };
  symbols: SymbolPerformance[];
  sectors: SectorPerformance[];
};

// Daily bars only change once a day, after the close. Six hours keeps a
// long-running server current without re-pulling ~500 symbols per request.
const TTL_MS = 6 * 60 * 60 * 1000;
// A year of daily bars is ~252 rows; 10,000 per page / 252 ≈ 39 symbols, so
// 100 costs about three pages per batch and keeps the request count sane.
const BATCH_SIZE = 100;

/** UTC date `months` before `from`, clamped so Mar 31 → Feb 28, not Mar 3. */
function monthsBefore(from: Date, months: number): Date {
  const d = new Date(from);
  const targetMonth = d.getUTCMonth() - months;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfTarget));
  return d;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The last close at or before `date`. Bars are ascending, and markets close
 * on weekends and holidays, so an anchor almost never lands on a trading day —
 * walking back to the previous session is the point, not a fallback.
 */
function closeAsOf(bars: DailyBar[], date: string): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= date) {
      found = bars[mid].close;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function computeReturns(bars: DailyBar[], now: Date): { lastPrice: number; returns: Returns } | null {
  if (bars.length === 0) return null;
  const lastPrice = bars[bars.length - 1].close;
  if (!(lastPrice > 0)) return null;

  const anchors: Record<Window, string> = {
    "1M": iso(monthsBefore(now, 1)),
    "3M": iso(monthsBefore(now, 3)),
    // YTD is measured from the last close of LAST year, not Jan 1 — Jan 1 is
    // never a trading day, and the first session of the year already contains
    // some of the move being measured.
    YTD: `${now.getUTCFullYear() - 1}-12-31`,
    "1Y": iso(monthsBefore(now, 12)),
  };

  const returns = {} as Returns;
  for (const w of WINDOWS) {
    const base = closeAsOf(bars, anchors[w]);
    // No base means the history doesn't reach back that far (a recent
    // listing, or an index addition we have no prior bars for). Null, not
    // zero — "we can't say" is not "it didn't move".
    returns[w] = base && base > 0 ? ((lastPrice - base) / base) * 100 : null;
  }
  return { lastPrice, returns };
}

/** Equal-weighted mean of the members that priced, per window. */
function aggregateSectors(symbols: SymbolPerformance[]): SectorPerformance[] {
  return GICS_SECTORS.map((sector) => {
    const members = symbols.filter((s) => s.sector === sector);
    const returns = {} as Returns;
    for (const w of WINDOWS) {
      const values = members.map((m) => m.returns[w]).filter((v): v is number => v !== null);
      returns[w] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    return { sector, count: members.length, returns };
  });
}

async function compute(): Promise<MarketPerformance> {
  const now = new Date();
  // A month of slack before the 1Y anchor so the binary search always has a
  // bar to walk back to, even across a long holiday stretch.
  const start = iso(monthsBefore(now, 13));

  const bars: Record<string, DailyBar[]> = {};
  for (let i = 0; i < SP500_SYMBOLS.length; i += BATCH_SIZE) {
    const batch = SP500_SYMBOLS.slice(i, i + BATCH_SIZE);
    Object.assign(bars, await alpacaData.getDailyBars(batch, start));
  }

  const symbols: SymbolPerformance[] = [];
  let asOf: string | null = null;

  for (const entry of SP500) {
    const rows = bars[entry.symbol];
    if (!rows?.length) continue;
    const computed = computeReturns(rows, now);
    if (!computed) continue;
    const latest = rows[rows.length - 1].date;
    if (!asOf || latest > asOf) asOf = latest;
    symbols.push({ ...entry, ...computed });
  }

  return {
    computedAt: new Date().toISOString(),
    asOf,
    universe: { name: "S&P 500", size: SP500.length, priced: symbols.length },
    symbols,
    sectors: aggregateSectors(symbols),
  };
}

let cache: MarketPerformance | null = null;
let cachedAt = 0;
// Concurrent first-hits share one refresh instead of each firing ~15 batched
// Alpaca requests of their own.
let inFlight: Promise<MarketPerformance> | null = null;

export async function getMarketPerformance(): Promise<MarketPerformance> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = compute()
    .then((result) => {
      cache = result;
      cachedAt = Date.now();
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  try {
    return await inFlight;
  } catch (err) {
    // A stale answer beats no answer for a browsing screen — only surface the
    // failure when there's nothing cached to fall back on.
    if (cache) return cache;
    throw err;
  }
}

/** Top `limit` performers over one window, best first. */
export function topBy(perf: MarketPerformance, window: Window, limit: number): SymbolPerformance[] {
  return perf.symbols
    .filter((s) => s.returns[window] !== null)
    .sort((a, b) => (b.returns[window] as number) - (a.returns[window] as number))
    .slice(0, limit);
}
