import { API_BASE } from "./api";

/**
 * Client types + formatters for the full financial statements behind the
 * stock screen's Financials tab (backend: routes/company.ts's /statements).
 *
 * The backend hands over sections, labels, ordering and units already
 * resolved, so nothing here knows a Finnhub field name — it only decides how
 * a number reads on screen.
 */

export const STATEMENTS = [
  { key: "ic", label: "Income" },
  { key: "bs", label: "Balance" },
  { key: "cf", label: "Cash Flow" },
] as const;

export type StatementKind = (typeof STATEMENTS)[number]["key"];
export type Frequency = "annual" | "quarterly";
export type Unit = "currency" | "shares" | "perShare" | "ratio";

export type StatementRow = {
  key: string;
  label: string;
  unit: Unit;
  indent: boolean;
  emphasis: "subtotal" | "total" | null;
  values: Record<string, number | null>;
};

export type StatementSection = { title: string | null; rows: StatementRow[] };

/** A node in the premium flow view. `kind` drives colour, nothing else. */
export type FlowNode = {
  id: string;
  label: string;
  kind: "stage" | "expense" | "income" | "loss" | "other";
  /** The filed figure for the label, when it differs from the bar's throughput (loss years). */
  reported?: number;
};
export type FlowLink = { source: string; target: string; value: number };
export type FlowGraph = { nodes: FlowNode[]; links: FlowLink[] };

export type Statements = {
  symbol: string;
  statement: StatementKind;
  frequency: Frequency;
  title: string;
  periods: string[];
  sections: StatementSection[];
  memo: StatementRow[];
  /** Per period; null when that period can't be drawn (see backend). */
  flow: Record<string, FlowGraph | null>;
};

export class StatementsUnavailable extends Error {
  constructor(
    message: string,
    /** True when the data exists but this Finnhub plan can't reach it. */
    public planLimited: boolean,
    /**
     * Symbols the plan does cover, when the backend says so. Comes from the
     * server rather than being hardcoded here: it's a billing-plan fact, and
     * a list baked into a shipped binary would need an app release to correct.
     */
    public availableSymbols: string[] = [],
  ) {
    super(message);
  }
}

export async function fetchStatements(
  symbol: string,
  statement: StatementKind,
  frequency: Frequency,
): Promise<Statements> {
  const res = await fetch(
    `${API_BASE}/api/company/${encodeURIComponent(symbol)}/statements?statement=${statement}&freq=${frequency}`,
  );
  if (res.ok) return (await res.json()) as Statements;

  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    availableSymbols?: string[];
  } | null;
  throw new StatementsUnavailable(
    body?.message ?? "Statements aren’t available for this company.",
    body?.error === "statements_not_in_plan",
    body?.availableSymbols ?? [],
  );
}

/**
 * Compact, human-readable money — "$94.83B", not "94,827" under an "(in
 * millions)" header. Real filings use the latter, but this app's reader is
 * someone who left day trading, not an analyst (§1), and a suffix they can
 * read at a glance beats a scale note at the top of the page they have to
 * remember while scanning forty rows.
 */
function compactMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const n = Math.abs(v);
  if (n >= 1e12) return `${sign}$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}$${(n / 1e3).toFixed(1)}K`;
  return `${sign}$${n.toFixed(0)}`;
}

function compactCount(v: number): string {
  const sign = v < 0 ? "-" : "";
  const n = Math.abs(v);
  if (n >= 1e9) return `${sign}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}${(n / 1e3).toFixed(1)}K`;
  return `${sign}${n.toFixed(0)}`;
}

export function formatValue(v: number | null, unit: Unit): string {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "currency":
      return compactMoney(v);
    case "shares":
      return compactCount(v);
    case "perShare":
      return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
    case "ratio":
      return v.toFixed(2);
  }
}

/** "Dec 2025" for annual, "Q2 2026" for quarterly — short enough for a chip. */
export function formatPeriod(iso: string, frequency: Frequency): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  if (frequency === "annual") {
    const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    // Most fiscal years end in December; naming the month matters only when
    // one doesn't (Apple's ends in September, Walmart's in January).
    return m === 12 ? String(y) : `${month} ${y}`;
  }
  return `Q${Math.ceil(m / 3)} ${y}`;
}

export function formatPeriodLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
