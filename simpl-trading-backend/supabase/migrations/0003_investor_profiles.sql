-- Investment/employment/marital-status questionnaire, collected right after
-- KYC onboarding (see CLAUDE.md §11). Not SSN-level PII (§2/§9 still applies
-- to SSN, which is never stored here or anywhere in our DB) — this is
-- descriptive financial/employment data, comparable to a brokerage's
-- standard suitability/AML-adjacent recordkeeping fields. Mirrors the
-- alpaca_accounts pattern: owner can read their own row, but only the
-- backend's service-role key ever writes it (routes/me/investmentProfile.ts),
-- since it's also pushed to Alpaca via PATCH and the two must stay in sync.
--
-- Bundling the table, RLS, AND the grant in one migration this time — see
-- 0002_grants.sql's postmortem: splitting them caused a full outage because
-- RLS policies alone don't imply the base GRANT PostgREST needs.
create table public.investor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  annual_income_min bigint not null,
  annual_income_max bigint not null,
  total_net_worth_min bigint not null,
  total_net_worth_max bigint not null,
  liquid_net_worth_min bigint not null,
  liquid_net_worth_max bigint not null,
  time_horizon text not null,
  employment_status text not null,
  employer_name text,
  marital_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investor_profiles enable row level security;

create policy "investor_profiles are readable by owner"
  on public.investor_profiles for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated — same
-- reasoning as alpaca_accounts: this stays in sync with what was actually
-- sent to Alpaca, so only the backend writes it.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.investor_profiles to authenticated, service_role;
