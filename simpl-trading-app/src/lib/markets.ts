import { API_BASE } from "./api";

/**
 * Client types + fetchers for the Education tab's market sections
 * (backend: routes/markets.ts). Public data, so plain fetch — no session
 * token needed, same as the quotes/snapshots routes.
 */

export const WINDOWS = ["1M", "3M", "YTD", "1Y"] as const;
export type Window = (typeof WINDOWS)[number];

/** Short labels for the window switcher. "1Y" is the default everywhere. */
export const WINDOW_LABELS: Record<Window, string> = {
  "1M": "1 Month",
  "3M": "3 Months",
  YTD: "YTD",
  "1Y": "1 Year",
};

export type Returns = Record<Window, number | null>;

export type Company = { symbol: string; name: string; sector: string };

export type SymbolPerformance = Company & {
  lastPrice: number;
  returns: Returns;
};

export type SectorPerformance = {
  sector: string;
  count: number;
  returns: Returns;
};

export type CompanyRow = Company & {
  lastPrice: number | null;
  returns: Returns | null;
};

export type SectionId = "companies" | "sectors" | "stocks";

export type SectionMeta<T> = {
  id: SectionId;
  title: string;
  subtitle: string;
  available: true;
  preview: T[];
  total: number;
};

export type UnavailableSection = {
  id: string;
  title: string;
  subtitle: string;
  available: false;
  reason: string;
};

export type Overview = {
  asOf: string | null;
  universe: { name: string; size: number; priced: number };
  windows: readonly Window[];
  sections: {
    companies: SectionMeta<Company>;
    sectors: SectionMeta<SectorPerformance>;
    stocks: SectionMeta<SymbolPerformance>;
  };
  unavailable: UnavailableSection[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const fetchOverview = () => getJson<Overview>("/api/markets/overview");

export const fetchPerformance = (window: Window, limit = 50) =>
  getJson<{ asOf: string | null; window: Window; results: SymbolPerformance[] }>(
    `/api/markets/performance?window=${window}&limit=${limit}`,
  );

export const fetchSectors = (window: Window) =>
  getJson<{ asOf: string | null; window: Window; weighting: "equal"; results: SectorPerformance[] }>(
    `/api/markets/sectors?window=${window}`,
  );

export const fetchCompanies = (opts: { sector?: string; limit?: number; offset?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.sector) p.set("sector", opts.sector);
  p.set("limit", String(opts.limit ?? 50));
  p.set("offset", String(opts.offset ?? 0));
  return getJson<{ asOf: string | null; total: number; offset: number; results: CompanyRow[] }>(
    `/api/markets/companies?${p.toString()}`,
  );
};

/** "+12.4%" / "−3.1%" / "—". Always signed, so a gain never reads as a number. */
export const formatReturn = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export const formatPrice = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `$${v.toFixed(2)}`;

/** "as of Sep 10, 2026" — dates arrive as plain YYYY-MM-DD, no timezone. */
export function formatAsOf(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
