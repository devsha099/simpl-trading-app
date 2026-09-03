-- RevenueCat entitlement mirror (CLAUDE.md §6/§16). Same read-only-for-owner
-- shape as alpaca_accounts/investor_profiles: the backend's RevenueCat
-- webhook (routes/webhooks/revenuecat.ts) is the ONLY writer, since this
-- must always reflect what RevenueCat/the App Store/Play Store actually
-- say, never what a client claims — a client that could write its own row
-- could just grant itself premium for free. The app reads this row directly
-- via RLS to gate premium features, no backend round trip needed per check.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- RevenueCat's own app_user_id for this customer. We configure the SDK to
  -- use the Supabase user id directly as app_user_id (see lib/purchases.ts),
  -- so today this always equals user_id — stored separately anyway in case
  -- a transfer/merge ever makes RevenueCat's id diverge from ours.
  revenuecat_app_user_id text not null,
  entitlement text not null,          -- RevenueCat entitlement identifier, e.g. "premium"
  -- Computed from expires_at at webhook time, not remembered from the event
  -- type (CANCELLATION doesn't mean "revoke now" — the user is still
  -- entitled until expiration; see routes/webhooks/revenuecat.ts) — this
  -- column is a cache of that computation, always re-derivable, same
  -- self-healing philosophy as alpaca_accounts' status sync.
  status text not null check (status in ('active', 'expired')),
  product_id text,                    -- the store product id (SKU) currently granting it, if any
  expires_at timestamptz,             -- null would mean a non-expiring grant; not expected in practice here
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions are readable by owner"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated — see the
-- comment above the table. Only the webhook's service-role key writes it.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.subscriptions to authenticated, service_role;
