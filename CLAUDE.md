# Simpl Trading — Project Context

Standing context for every session. Read before doing anything. Captures what we're
building, why, decisions already made, and traps to avoid. Keep it updated as decisions
change — but keep entries terse: one clause of "why," not a paragraph of narration.

---

## 1. What this is

Simpl Trading is a **minimalist, buy-and-hold stock brokerage app**. The product thesis
is calm, simple, long-term investing — the opposite of gamified, dopamine-driven
day-trading apps.

- **Target users:** people who lost money day-trading and want to stop, plus people who
  believe in simple index-and-hold investing.
- **Core loop:** search a stock → buy it → hold it. That's the whole app.
- **Deliberately NOT included:** advanced charts, dozens of metrics, options, margin,
  day-trading tooling, social feeds, anything that encourages frequent trading.
- **Business model:** subscription via RevenueCat — **$6.99/mo or $49.99/yr** (set
  2026-09-15, superseding the earlier ~$20–30/yr figure; the display prices live in
  one constant, `lib/premium.ts`). Not aiming to be a billion-dollar company; a
  sustainable app with tens of thousands of users is the goal.

Minimalism is the product and the brand — the *product* stays narrow, not the UI.

**Visual identity: "Terminal Amber."** One deliberately-chosen dark theme (no light
mode) — warm near-black ground (`#15120c`), one amber accent, inspired by phosphor
ticker terminals (Quotron/Bloomberg-era), not a generic "dark mode." Gains/losses stay
conventional green/rust (semantic, separate from the brand accent). Type: **Zilla Slab**
(display), **IBM Plex Sans** (body/UI), **IBM Plex Mono** (every number, so figures line
up like a ledger). Two motifs used sparingly: `components/HazyText.tsx` (chromatic
double-shadow on hero text) and `components/SpectrumStripe.tsx` (stripe bar + logo
mark). All tokens live in `lib/theme.ts` — never hardcode a hex value or font name.

---

## 2. Regulatory stance (CRITICAL — do not drift from this)

We are a **technology/marketing layer on top of Alpaca's Broker API.** Alpaca is the
registered, self-clearing broker-dealer (FINRA/SIPC) and does all the regulated work:
custody, clearing, settlement, KYC/AML, regulatory reporting.

**We are NOT a broker-dealer and NOT an RIA.** To keep it that way:

- **Strictly self-directed. NO advice, NO recommendations, NO trading signals.** No
  "this stock is a buy," no AI signals, no personalized suggestions — that triggers
  RIA/broker-dealer registration.
- **No "AI-powered" or predictive marketing claims** (SEC enforces "AI washing" —
  only claims we can substantiate).
- **Do NOT promote day trading.**
- **Security marketing must be accurate.** "Funds held by a regulated, SIPC-member
  broker" is true. Never imply SIPC covers market losses (it doesn't).

If a feature edges toward advice or promoting active trading, flag it rather than
building it.

---

## 3. Architecture

Three layers. The app NEVER talks to Alpaca directly and NEVER holds Alpaca keys.

```
[ Mobile app ]  →  [ Our backend ]  →  [ Alpaca Broker API ]
 React Native       Node + Fastify        brokerage
 (no secrets)        (holds keys)
       │
       └────────→  [ Supabase ]  (auth + our own data, direct)
```

**Data ownership split:**
- **Identity/auth →** Supabase Auth.
- **Our own app data** (profile display, watchlists, settings, subscription status) →
  Supabase Postgres, accessed **directly by the app** under RLS.
- **Money/brokerage** (account creation, funding, orders, positions, prices) → always
  **our backend → Alpaca**. The app never calls Alpaca.
- **KYC PII** (SSN etc.) → passed through the backend to Alpaca and **discarded**.
  Never stored in our DB.
- **Subscription billing →** RevenueCat + Apple/Google, mirrored into Supabase via webhook.

**Security boundary (never violate):** the app never sends an Alpaca account ID. The
backend always derives it from the logged-in user's session token, then looks it up in
the DB. A user can only ever act on their own account.

---

## 4. The router state machine

On every launch, the root layout decides where the user goes, in order:

1. Not logged in → welcome/auth.
2. Logged in, no Alpaca account row → onboarding (KYC).
3. Has an account, status ≠ `ACTIVE`, no `investor_profiles` row → investment/employment
   questionnaire (fills the review wait instead of a dead pending screen).
4. Has an account + questionnaire row, status ≠ `ACTIVE` → pending screen.
5. `ACTIVE` → main app. Checked BEFORE step 3, so an approved account is never sent
   back for the questionnaire.

Resilient to quitting mid-flow: routing reads real state, not a linear assumption.
Implemented in `src/app/_layout.tsx` + `src/hooks/useAuthState.ts` (a `useSegments()`
guard redirecting on every auth-state change). Onboarding-complete and
pending-becomes-active are NOT Supabase auth events, so those screens call `refresh()`
and navigate directly instead of relying on the listener (§12).

---

## 5. App layout (v1)

- **Welcome** → philosophy + Log In / Sign Up.
- **Sign Up** → email, password, name, phone (Supabase auth + OTP-code email
  verification — §12).
- **Onboarding (KYC)** → DOB, address, citizenship, SSN, disclosures → creates the
  Alpaca cash account via our backend.
- **Investment/Employment questionnaire** → income/net-worth brackets, time horizon,
  employment, marital status → fills the Alpaca-review wait.
- **Pending** → shown until Alpaca approves (`ACTIVE`).
- **Main app — bottom tab bar, 4 tabs:**
  - **Watchlists** (default landing) — multiple named lists; a list opens to its
    ticker rows (last price + %-change); tapping a ticker opens the stock screen.
  - **Account** — portfolio value + cash, nav title shows the real Alpaca brokerage
    number ("#335725994 Cash Account"); sub-screens **Holdings** (positions + P/L, tap
    to trade), **Orders** (open), **Trade History** (closed), **Banking**.
  - **Banking** (under Account) — cash + settled-cash, linked-bank card, **Transfer
    Money** / **Withdraw Money** / **Add-Remove Bank Account**, transfer history with
    a status pill (Pending/Complete/Rejected/Canceled) and per-row cancel. Wire
    transfers out of scope (sandbox is ACH-only).
  - **Education** — a search box, the (still-empty) video shelf, then Webull-style
    scroll sections each showing 3 preview rows with the rest behind "See all":
    **The S&P 500** (browse/filter by sector), **Sector Performance**, **Stock
    Performance** (1M/3M/YTD/1Y switcher). **Largest Companies** renders as a
    deliberate "not available" card — ranking by market cap needs a cap feed we
    don't have (§14). See §18. Formerly "Research"; will also hold
    financial-education videos.
  - **Settings** — read-only **Profile** + Sign Out.
- **The stock screen** — reached from a watchlist row, a Holdings row, or Education's
  search, one screen per symbol with a 3-way switcher: **Company Info**, **Trade**
  (landing tab — bid/ask, order form, Buy/Sell, Your Position card), **Financials**
  (full income statement / balance sheet / cash flow, own sub-switcher — §19). Plus a
  **+ Watchlist** button in the header (§18). Company Info/Financials come from
  Finnhub, not Alpaca (Alpaca has no fundamentals data — §13).

---

## 6. Product decisions (locked)

- **Cash accounts only** (not margin) — fits buy-and-hold, avoids margin/day-trading
  rules. Confirm the default with Alpaca before production.
- **KYC handled by Alpaca**, not us. We store only the Alpaca account ID + status.
- **Never store SSN/KYC PII** — pass through to Alpaca, discard.
- **Pending until status = ACTIVE** (polled on launch/demand for MVP; move to Alpaca
  account-status events later).
