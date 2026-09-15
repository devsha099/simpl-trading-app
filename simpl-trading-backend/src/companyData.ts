import { finnhub } from "./finnhub.js";
import {
  STATEMENT_LAYOUTS,
  type Frequency,
  type LineItem,
  type StatementKind,
  type Unit,
} from "./data/statementLayout.js";

/**
 * Per-symbol cache in front of Finnhub — company profile and fundamentals
 * change slowly, so there's no reason to hit Finnhub every time any user
 * opens a stock's Company Info/Financials tab. Same daily-refresh reasoning
 * as assetSearch.ts's tradable-assets cache, just keyed per symbol instead
 * of one bulk list (Finnhub has no bulk endpoint for either of these).
 *
 * Also the boundary that keeps the app decoupled from Finnhub's raw field
 * names (peBasicExclExtraTTM, etc., which have shifted shape before — see
 * github.com/finnhubio/Finnhub-API/issues/337) — routes/company.ts and the
 * app only ever see the curated shapes below.
 */
const REFRESH_MS = 24 * 60 * 60 * 1000;

export type CompanyProfile = {
  symbol: string;
  name: string;
  exchange: string | null;
  industry: string | null;
  ipo: string | null;
  marketCapitalization: number | null;
  shareOutstanding: number | null;
  webUrl: string | null;
  country: string | null;
  currency: string | null;
};

export type BasicFinancials = {
  symbol: string;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null; // percent, e.g. 1.42 means 1.42%
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  profitMargin: number | null; // percent
  revenuePerShare: number | null;
};

const profileCache = new Map<string, { data: CompanyProfile | null; at: number }>();
const financialsCache = new Map<string, { data: BasicFinancials | null; at: number }>();

const isFresh = (at: number) => Date.now() - at < REFRESH_MS;
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function getCompanyProfile(rawSymbol: string): Promise<CompanyProfile | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  const cached = profileCache.get(symbol);
  if (cached && isFresh(cached.at)) return cached.data;

  const raw = await finnhub.getCompanyProfile(symbol);
  // An empty `name` is Finnhub's real "no profile for this symbol" signal
  // (see finnhub.ts) — everything else is optional and rendered as "—".
  const data: CompanyProfile | null = raw.name
    ? {
        symbol,
        name: raw.name,
        exchange: raw.exchange ?? null,
        industry: raw.finnhubIndustry ?? null,
        ipo: raw.ipo ?? null,
        marketCapitalization: asNumber(raw.marketCapitalization),
        shareOutstanding: asNumber(raw.shareOutstanding),
        webUrl: raw.weburl ?? null,
        country: raw.country ?? null,
        currency: raw.currency ?? null,
      }
    : null;
  profileCache.set(symbol, { data, at: Date.now() });
  return data;
}

export async function getBasicFinancials(rawSymbol: string): Promise<BasicFinancials | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  const cached = financialsCache.get(symbol);
  if (cached && isFresh(cached.at)) return cached.data;

  const raw = await finnhub.getBasicFinancials(symbol);
  const m = raw.metric ?? {};
  // Deliberately a curated handful, not the ~100+ fields Finnhub returns —
  // dumping all of them onto a "calm, minimalist" screen (CLAUDE.md §1)
  // would just be a different flavor of the "dozens of metrics" this app
  // exists to avoid. A couple of common TTM/annual key-name variants are
  // tried per field since Finnhub's naming is inconsistent; a field that
  // isn't present comes back null and renders as "—", never a guess.
  const data: BasicFinancials | null =
    Object.keys(m).length > 0
      ? {
          symbol,
          peRatio: asNumber(m.peBasicExclExtraTTM ?? m.peTTM ?? m.peNormalizedAnnual),
          eps: asNumber(m.epsBasicExclExtraItemsTTM ?? m.epsInclExtraItemsTTM ?? m.epsTTM),
          dividendYield: asNumber(m.dividendYieldIndicatedAnnual ?? m.currentDividendYieldTTM),
          week52High: asNumber(m["52WeekHigh"]),
          week52Low: asNumber(m["52WeekLow"]),
          beta: asNumber(m.beta),
          profitMargin: asNumber(m.netProfitMarginTTM),
          revenuePerShare: asNumber(m.revenuePerShareTTM),
        }
      : null;
  financialsCache.set(symbol, { data, at: Date.now() });
  return data;
}

