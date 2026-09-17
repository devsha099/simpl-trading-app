-- Abuse limits on the tables the APP WRITES DIRECTLY (watchlists,
-- watchlist_items, user_settings). These never pass through our backend, so
-- Fastify's rate limiter cannot see them at all — RLS proves *who* you are,
-- and until now nothing bounded *how much* you could write as yourself.
--
-- A signed-in bot could previously store a 10 MB watchlist name, a ticker
-- of arbitrary junk, or a million rows, and every one of those is a valid
-- RLS write. Postgres is the only place that can stop it, so the rules live
-- here rather than in client validation a bot simply skips.
--
-- Limits are deliberately far above real use (a person with 50 watchlists is
-- already unusual) — the point is a ceiling, not a product constraint.

-- ---------------------------------------------------------------------------
-- Shape constraints
-- ---------------------------------------------------------------------------

-- Existing rows could violate these, so clean up before constraining.
-- Neither table has ever had a UI path that produces an over-long value, so
-- in practice this touches nothing; it just makes the migration safe to run.
update public.watchlists set name = left(btrim(name), 60) where length(btrim(name)) > 60;
update public.watchlists set name = 'Watchlist' where btrim(name) = '';
delete from public.watchlist_items where symbol !~ '^[A-Z0-9][A-Z0-9.\-/]{0,9}$';

alter table public.watchlists drop constraint if exists watchlists_name_len;
alter table public.watchlists add constraint watchlists_name_len
  check (length(name) between 1 and 60 and btrim(name) <> '');

-- Matches a real ticker (BRK/B and BF.B included) and nothing else. Alpaca's
-- own asset list is the functional gate in the app; this is the backstop for
-- a client that skips it.
alter table public.watchlist_items drop constraint if exists watchlist_items_symbol_shape;
alter table public.watchlist_items add constraint watchlist_items_symbol_shape
  check (symbol ~ '^[A-Z0-9][A-Z0-9.\-/]{0,9}$');

-- ---------------------------------------------------------------------------
-- Row-count ceilings
-- ---------------------------------------------------------------------------
-- A CHECK can't count other rows, so these are BEFORE INSERT triggers.
-- SECURITY DEFINER so the count isn't itself filtered by the caller's RLS
-- policy (a user can only see their own rows, which is exactly what we're
-- counting — but making it explicit keeps the limit correct if policies
-- ever change). search_path is pinned: a SECURITY DEFINER function with a
-- caller-controlled search_path is a privilege-escalation hole.

create or replace function public.enforce_watchlist_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.watchlists where user_id = new.user_id) >= 50 then
    raise exception 'watchlist_limit_reached'
      using hint = 'A single account may hold at most 50 watchlists.';
  end if;
  return new;
end;
$$;

drop trigger if exists watchlists_count_limit on public.watchlists;
create trigger watchlists_count_limit
  before insert on public.watchlists
  for each row execute function public.enforce_watchlist_count();

create or replace function public.enforce_watchlist_item_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.watchlist_items where watchlist_id = new.watchlist_id) >= 200 then
    raise exception 'watchlist_item_limit_reached'
      using hint = 'A single watchlist may hold at most 200 symbols.';
  end if;
  return new;
end;
$$;

drop trigger if exists watchlist_items_count_limit on public.watchlist_items;
create trigger watchlist_items_count_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_item_count();

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
-- Owner-writable by design (§17: a self-imposed limit isn't an adversarial
-- control). The trade-limit columns already have CHECKs from 0005; this
-- bounds the free-form JSON beside them, which had none. 4 KB is far more
-- than the handful of keys saveTradeLimits writes.
alter table public.user_settings drop constraint if exists user_settings_pending_size;
alter table public.user_settings add constraint user_settings_pending_size
  check (pending_limits is null or pg_column_size(pending_limits) <= 4096);