- **Buys/sells support dollars AND shares** (UI toggle) — backend sends Alpaca either
  `notional` or `qty`, never both.
- **Selling is allowed** (a hard lock was dropped as legally risky) but kept quiet in
  the UI. Backend checks current holdings and rejects an oversell — no short selling.
- **Order types: Market, Limit, Stop Loss.** A deliberate step beyond pure "buy and
  hold," confirmed with the founder as a brand-fit call, not a regulatory one (standard
  execution mechanics, not advice). Limit needs `limit_price`; Stop needs `stop_price`.
- **Extended-hours trading** — Regular/Extended Hours toggle, Limit orders only
  (Alpaca rejects `extended_hours` on anything else); resets to Regular whenever the
  order type leaves Limit. Fills 4:00 AM–8:00 PM ET. Flagged as in real tension with
  the "people trying to stop day trading" audience (pre/after-hours reacting is
  active-trading behavior) but built on specific founder instruction. Revisit if it
  starts to feel like coaching users toward after-hours catalysts.
- **Banking is Alpaca ACH, one linked bank at a time** (Alpaca allows exactly one
  active relationship; a second create 409s, so the UI is "your linked bank," never a
  list). Typed routing/account number today; the same endpoint accepts a Plaid
  `processor_token` later without a redesign. Withdrawals capped at Alpaca's
  `cash_withdrawable` (T+1-settled). Nothing about banking is stored in our DB.
- **The account's identity is Alpaca's own brokerage number** ("#XXXXXXXXX Cash
  Account") — we don't mint our own ID or mirror it into our DB (no security benefit,
  just a second copy that can drift).
- **Investment-profile data is KYC-adjacent, not casual app data**: pushed to Alpaca
  via PATCH first, saved locally only if accepted, so the two can't drift.
- **Subscription ($6.99/mo · $49.99/yr) via RevenueCat** gates premium *app features*
  (IAP-required) — NOT the trading itself (a real-world service, IAP-exempt).
  Entitlement mirrored to Supabase via webhook. First gated feature: **Simpl
  Financials** (§20), behind a custom Terminal Amber paywall rather than RevenueCat's
  hosted UI.
- **Donations deprioritized** (awkward on mobile stores); subscription is the revenue
  pillar.

---

## 7. Tech stack

**Backend** (`simpl-trading-backend/`) — Node 20+, TypeScript, Fastify, NodeNext/ESM
(`"type": "module"`). Alpaca client: native `fetch` + HTTP Basic auth.
Installed: `@supabase/supabase-js`, `zod`, `@fastify/cors`, `@fastify/rate-limit`.
`npm audit`: 0 vulnerabilities.

**Mobile app** (`simpl-trading-app/`) — React Native/Expo, TypeScript, expo-router
(screens under `src/app/`, not `app/`). Installed: `@supabase/supabase-js`,
`@react-native-async-storage/async-storage`, `react-native-url-polyfill`,
`react-hook-form`+`zod`+`@hookform/resolvers`, `@react-native-picker/picker`,
`expo-font`+`expo-asset`, `expo-dev-client`+`react-native-purchases` (RevenueCat —
installing this ended Expo Go compatibility, §12), `react-native-svg` (via `expo
install`) + `d3-sankey` (the Simpl Financials flow view, §20). `expo-secure-store` is installed but
not yet wired into the Supabase auth storage adapter (still AsyncStorage).
Still planned: `@tanstack/react-query`, `nativewind`, `react-native-purchases-ui` (only
if the hosted Paywall UI is chosen over custom — §15). Later: Plaid.
App's 31 `npm audit` advisories are left unpatched on purpose — all are transitive
**build-time** deps of Expo tooling (postcss, image-size, xmldom), not in the shipped
bundle, and the only fix jumps an Expo SDK line (the exact break §12 warns about).
Re-check when the project next moves SDK lines.

**Data/services** — Supabase (Postgres+Auth+RLS, project `avhnfuffwevdcwapkmnh`).
Alpaca Broker API (sandbox now). Resend (custom SMTP for auth emails, domain
`simplapp.us`, verified). Finnhub (company profile + fundamentals, free tier only so
far — confirm commercial terms before production, §14).

---

## 8. File structure

```
workspace/
├── CLAUDE.md
├── simpl-trading-backend/
│   ├── src/
│   │   ├── index.ts              Fastify server, CORS, rate limiting, error handling
│   │   ├── config.ts             env loading/validation
│   │   ├── alpaca.ts             Alpaca Broker API client (Basic auth)
│   │   ├── alpaca-data.ts        Alpaca Market Data client (different host/auth style)
│   │   ├── assetSearch.ts        ticker/company search + tradable check, in-memory
│   │   │                         cache of ~13.3k tradable assets, refreshed daily
│   │   ├── finnhub.ts            Finnhub REST client (company profile + fundamentals)
│   │   ├── companyData.ts        24h per-symbol cache in front of finnhub.ts
│   │   ├── supabase.ts           admin client (service-role key), lazily validated
│   │   ├── auth.ts               preHandler: verify session token, attach req.user
│   │   ├── db/
│   │   │   ├── accounts.ts       user's alpaca_account_id + status
│   │   │   ├── investorProfiles.ts
│   │   │   └── subscriptions.ts  RevenueCat entitlement mirror (webhook-only writer)
│   │   ├── data/
│   │   │   ├── usStates.ts       mirrored (not shared) in the app's lib/usStates.ts
│   │   │   └── financialProfile.ts  income/net-worth brackets, mirrored in app's lib/
│   │   ├── schemas/               onboarding.ts, investmentProfile.ts (zod)
│   │   └── routes/
│   │       ├── me/
│   │       │   ├── onboarding.ts, status.ts, investmentProfile.ts, kycDetails.ts
│   │       │   ├── trading.ts     GET account/positions/orders + POST orders
│   │       │   └── banking.ts     /bank + /transfers
│   │       ├── alpaca.ts         public market-data routes (quotes/snapshots/assets)
│   │       ├── company.ts        public /api/company/:symbol/{profile,financials}
│   │       └── webhooks/revenuecat.ts  only writer of public.subscriptions
│   ├── supabase/migrations/
│   │   └── 0001_init … 0005_trade_limits.sql   all applied (0004+0005 on 2026-09-01)
│   ├── .env / .env.example
│   └── package.json / tsconfig.json
└── simpl-trading-app/
    ├── src/app/
    │   ├── _layout.tsx           router state machine (§4); index.tsx is a loading stub
    │   ├── (auth)/               no tab bar — welcome, login, signup, verify-email,
    │   │                         forgot/reset-password, onboarding, investment-profile,
    │   │                         pending. Each has a "Not you? Sign out" escape hatch.
    │   └── (tabs)/               bottom tab bar — hides entirely on any sub-route one
    │       │                     level past a tab's root (§12)
    │       ├── watchlists/       index -> [watchlistId]/index -> stock/[symbol]
    │       ├── account/          index -> holdings/orders/trade-history/banking/[symbol]
    │       ├── education/       index -> [section] -> stock/[symbol] (§18). Gained
    │       │                     its own _layout.tsx, so its tab route name changed
    │       │                     from "education/index" to "education" (§12).
    │       └── settings/         index -> profile
    ├── src/lib/
    │   ├── api.ts                API_BASE (self-resolving, §12) + apiFetch()
    │   ├── supabase.ts           anon-key client; never throws on missing config
    │   ├── purchases.ts          RevenueCat SDK setup — configures with the Supabase
    │   │                         user id as app_user_id, called from useAuthState
    │   ├── passwordRules.ts, financialProfile.ts, usStates.ts, banking.ts, theme.ts
    ├── src/context/AuthStateContext.tsx   the ONE shared useAuthState() instance
    ├── src/hooks/
    │   ├── useAuthState.ts       router state machine's data (§4)
    │   ├── useWatchlists.ts      Supabase-backed; loads on FOCUS not just mount (each
    │   │                         screen holds its own copy, unlike useAuthState)
    │   └── useEntitlement.ts     `{isPremium, loading}` from public.subscriptions via
    │                             RLS — built, not called from anywhere yet (§15)
    ├── src/components/           FormField, SelectField, PasswordRequirements,
    │   │                         OrderList, ToggleField, HazyText, SpectrumStripe
    ├── src/screens/               full screens shared across routes (thin route files
    │   │                         re-export these — §12's sibling-segment pattern)
    │   ├── StockScreen.tsx       owns the route param/title/SafeAreaView + 3-way
    │   │                         switcher + KeyboardAvoidingView
    │   ├── TradeScreen.tsx       the Trade pane — dropdown order form (Side/Order
    │   │                         Type/Trading Hours, SelectField, all start
    │   │                         unselected), single Buy/Sell button (vibrant
    │   │                         colors.buyGreen/sellRed) gated on every visible
    │   │                         dropdown being chosen. Amount starts empty with a
    │   │                         live "Amount left to invest"/"Max quantity" caption.
    │   │                         client_order_id idempotency key held in a ref (§12).
    │   ├── CompanyInfoPane.tsx, FinancialsPane.tsx   Finnhub-backed panes (§14)
    └── app.json / package.json / tsconfig.json
```

