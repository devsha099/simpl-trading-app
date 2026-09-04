-- Trade Limits (CLAUDE.md §17): user-set guardrails against exactly the
-- behavior §1 exists to discourage — weekly churn and going all-in on
-- micro-caps. Columns hang off the existing user_settings rather than a new
-- table: it already has the right RLS shape for this ("for all" scoped to the
-- owner), and these ARE user preferences.
--
-- Unlike alpaca_accounts/subscriptions, the owner is allowed to WRITE these:
-- it's a self-imposed limit, not an adversarial control, and the Reset button
-- requires it. The commitment mechanism is the cooldown below, not RLS.
--
-- No new GRANT needed — 0002 already granted on public.user_settings, and a
-- table-level grant covers columns added later. RLS likewise applies to the
-- whole row. (Still stating that explicitly here so the next person doesn't
-- have to re-derive it — see 0002's postmortem for why that matters.)

alter table public.user_settings
  -- NULL = no limit. 0 is meaningfully DIFFERENT from NULL: it means "open no
  -- new positions at all," which is a legitimate thing to choose.
  add column if not exists round_trade_limit smallint
    check (round_trade_limit is null or (round_trade_limit >= 0 and round_trade_limit <= 10)),
  -- NULL = no limit. Stored in whole DOLLARS (10000000 = $10M), not Finnhub's
  -- millions unit — the conversion happens once, at the comparison site, so
  -- this column never depends on a third party's unit convention.
  add column if not exists min_market_cap bigint
    check (min_market_cap is null or min_market_cap > 0),
  -- When true, changes that LOOSEN protection are queued instead of applied
  -- (see pending_limits). Tightening always applies immediately — delaying a
  -- user's own protection at the moment they reach for it would be backwards.
  add column if not exists limit_change_cooldown boolean not null default false,
  -- The queued change, as {roundTradeLimit, minMarketCap, cooldown}. NULL when
  -- nothing is pending. jsonb rather than a parallel set of pending_* columns
  -- so "what's queued" stays one atomic value that can't half-apply.
  add column if not exists pending_limits jsonb,
  add column if not exists pending_effective_at timestamptz;

-- Both halves of a queued change must be present or absent together; a pending
-- payload with no effective time would never activate, and vice versa.
alter table public.user_settings
  drop constraint if exists user_settings_pending_limits_paired;
alter table public.user_settings
  add constraint user_settings_pending_limits_paired
  check ((pending_limits is null) = (pending_effective_at is null));
