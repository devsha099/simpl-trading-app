-- 0001_init.sql defined RLS policies but never granted the baseline table
-- privileges PostgREST needs before RLS is even evaluated — GRANTs and RLS
-- policies are independent, additive checks; a policy can't substitute for
-- a missing GRANT. Result: every query 403'd with "permission denied for
-- table X" (Postgres error 42501), service_role included, even though
-- service_role is meant to bypass RLS entirely.
--
-- Safe to grant broadly here: RLS still enforces row-level access on top of
-- this. alpaca_accounts in particular has no insert/update/delete POLICY for
-- authenticated (see 0001_init.sql's comment) — granting the privilege here
-- does not undermine that, since RLS-enabled tables deny all rows by default
-- until a matching policy allows them, regardless of the table-level grant.
--
-- No grants to `anon`: every table in this schema requires a logged-in user.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.profiles,
  public.alpaca_accounts,
  public.watchlists,
  public.watchlist_items,
  public.user_settings
to authenticated, service_role;
