-- Core schema for Simpl Trading. auth.users is provided by Supabase automatically.
-- Every table has RLS enabled — see CLAUDE.md §9.

-- ---------------------------------------------------------------------------
-- profiles: non-sensitive display data only. Auto-created on signup (below).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);

-- Pulls first_name/last_name/phone out of the signup metadata passed via
-- supabase.auth.signUp({ options: { data: { first_name, last_name, phone } } }).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- alpaca_accounts: THE critical user -> brokerage account mapping.
-- Only the backend (service-role key, bypasses RLS) ever writes here.
-- Clients may only read their own row, to check onboarding/account status.
-- ---------------------------------------------------------------------------
create table public.alpaca_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alpaca_account_id text not null unique,
  account_status text not null,
  created_at timestamptz not null default now()
);

alter table public.alpaca_accounts enable row level security;

create policy "alpaca_accounts are readable by owner"
  on public.alpaca_accounts for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for the authenticated role.
-- A client that could write its own alpaca_account_id could point itself at
-- someone else's brokerage account. Only the backend's service-role key
-- (routes/me/onboarding.ts) may write this table.

-- ---------------------------------------------------------------------------
-- watchlists / watchlist_items: fully owned and managed by the client.
-- ---------------------------------------------------------------------------
create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;

create policy "watchlists are managed by owner"
  on public.watchlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  symbol text not null,
  added_at timestamptz not null default now(),
  unique (watchlist_id, symbol)
);

alter table public.watchlist_items enable row level security;

-- watchlist_items has no user_id of its own — ownership is checked through
-- the parent watchlist.
create policy "watchlist_items are managed by the watchlist owner"
  on public.watchlist_items for all
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- user_settings: one row per user, app preferences. Created lazily by the
-- client on first use (no signup trigger, unlike profiles).
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system',
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings are managed by owner"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
