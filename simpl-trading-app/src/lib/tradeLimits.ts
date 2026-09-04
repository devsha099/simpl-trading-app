/**
 * Trade Limits option sets — mirrors the backend's data/tradeLimits.ts
 * (two npm projects, no shared package; same arrangement as usStates.ts).
 * Keep in sync.
 */

export const MARKET_CAP_OPTIONS = [
  { value: 10_000_000, label: "$10 million" },
  { value: 50_000_000, label: "$50 million" },
  { value: 100_000_000, label: "$100 million" },
  { value: 250_000_000, label: "$250 million" },
  { value: 500_000_000, label: "$500 million" },
  { value: 1_000_000_000, label: "$1 billion" },
  { value: 5_000_000_000, label: "$5 billion" },
  { value: 10_000_000_000, label: "$10 billion" },
  { value: 50_000_000_000, label: "$50 billion" },
  { value: 100_000_000_000, label: "$100 billion" },
] as const;

export const MAX_ROUND_TRADE_LIMIT = 10;

export type TradeLimits = {
  roundTradeLimit: number | null;
  minMarketCap: number | null;
  cooldownEnabled: boolean;
};

export type TradeLimitsState = {
  effective: TradeLimits;
  pending: TradeLimits | null;
  pendingEffectiveAt: string | null;
  roundTripsThisWeek: number | null;
};

export const NO_LIMITS: TradeLimits = {
  roundTradeLimit: null,
  minMarketCap: null,
  cooldownEnabled: false,
};

export const marketCapLabel = (dollars: number | null): string =>
  dollars === null
    ? "No limit"
    : MARKET_CAP_OPTIONS.find((o) => o.value === dollars)?.label ?? `$${dollars.toLocaleString("en-US")}`;

/** "Monday, Sep 7 at 9:30 AM ET" — when a deferred change goes live. */
export function formatEffectiveAt(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${day} at 9:30 AM ET`;
}
