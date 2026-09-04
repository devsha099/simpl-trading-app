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
- **Business model:** low-cost yearly subscription (~$20–30/yr) via RevenueCat. Not
  aiming to be a billion-dollar company; a sustainable app with tens of thousands of
  users is the goal.

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
  - **Education** — placeholder ("coming soon"), formerly "Research"; will hold
    financial-education videos.
  - **Settings** — read-only **Profile** + Sign Out.
- **The stock screen** — reached from a watchlist row or a Holdings row, one screen per
  symbol with a 3-way switcher: **Company Info**, **Trade** (landing tab — bid/ask,
  order form, Buy/Sell, Your Position card), **Financials**. Company Info/Financials
  come from Finnhub, not Alpaca (Alpaca has no fundamentals data — §13).

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
- **Subscription (~$20–30/yr) via RevenueCat** gates premium *app features*
  (IAP-required) — NOT the trading itself (a real-world service, IAP-exempt).
  Entitlement mirrored to Supabase via webhook. Infrastructure built; what's gated and
  the paywall's design are still open — see §15.
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
installing this ended Expo Go compatibility, §12). `expo-secure-store` is installed but
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
│   │   ├── 0001_init.sql, 0002_grants.sql, 0003_investor_profiles.sql   applied
│   │   └── 0004_subscriptions.sql   written, **NOT YET applied** — run via the
│   │                                Supabase SQL editor before the webhook can write
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
    │       ├── education/index.tsx
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

Migrations 0001–0003 applied to the real project. **0004 (subscriptions) is written but
not yet applied** — needs the Supabase SQL editor. See §12 for why GRANTs and RLS are
both required (a migration that adds RLS without the base GRANT 403s everything).

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
- `GET /api/company/:symbol/profile`, `/financials` — Finnhub-backed (§14). 404 if no
  data, 503 if `FINNHUB_API_KEY` unset. Rate-limited 30/min (Finnhub's own cap is
  60/min for the whole app).

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
- Company Info/Financials: Finnhub's free-tier rate limit (60/min) hasn't been
  stress-tested — fine for dev, revisit before real traffic.
- RevenueCat: nothing gates on `useEntitlement()` yet; `0004_subscriptions.sql` not
  applied; no real device purchase test yet (§15).

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
via RLS; built, not called from anywhere yet.

**Still open:**
1. **What premium actually gates** — nothing does yet. Must avoid gating the trading
   loop itself (IAP-exempt, and the core business) or anything advice-adjacent. The
   Company Info/Financials tabs are a natural fit — real recurring cost to offset
   (Finnhub), pure data display.
2. **Custom Terminal Amber paywall vs. RevenueCat's hosted Paywall UI**
   (`react-native-purchases-ui`, not installed) — speed vs. brand fit.
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
  "opening a position").
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
