import { config } from "./config.js";

/**
 * Thin client for Finnhub's REST API — company profile + basic fundamentals,
 * the two things Alpaca doesn't provide at all (no company metadata beyond
 * symbol/name/exchange, and zero fundamentals data at any tier — see
 * CLAUDE.md §13). Isolated in its own file for the same reason as
 * alpaca.ts/alpaca-data.ts: a future data-vendor swap only touches one file.
 *
 * Free tier: 60 calls/min, but Finnhub's own terms restrict it to
 * personal/non-commercial use — fine for building and testing against, but
 * a paid plan (Starter or above) is required before this goes in front of
 * real subscribers. Confirm the exact commercial/redistribution terms in
 * writing before production, same caution CLAUDE.md §13 already applies to
 * Alpaca's partner tier.
 */
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export class FinnhubError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Finnhub request failed: ${status}`);
  }
}

async function finnhubFetch(path: string): Promise<unknown> {
  if (!config.finnhubApiKey) {
    // Distinct from a real Finnhub failure so routes/company.ts can tell
    // "not configured" apart from "Finnhub rejected/errored" and reply with
    // a clearer status either way.
    throw new FinnhubError(0, { error: "finnhub_not_configured" });
  }

  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${FINNHUB_BASE_URL}${path}${separator}token=${config.finnhubApiKey}`);

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    throw new FinnhubError(res.status, body);
  }
  return body;
}

// Raw Finnhub response shapes — only the fields we actually read. Finnhub
// returns `{}` (200 OK, not 404) for a symbol it has no data for, so the
// caller checks for a missing `name`/`metric` to detect "not found" rather
// than relying on the HTTP status.
export type RawCompanyProfile = {
  name?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  marketCapitalization?: number; // millions USD, per Finnhub's convention
  shareOutstanding?: number; // millions of shares
  weburl?: string;
  country?: string;
  currency?: string;
};

export type RawBasicFinancials = {
  metric?: Record<string, number | string | undefined>;
};

/**
 * One period of a standardized statement. `period` is the period-end date
 * (YYYY-MM-DD); every other key is a line item whose name is consistent
 * ACROSS companies — that consistency is the whole reason this endpoint is
 * used instead of `financials-reported`, whose raw us-gaap concepts differ
 * per filer (a bank's balance sheet shares almost no keys with a retailer's).
 * The key set still varies per company — a company with no R&D simply has no
 * `researchDevelopment` key — so every read is optional.
 */
export type RawStatementPeriod = { period?: string; year?: number } & Record<
  string,
  number | string | undefined
>;

export type RawFinancialStatements = { financials?: RawStatementPeriod[] };

export const finnhub = {
  getCompanyProfile: (symbol: string) =>
    finnhubFetch(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`) as Promise<RawCompanyProfile>,

  getBasicFinancials: (symbol: string) =>
    finnhubFetch(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`) as Promise<RawBasicFinancials>,

  /**
   * Standardized income statement / balance sheet / cash flow.
   *
   * A PAID endpoint, and a narrow one on the current key: it 403s for any
   * symbol outside the plan's allowlist, and 403s identically for a symbol
   * that doesn't exist — so a rejection here can't be read as "no such
   * company" (see routes/company.ts, which surfaces it as a plan limit).
   */
  getFinancialStatements: (symbol: string, statement: string, freq: string) =>
    finnhubFetch(
      `/stock/financials?symbol=${encodeURIComponent(symbol)}&statement=${statement}&freq=${freq}`,
    ) as Promise<RawFinancialStatements>,
};