`(auth)`/`(tabs)` include literal parentheses (expo-router route groups, no URL
segment). Layout files must be `_layout.tsx`. **Typed routes are disabled**
(`app.json`) — caused a shipped nav bug and a typecheck failure for no real benefit at
this size; `router.push()` takes plain strings.

---

## 9. Database schema (Supabase Postgres)

`auth.users` is automatic. Around it, every table has RLS enabled:

- **profiles** — first_name, last_name, phone. Auto-created by a DB trigger on signup.
- **alpaca_accounts** — user_id → alpaca_account_id, account_status. THE mapping from
  user to brokerage account. **Read-only for the owner** — no insert/update/delete
  policy for `authenticated` at all; only the backend's service-role key writes it
  (a client that could rewrite its row could point itself at someone else's account).
- **watchlists**, **watchlist_items** (no `user_id` of its own — ownership via the
  parent watchlist's RLS policy).
- **user_settings** — preferences.
- **investor_profiles** — the questionnaire (income/net-worth as min/max brackets,
  time horizon, employment, marital status). Same read-only-for-owner shape as
  alpaca_accounts, kept in sync with what was PATCHed to Alpaca.
- **subscriptions** — user_id, revenuecat_app_user_id, entitlement, status
  ('active'|'expired'), product_id, expires_at. Same shape again: only the RevenueCat
  webhook writes it.

No table for KYC PII or holdings — PII passes through to Alpaca and is discarded;
holdings live at Alpaca and are fetched live. `GET /api/me/kyc-details` fetches
address/DOB on-demand for the Profile screen, never returning `tax_id`.

Migrations 0001–0005 are all applied to the real project (0004 and 0005 on
2026-09-01). See §12 for why GRANTs and RLS are both required (a migration that adds
RLS without the base GRANT 403s everything).

---

## 10. Backend API

- `GET /health`

**Public, unauthenticated** (same data for every user — `routes/alpaca.ts`,
`routes/company.ts`):
- `GET /api/alpaca/quotes/:symbol` — bid/ask + last trade + `reliable` flag (§13).
- `GET /api/alpaca/quotes?symbols=`, `/api/alpaca/snapshots?symbols=` — batched.
- `GET /api/alpaca/assets/search?q=` — ticker/company autocomplete, capped at 6.
- `GET /api/alpaca/assets/:symbol` — exists-and-tradable check; 404 if not. The
  authoritative gate before anything reaches a watchlist.
- `GET /api/markets/overview` — every Education section's preview in one call.
  `/performance?window=&limit=`, `/sectors?window=`, `/companies?sector=&limit=&offset=`
  are the expanded views. All ranked inside the S&P 500 only (§18).
- `GET /api/company/:symbol/profile`, `/financials` — Finnhub-backed (§14). 404 if no
  data, 503 if `FINNHUB_API_KEY` unset. Rate-limited 30/min (Finnhub's own cap is
  60/min for the whole app).
- `GET /api/company/:symbol/statements?statement=ic|bs|cf&freq=annual|quarterly` — full
  standardized statements, all periods in one response (§19). **402** with
  `availableSymbols` when the symbol is outside the Finnhub plan's allowlist.

**User-aware** (account id always derived from `req.user.id`):
- `POST /api/me/onboard` — idempotent KYC submission; name/phone/email come from
  `profiles`/session, never the client.
- `GET /api/me/status` — re-checks Alpaca live and syncs `alpaca_accounts` if changed.
- `POST /api/me/investment-profile` — PATCHes Alpaca first, saves locally only if
  accepted.
- `GET /api/me/account`, `/positions`, `/orders?status=open|closed|all`.
- `POST /api/me/orders` — notional XOR qty; limit/stop need their price;
  `extended_hours` only with `type:"limit"` (400 otherwise); sells checked against
  holdings (no short selling). Optional `client_order_id` idempotency key (≤128
  chars) — a repeat comes back `409 duplicate_order` instead of a second real order
  (§12). Rate-limited 20/min.
- `GET /api/me/kyc-details` — address+DOB only, never `tax_id`.
- `GET /api/me/bank` — masked to `{nickname, type, last4, status}`, never the full
  number or Alpaca's relationship id. `POST` links (409 if one's already linked,
  owner name from `profiles`); `DELETE` unlinks.
- `GET /api/me/transfers` — Alpaca's 9 statuses collapsed to
  `pending|complete|rejected|canceled`. `POST` moves money (withdrawals pre-checked
  against `cash_withdrawable`); `DELETE /:id` cancels one. Rate-limited 10/min.

**Server-to-server** — `POST /api/webhooks/revenuecat`, the only writer of
`public.subscriptions`; authenticated by a shared secret header, not Supabase auth.

**Rate limiting** (`@fastify/rate-limit`): global 300/min keyed on user id (or IP),
tighter caps above. `/health` and `/api/webhooks/*` are exempt — throttling either
causes worse failures than it prevents. Verified live (35 requests → 30 through, 5
clean 429s).

---

## 11. Current state

Phases 1–2 complete (Alpaca sandbox core loop; Supabase auth/KYC/per-user ownership).
Every screen is session-derived — no hardcoded account id, no on-device-only data.

**Known gaps:**
- No way to delete an entire watchlist (only individual symbols).
- `@tanstack/react-query` not wired in — watchlists work via plain `useState`.
- SUBMITTED→ACTIVE sandbox sync is proven to self-heal, but a real Alpaca-side
  approval landing on its own hasn't been directly observed.
- Banking: no wire transfers (sandbox is ACH-only), no Plaid login yet.
- A REJECTED/RETURNED transfer's styling has never been seen against real data
  (sandbox can't force an ACH failure) — code path exists, only
  Pending/Complete/Canceled confirmed.
- Education/markets: verified live, but "Largest Companies" is deliberately empty and
  Finnhub coverage now breaks §17's market-cap floor (§14, §17) — both pending the
  Finnhub plan decision.
- Company Info/Financials: Finnhub's free-tier rate limit (60/min) hasn't been
  stress-tested — fine for dev, revisit before real traffic.
- RevenueCat: `useEntitlement()` now gates Simpl Financials (§20), but a purchase can't
  complete until §15's external accounts exist, and there's been no real device
  purchase test. The test account is seeded premium directly in `public.subscriptions`.

**Immediate next steps:**
1. Wire `@tanstack/react-query` into watchlists.
2. Real Education content, Profile editing, subscription paywall (in progress — see §15
   for what's still an open decision).
3. Level 2/order-book depth deliberately NOT built — Alpaca has no depth data at any
   tier for equities; anything resembling one would be fabricated. Revisit only with a
   direct exchange feed (a separate, expensive product).
4. Banking follow-ons when they matter: Plaid, wire transfers, recurring deposits.

---

## 12. Conventions & gotchas (READ THESE — they cause the most wasted time)

- **Secrets never on the device; account id from the session, never the client.**
- **NodeNext imports use `.js` extensions even for `.ts` files** — correct, not a bug.
- **`API_BASE` (`lib/api.ts`) self-resolves** via `Constants.expoConfig.hostUri` (the
  host Expo/Metro used to reach this device) — web→localhost, emulator→localhost/
  10.0.2.2, physical device→whatever reached it over the QR code. A hardcoded LAN IP
  used to go stale on every network change; don't reintroduce one. If a physical
  device still can't reach the backend: reload (recomputes `API_BASE`), then check for
  an active VPN (blocks/reroutes LAN traffic, looks identical to a firewall problem).
- **CORS `methods` must be listed explicitly** — `@fastify/cors` defaults to
  GET/HEAD/POST only, so a browser preflight silently rejects DELETE/PATCH/PUT before
  it reaches any route (bit banking's first DELETE calls). Check with
  `curl -i -X OPTIONS <url> -H "Origin: ..." -H "Access-Control-Request-Method: DELETE"`
  if a verb ever "does nothing" on web only.
- **Never bump `expo-*`/RN packages by hand** — always `npx expo install <pkg>`, then
  `npx expo-doctor`. A bare `npm install` bump can pull a different Expo SDK line for
  that one package and break `expo start` with an opaque module-resolution crash. Fix
  with `npx expo install --fix`, reinstall clean if needed.
- **Expo Go can no longer run this app** (since `react-native-purchases`, a real native
  module Expo Go doesn't ship). Any screen touching it needs a custom dev client:
  `eas build --profile development` or `npx expo run:ios/android`. Web preview (`w`)
  still works for everything except purchases themselves (RevenueCat's web support is
  a separate Stripe product). If Expo Go instead reports an SDK-incompatibility error,
  that's the *other*, unrelated issue — bump the project's `expo` version to match
  Expo Go's current SDK.
- **Variable-only Google Fonts can't have their weight selected by RN's Text
  component.** Pick a family with static weight files, or instantiate one yourself
  (`python -m fontTools.varLib.instancer wght=600`) — this is how the IBM Plex weights
  in `assets/fonts/` were made.
- **Only list a package in `app.json`'s `plugins` if it ships an `app.plugin.js`** —
  otherwise Expo's resolver falls back to requiring raw untranspiled `src/index.ts`
  and crashes `expo start` in a way that looks like a TS problem. Confirm with
  `ls node_modules/<pkg>/app.plugin.js` first.
- **Never put two dynamic segments as siblings in the same folder**
  (`watchlists/[watchlistId]/` + a bare `watchlists/[symbol].tsx`) — expo-router
  silently picks ONE for every matching URL with no error (confirmed: `/watchlists/NVDA`
  matched `[watchlistId]/index`, treating "NVDA" as a watchlist id). Fix: a static
  prefix segment (`watchlists/stock/[symbol].tsx`). If one screen needs to be reachable
  from two tabs with each keeping its own back-stack, duplicate a thin re-export route
  file — never the component logic.
- **A `<Tabs.Screen name=...>` must match the ACTUAL route name** or the tab silently
  renders the raw route string as its label (a folder with its own `_layout.tsx`
  registers as the folder name; a bare `index.tsx` keeps an `/index` suffix).
- **Hiding the bottom tab bar on sub-routes** (`(tabs)/_layout.tsx`) uses
  `getFocusedRouteNameFromRoute` (from `@react-navigation/native`, not in expo-router's
  own public API but directly importable) inside `<Tabs>`'s `screenOptions`, keyed off
  each tab's own nested-Stack route names. `display:"none"` removes the bar entirely —
  the only way back is popping the stack, which is what guarantees the same
  stock/Holdings/Profile screen can't end up pushed open in two tabs at once. Centralized
  here rather than per-screen because expo-router's `<Tabs>` types `id` as
  `undefined`-only, so `navigation.getParent(id)` isn't available.
- **A `display:"none"` element still counts in Playwright's `.count()`/`getByText()`**
  — it's hidden, not removed. Check `.isVisible()`, not just presence.
- **RN Web's `Pressable` has no real `disabled` DOM property** — it's a `<div>`
  signaling disabled via `aria-disabled="true"` on an ancestor, *absent* (not
  `"false"`) when enabled. Test for `aria-disabled !== null` / `!== "true"`, not an
  equality check against `"false"`.
- **`page.goBack()` in a web Playwright test REMOUNTS the screen** — it's a full
  browser navigation, so it cannot reproduce React Navigation staleness bugs (the
  whole reason holdings/orders/TradeScreen/useWatchlists use `useFocusEffect` instead
  of `useEffect`). Proven by A/B: with browser-back, both the fixed and broken
  versions of a staleness fix passed — the test was worthless. Use the in-app back
  control (`[aria-label="<PreviousScreen>, back"]` on web) instead. Also: an "add X"
  assertion proves nothing if X is already present (the duplicate guard makes it a
  no-op) — clear the row via the service-role client first.
- **A global `setErrorHandler` will silently swallow every plugin's 4xx unless it
  passes them through explicitly.** Adding rate limiting once produced a correct 429
  body that this handler rewrote into an opaque 500. Also: `@fastify/rate-limit`'s
  `errorResponseBuilder` must include `statusCode: 429` itself — whatever it returns
  IS the thrown error, and a plain `{error, message}` carries no status. Neither trap
  is visible from reading the config; both only surfaced by firing real requests.
- **`tsx watch` can't rebind port 4000 if an old instance still holds it** — logs
  `EADDRINUSE` and keeps serving the OLD code, so a fix appears to do nothing. Orphans
  accumulate across restarts. Check `Get-NetTCPConnection -LocalPort 4000`; kill all
  matching `node.exe` processes before assuming a change didn't work.
- **Money-app safety: the client order id must be generated by the CLIENT and held
  steady across retries**, not the server (a server-generated id would be new every
  request and dedupe nothing). `TradeScreen.tsx` holds it in a ref, clearing it only
  once an order is accepted, so a lost response + retry can't become two real orders.
- **Fractional/notional orders are market+day only**, filling during regular US market
  hours; off-hours orders queue (expected, not a bug).
- **Sandbox ACH: deposits complete but stay unsettled** — `cash` rises immediately but
  `cash_withdrawable` stays $0 until Alpaca's settlement clock advances, so
  "deposit then immediately withdraw" always fails the settled-cash check in sandbox.
  Correct behavior, not a bug.
- **Alpaca tax_id validation** (sandbox) rejects area 000/666, sequential digits, and
  invalid characters — use realistic-looking test SSNs.
- **Closing an Alpaca account does NOT free its email for reuse** — it becomes
  `ACCOUNT_CLOSED`, kept on file permanently; a new signup with that email fails
  forever. For repeat test signups: verified-domain Resend + Gmail plus-addressing
  (`you+test1@gmail.com`) — neither Supabase nor Alpaca understands `+tag`, so each
  variant is a fully distinct account while Gmail delivers them all to one inbox.
- **Supabase's email-send rate limit is separate from Resend's and still applies**
  post-verification — heavy signup/reset testing can trip `over_email_send_rate_limit`
  (429; resets after a window). `admin.auth.admin.generateLink()`/`createUser()`
  bypass real email entirely — the right tool for scripted tests.
- **Supabase's OTP email templates must explicitly show `{{ .Token }}`** (dashboard →
  Authentication → Emails) or the code is computed but never displayed. Prefer
  code-only content over the emailed link entirely: corporate mail scanners routinely
  pre-fetch links server-side, silently burning single-use Supabase tokens before a
  human clicks — this is why the OTP-code screens exist at all.
- **`account_status` needs an explicit re-check to ever change after onboarding** —
  nothing polls Alpaca in the background; `GET /api/me/status` is the only re-check.
- **Any screen navigating on a non-auth-event state change must `refresh()` the shared
  `AuthStateContext` first**, or the root guard reasserts the old status and bounces
  the navigation right back. Use `useAuthStateContext`, never a second
  `useAuthState()` call (an independent, useless copy).
- **`verifyOtp({type:"recovery"})` fires a distinct `PASSWORD_RECOVERY` event** —
  `useAuthState` ignores it so the guard doesn't yank the user away before
  `reset-password.tsx` lets them set a new password.
- **SQL injection isn't reachable here** — every DB call goes through Supabase's
  parameterized query builder; zod validation is defense-in-depth, not an injection fix.
- **Dev environment:** Windows + PowerShell. Use `curl.exe` (not the alias); quote
  JSON with single quotes.

---

## 13. Alpaca specifics

- Sandbox: `https://broker-api.sandbox.alpaca.markets`. Auth: HTTP Basic.
- **Market Data API is a separate host with separate auth** —
  `data.sandbox.alpaca.markets` (sandbox)/`data.alpaca.markets` (prod),
  `APCA-API-KEY-ID`/`APCA-API-SECRET-KEY` headers, not Basic. Sandbox Broker keys 401
  against the prod data host.
- **Sandbox quotes can have a $0 side** — treat as "no data," not a real price.
- **Free IEX-only feed can be wildly unrepresentative** (observed: MSFT bid/ask 1.4%
  spread while last-trade stayed accurate) — SIP is a paid add-on we don't have.
  `isReliableQuote()` flags a quote unreliable when spread exceeds 0.5% of last trade
  (or a side is 0/crossed); the trade screen shows Last Price instead of a misleading
  spread when unreliable, plus a standing "quotes reflect one exchange only" disclaimer
  regardless. **Execution itself is unaffected** — Alpaca's Reg NMS best-execution
  obligation fills at the true NBBO regardless of what data tier we display.
  Do NOT use condition code `"R"` as an odd-lot signal — it's stamped on every quote,
  including obvious round lots.
- **No Level 2/order-book depth for equities at any tier** — top-of-book only, even
  paid SIP. Depth exists for crypto only. A real depth ladder needs a separate direct
  exchange feed (e.g. Nasdaq TotalView).
- Rate limit ~1,000/min — cache aggressively. Trade screen polls every 3s (2 calls),
  ~40/min per open screen.
- Before production: confirm partner tier, pricing, cash-account default, market-data
  tier, and tech-partner scope with Alpaca in writing.

---

## 14. Finnhub specifics

Company profile + fundamentals for the stock screen (Alpaca has none). Picked over
Financial Modeling Prep because FMP's free tier disallows displaying data to an app's
end users without a separate licensing agreement; Finnhub's free tier is simpler to
build against, with a self-serve paid Starter tier (~$50/mo) for real commercial use.

- Base URL `https://finnhub.io/api/v1`, auth via `token=` query param.
- `GET /stock/profile2` → profile. **Returns `{}` with 200, not 404**, for an unknown
  symbol — `companyData.ts` treats a missing `name` as the real "not found" signal.
- `GET /stock/metric?metric=all` → 100+ fundamentals fields, inconsistently named
  across TTM/Annual/Quarterly (has shifted before). We read a curated handful
  defensively, falling back to null/"—" rather than guessing — also a brand call
  (dumping 100+ fields would be a fundamentals-flavored "dozens of metrics," §1).
- `marketCapitalization`/`shareOutstanding` are in **millions**, not billions.
- **FREE-TIER COVERAGE COLLAPSED (measured 2026-09-10) — this breaks shipped
  features.** `profile2` AND `metric` now return `{"error":"You don't have access to
  this resource."}` for most large caps. Of 18 mega-caps probed, only 6 still work
  (AAPL, MSFT, NVDA, TSLA, WMT, PFE); GOOGL, AMZN, META, KO, JPM, BAC, XOM, CVX, JNJ,
  UNH, V and MA all fail. KO *did* work on 2026-09-01 during Trade Limits
  verification, so this is a vendor change, not a mis-test. Consequences: Company
  Info/Financials are blank for those symbols, and §17's market-cap floor fails
  closed on them (see §17). Alpaca is unaffected — it has full coverage.
- The paid **standardized** statements endpoint (`/stock/financials`) is a different,
  better product than `financials-reported` and is what any statement-visualization
  feature should use: verified on a demo key that AAPL and WMT share 15 identically
  named fields (`revenue`, `costOfGoodsSold`, `grossIncome`, `ebit`, `netIncome`),
  that components reconcile exactly (AAPL 416,161 − 220,960 = 195,201 = grossIncome),
  and that IC/BS/CF all go back 40+ years. Untested for banks/insurers/REITs — JPM and
  XOM are outside the demo key's allowlist, so that remains the open question.
- Free tier is personal/non-commercial per Finnhub's terms — a paid plan is required
  before real subscribers see this data; confirm in writing first.
- Field names confirmed live against a real key (AAPL) on the first try — re-verify if
  Finnhub ever changes them (their own GitHub issue #337 shows precedent).
- 24h per-symbol cache (`companyData.ts`) — this data changes slowly.

---

## 15. RevenueCat specifics

Subscription infrastructure (§6). RevenueCat itself is free until $2,500/mo tracked
revenue, then 1% — no fixed cost pressure at current scale, unlike Finnhub.

**Built:** `react-native-purchases` + `expo-dev-client` installed.
`Purchases.configure()` runs from `useAuthState.ts` with the Supabase user id as
RevenueCat's `app_user_id`, so the webhook can trust `event.app_user_id` as a real
`auth.users.id` with no separate identity mapping. `POST /api/webhooks/revenuecat` is
the only writer of `public.subscriptions`, authenticated by a shared-secret header.
Status is recomputed from the event's expiration timestamp every time, not remembered
from the event type (a CANCELLATION means "won't renew," not "revoke now") — same
self-healing philosophy as the Alpaca status sync. `useEntitlement()` reads the table
via RLS; its first consumer is `FinancialsPane` (§20). It also exposes `refresh()` for
the one case focus can't cover — a purchase completed on the gated screen itself.

**Still open:**
1. ~~What premium gates~~ — **decided 2026-09-15: Simpl Financials** (§20), the
   flow-diagram view of the statements. Pure data display, not advice-adjacent, and
   it offsets the one real recurring cost (Finnhub). The trading loop stays ungated.
2. ~~Custom vs hosted paywall~~ — **decided: custom** (`components/PaywallSheet.tsx`),
   because it can show a real rendering of the thing being sold. RevenueCat package
   ids it expects: `$rc_monthly`, `$rc_annual` (`lib/premium.ts`).
3. **External accounts only the founder can create**: RevenueCat project + app
   entries + entitlement/offering; Apple Developer Program ($99/yr) + App Store
   Connect subscription product; Google Play Console ($25 one-time) + product. Not
   code — dashboards, business/banking verification.
4. Once those exist: SDK keys → app `.env`; webhook secret + entitlement id → backend
   `.env`; apply `0004_subscriptions.sql`.
5. A real device/dev-client sandbox purchase test — impossible via Expo Go or web.

---

## 16. How to work in this repo

- Small, testable increments. Add one feature, run it against the live sandbox, then
  move on.
- Two terminals: backend (`npm run dev`), app (`npx expo start`, press `w` for web).
  Web is a fast logic preview, not accurate visually — tune on device/emulator.
- Money feature: new function in `alpaca.ts` + new route in `routes/` + client call in
  `lib/api.ts`. Keep the Alpaca client isolated (one file to touch for a future
  broker migration).
- App-owned data (watchlists, settings): app talks straight to Supabase under RLS, no
  backend route needed.
- Prefer an actual Playwright run over "it typechecks" when verifying navigation —
  this project shipped a real routing bug that both typecheck and build missed.
- Keep this file updated when a decision changes — tersely.

---

## 17. Trade Limits

User-set guardrails against the two behaviors §1's audience is trying to quit: weekly
churn and going all-in on micro-caps. Account → Trade Limits. Unlike margin (§6's
locked "cash accounts only"), this *reinforces* the philosophy rather than fighting it.

**Two limits, both optional:**
- **Round trade limit** (0–10, or unset = no limit). `0` is meaningfully different from
  unset: it means "open no new positions at all."
- **Market cap limit** — a floor from a fixed dropdown ($10M…$100B), or No limit.

**Definitions that were judgement calls, not obvious readings:**
- **A round trip = a buy AND a sell of the same symbol, both filled inside the same
  Mon–Fri ET window.** Selling a position opened weeks ago does NOT count. Deliberate:
  the limit exists to slow in-week churn, and burning a round trip on a long-held exit
  would penalize exactly the calm behavior the app encourages. Counting every sell
  instead would do that. Partial fills count by intent, not quantity —
  buy-buy-sell is one trip, buy-sell-buy-sell is two (`roundTrips.ts`).
- **Only BUYS are gated, and only buys that OPEN a position.** Adding to something
  already held is allowed at the limit; sells are never blocked at all (§6 treats a
  hard sell lock as legally risky, and the feature's own wording scopes it to
  "opening a position"). "Already held" checks BOTH filled positions AND currently
  open (unfilled) buy orders for that symbol — checking positions alone was a real
  bug, caught live: a second buy of a symbol whose first buy hadn't filled yet (a
  Limit order not yet triggered, or simply an after-hours queue) looked like
  "opening a new position" and wrongly burned a round trade.
- **LIVE BUG (found 2026-09-10, not yet fixed):** fail-closed + Finnhub's collapsed
  free-tier coverage (§14) means a user with a market-cap floor set currently CANNOT
  buy JPM, GOOGL, AMZN, KO, JNJ, V and most other blue chips — the exact opposite of
  what the floor is for. Latent until someone sets a floor. Neither obvious fix is
  good (failing open guts the floor; staying closed blocks blue chips); the real fix
  is a market-cap source with real coverage, which is the pending Finnhub decision.
- **An unverifiable market cap blocks the buy** (fail closed). An obscure name with no
  Finnhub data is precisely what the floor exists to keep out, so "we don't know" is
  treated as "not allowed."

**Cooldown toggle** — when on, changes that *loosen* protection (raising/removing the
round-trade cap, lowering/removing the market-cap floor, or switching the cooldown
itself off) are queued until the next weekday 9:30 AM ET; changes that *tighten* apply
immediately. Delaying a tightening would postpone a user's own protection at the moment
they reach for it, which is backwards. Turning the cooldown off counts as loosening on
purpose — instantly-flippable would make it no commitment at all.

**Enforcement is server-side**, in `POST /api/me/orders` — a UI-only limit is
bypassable by anything that can reach the API. The screen pre-checks purely for a
clean message.

- Storage: columns on `user_settings` (migration `0005`), whose existing RLS is already
  owner-read-AND-write — correct here, since a self-imposed limit isn't an adversarial
  control and Reset requires it. The commitment mechanism is the cooldown, not RLS.
  `min_market_cap` is whole **dollars**; Finnhub reports **millions**, converted once at
  the comparison site (§14).
- `GET`/`PUT /api/me/trade-limits` go through the backend rather than direct Supabase
  (the usual pattern for app data, §3) because resolving a matured cooldown must happen
  in one place, and the weekly round-trip count comes from Alpaca order history the
  client can't reach.
- `marketTime.ts` holds the only date math in the codebase — ET week start and next
  market open, Intl-based, verified across both DST boundaries. **Known limitation:
  market holidays aren't accounted for**, so a queued change can activate on a holiday
  morning — always earlier than a strict reading, never later, so it can't silently
  extend a lock.
- `getOrders()` takes an optional `after` so the 100-row cap can't truncate the week
  being counted.
- **`InfoTooltip.tsx`'s hover and tap must be tracked as separate booleans, not one
  shared toggle.** A Pressable's `onHoverIn` fires before `onPress` on a real mouse
  click, so "hover opens it, click flips the same flag" means the click immediately
  closes what the hover just opened — confirmed live via a scripted click that left
  a bubble open across unrelated later UI steps instead of closing on the second tap.
  Fixed by keeping `hovered`/`tapped` independent and OR-ing them for visibility.
- **Verified live against the real sandbox**, not just typechecked: the $1B floor
  blocked a real GPRO buy and allowed a real KO buy; a round-trade limit set exactly
  to current usage blocked a new symbol and allowed adding to an already-held one;
  sells succeeded with both limits active; the cooldown's tighten-now/loosen-later
  asymmetry held across 6 transition cases. One test-script trap surfaced along the
  way: placing a same-symbol buy then immediately a sell (or vice versa) trips
  Alpaca's own "potential wash trade" rejection while the first order is still
  open — real Alpaca behavior, not a Trade Limits bug, but it means a test can't
  reuse a symbol across a buy-check and a sell-check without waiting for the first
  order to clear.

---

## 18. Education tab & market sections

Search box first, then the (still-empty) video shelf, then Webull-style scroll
sections — each with a heading, three preview rows, a "See all", and a real gap
before the next. Added 2026-09-10.

**The universe is the feature.** Every list ranks strictly inside the S&P 500
(`data/sp500.ts`, 503 rows of symbol+name+GICS sector, all verified tradable against
Alpaca when generated). That is a deliberate product decision, not a data compromise:
- Alpaca's own `/v1beta1/screener/stocks/movers` and `/most-actives` work fine, but
  what they actually return is penny stocks and warrants — measured live, the top
  gainers were a warrant at $0.0276 (+176%), one at $0.39 (+95%). Those are exactly
  the micro-caps §17's market-cap floor exists to keep users away from. Shipping a
  movers feed would have one feature blocking what another promotes.
- Ranking inside a large-cap universe makes that **structurally impossible** rather
  than filtered-out, so no future config change can reintroduce it.
- It also reframes "top 500 by market cap" (which needs a cap feed we don't have)
  as "The S&P 500", a better fit for §1's index-and-hold audience.
- Longest horizon leads: 1Y is the default everywhere, and Sector Performance sits
  above Stock Performance — which part of the market moved is a more useful lesson
  than which single ticker moved most.

**Static dataset on purpose.** `data/sp500.ts` is generated, not fetched: Finnhub's
index-constituents endpoint is premium and its profile coverage collapsed (§14).
Same mirrored-static pattern as `usStates.ts`/`financialProfile.ts`. Regenerate when
the index changes (a few times a year).

- **Performance comes from Alpaca daily bars**, not Finnhub — `alpacaData.getDailyBars`,
  computed in `marketPerformance.ts`, cached 6h with an in-flight promise so
  concurrent first-hits share one refresh (cold ~6s for all 503, then ~0.3s).
- **`adjustment=split` is required** — without it a stock that split mid-window shows
  a fake ~50% loss. Dividends deliberately NOT adjusted: these are price returns, and
  quietly showing total return under a "1 Year" label would overstate what a holder saw.
- **YTD anchors on the last close of last year**, not Jan 1 — Jan 1 is never a trading
  day and the year's first session already contains part of the move being measured.
- **Sector figures are equal-weighted, not cap-weighted** (no cap data), so they won't
  match a sector ETF. The API says `weighting:"equal"` and the UI states it — a number
  that silently disagrees with a benchmark is worse than one that explains itself.
- A missing anchor returns **null, not 0** — "we can't say" is not "it didn't move".
- Unbuildable sections are returned as real structure with `available:false` + a
  reason and rendered as an honest card, so filling them later is a data change.
- **Add-to-watchlist now works from a stock's own page** (`AddToWatchlistSheet`),
  reachable from every entry point. A list already holding the symbol renders checked
  and non-tappable rather than hidden — hiding it would look like the symbol wasn't
  saved anywhere. `useWatchlists.addSymbol` also guards duplicates internally, so the
  rule is enforced in both places.
- Verified by driving a real browser (§16): 27 checks across both suites, 0 runtime
  errors — tab label, all sections, search→stock→watchlist→dedupe-on-reopen, window
  switcher re-ranking, and an unknown section id showing not-found. One apparent
  failure was the test's own `.first()` landing on the alphabetical S&P 500 list,
  which correctly has no window switcher; confirmed by screenshot before "fixing" it.

---

## 19. Full financial statements (Financials tab)

Income statement / balance sheet / cash flow, every line item, from Finnhub's
**standardized** `/stock/financials` endpoint. Added 2026-09-15, replacing the
eight-ratio summary that was there before.

**Why this doesn't contradict §1's "no dozens of metrics."** That rule still holds for
*ratios* — a wall of P/E variants is noise. A statement is a different object: one
structured document the company actually files, read top to bottom, where the whole
point is that it's complete and the subtotals reconcile. Showing eight numbers out of
it was the incomplete version, not the minimal one. This is also the free tier of the
planned paywall split — premium turns the same data into proportional flow diagrams.

- **Standardized, not `financials-reported`.** As-reported data uses raw us-gaap
  concepts that differ per filer (JPM's balance sheet shares almost no keys with
  AAPL's), so it can't drive a generic layout. Verified TSLA reconciles exactly:
  revenue 94,827 − COGS 77,733 = 17,094 gross; assets 137,806 = liabilities 55,669 +
  equity 82,137; operating 14,747 − investing 15,478 + financing 1,139 + FX 171 = 579
  change in cash.
- **The layout lives on the BACKEND** (`data/statementLayout.ts`) — which fields, in
  what order, under what label, with what unit. companyData.ts is already documented as
  the boundary keeping the app away from Finnhub's field names, and a statement layout
  is exactly that mapping. The app renders sections it's handed and never learns
  `sgaExpense` exists.
- **Finnhub reports money AND share counts in millions**; both are scaled to real units
  once, in `companyData.ts`. `perShare`/`ratio` units are NOT scaled — formatting EPS as
  "$1.08M" is the bug this prevents.
- **A line item absent from every period is dropped**, and a section whose items are all
  absent disappears. A company with no R&D shouldn't show "R&D —" implying missing data.
  Absent in *some* periods still renders; a gap in a series is real information.
- **Values are not colored by sign here**, unlike the P&L screens. Negative capex or
  accumulated depreciation is normal statement mechanics, not a loss, and rust-on-
  negative would read as "something is wrong" on rows where nothing is.
- **Memo rows ("Also reported") are separate from the waterfall** — they're real figures
  that don't feed a subtotal. `interestIncomeExpense` is the net figure inside the
  arithmetic; `interestExpense` is gross detail beside it. Listing them inline would
  imply they sum.
- One period at a time with chips, not a years × rows grid — 40 rows × 10 columns does
  not survive a 430px phone. All periods ship in one response so switching is instant.
  Capped at 10 annual / 12 quarterly.
- **Only 6 symbols work on the current key** (AAPL, MSFT, NVDA, TSLA, WMT, PFE);
  everything else 403s. The route turns that into a **402 + `availableSymbols`**. That
  list is a backend constant on purpose — it's a billing-plan fact, and hardcoding it in
  the app would need a mobile release to correct when the plan changes. Delete it and
  the field when the plan covers the market. Finnhub 403s identically for "outside your
  plan" and "no such symbol," so the message can't claim the company is unknown.
- Verified by driving a real browser (§16): 19 checks — all three statements, both
  frequencies, unit conversion, period switching, and the plan-limited state. The one
  console 402 is the JPM path being exercised deliberately, not a fault.

---

## 20. Simpl Financials — the paywalled flow view

The first premium feature (§6, §15): the same statements as §19, drawn as a Sankey.
Toggle sits beside Annual/Quarterly on the Financials tab; locked (padlock) for a
non-subscriber and opens the paywall, a switch for a subscriber (defaults ON — it's
what they paid for; off returns the table). Added 2026-09-15. Prices $6.99/mo ·
$49.99/yr, one constant in `lib/premium.ts`.

**The graph is built on the BACKEND** (`data/statementFlow.ts`), shipped in the same
response as the table (`flow[period]`), for the §19 reason: the app must never learn a
Finnhub field name. Not gated server-side — it's a re-arrangement of the free figures,
so there's nothing to protect; the paywall gates the *rendering*, which is the value.

**The one rule: every node balances exactly.** A Sankey bar is drawn at max(in, out),
so any gap is a visibly lopsided bar. Each stage closes its own books and whatever the
listed components don't explain becomes an explicit "Other" ribbon — thin when the
filing reconciles, honest-sized when it doesn't. Audited across all 6 covered symbols ×
3 statements × 10 periods: worst imbalance 1.1e-16. Balance sheet and cash flow have
NO residuals; income-statement residuals that remain are real unitemised one-offs
(Apple's 2024 EU tax charge, Microsoft's 2018 TCJA charge, Pfizer 2017–19).

**Things the audit caught that reading the code would not have:**
- The parent→child ribbon must carry what the PARENT HAS LEFT, not the child's
  reported value — income sources join the child directly, so sizing by the child
  double-counted them and Operating Income came out narrower than its outflows.
- Residuals leave from the PARENT, so the child bar always equals the filed figure.
  Peeling them off the child drew Apple's net income at $104B instead of $93.7B.
- `cashDividendsPaid` was missing: MSFT/WMT/AAPL/PFE pay $6–22B a year and every one
  showed as an "Other" ribbon a fifth the size of the chart. Placed by magnitude, not
  sign — dividends are always money out. `longTermInvestments` (Apple's single largest
  asset, $77.7B) and `deferredIncomeTax` (Walmart, $16.5B) likewise.
- Operating cash flow is NOT decomposed — Finnhub's sub-items overlap (SBC appears
  both alone and inside "other non-cash"), so itemising manufactures a fake residual.
- Loss years: a negative stage can't be a bar. The uncovered shortfall becomes a rust
  "… Loss" source on the left funding the expenses (the classic drawing), and stage
  nodes carry `reported` so the LABEL is the filed figure while the bar shows
  throughput — TSLA 2017 labelled Gross Profit "$3.85B" (profit + loss ribbon) until
  this; the filing says $2.22B.

**Renderer** (`components/SankeyChart.tsx`): d3-sankey for layout (pure geometry, runs
on native and web), react-native-svg to draw. Ribbons are gradients source→target so
money is followed by hue: amber = the company's own profit path, green = in from
elsewhere, rust = out (and a loss on the left), grey = unitemised. Labels are drawn
twice (dark stroke, then fill) — SVG paint-order isn't on native and text over a
ribbon is unreadable without a halo.
- **Column membership by x-position, not `depth`.** `sankeyJustify` moves sinks to the
  last column but leaves `depth` where the path put it, so a depth test called every
  sink a middle stage and stacked two-line labels on 3 px bars. First/last columns
  label to the right (last into a reserved 132 px margin); middle stages label
  above/below, centred, so no two columns share a horizontal band.
- Rendered at clamp(container, 640, 900) in a horizontal ScrollView — a five-stage
  flow needs ~600 px to label; on a phone it pans rather than crushes.
- Values are NOT coloured by sign, same reasoning as §19.

**Paywall** (`components/PaywallSheet.tsx`): a real rendering of TSLA's income
statement (`lib/tslaExampleFlow.ts`, a snapshot generated from the backend's own
builder so it can't drift from what subscribers get), then plan cards, then a separate
Subscribe button — two steps because it's a money action. `purchasePremium()` runs the
real RevenueCat flow and NEVER marks the user premium itself; on success the webhook
writes `public.subscriptions` and `useEntitlement().refresh()` re-reads it. Until §15's
external accounts exist (and always on web/Expo Go) it reports "Purchases aren't
available in this build yet" rather than faking success — verified.
- **The test account is seeded premium directly** in `public.subscriptions` via the
  service-role key — the same path the webhook uses, a test seed, not a bypass. Flip
  with a one-row update to see the locked state.
- A horizontal ScrollView inside an `alignItems:center` parent sizes to its content
  and overflows BOTH edges instead of scrolling — the paywall preview clipped Revenue
  on the left until the ScrollView got `alignSelf:"stretch"`.
- Verified by driving a real browser (§16): 34 checks across locked and unlocked
  suites, 0 runtime errors — lock, paywall (verbatim headline, both prices, example
  Sankey, disclosure, honest purchase failure, close), default-on flow for a
  subscriber, all three statements, toggle off/on, the 2017 loss year, Apple 2024's
  net income exact with its one-off as a ribbon, and phone width.

---

## 21. Abuse limits & hardening

Rate limiting, input bounds, and proxy trust. Audited and extended 2026-09-17,
after the first pass (§10) covered only three routes.

**The surface is split, and the smaller half is the backend.** Signup, login,
password reset and EVERY watchlist write go app -> Supabase directly (§3), so
Fastify's limiter cannot see them at all. That means:
- **Postgres is the only place that can bound them** — migration `0006` adds
  length/shape CHECKs and row-count triggers on `watchlists`, `watchlist_items`
  and `user_settings`. RLS proves *who* you are; nothing bounded *how much* you
  could write as yourself, so a signed-in bot could store a 10 MB watchlist name
  or a million rows and every write was a valid RLS write.
- **Auth throttling is a Supabase dashboard setting**, not code in this repo.
  Nothing here can rate-limit `signInWithPassword`.

**Backend caps live in one table** (`rateLimits.ts`), sized by what a request
COSTS rather than by guessed human behaviour — `/markets/overview` fans out to
~15 Alpaca calls across 503 symbols on a cold cache, so it gets 30/min while a
cached sibling gets 60. Every route now carries one; before this pass only
`POST /orders` and `POST /transfers` did, leaving bank link/unlink, onboarding,
the investment profile, trade-limit writes and all of `/api/alpaca/*` and
`/api/markets/*` on the global 300/min alone. Verified live: 40 requests at a
30/min route gave exactly 30×200 + 10×429, `/health` unaffected.

- **The RevenueCat webhook is no longer exempt from limiting.** It was, on the
  reasoning that a dropped event costs a user their entitlement — true, but
  "unlimited" isn't the only way to avoid that. An unauthenticated endpoint with
  no ceiling is a free CPU-burn target for anyone who learns the URL, and the
  shared secret is only checked after the body is parsed. It now has a
  deliberately generous 600/min: far above RevenueCat's real send rate, still a
  ceiling. `/health` is the only thing fully exempt.

**IP rotation / `trustProxy`.** Unauthenticated routes key on `req.ip`, and both
the old default and the obvious fix are wrong:
- Unset behind a proxy, `req.ip` is the PROXY's address for every request, so
  all traffic shares one bucket and the first burst locks out every user.
- `trustProxy: true` believes `X-Forwarded-For` from anyone, so a client forges
  a fresh IP per request and gets an unlimited quota — the rotation bypass,
  handed out for free.
So `TRUST_PROXY` takes a proxy IP/CIDR or a hop count, defaults to off, and
**config.ts throws on `true`** rather than letting it be set by accident.
Honest limit: none of this stops a distributed botnet across real IPs. That
needs a WAF in front (Cloudflare or equivalent) — per-IP limits bound one host,
not a swarm.

**Input bounds.** Every `TextInput` now caps length (only one of eight did).
Watchlist names cap at 60 to match the DB CHECK exactly, so a user is stopped by
the keyboard rather than a Postgres error; money fields cap at 12 chars; symbol
search at 12. Client caps are UX, not security — the DB constraints are what a
scripted client actually hits.

**Already clean, checked not assumed:** no route trusts a client-supplied
timestamp, so a device clock cannot skip §17's cooldown — the only date math is
server-side in `marketTime.ts`. SQL injection isn't reachable (§12): everything
goes through Supabase's parameterized builder. XSS isn't a class here — React
Native has no `innerHTML`.

---

## 22. Dropdowns (SheetSelect)

Every dropdown in the app opens as a sheet with per-option explanations, not a
native picker wheel. Added 2026-09-17, replacing `@react-native-picker/picker`
at all 13 call sites.

**Why a sheet.** The native `<Picker>` gave a bare list of words with nowhere to
explain them, which is worst exactly where it matters: "Limit" vs "Stop", or
"Extended Hours", where the label is the least useful part. It also rendered as
three different products — a wheel on iOS, a dialog on Android, an HTML
`<select>` on web. The sheet is one shape everywhere with room to teach.

- **`SelectField` kept its exact prop signature** and became a thin wrapper, so
  all ten existing call sites (onboarding, investment profile, banking, trade)
  upgraded without being touched; each can now add `description` per option.
- **Option copy is MECHANICS, never guidance** (§2). "Fills only at the price
  you set or better" is how a limit order works; "use a limit order when the
  market is volatile" would be a recommendation and is not there. A test asserts
  no advice language ("you should", "recommend", "best for") appears in any sheet.
- Lists over 12 options get a filter box automatically (states, market caps);
  shorter ones don't, because a search field above four options is furniture.
- **"No limit" is a real option row** in the market-cap sheet, not just the
  trigger's placeholder — a placeholder alone leaves no way back to unlimited
  without the Reset button.
- `compact` renders an inline pill trigger for toolbars (the statements period
  picker) instead of a labelled form field.