// --- full statements --------------------------------------------------------

export type StatementRow = {
  key: string;
  label: string;
  unit: Unit;
  indent: boolean;
  emphasis: "subtotal" | "total" | null;
  /** period-end date -> value, already in real units. */
  values: Record<string, number | null>;
};

export type StatementSection = { title: string | null; rows: StatementRow[] };

export type Statements = {
  symbol: string;
  statement: StatementKind;
  frequency: Frequency;
  title: string;
  /** Period-end dates, newest first. */
  periods: string[];
  sections: StatementSection[];
  memo: StatementRow[];
};

// A decade of history is far more than a phone screen needs, and 20+ period
// chips is a scroll, not a feature. Quarterly gets more entries for the same
// span of time.
const MAX_PERIODS: Record<Frequency, number> = { annual: 10, quarterly: 12 };

// Finnhub reports monetary figures and share counts in MILLIONS. Converting
// here — the single site — means nothing downstream carries the scale, the
// same rule §14 already sets for market cap.
const SCALE: Record<Unit, number> = {
  currency: 1_000_000,
  shares: 1_000_000,
  perShare: 1,
  ratio: 1,
};

const statementsCache = new Map<string, { data: Statements | null; at: number }>();

function buildRow(item: LineItem, periods: { period: string; raw: Record<string, unknown> }[]): StatementRow | null {
  const unit = item.unit ?? "currency";
  const values: Record<string, number | null> = {};
  let anyPresent = false;

  for (const { period, raw } of periods) {
    const n = asNumber(raw[item.key]);
    if (n !== null) anyPresent = true;
    values[period] = n === null ? null : n * SCALE[unit];
  }

  // A line item absent from EVERY period isn't rendered at all — a company
  // with no R&D shouldn't show an "R&D — " row implying the data is missing.
  // Absent in only some periods still renders, since a gap in a series is
  // real information.
  if (!anyPresent) return null;

  return {
    key: item.key,
    label: item.label,
    unit,
    indent: item.indent ?? false,
    emphasis: item.emphasis ?? null,
    values,
  };
}

export async function getStatements(
  rawSymbol: string,
  statement: StatementKind,
  frequency: Frequency,
): Promise<Statements | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  const cacheKey = `${symbol}:${statement}:${frequency}`;
  const cached = statementsCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.data;

  const raw = await finnhub.getFinancialStatements(symbol, statement, frequency);
  const reported = (raw.financials ?? [])
    .filter((p): p is typeof p & { period: string } => typeof p.period === "string")
    .slice(0, MAX_PERIODS[frequency]);

  let data: Statements | null = null;
  if (reported.length > 0) {
    const layout = STATEMENT_LAYOUTS[statement];
    const periods = reported.map((p) => ({ period: p.period, raw: p as Record<string, unknown> }));

    const sections = layout.sections
      .map((section) => ({
        title: section.title ?? null,
        rows: section.items
          .map((item) => buildRow(item, periods))
          .filter((r): r is StatementRow => r !== null),
      }))
      // A section whose every line item is absent disappears rather than
      // rendering an empty heading.
      .filter((section) => section.rows.length > 0);

    data = {
      symbol,
      statement,
      frequency,
      title: layout.title,
      periods: periods.map((p) => p.period),
      sections,
      memo: layout.memo.map((item) => buildRow(item, periods)).filter((r): r is StatementRow => r !== null),
    };
  }

  statementsCache.set(cacheKey, { data, at: Date.now() });
  return data;
}
