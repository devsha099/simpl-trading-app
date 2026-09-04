import { getSupabaseAdmin } from "../supabase.js";
import { nextMarketOpenET } from "../marketTime.js";

/**
 * Trade Limits storage (CLAUDE.md §17), living on user_settings.
 *
 * Reads go through here rather than straight from the app because a stored
 * row isn't the same thing as the EFFECTIVE limits: a queued cooldown change
 * whose time has passed has to be folded in first. Keeping that resolution in
 * one server-side place means the enforcement path (trading.ts) and the
 * settings screen can never disagree about what's currently in force.
 */

export type TradeLimits = {
  /** null = no limit. 0 = open no new positions at all (a real choice, not "unset"). */
  roundTradeLimit: number | null;
  /** null = no limit. Whole dollars. */
  minMarketCap: number | null;
  cooldownEnabled: boolean;
};

export type TradeLimitsState = {
  effective: TradeLimits;
  /** A queued loosening that hasn't activated yet; null when nothing is pending. */
  pending: TradeLimits | null;
  pendingEffectiveAt: string | null;
};

const NO_LIMITS: TradeLimits = { roundTradeLimit: null, minMarketCap: null, cooldownEnabled: false };

type SettingsRow = {
  round_trade_limit: number | null;
  min_market_cap: number | string | null;
  limit_change_cooldown: boolean | null;
  pending_limits: TradeLimits | null;
  pending_effective_at: string | null;
};

const rowToLimits = (row: SettingsRow): TradeLimits => ({
  roundTradeLimit: row.round_trade_limit,
  // Postgres bigint arrives as a string through PostgREST once it exceeds the
  // safe-integer range in some driver paths — normalize before any comparison,
  // or "100000000000" > 50000000000 silently compares as strings.
  minMarketCap: row.min_market_cap === null ? null : Number(row.min_market_cap),
  cooldownEnabled: row.limit_change_cooldown ?? false,
});

/**
 * Current limits, with any matured pending change applied and cleared.
 *
 * The activation write is best-effort: if it fails we still RETURN the matured
 * values, so a DB hiccup can't leave a user's limits stuck in the past. The
 * next call simply tries again.
 */
export async function getTradeLimits(userId: string): Promise<TradeLimitsState> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .select("round_trade_limit, min_market_cap, limit_change_cooldown, pending_limits, pending_effective_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { effective: NO_LIMITS, pending: null, pendingEffectiveAt: null };

  const row = data as SettingsRow;
  const stored = rowToLimits(row);

  const matured =
    row.pending_limits !== null &&
    row.pending_effective_at !== null &&
    Date.parse(row.pending_effective_at) <= Date.now();

  if (matured && row.pending_limits) {
    const promoted = row.pending_limits;
    await getSupabaseAdmin()
      .from("user_settings")
      .update({
        round_trade_limit: promoted.roundTradeLimit,
        min_market_cap: promoted.minMarketCap,
        limit_change_cooldown: promoted.cooldownEnabled,
        pending_limits: null,
        pending_effective_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { effective: promoted, pending: null, pendingEffectiveAt: null };
  }

  return {
    effective: stored,
    pending: row.pending_limits,
    pendingEffectiveAt: row.pending_effective_at,
  };
}

/**
 * True when `next` is weaker protection than `current` in any dimension —
 * a higher (or removed) round-trade cap, a lower (or removed) market-cap
 * floor, or switching the cooldown itself off.
 *
 * Turning the cooldown off counts as loosening on purpose: if it could be
 * flipped off instantly it would be no commitment at all, just a checkbox in
 * front of the same impulse.
 */
export function isLoosening(current: TradeLimits, next: TradeLimits): boolean {
  const roundLoosened =
    current.roundTradeLimit !== null &&
    (next.roundTradeLimit === null || next.roundTradeLimit > current.roundTradeLimit);
  const capLoosened =
    current.minMarketCap !== null &&
    (next.minMarketCap === null || next.minMarketCap < current.minMarketCap);
  const cooldownLoosened = current.cooldownEnabled && !next.cooldownEnabled;
  return roundLoosened || capLoosened || cooldownLoosened;
}

/**
 * Apply a change, honoring the cooldown.
 *
 * With the cooldown off, or for a change that only tightens, this writes
 * straight through. With it on and the change loosening anything, the new
 * values are parked in pending_limits until the next market open and the
 * currently-effective limits stay untouched.
 */
export async function saveTradeLimits(
  userId: string,
  next: TradeLimits,
): Promise<TradeLimitsState> {
  const { effective: current } = await getTradeLimits(userId);
  const defer = current.cooldownEnabled && isLoosening(current, next);

  // Explicitly typed: the defer/immediate ternary otherwise infers a union
  // whose `pending_limits` is `TradeLimits | null` on one branch and `null` on
  // the other, which Supabase's upsert generic can't reconcile.
  type SettingsUpsert = {
    user_id: string;
    updated_at: string;
    round_trade_limit: number | null;
    min_market_cap: number | null;
    limit_change_cooldown: boolean;
    pending_limits: TradeLimits | null;
    pending_effective_at: string | null;
  };

  const base = { user_id: userId, updated_at: new Date().toISOString() };
  const payload: SettingsUpsert = defer
    ? {
        ...base,
        // Effective values deliberately untouched here.
        round_trade_limit: current.roundTradeLimit,
        min_market_cap: current.minMarketCap,
        limit_change_cooldown: current.cooldownEnabled,
        pending_limits: next,
        pending_effective_at: nextMarketOpenET().toISOString(),
      }
    : {
        ...base,
        round_trade_limit: next.roundTradeLimit,
        min_market_cap: next.minMarketCap,
        limit_change_cooldown: next.cooldownEnabled,
        // Any immediate change supersedes whatever was queued — otherwise a
        // stale pending payload would later clobber the value just set.
        pending_limits: null,
        pending_effective_at: null,
      };

  // upsert, not update: user_settings rows are created lazily (0001_init.sql),
  // so a user who never touched settings has no row yet.
  const { error } = await getSupabaseAdmin().from("user_settings").upsert(payload);
  if (error) throw error;

  return defer
    ? { effective: current, pending: next, pendingEffectiveAt: payload.pending_effective_at as string }
    : { effective: next, pending: null, pendingEffectiveAt: null };
}
