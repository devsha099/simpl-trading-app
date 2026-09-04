/**
 * Trade Limits option sets (CLAUDE.md §17). Mirrored — not shared — in the
 * app's lib/tradeLimits.ts, same arrangement as usStates.ts and
 * financialProfile.ts (two npm projects, no shared package). Keep in sync.
 */

/** Market-cap floors, in whole dollars. The backend compares against these directly. */
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

export const VALID_MARKET_CAPS = new Set<number>(MARKET_CAP_OPTIONS.map((o) => o.value));

export const MAX_ROUND_TRADE_LIMIT = 10;

/** Compact display for a dollar figure, e.g. 1_000_000_000 -> "$1B". */
export function formatMarketCap(dollars: number): string {
  if (dollars >= 1_000_000_000_000) return `$${(dollars / 1_000_000_000_000).toFixed(2)}T`;
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(dollars % 1_000_000_000 === 0 ? 0 : 1)}B`;
  return `$${Math.round(dollars / 1_000_000)}M`;
}
