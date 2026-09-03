# Simpl Trading — Project Context

This file is standing context for every Claude Code session. Read it before doing
anything. It captures what we're building, why, the decisions already made, and the
traps to avoid. Keep it updated as decisions change.

---

## 1. What this is

Simpl Trading is a **minimalist, buy-and-hold stock brokerage app**. The entire
product thesis is calm, simple, long-term investing — the opposite of gamified,
dopamine-driven day-trading apps.

- **Target users:** people who lost money day-trading and want to stop, plus people
  who believe in a simple index-and-hold philosophy.
- **Core loop for the user:** search a stock → buy it → hold it. That's the whole app.
- **Deliberately NOT included:** advanced charts, dozens of metrics, options, margin,
  day-trading tooling, social feeds, anything that encourages frequent trading.
- **Business model:** low-cost yearly subscription (~$20–30/yr). Not aiming to be a
  billion-dollar company; a sustainable app with tens of thousands of users is the goal.

The minimalism is not a limitation — it is the product and the brand. Minimalism
means the *product* stays narrow (one core loop, no day-trading tooling) — it does not
mean the UI has to look sterile. See below for the actual visual identity.

**Visual identity: "Terminal Amber."** The whole app is a single, deliberately-chosen
dark theme (no light mode) — a warm near-black ground (`#15120c`) with one signature
amber accent, inspired by the phosphor ticker terminals (Quotron/Bloomberg-era) that
ran the first stock quote feeds, not a generic "dark mode." Gains/losses stay
conventional green/rust (semantic, kept separate from the brand accent). Type system:
**Zilla Slab** for display/headlines, **IBM Plex Sans** for body/UI, **IBM Plex Mono**
for every number (prices, P/L, portfolio value) so figures line up like a ledger.
Two recurring motifs, used strategically (never as wallpaper): a "hazy" chromatic
double-shadow on hero text (`components/HazyText.tsx`) and a stacked spectrum-stripe
bar (`components/SpectrumStripe.tsx`, also doubles as the small logo mark). All tokens
live in `lib/theme.ts` — new screens should pull colors/fonts from there, never
hardcode a hex value or font name.

---

## 2. Regulatory stance (CRITICAL — do not drift from this)

We are a **technology / marketing layer on top of Alpaca's Broker API.** Alpaca is the
registered, self-clearing broker-dealer (FINRA/SIPC) and does all the regulated work:
custody, clearing, settlement, KYC/AML, regulatory reporting.

**We are NOT a broker-dealer and NOT a Registered Investment Adviser (RIA).** To keep
it that way, the app must stay in the "light regulatory box":

- **Strictly self-directed. NO advice, NO recommendations, NO trading signals.** Never
  build features that tell users what to buy/sell or imply it (no "this stock is a buy,"
  no AI signals, no personalized suggestions). That would trigger RIA or broker-dealer
  registration.
- **No "AI-powered" or predictive marketing claims.** SEC actively enforces "AI washing."
  Only make claims we can fully substantiate.
- **Do NOT promote day trading.** Our whole brand is the opposite; keep it that way.
- **Security marketing must be accurate.** "Funds held by a regulated, SIPC-member
  broker" is true. Never imply protection against market losses (SIPC does not cover that).

If a proposed feature edges toward giving advice or promoting active trading, flag it
rather than building it.

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

**Data ownership split — memorize this:**

- **Identity / auth →** Supabase Auth.
- **Our own app data** (profile display, watchlists, settings, subscription status) →
  Supabase Postgres, accessed **directly by the app** under Row-Level Security (RLS).
- **Money / brokerage** (account creation, funding, orders, positions, prices) →
  always through **our backend → Alpaca**. The app never calls Alpaca.
- **KYC PII** (SSN etc.) → passed through the backend to Alpaca and **discarded**.
  Never stored in our database.
- **Subscription billing →** RevenueCat + Apple/Google, mirrored into Supabase via webhook.

**The security boundary (never violate):** the app never sends an Alpaca account ID.
The backend always derives the account ID from the logged-in user's session token, then
looks it up in the database. A user can only ever act on their own account.

---

## 4. The router state machine (the spine of the mobile app)

On every launch, the root layout decides where the user goes, in this order:

1. Not logged in → welcome / auth screens.
2. Logged in, no Alpaca account row yet → onboarding (KYC).
3. Has an account, status ≠ `ACTIVE`, no `investor_profiles` row → the
   investment/employment questionnaire. This deliberately fills the review wait
   instead of parking the user on a dead pending screen.
4. Has an account and a questionnaire row, but status ≠ `ACTIVE` → pending screen.
5. Account is `ACTIVE` → main app (bottom tabs). Checked BEFORE step 3, so an
   already-approved account is never sent back for the questionnaire.

This makes the app resilient: someone who quits mid-KYC resumes at onboarding next time,
because routing reads their real state instead of assuming a linear path.

Implemented in `src/app/_layout.tsx` + `src/hooks/useAuthState.ts`: a
`useSegments()`-based guard that redirects on every auth-state change. Verified via a
real Playwright run that directly navigating to `/watchlists`, `/account`, or
`/onboarding` while signed out always bounces to `/welcome` — you cannot reach a
protected screen by URL alone. Onboarding-complete and pending-becomes-active are NOT
Supabase auth events, so those screens navigate directly after their own actions
instead of relying on this listener (see §12's `refresh()` gotcha).

---

## 5. App layout (v1)

- **Welcome screen** — philosophy + "Log In" / "Sign Up".
- **Sign Up** → email, password, first name, last name, phone (Supabase auth +
  email verification via OTP code — see §12).
- **Onboarding (KYC)** → DOB, address, citizenship, SSN, disclosures, agreements →
  creates the Alpaca cash account via our backend.
- **Investment/Employment questionnaire** → income/net-worth brackets, time horizon,
  employment status, employer name, marital status → shown instead of a dead wait
  screen while Alpaca reviews the account.
- **Pending screen** → shown until Alpaca approves (status ACTIVE).
- **Main app — bottom tab bar, 4 tabs:**
  - **Watchlists** ← default landing. Supports multiple named watchlists: the tab
    opens to a list of watchlists (blank except a "+ New Watchlist" action until you
    make one); tapping a watchlist opens its ticker list (add by typing, long-press/
    right-click a row for a "Remove from Watchlist" sheet); tapping a ticker pushes
    into the per-symbol stock screen (see below). Ticker rows show last price +
    %-change since previous close.
  - **Account** ← portfolio value + cash at the top, the nav title showing the
    account's real Alpaca-issued brokerage number ("#335725994 Cash Account"), then
    four sub-screens: **Holdings** (current positions + unrealized P/L, tap a row to
    trade it — see below), **Orders** (still-working orders), **Trade History**
    (filled/closed orders), and **Banking** (see below).
  - **Banking** (under Account) ← cash balance + settled-cash line, the linked bank
    card, three actions — **Transfer Money** (bank → Simpl), **Withdraw Money**
    (Simpl → bank), **Add/Remove Bank Account** — and the full transfer history with
    a status pill per row (Pending / Complete / Rejected / Canceled). A still-pending
    transfer can be canceled from its row. Wire transfers are deliberately out of
    scope for now (Alpaca's sandbox is ACH-only; production supports outgoing wires
    only).
  - **Education** ← placeholder ("coming soon"). Formerly "Research" (renamed
    2026-09-02) — stock financials/fundamentals are moving onto the stock's own page
    instead (see below), freeing this tab for short financial-education videos,
    uploaded later.
  - **Settings** ← **Profile** (read-only view of everything on file, see §9) and
    Sign Out. More settings TBD.
- **The stock screen** (added 2026-09-02) ← reached from both a watchlist ticker row
  and a Holdings row, one screen per symbol with a 3-way tab switcher at the top:
  **Company Info**, **Trade**, **Financials**. **Trade** is the landing tab (buying/
  holding is the core loop, §1) and is exactly the old full-screen trade experience
  (bid/ask or last price, order type, dollars/shares, Buy/Sell, Your Position card),
  just embedded instead of standalone. **Company Info** (symbol, exchange, industry,
  market cap, shares outstanding, IPO date, website) and **Financials** (P/E, EPS,
  dividend yield, profit margin, revenue/share, 52-week high/low, beta) are both new,
  and both come from Finnhub, not Alpaca — Alpaca has no company metadata beyond
  symbol/name/exchange and zero fundamentals data at any tier (§13). This is the
  landing spot for what used to be the "Research" tab's planned content — see
  Education above and §13's Finnhub section for the full reasoning, including the
  explicit §1 brand-minimalism tension this was flagged against before building.

---

## 6. Product decisions (locked)

- **Cash accounts only** (not margin) — fits buy-and-hold, avoids margin/day-trading rules.
  Set at account creation; confirm the default with Alpaca for production.
- **KYC handled by Alpaca.** We collect the data and submit it; Alpaca verifies and
  approves. We do NOT manually verify anyone. Store only the Alpaca account ID + status.
- **Never store SSN / KYC PII.** Pass through to Alpaca, then discard.
- **Pending screen until status = ACTIVE** (poll on app launch for MVP; move to Alpaca
  account-status events later).
- **Buys and sells both support dollar amounts AND share quantities** (UI toggle).
  Backend sends Alpaca either `notional` (dollars) or `qty` (shares), never both.
- **Selling is allowed** (a hard lock on selling is legally risky, so it was dropped) but
  kept quiet and un-gamified in the UI. The backend checks current holdings before
  submitting a sell and rejects it with a clear error if it would oversell — no short
  selling.
- **Order types: Market, Limit, and Stop Loss** are all supported (not market-only).
  This is a deliberate step beyond pure "buy and hold" — flagged and confirmed with the
  founder given the brand's anti-day-trading stance (see §2); these are standard
  execution mechanics, not advice/signals, so no regulatory concern, just a brand-fit
  call. Limit orders require a `limit_price`; Stop Loss orders require a `stop_price`.
  Revisit if the live bid/ask + order-type surface starts to feel like a trading
  terminal rather than a calm buy-and-hold app.
- **Extended-hours trading (added 2026-09-02)** — a Regular Hours / Extended Hours
  toggle on Limit orders only (Alpaca rejects `extended_hours` on anything but
  Limit+day; the toggle is hidden entirely for Market/Stop Loss, and always resets
  to Regular Hours when leaving Limit so it can't be silently still "on" if the user
  switches back). Extends fills to 4:00 AM–8:00 PM ET instead of just the 9:30–4:00
  session, and works with both dollar and share amounts (Alpaca lifted the old
  whole-share-only restriction for extended-hours notional/fractional orders).
  **Flagged, not just built**: this is arguably a stronger day-trading signal than
  Limit/Stop Loss were — reacting to pre-market/after-hours moves is a core active-
  trading behavior, in tension with §1's "people trying to stop day trading"
  audience — but it was a specific, detailed founder instruction (exact hours, exact
  toggle interaction), so treated as the same kind of brand-fit call as the order
  types above rather than a stop-and-ask. Revisit if it starts to feel like the app
  is coaching users to watch for after-hours catalysts.
- **Banking is Alpaca ACH, one linked bank at a time.** Alpaca allows exactly ONE
  active ACH relationship per account (a second create returns 409), so the UI is
  "your linked bank" with a remove-then-add swap, never a list. Bank linking is
  typed routing + account number today; Alpaca's same endpoint also accepts a Plaid
  `processor_token`, so Plaid can be added later without redesigning the screen.
  Withdrawals are capped at Alpaca's `cash_withdrawable` (its own T+1-settled
  figure) — we display and pre-check it, Alpaca enforces it. Nothing about banking
  is stored in our DB: bank links and transfers live at Alpaca and are fetched
  live, exactly like holdings.
- **The account's identity is Alpaca's own brokerage account number**, surfaced as
  "#XXXXXXXXX Cash Account". We deliberately do NOT mint our own account ID or
  mirror the number into our DB and attach it to transfers — it would add no
  security (every Alpaca call is already scoped to a session-derived account id in
  the URL path) and would just be a second copy that can drift.
- **Investment-profile data (income/net worth/employment/marital status) is treated
  like KYC-adjacent data, not casual app data**: pushed to Alpaca via PATCH first,
  saved locally only if Alpaca accepted, so the two can't drift. Not the same as SSN
  (still never stored) — this is descriptive financial data Alpaca itself requires.
- **Subscription (~$20–30/yr) via RevenueCat**, gates premium *app features* (IAP-required,
  Apple/Google take a cut) — NOT the trading itself (a real-world service, IAP-exempt).
  Mirror entitlement to Supabase via a RevenueCat webhook so the server knows who's premium.
  Infrastructure built 2026-09-02 (SDK, webhook, `subscriptions` table — see §15); which
  screens actually check it, and whether the paywall is custom-built or RevenueCat's
  hosted UI, are still open — see §15's "still needed" list.
- **Donations deprioritized** (awkward on mobile stores); subscription is the revenue pillar.

---

## 7. Tech stack

**Backend** (`simpl-trading-backend/`)
- Node.js 20+, TypeScript, Fastify.
- Module system: **NodeNext / ESM** (`"type": "module"`).
- Alpaca client: native `fetch` + **HTTP Basic auth** (key ID + secret, base64).
- Installed: `@supabase/supabase-js` (verify session tokens, query DB — admin/service-role
  client, see `supabase.ts`), `zod` (request validation), `@fastify/cors`.
- Still planned: `@fastify/rate-limit`.

**Mobile app** (`simpl-trading-app/`)
- React Native via **Expo**, TypeScript, **expo-router** (file-based routing).
- Screens live under **`src/app/`** (this project uses the `src/app` root, not `app/`).
- Installed: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`,
  `react-native-url-polyfill`, `expo-secure-store` (added to the config plugins list but
  not yet wired into the Supabase auth storage adapter — session storage currently uses
  AsyncStorage), `react-hook-form` + `zod` + `@hookform/resolvers`,
  `@react-native-picker/picker` (dropdowns — works cross-platform, renders as a native
  picker on iOS/Android and an HTML `<select>` on web), `expo-font` + `expo-asset`
  (custom fonts — `expo-asset` isn't automatically pulled in and must be installed
  separately or `expo-font`'s web build fails to resolve it), `expo-dev-client` +
  `react-native-purchases` (RevenueCat — added 2026-09-02, see §15; installing this
  is what ends Expo Go compatibility for this project, §12).
- Still planned: `@tanstack/react-query` (for the Supabase-backed watchlists — see
  §11 next steps), `nativewind`, `react-native-purchases-ui` (only if the hosted
  Paywall UI is the chosen route over a custom screen — see §15).
- Later: Plaid.

**Data / services**
- Supabase (Postgres + Auth + RLS), real project `avhnfuffwevdcwapkmnh`.
- Alpaca Broker API (sandbox now, production later).
- Resend (custom SMTP for Supabase auth emails — see §12). Sending domain
  `simplapp.us`, verification in progress.
- Finnhub (added 2026-09-02) — company profile + fundamentals for the stock screen's
  Company Info/Financials tabs, since Alpaca has neither (§13). Free tier only so far
  (personal/non-commercial per Finnhub's terms); a paid Starter-or-above plan is
  required before this is in front of real subscribers — confirm exact commercial
  terms in writing first, same caution as Alpaca's partner tier.

---

## 8. File structure

```
workspace/
├── CLAUDE.md                     ← this file
├── simpl-trading-backend/
│   ├── src/
│   │   ├── index.ts              Fastify server + error handling (logs Alpaca
│   │   │                         rejections at warn level, not just returns them)
│   │   ├── config.ts             env loading/validation
│   │   ├── alpaca.ts             Alpaca Broker API client (Basic auth) — account
│   │   │                         CRUD, orders, positions, updateAccount (PATCH)
│   │   ├── alpaca-data.ts        Alpaca Market Data client (APCA-API-KEY headers, different host)
│   │   ├── assetSearch.ts        ticker/company-name search + exists-and-tradable
│   │   │                         validation, backed by an in-memory cache of Alpaca's
│   │   │                         ~13.3k tradable US-equity assets (lazy-loaded,
│   │   │                         refreshed daily — see §11)
│   │   ├── finnhub.ts            Finnhub REST client (company profile + fundamentals) —
│   │   │                         isolated like alpaca-data.ts, same future-swap reasoning
│   │   ├── companyData.ts        per-symbol cache in front of finnhub.ts (24h TTL, same
│   │   │                         reasoning as assetSearch.ts); curates Finnhub's raw,
│   │   │                         inconsistently-named fields into stable app-facing shapes
│   │   ├── supabase.ts           admin Supabase client (service-role key, bypasses RLS);
│   │   │                         lazily validated so the server still boots without it
│   │   ├── auth.ts               preHandler: verify session token, attach req.user
│   │   ├── db/
│   │   │   ├── accounts.ts       look up / save / update a user's alpaca_account_id + status
│   │   │   ├── investorProfiles.ts  read/upsert the questionnaire row
│   │   │   └── subscriptions.ts  upsert the mirrored RevenueCat entitlement row — only
│   │   │                         routes/webhooks/revenuecat.ts calls this (see §15)
│   │   ├── data/
│   │   │   ├── usStates.ts       USPS state/territory codes — backs the `state` enum in
│   │   │   │                     schemas/onboarding.ts. Mirrored (not shared) in the app's
│   │   │   │                     lib/usStates.ts; two npm projects, no shared package.
│   │   │   └── financialProfile.ts  income/net-worth brackets (label + min/max, since
│   │   │                         Alpaca takes numeric ranges), time horizons, employment
│   │   │                         and marital statuses. Mirrored in the app's lib/ copy.
│   │   ├── schemas/
│   │   │   ├── onboarding.ts     zod schema for the KYC payload — state is a strict
│   │   │   │                     enum, postalCode/taxId are format-checked, free-text
│   │   │   │                     fields are length-bounded
│   │   │   ├── investmentProfile.ts  zod schema for the questionnaire; employer name is
│   │   │   │                     required only when employmentStatus is EMPLOYED
│   │   │   └── orders.ts         zod schema for buys (dollars OR shares) — NOT built yet
│   │   └── routes/
│   │       ├── me/
│   │       │   ├── onboarding.ts     POST /api/me/onboard
│   │       │   ├── status.ts         GET /api/me/status — re-checks the user's status
│   │       │   │                     with Alpaca and syncs alpaca_accounts if it changed
│   │       │   ├── investmentProfile.ts  POST /api/me/investment-profile — PATCHes Alpaca
│   │       │   │                     first, saves locally only if that succeeded
│   │       │   ├── trading.ts        GET account/positions/orders + POST orders, all
│   │       │   │                     session-derived (no account id from the client)
│   │       │   ├── kycDetails.ts     GET /api/me/kyc-details — live address/DOB from Alpaca
│   │       │   │                     for the Profile screen; never returns tax_id
│   │       │   └── banking.ts        /bank (GET/POST/DELETE) + /transfers
│   │       │                         (GET/POST/DELETE :id) — see §10
│   │       ├── alpaca.ts         market-data routes (/quotes, /snapshots) still in use; its
│   │       │                     account-scoped routes are now dead — delete before prod
│   │       ├── company.ts        /api/company/:symbol/profile + /financials — public,
│   │       │                     non-account-scoped like alpaca.ts, backed by Finnhub
│   │       │                     via companyData.ts (added 2026-09-02, see §13)
│   │       └── webhooks/
│   │           └── revenuecat.ts  POST /api/webhooks/revenuecat — the only writer of
│   │                              public.subscriptions. Authenticated by a shared
│   │                              secret in the Authorization header (RevenueCat's own
│   │                              servers call this, not a logged-in user), not
│   │                              Supabase auth. See §15.
│   ├── supabase/migrations/
│   │   ├── 0001_init.sql         profiles, alpaca_accounts, watchlists, watchlist_items,
│   │   │                         user_settings — all tables + RLS policies
│   │   ├── 0002_grants.sql       base table GRANTs the tables actually needed — RLS
│   │   │                         policies alone left every query 403ing (see §12)
│   │   ├── 0003_investor_profiles.sql  the questionnaire table + RLS + GRANT together
│   │   │                         in ONE file (0002's lesson). Applied.
│   │   └── 0004_subscriptions.sql  the RevenueCat entitlement mirror table (added
│   │                             2026-09-02, see §15) — same table+RLS+GRANT-together
│   │                             shape as 0003. NOT YET applied to the real project —
│   │                             apply it via the Supabase SQL editor before the
│   │                             webhook route can actually write anything.
│   ├── .env / .env.example       secrets (never commit .env)
│   ├── package.json / tsconfig.json / README.md
└── simpl-trading-app/
    ├── src/app/
    │   ├── _layout.tsx           root layout — the real router state machine (§4), built.
    │   │                         Redirects based on useAuthState(); "/" (index.tsx) is
    │   │                         just a loading placeholder it redirects away from.
    │   ├── index.tsx             "/" — brief loading spinner; _layout.tsx's effect
    │   │                         redirects everyone from here (never navigates itself)
    │   ├── (auth)/               no tab bar:
    │   │   ├── _layout.tsx           Stack: welcome, login, signup, verify-email,
    │   │   │                         forgot-password, reset-password, onboarding,
    │   │   │                         investment-profile, pending
    │   │   ├── welcome.tsx           philosophy + Log In / Sign Up
    │   │   ├── login.tsx             email+password -> supabase.auth.signInWithPassword;
    │   │   │                         "Forgot password?" -> forgot-password.tsx
    │   │   ├── signup.tsx            + first/last name, phone, confirm password ->
    │   │   │                         supabase.auth.signUp (metadata -> profiles via DB
    │   │   │                         trigger); on "confirmation required" routes to
    │   │   │                         verify-email instead of an inert message. Detects
    │   │   │                         signing up with an already-registered email (empty
    │   │   │                         `identities` array on the response) and shows a clear
    │   │   │                         error instead of the generic "check your email"
    │   │   │                         message Supabase shows regardless, to prevent
    │   │   │                         enumeration (see §12). Phone requires a valid
    │   │   │                         10-digit US/Canada number (app is NA-only, §1) and
    │   │   │                         is normalized to E.164 before it's sent — this is
    │   │   │                         what later becomes Alpaca's `contact.phone_number`.
    │   │   │                         Password requirements (8+ chars, a number, a special
    │   │   │                         character — lib/passwordRules.ts) render live via
    │   │   │                         components/PasswordRequirements.tsx; same
    │   │   │                         component + rules reused on reset-password.tsx
    │   │   ├── verify-email.tsx      confirmation-code entry ->
    │   │   │                         supabase.auth.verifyOtp({type:"signup"}) + a resend
    │   │   │                         button -> supabase.auth.resend({type:"signup"}).
    │   │   │                         Code length isn't hardcoded (4-10 digits accepted) —
    │   │   │                         see §12 on why
    │   │   ├── forgot-password.tsx   email -> supabase.auth.resetPasswordForEmail ->
    │   │   │                         reset-password.tsx. Never reveals whether the email
    │   │   │                         is actually registered (unlike signup's check above —
    │   │   │                         here that WOULD be an enumeration leak)
    │   │   ├── reset-password.tsx    code + new password ->
    │   │   │                         supabase.auth.verifyOtp({type:"recovery"}) then
    │   │   │                         supabase.auth.updateUser({password}) -> refresh() the
    │   │   │                         shared auth state and let the guard route from there
    │   │   │                         (see §12 on why PASSWORD_RECOVERY is special-cased)
    │   │   ├── onboarding.tsx        the KYC form -> POST /api/me/onboard. State is a
    │   │   │                         dropdown (lib/usStates.ts), postal code and SSN are
    │   │   │                         format-validated. "Not you? Sign out" link — a
    │   │   │                         signed-in user who hasn't onboarded had NO way to
    │   │   │                         escape this screen otherwise (the guard forces you
    │   │   │                         back here no matter what URL you type, by design)
    │   │   ├── investment-profile.tsx  income/net-worth brackets, time horizon,
    │   │   │                         employment (+ employer name when employed), marital
    │   │   │                         status -> POST /api/me/investment-profile. Shown
    │   │   │                         INSTEAD of the pending screen right after KYC
    │   │   │                         (see §4 step 3), then falls through to /pending
    │   │   └── pending.tsx           shown until status = ACTIVE; "Check status" calls
    │   │                             GET /api/me/status (backend re-checks Alpaca live)
    │   │                             instead of re-reading the DB's cached value. Same
    │   │                             "Not you? Sign out" link as onboarding.tsx
    │   └── (tabs)/               bottom tab bar:
    │       ├── _layout.tsx           Tabs navigator: watchlists, account, education, settings.
    │       │                         Also hides the bottom tab bar entirely on any sub-route
    │       │                         one level past a tab's own root (a stock, Holdings,
    │       │                         Orders, Trade History, Banking, Profile) — see §12
    │       ├── watchlists/
    │       │   ├── _layout.tsx           Stack: index -> [watchlistId]/index -> stock/[symbol]
    │       │   ├── index.tsx             list of watchlists + "+ New Watchlist" (name prompt modal)
    │       │   ├── [watchlistId]/
    │       │   │   └── index.tsx         one watchlist: add-ticker input with debounced
    │       │   │                         autocomplete (symbol prefix OR company name,
    │       │   │                         /api/alpaca/assets/search), tapping a suggestion
    │       │   │                         adds it immediately; typing a full symbol and
    │       │   │                         hitting Add/Enter instead validates it against
    │       │   │                         /api/alpaca/assets/:symbol first — rejects
    │       │   │                         anything not real/tradable with an inline error.
    │       │   │                         Rows (price + % change), long-press/right-click
    │       │   │                         row -> remove sheet
    │       │   └── stock/[symbol].tsx    re-exports screens/StockScreen.tsx (see below) —
    │       │                             lives under a static "stock/" segment, NOT
    │       │                             directly in watchlists/, because a bare
    │       │                             [symbol].tsx there would sit alongside
    │       │                             [watchlistId]/ as a second dynamic segment at
    │       │                             the same level, which expo-router resolves
    │       │                             ambiguously (confirmed live: /watchlists/NVDA
    │       │                             silently matched [watchlistId]/index instead,
    │       │                             treating "NVDA" as a watchlist id and rendering
    │       │                             an empty watchlist screen — no error, just the
    │       │                             wrong screen). See §12.
    │       ├── account/
    │       │   ├── _layout.tsx            Stack: index -> holdings / orders / trade-history
    │       │   │                          / banking/index / banking/transfer / banking/bank
    │       │   │                          / [symbol]
    │       │   ├── index.tsx              portfolio value + cash, then links to the three below
    │       │   ├── holdings.tsx           current positions + unrealized P/L; rows are
    │       │   │                          tappable -> [symbol] (see below). Refetches on
    │       │   │                          focus, not just on mount, so selling on the
    │       │   │                          trade screen and coming back here shows the
    │       │   │                          real post-sale quantity without a manual pull
    │       │   ├── orders.tsx             open orders (GET /api/me/orders?status=open);
    │       │   │                          also refetches on focus
    │       │   ├── trade-history.tsx      closed orders (?status=closed); also refetches
    │       │   │                          on focus
    │       │   ├── [symbol].tsx           re-exports screens/StockScreen.tsx — same stock
    │       │   │                          screen as watchlists/stock/[symbol].tsx, reached
    │       │   │                          from tapping a Holdings row. No sibling dynamic
    │       │   │                          segment here (banking/ is a static name), so no
    │       │   │                          ambiguity risk the way watchlists/ had one.
    │       │   └── banking/
    │       │       ├── index.tsx          hub: cash + settled cash, linked-bank card,
    │       │       │                      the 3 actions, transfer history w/ status
    │       │       │                      pills and per-row cancel
    │       │       ├── transfer.tsx       BOTH directions — ?direction=deposit|withdraw
    │       │       │                      flips From/To. Amount -> Review -> confirm
    │       │       │                      (two steps on purpose for money movement).
    │       │       │                      Routes you to bank.tsx if nothing is linked
    │       │       └── bank.tsx           add (routing/account/type/nickname) or
    │       │                              remove the one linked bank
    │       ├── education/index.tsx   placeholder ("coming soon") — formerly research/
    │       └── settings/
    │           ├── _layout.tsx           Stack: index -> profile
    │           ├── index.tsx             Profile link + "Sign Out"
    │           └── profile.tsx           read-only: name/email/phone from Supabase,
    │                                     address+DOB fetched live from Alpaca on open
    │                                     (never stored, see §9), investment/employment/
    │                                     marital answers from investor_profiles
    ├── src/lib/
    │   ├── api.ts                 API_BASE + apiFetch() — attaches the Supabase session
    │   │                          token to every backend call. No hardcoded account id
    │   │                          anywhere; the backend derives it from the token (§3)
    │   ├── passwordRules.ts       password requirements, shared by the live checklist UI
    │   │                          and the zod schemas on signup/reset-password
    │   ├── financialProfile.ts    questionnaire options + label helpers for rendering
    │   │                          stored bracket min/max pairs back into text. Mirrors
    │   │                          the backend's data/financialProfile.ts — keep in sync
    │   ├── usStates.ts            USPS state/territory list for the KYC dropdown — mirrors
    │   │                          the backend's data/usStates.ts (see §8's backend tree)
    │   ├── supabase.ts            anon-key client (auth + watchlists/settings). Session
    │   │                          storage uses AsyncStorage, not expo-secure-store. Never
    │   │                          throws on missing config (would crash web SSR);
    │   │                          degrades to a clean network-error message instead.
    │   │                          `detectSessionInUrl: true` — needed on web so clicking
    │   │                          an emailed confirmation/recovery link actually
    │   │                          establishes a session (see §12)
    │   └── purchases.ts           configurePurchases()/resetPurchases() — RevenueCat SDK
    │                              setup (added 2026-09-02, see §15). Configures with the
    │                              Supabase user id as RevenueCat's own app_user_id, called
    │                              from useAuthState.ts whenever a session resolves. Never
    │                              throws on a missing API key, same philosophy as
    │                              supabase.ts's placeholder fallback above
    ├── src/context/
    │   └── AuthStateContext.tsx   wraps the ONE useAuthState() instance the root layout
    │                              routes on, so onboarding.tsx/pending.tsx can call
    │                              its `refresh()` and have the SAME state update —
    │                              calling useAuthState() again from those screens would
    │                              make an independent, useless copy (see §12)
    ├── src/hooks/
    │   ├── useAuthState.ts       drives the router state machine: signed-out /
    │   │                         needs-onboarding / needs-investment-profile / pending /
    │   │                         active, from a Supabase session + DB reads. If the
    │   │                         alpaca_accounts row exists but isn't ACTIVE, also calls
    │   │                         GET /api/me/status to re-check with Alpaca before
    │   │                         settling on "pending". Returns `{ status, refresh }` —
    │   │                         refresh() re-evaluates on demand, used before navigating
    │   │                         after onboarding/questionnaire/status-check actions.
    │   │                         Ignores the `PASSWORD_RECOVERY` auth event specifically —
    │   │                         reset-password.tsx owns that moment until a new password
    │   │                         is actually set (see §12)
    │   ├── useWatchlists.ts      Supabase-backed, RLS-scoped to the logged-in user
    │   │                         (watchlists + watchlist_items). Optimistic local updates
    │   │                         so callers keep a fire-and-forget-feeling API;
    │   │                         react-query still not wired in (§11 next steps)
    │   └── useEntitlement.ts     `{ isPremium, loading }` — reads public.subscriptions
    │                             directly via RLS (added 2026-09-02, see §15), same
    │                             "backend writes, client reads straight from Supabase"
    │                             pattern as alpaca_accounts. Refetches on focus. Not yet
    │                             used anywhere — nothing in the app actually gates on
    │                             this yet, see §15's "still needed" list
    │                             so callers keep a fire-and-forget-feeling API;
    │                             react-query still not wired in (§11 next steps)
    ├── src/components/            small reusable UI pieces (not full screens — see
    │   │                           src/screens/ below for those)
    │   ├── FormField.tsx         labeled TextInput + error text, used by every auth/KYC form
    │   ├── SelectField.tsx       labeled Picker row, used by questionnaire + banking dropdowns
    │   ├── PasswordRequirements.tsx  live checklist, green checks as each rule is met
    │   ├── OrderList.tsx         shared order-row list, used by both Orders and Trade History
    │   ├── ToggleField.tsx       labeled Switch row, used by the KYC disclosure questions
    │   ├── HazyText.tsx          the "hazy" chromatic double-shadow text effect (§1)
    │   └── SpectrumStripe.tsx    the spectrum-stripe bar motif + small logo mark (§1)
    ├── src/screens/                full screen components shared across multiple routes
    │   │                           (route files re-export these — see expo-router's
    │   │                           "same screen, multiple paths" pattern, §12)
    │   ├── StockScreen.tsx       the per-symbol screen (added 2026-09-02) — owns the route
    │   │                         param, screen title, and single SafeAreaView; renders a
    │   │                         3-way tab switcher (Company Info / Trade / Financials,
    │   │                         default Trade) and the matching pane below it, wrapped in a
    │   │                         KeyboardAvoidingView (iOS "padding" behavior; Android relies
    │   │                         on Expo's default window-resize) so the Amount keyboard
    │   │                         doesn't cover the field being typed into. Re-exported by
    │   │                         both watchlists/stock/[symbol].tsx and account/[symbol].tsx
    │   │                         so each stays in its own tab's back-stack (this re-export
    │   │                         pair used to point at TradeScreen.tsx directly, before it
    │   │                         became one of three panes)
    │   ├── TradeScreen.tsx       the Trade pane — bid/ask (or last price), an order form, and
    │   │                         — when the symbol is held — a "Your Position" card (shares
    │   │                         owned, shares actually available to sell vs. tied up in
    │   │                         another pending order, market value, avg cost, $ + %
    │   │                         unrealized P&L). Every number there is Alpaca's own position
    │   │                         data via GET /api/me/positions, re-fetched after every order
    │   │                         — nothing is computed or cached client-side. Takes `symbol`
    │   │                         as a prop, not a route param — it's StockScreen's child, not
    │   │                         a route target itself. Order form redesigned 2026-09-02:
    │   │                         Side/Order Type/Trading Hours are dropdowns (SelectField,
    │   │                         same component the questionnaire/banking screens use) that
    │   │                         all start unselected; a single Buy/Sell action button
    │   │                         (vibrant green/red — colors.buyGreen/sellRed in theme.ts,
    │   │                         deliberately more saturated than the muted phosphor/rust
    │   │                         used for P&L semantics) only appears once Side has a value
    │   │                         and only becomes tappable once every currently-visible
    │   │                         dropdown does. Amount starts empty (no prefilled 20/0.2)
    │   │                         with a caption underneath driven by real account/position
    │   │                         data — "Amount left to invest: $X" (buy) or "Max quantity
    │   │                         allowed" / "Max amount you can sell" (sell, from the
    │   │                         position's own qty_available)
    │   ├── CompanyInfoPane.tsx   the Company Info pane — symbol, exchange, industry, market
    │   │                         cap, shares outstanding, IPO date, website. GET
    │   │                         /api/company/:symbol/profile (Finnhub — see §13)
    │   └── FinancialsPane.tsx    the Financials pane — P/E, EPS, dividend yield, profit
    │                             margin, revenue/share, 52-week high/low, beta. GET
    │                             /api/company/:symbol/financials (Finnhub — see §13).
    │                             Deliberately a curated handful of figures, not a dense
    │                             fundamentals dashboard — see the pane's own header comment
    ├── app.json / package.json / tsconfig.json
```

Note: `(auth)` and `(tabs)` folder names include the literal parentheses — they are
expo-router route groups that don't appear in the URL. Layout files must be named
`_layout.tsx` with the leading underscore.

**Typed routes are DISABLED.** app.json's `typedRoutes` experiment caused real problems
(a shipped navigation bug from trusting its wrong `.../index` suggestion, then a
typecheck failure when its generated types drifted for unrelated reasons) for no real
benefit at this project's size. `useSegments()`/`router.push()` take plain strings — no
`Href` casts needed anywhere.

**Never put two dynamic segments as siblings in the same folder** (e.g. `watchlists/
[watchlistId]/` and `watchlists/[symbol].tsx` both directly under `watchlists/`).
expo-router doesn't error on this — it silently picks ONE of them for every matching
URL. Confirmed live: with both present, `/watchlists/NVDA` matched `[watchlistId]/
index` (treating "NVDA" as a watchlist id) instead of the intended `[symbol]` route,
rendering a plain empty-watchlist screen with zero indication anything was wrong — no
error, no warning, just the wrong screen. Fix: give one of them a static prefix
segment so they stop competing (`watchlists/stock/[symbol].tsx`, not `watchlists/
[symbol].tsx`). If a route ever needs to be reachable from two different tabs with
each tab keeping its own correct back-stack (e.g. `screens/StockScreen.tsx`, reached
from both Watchlists and Account), duplicate a thin re-export file
(`export { default } from "../../../screens/StockScreen"`) in each tab's own folder
rather than trying to share one URL across tabs — don't duplicate the actual
component logic, just the route file.

**Hiding the bottom tab bar on a sub-route (added 2026-09-02, `(tabs)/_layout.tsx`)**
uses `getFocusedRouteNameFromRoute` (from `@react-navigation/native` — a transitive
dep of expo-router, re-exported from `@react-navigation/core`, and directly
importable even though it's not in expo-router's own public API) inside the `<Tabs>`
component's `screenOptions` function, keyed off each tab's OWN nested-Stack route
names (the literal `Stack.Screen name=` values in that tab's `_layout.tsx` — e.g.
`"stock/[symbol]"`, `"holdings"`, `"[symbol]"`, `"profile"`). Setting
`tabBarStyle: {display:"none"}` this way removes the bar entirely rather than fading
it — there's nothing left to tap, so the only way back to it is pressing back and
popping the screen off that tab's stack. That's the actual point: it's what
guarantees the same stock/Holdings/Profile screen can never end up pushed and left
open in two tabs' stacks at once, since you always have to fully back out of a
sub-route before a different tab is reachable again. Centralizing this in one
`screenOptions` function (rather than a `useFocusEffect` + `navigation.getParent()`
call in every sub-screen) was deliberate: expo-router's `<Tabs>` explicitly types
`id` as `undefined`-only, so the usual React-Navigation `getParent(id)` pattern for
reaching an ancestor navigator from deep inside a nested stack isn't available here.
- **A `display:"none"` element still counts in a Playwright `.count()`/`getByText()`
  check** — it's hidden, not removed from the DOM, so a tab-bar-visibility test that
  only checks element count instead of `.isVisible()` will report the bar as
  "present" even when it's genuinely invisible on screen. Same family of mistake as
  the stale-mounted-input lesson elsewhere in this file: check actual visibility,
  not just DOM presence.
- **React Native Web's `Pressable` has no real `disabled` DOM property to check
  either** — it renders as a plain `<div>` (no `role="button"`, no `<button>` tag)
  and signals disabled state via `aria-disabled="true"` on an ancestor div, which is
  *absent* (not `"false"`) when enabled. A test that does `el.disabled === true` or
  `getAttribute("aria-disabled") === "false"` will silently get `null` either way —
  walk up for `aria-disabled !== null` for the disabled case, and treat "attribute
  missing" as enabled (`!== "true"`), not as an equality check against `"false"`.

**Supabase client must never throw at import time.** `src/lib/supabase.ts` is imported
by the root layout; `app.json`'s `web.output` is `"single"` (plain SPA, no SSR) because
this app is mobile-first and doesn't need SSR — `web.output: "static"` previously made
expo-router server-render every web request, and anything the Supabase client did at
import/construction time (including `AsyncStorage.getItem()`, which touches `window`)
crashed that Node-side SSR pass, taking down the *entire* app. `lib/supabase.ts` also
falls back to a placeholder URL/key instead of throwing when unconfigured, so a missing
`.env` fails at the network layer with a normal catchable error instead of crashing.

---

## 9. Database schema (Supabase Postgres)

Supabase provides `auth.users` automatically. Around it:

- **profiles** — id (→ auth.users), first_name, last_name, phone, created_at.
  (Auto-created by a DB trigger on signup; non-sensitive display data only.)
- **alpaca_accounts** — user_id, alpaca_account_id, account_status, created_at.
  THE critical mapping from logged-in user → brokerage account. RLS: **read-only** for
  the owning user — no insert/update/delete policy for `authenticated` at all, since a
  client that could rewrite its own row could point itself at someone else's brokerage
  account. Only the backend's service-role key (which bypasses RLS) ever writes it.
- **watchlists** — id, user_id, name, created_at.
- **watchlist_items** — id, watchlist_id, symbol, added_at. No `user_id` of its own —
  its RLS policy checks ownership through the parent `watchlists` row.
- **user_settings** — user_id + preference columns (theme, notifications, etc.).
- **investor_profiles** — user_id + the investment/employment questionnaire: annual
  income / total net worth / liquid net worth as min+max bracket pairs (what Alpaca's
  API takes, not free-form figures), time_horizon, employment_status, employer_name,
  marital_status. Same RLS shape as `alpaca_accounts` — owner can read, only the
  backend's service-role key writes, since the row must stay in sync with what was
  actually PATCHed to Alpaca. Not a §2 exception: SSN still never touches our DB. This
  is descriptive financial data, not identity documents.
- **subscriptions** — user_id, revenuecat_app_user_id, entitlement, status ('active' |
  'expired'), product_id, expires_at, updated_at. The RevenueCat entitlement mirror
  (added 2026-09-02, not yet applied — see §15). Same RLS shape as `alpaca_accounts`:
  owner can read, only the backend's RevenueCat webhook (service-role key) writes it —
  a client that could write its own row could grant itself premium for free.

Every table has RLS enabled. There is NO table for KYC PII (address, DOB, SSN) or
holdings — PII is passed through to Alpaca and discarded; holdings live at Alpaca and
are fetched live. The Settings → Profile screen fetches address/DOB from Alpaca
on-demand (only when Profile is opened, not eagerly) via `GET /api/me/kyc-details`,
which never returns `tax_id`.

Migrations `0001_init.sql`, `0002_grants.sql`, `0003_investor_profiles.sql` have all
been applied, in order, to the real project (`avhnfuffwevdcwapkmnh`). A fresh project
needs all four (including `0004_subscriptions.sql`), in order — see §12 for why GRANTs
and RLS are both required. **`0004_subscriptions.sql` has NOT been applied yet** — it
exists in the repo but needs to be run via the Supabase SQL editor before the
RevenueCat webhook can write anything real (see §15).

---

## 10. Backend API

- `GET  /health`

**Public, not account-scoped (`routes/alpaca.ts` — same data for every user, nothing
to authenticate). The old dev-only account-scoped routes that used to live here
(`/api/alpaca/accounts`, `/test-account`, `/accounts/:id/*`) were deleted 2026-08-11
once real banking replaced the last thing that used them:**
- `GET  /api/alpaca/quotes/:symbol` — best bid/ask + last trade + a `reliable` flag
  (see §12's IEX-feed gotcha) for one symbol. Polled every 3s by the trade screen.
- `GET  /api/alpaca/quotes?symbols=`, `/api/alpaca/snapshots?symbols=` — same, for
  several symbols at once (market data, `alpaca-data.ts`).
- `GET  /api/alpaca/assets/search?q=` — ticker/company-name autocomplete, ranked,
  capped at 6 results. Empty `q` returns `[]`.
- `GET  /api/alpaca/assets/:symbol` — exists-and-tradable check; 404 if not. The
  authoritative gate before a symbol is ever added to a watchlist (`assetSearch.ts`).
- `GET  /api/company/:symbol/profile` — company info for the stock screen's Company
  Info tab (`companyData.ts`, Finnhub-backed). 404 if Finnhub has no profile for the
  symbol; 503 if `FINNHUB_API_KEY` isn't set.
- `GET  /api/company/:symbol/financials` — curated fundamentals for the Financials
  tab (same backing). Same 404/503 shape.

**Real, user-aware (account id ALWAYS derived from `req.user.id`, never from the client):**
- `POST /api/me/onboard` — idempotent KYC submission. Pulls name/phone from `profiles`
  and email from the session (never the client), builds the Alpaca payload, creates
  the account, saves only `{ alpaca_account_id, account_status }`.
- `GET  /api/me/status` — re-checks the account with Alpaca and syncs `alpaca_accounts`
  if it changed. Called by the pending screen's "Check status" and by `useAuthState` —
  onboarding only writes status once at creation, so nothing else keeps it current.
- `POST /api/me/investment-profile` — the post-KYC questionnaire. PATCHes Alpaca first,
  saves to `investor_profiles` only if that succeeded.
- `GET  /api/me/account` — cash / buying power / portfolio value.
- `GET  /api/me/positions` — holdings.
- `GET  /api/me/orders?status=open|closed|all` — `open` backs Orders, `closed` backs
  Trade History.
- `POST /api/me/orders` — place an order (notional XOR qty, limit/stop need their
  price, sells checked against current holdings first — no short selling).
  `extended_hours: true` is accepted only when `type: "limit"` — 400s otherwise,
  since Alpaca itself rejects that combination (see §6).
- `GET  /api/me/kyc-details` — address + DOB fetched live from Alpaca for the Profile
  screen. Returns ONLY those fields, never the raw Alpaca response (which contains
  `tax_id`).
- `GET  /api/me/bank` — the one linked bank, masked to `{nickname, type, last4,
  status}`. `{bank:null}` when nothing is linked. Never returns the full account
  number or Alpaca's relationship id.
- `POST /api/me/bank` — link a bank (routing + account number, ABA-checksum
  validated). Owner name comes from `profiles`, never the client. 409 if one is
  already linked.
- `DELETE /api/me/bank` — unlink. The relationship id is looked up server-side.
- `GET  /api/me/transfers` — history, newest first, with Alpaca's nine statuses
  collapsed to `pending | complete | rejected | canceled` (raw status rides along).
- `POST /api/me/transfers` — `{direction: "deposit"|"withdraw", amount}`. Translates
  to Alpaca's INCOMING/OUTGOING; withdrawals are pre-checked against
  `cash_withdrawable`.
- `DELETE /api/me/transfers/:id` — cancel a transfer that hasn't reached clearing.

**Server-to-server, not client-facing (RevenueCat's own servers call this, never the app):**
- `POST /api/webhooks/revenuecat` — the only writer of `public.subscriptions`.
  Authenticated by a shared secret in the Authorization header, not a Supabase session.
  See §15.

Every mobile screen goes through `apiFetch()` (`lib/api.ts`), which attaches the
Supabase session token; the backend derives the Alpaca account id from it.
`routes/alpaca.ts`'s account-scoped routes are dead code now and get deleted before
production; its market-data routes stay.

---

## 11. Current state

Phase 1 (Alpaca sandbox core loop) and Phase 2 (Supabase auth + KYC + real per-user
ownership) are both complete. Every screen is backed by real session-derived data —
no hardcoded account id anywhere, no on-device-only watchlists. See §8 for the exact
file tree.

- **Auth flow:** Welcome → Sign Up → email confirmation (OTP code, not a magic link —
  see §12) → Onboarding (KYC) → Investment/Employment questionnaire → Pending (polls
  Alpaca status) → main app once `ACTIVE`. Forgot/reset password uses the same
  OTP-code pattern. Sign-out is reachable from every stage of the flow, not just
  Settings.
- **Main app:** Watchlists (Supabase-backed, RLS-scoped, multiple named lists),
  Account (Holdings / Orders / Trade History / Banking, all session-derived),
  Education (placeholder), Settings → Profile (read-only — name/phone/email from
  `profiles`, questionnaire answers from `investor_profiles`, address/DOB fetched
  live from Alpaca only when Profile is opened, never stored — see §9).
- **Banking (added 2026-08-11):** ACH deposits, withdrawals, and bank linking, all
  through Alpaca. Verified end-to-end against the sandbox with a real Playwright
  run: link a bank (bad routing numbers rejected by the ABA checksum before the
  round trip), deposit → review → confirm, watch it land in the history, cancel a
  still-pending transfer, get blocked trying to withdraw more than settled cash,
  and remove the bank. Phase 1's dev-only `/api/alpaca/accounts/:id/*` routes
  (including the old `/fund` scaffolding) were deleted at the same time — only the
  market-data routes remain in `routes/alpaca.ts`.
- **Infrastructure:** real Supabase project (`avhnfuffwevdcwapkmnh`), real Alpaca
  sandbox (fake money). Custom SMTP via Resend is wired up and `simplapp.us` is fully
  verified (sender `noreply@simplapp.us`) — real signups now deliver an actual emailed
  OTP code to any address, confirmed end-to-end (see §12's plus-addressing gotcha).
- **Known gaps:**
  - No way to delete an entire watchlist (only individual symbols).
  - `@tanstack/react-query` isn't wired in for watchlists yet — works today via plain
    `useState` + optimistic updates, but caching/refetch is manual.
  - The SUBMITTED→ACTIVE sandbox sync logic is proven correct (a
    deliberately-corrupted-status test confirmed it self-heals), but a real
    Alpaca-side approval landing on its own hasn't been directly observed yet.
  - Banking has no wire transfers (deliberate — sandbox is ACH-only) and no Plaid
    bank login yet (typed routing/account number only).
  - A REJECTED/RETURNED transfer's styling has never been seen against real data —
    Alpaca's sandbox `additional_information` status fixture is wire-only, so an
    ACH transfer can't be forced to fail. The code path is written and the pill
    colors exist; only Pending/Complete/Canceled have actually been observed.
  - The Company Info/Financials tabs (§14) are built, typecheck, and are now
    verified live against a real Finnhub key: both the "not configured" 503 path
    and a real AAPL response were confirmed via curl (name, exchange, industry,
    market cap ~$4.75T, EPS $8.72, P/E 34.36, profit margin 27.6% — all internally
    consistent) and an unknown symbol 404s cleanly. Not yet checked: the actual
    `CompanyInfoPane`/`FinancialsPane` screens rendering this in the app (only the
    backend routes have been hit directly so far), and Finnhub's free-tier rate
    limit (60 calls/min) hasn't been stress-tested — fine for one developer
    clicking around, revisit before any real traffic.
- **Stock search (added 2026-08-13):** adding a ticker now autocompletes by symbol
  prefix OR company name (`GET /api/alpaca/assets/search?q=`), and anything actually
  added is validated to exist and be tradable first (`GET /api/alpaca/assets/:symbol`
  — 404 rejects it before it ever reaches Supabase). Backed by an in-memory cache of
  Alpaca's ~13.3k tradable US-equity assets (`assetSearch.ts`), refreshed daily,
  loaded lazily on first request rather than at boot (an eager fetch would add
  multi-second delay to every `tsx watch` hot-reload in dev). OTC-exchange tickers
  are filtered out of both search and validation — OTC skews toward thin/speculative
  penny stocks, which cuts against §1's "people trying to stop day trading" audience;
  revisit if a real use case needs one. Verified end-to-end via Playwright: prefix
  search, company-name search, clicking a suggestion adds immediately (no extra
  round trip — it's already a known-valid symbol from the cache), a duplicate
  add is blocked with a message, and a garbage ticker like "BAAAAA" is rejected
  with a clear error and never reaches the watchlist.
- **Stock screen restructure + Education rename (added 2026-09-02):** the old
  standalone trade screen is now one of three tabs (Company Info / Trade /
  Financials — §5, §14) on a shared `StockScreen.tsx`; the former "Research"
  placeholder tab is renamed "Education", freed up for financial-education videos
  to be uploaded later. Also added: a standing "quotes reflect one exchange only"
  disclaimer on the Trade tab (§13), always shown regardless of the existing
  `reliable` flag.
- **Three UI fixes, same day (2026-09-02):** (1) `StockScreen.tsx` wraps its
  content in a `KeyboardAvoidingView` so the on-screen keyboard no longer covers
  the Amount field on iOS. (2) The bottom tab bar now hides entirely on any
  sub-route one level past a tab's own root (stock screens, Holdings, Orders,
  Trade History, Banking, Profile) — the only way back is pressing back, which is
  what guarantees the same sub-route can't end up pushed open in two tabs' stacks
  at once (§12). (3) The Trade tab's order form is dropdown-driven now — Side /
  Order Type / Trading Hours (`SelectField`, all starting unselected) gate a
  single vibrant green/red Buy-or-Sell action button; Amount starts empty with a
  live "Amount left to invest" / "Max quantity allowed" caption underneath, sourced
  from the real account cash balance and the position's own `qty_available`. All
  three verified live via Playwright against the real dev servers (14 tab-bar
  checks + 8 trade-form checks, all passing) — not just typechecked.

**Immediate next steps:**
1. Wire `@tanstack/react-query` into the watchlists hook.
2. Real Education content (video lessons), editing on the Profile screen, subscription
   paywall.
3. Level 2 / order-book depth is deliberately NOT built — Alpaca's equities data is
   top-of-book only at every tier (confirmed against their own docs), so a real
   depth ladder isn't possible through this integration; anything resembling one
   would be fabricated numbers styled as a live market. Revisit only if the app
   subscribes to a direct exchange feed (e.g. Nasdaq TotalView) — a distinct,
   separately-priced product, not a plan upgrade on the existing Market Data API.
4. Banking follow-ons when they matter: Plaid bank login, wire transfers,
   recurring/automatic deposits.

---

## 12. Conventions & gotchas (READ THESE — they cause the most wasted time)

- **Secrets never on the device.** Alpaca keys live only in the backend `.env`. The app
  talks only to our backend.
- **Account id from the session, never from the client.**
- **NodeNext imports use `.js` extensions even for `.ts` files** (e.g.
  `import { x } from "./routes/alpaca.js"`). This is correct, not a bug.
- **`API_BASE` (`lib/api.ts`) derives itself now — it is NOT a hardcoded IP
  anymore.** It used to be a literal string you had to hand-edit, and it went stale
  silently three separate times (each looking exactly like "the backend is down"
  when the backend was fine) because a hardcoded LAN IP breaks the instant the dev
  machine's network changes. As of 2026-08-13 it's computed by `resolveApiBase()`:
  web → `localhost`; simulator/emulator → `localhost`/`10.0.2.2`; physical device →
  `Constants.expoConfig.hostUri`'s host, i.e. whatever address Expo/Metro actually
  used to reach THIS device over the QR code. If that worked, port 4000 on the same
  host works too — no more IP-hunting, and it self-heals across network changes on
  every reload. A hardcoded fallback stays in the code for the edge case where
  `hostUri` is ever unset (e.g. a standalone build with no dev server) — only touch
  that line, and only if you actually land on it.
  - `localhost` still NEVER works from a physical phone — that's exactly why the
    derivation above exists instead of a fixed value.
  - If a physical device still can't reach the backend after this: reload the app
    (shake → Reload) so `API_BASE` recomputes, then check for an active VPN — many
    clients (NordVPN included) block/reroute LAN traffic while connected, which
    looks identical to a firewall problem (Expo Go times out scanning the QR code)
    but isn't. A VPN disconnecting also changes the adapter/subnet, so restart
    `npx expo start` afterward and confirm the phone's Wi-Fi IP is on the same
    subnet as the PC's.
- **CORS:** required for Expo web testing (browser cross-origin). Registered via
  `@fastify/cors`. Native (phone/emulator) doesn't need it. **`methods` must be
  listed explicitly** — `@fastify/cors` defaults `Access-Control-Allow-Methods` to
  just `GET,HEAD,POST`, so a browser preflight rejects DELETE (and PATCH/PUT)
  before it reaches any route. This is silent and confusing: the route is correct,
  a direct `curl` works, and only the web build fails. It first bit when banking
  added the app's first DELETE calls (remove bank, cancel transfer) — both did
  nothing on Expo web while working fine everywhere else. Check
  `curl -i -X OPTIONS <url> -H "Origin: http://localhost:8081" -H
  "Access-Control-Request-Method: DELETE"` if a new verb ever "does nothing".
- **Never bump individual `expo-*` / React Native packages by hand (e.g. `npm install
  expo-router@latest`) — always use `npx expo install <pkg>` (or bare `npx expo
  install` to resync everything), and run `npx expo-doctor` after any dependency
  change.** A bare `npm`-style bump can pull a package's newest npm version, which may
  belong to a completely different Expo SDK line than the rest of the tree — this
  already happened once (`expo` stayed on SDK 53 while `expo-router`/`expo-constants`
  jumped to SDK 57, `react-native` was still 0.72, `metro` was 0.76.9) and broke
  `expo start` with a hard-to-read `Cannot find module 'metro/src/...'` crash. Fix
  with `npx expo install --fix` (realigns `dependencies`, not `devDependencies` — check
  `typescript`/`@types/react` manually against what `expo-doctor` reports), then delete
  `node_modules` + the lockfile and reinstall clean. If `expo install --fix` bumps
  `react-native-reanimated` to v4.x, it now needs a separate `react-native-worklets`
  peer dependency (the v3→v4 split) — `npm install` will ERESOLVE-fail on a missing
  peer until it's added; check `npm view react-native-reanimated@<version>
  peerDependencies` if this happens again.
- **The project currently targets Expo SDK 54** (bumped from 53 on 2026-08-10 because
  Expo Go on a physical phone only supports one SDK line at a time and had moved past
  53). If Expo Go reports "Project is incompatible with this version of Expo Go" again,
  that's this same situation recurring — the fix is bumping the project's `expo`
  version to match Expo Go's current SDK (check `npm view expo versions --json`, note
  npm's `latest` tag may be several SDKs ahead of what Expo Go actually ships — match
  the exact SDK number the error message states, not just "latest"), not downgrading
  the phone's app.
- **Expo Go can no longer run this app, as of `react-native-purchases` being added
  2026-09-02.** That's not a bug to fix — RevenueCat's SDK has real native iOS/Android
  code that Expo Go doesn't ship, so any screen touching it (directly or via
  `useAuthState.ts`, which now calls `configurePurchases()` on every session) needs a
  custom dev client instead. One-time setup: `npx expo install expo-dev-client` (already
  done) and either `eas build --profile development --platform ios|android` (needs an
  Expo/EAS account) or `npx expo run:ios` / `npx expo run:android` for a local native
  build. From then on, run that dev client instead of Expo Go — `npx expo start` still
  works the same way to serve JS to it. The web preview (`w` in the terminal) still
  launches fine since Metro doesn't need the native module to bundle, but purchases
  themselves won't work there (RevenueCat's web support is a separate Stripe-backed
  product, "RevenueCat Billing," not this SDK) — same "web is a logic preview, not
  accurate for everything" caveat as always (§16), just now extended to an entire
  feature category, not just visual fidelity.
- **Most current Google Fonts are shipped as variable-only TTFs (no static weight
  cuts), and React Native's Text component can't select a variable font's weight axis
  the way CSS `font-weight` can** — loading one directly gets you stuck at whatever
  the file's default instance is, regardless of the `fontWeight` style. Two fixes: (1)
  pick a family that still ships static weights (check
  `github.com/google/fonts/tree/main/ofl/<family>` for plain `Name-Weight.ttf` files,
  not `Name[wght].ttf`) — this is why the app uses Zilla Slab instead of Fraunces for
  its display face; or (2) instantiate a specific static weight yourself with `pip
  install fonttools` then `python -m fontTools.varLib.instancer -o out.ttf
  in-variable.ttf wght=600` — this is how `IBMPlexSans-Regular.ttf` /
  `-SemiBold.ttf` in `assets/fonts/` were produced from Google's variable source, and
  is the reliable path since native variable-font weight interpolation support is
  inconsistent across RN/iOS/Android versions. `expo-font`'s `useFonts()` + holding
  `expo-splash-screen` open until it resolves is the loading pattern in use
  (`app/_layout.tsx`).
- **Only list a package in `app.json`'s `plugins` array if it actually ships an
  `app.plugin.js`.** If it doesn't, Expo's config-plugin resolver falls back to
  requiring the package's plain `main` entry instead — for Expo SDK packages this is
  often raw, untranspiled `src/index.ts` (fine for Metro, which transpiles TS; not fine
  for a direct Node `require()`), and it crashes `expo start` in a way that looks like
  a Node/TypeScript problem but isn't. `expo-image` doesn't need a plugins entry (no
  native config to set) — confirm with `ls node_modules/<pkg>/app.plugin.js` before
  adding one for any other package.
- **Fractional / notional orders are market + day only** and fill during regular US
  market hours (9:30am–4pm ET, weekdays). Off-hours orders queue and positions stay
  empty until the next open — this is expected, not a bug.
- **Sandbox funding simulates ACH delay** (can take ~10–30 min to reflect); production
  ACH takes 1–3 business days — set that expectation in the UI.
- **Sandbox deposits complete but stay unsettled**: a sandbox ACH deposit reaches
  `COMPLETE` and raises `cash`, but `cash_withdrawable` stays `$0.00` until Alpaca's
  own settlement clock advances. So "deposit then immediately withdraw" always fails
  the settled-cash check in sandbox — that's correct behavior being correctly
  enforced, not a bug in the withdrawal flow.
- **A `<Tabs.Screen name=...>` must match the ACTUAL route name, or the tab silently
  renders the raw route string as its label.** A tab folder with its own
  `_layout.tsx` registers as the folder name (`settings`); a bare `index.tsx` with no
  layout registers as `research/index`. The Research tab read literally
  "research/index" in the tab bar for exactly this reason. No error, no warning — it
  just prints the route.
- **Alpaca tax_id validation** (sandbox): rejects area 000/666, rejects sequential
  numbers (123456789), rejects invalid characters. Use realistic-looking test SSNs.
- **Closing an Alpaca account does NOT free its email for reuse.** "Delete" on a real
  broker-dealer account (even sandboxed) means transitioning to `ACCOUNT_CLOSED`, not
  erasure — Alpaca keeps closed accounts on file permanently (regulated recordkeeping)
  and rejects a new signup with "an account with the requested email address already
  exists" even after closure. There is no way to reuse a burned test email at the
  Alpaca layer, period.
- **`simplapp.us` is verified in Resend (DKIM + SPF on `send.simplapp.us`), sender is
  `noreply@simplapp.us` — Resend can now email any address, not just the account
  owner's.** This unlocked the real testing workflow: use Gmail plus-addressing
  (`you+test1@gmail.com`, `you+test2@gmail.com`, ...) for repeat signups. Neither
  Supabase nor Alpaca understands `+tag` aliasing — each variant is a fully distinct
  account to both of them (so it also sidesteps the Alpaca closed-account email
  lock above) — while Gmail still delivers all of them to your one real inbox.
  Confirmed working end-to-end: real signup, real emailed 8-digit code, real Alpaca
  account creation. Supabase's own per-project email-send rate limit (next bullet)
  still applies regardless of domain verification — don't script a tight loop of
  many signups back-to-back.
- **Supabase's own email-send rate limit is separate from Resend's restrictions and
  still applies post-verification** — heavy signup/resend/reset testing can trip
  `over_email_send_rate_limit` (429) even with a fully verified sending domain. Not a
  bug, resets after a window. `admin.auth.admin.generateLink()` /
  `admin.auth.admin.createUser()` bypass real email sending entirely (no rate-limit
  impact), which is why they're the right tool for scripted/automated auth-flow tests
  rather than real repeat signups.
- **Money-app safety:** generate a unique client order id per buy so a network retry
  can't place a duplicate order.
- **Dev environment:** Windows + PowerShell. Use `curl.exe` (not the `curl` alias) for
  API testing; quote JSON bodies with single quotes.
- **Supabase's "Confirm signup" and "Reset Password" email templates must be edited to
  show `{{ .Token }}`** before the OTP screens work with real email — dashboard:
  Authentication → Emails → Templates. Supabase always generates the OTP token
  alongside the magic link, but the default template only renders
  `{{ .ConfirmationURL }}`, so the code is computed and simply never shown unless the
  template displays it. Editing templates requires custom SMTP to be configured first
  (Supabase locks template editing on the default mailer) — see the Resend note above.
  Prefer replacing the link entirely with code-only content: a link-based confirmation
  is fundamentally unreliable regardless of template/domain/SMTP setup, because email
  clients and corporate mail scanners (Gmail included) routinely pre-fetch links
  server-side to check for phishing — since Supabase's confirmation tokens are
  single-use, this silently burns the token before a human ever clicks it. This is why
  the OTP-code screens exist instead of relying on the emailed link.
- **Supabase's own email-send rate limit is easy to hit during heavy testing** —
  signups, resends, and password-reset requests all count against it, and the default
  is low enough that a single session can trip `over_email_send_rate_limit` (429). Not
  a bug; it resets after a window. `generateLink()` doesn't count against it.
- **Double-check Authentication → URL Configuration → Site URL in the Supabase
  dashboard** if a real emailed link behaves inconsistently — it needs to match
  whatever port/host the app is actually reachable at for whoever clicks it.
- **`account_status` in `alpaca_accounts` needs an explicit re-check to ever change
  after onboarding** — nothing polls Alpaca automatically in the background. `GET
  /api/me/status` does the re-check; it only runs when something calls it (app
  launch, an auth event, or the pending screen's button), not on a timer.
- **Any screen that navigates based on a state change that ISN'T a Supabase auth
  event must `refresh()` the shared `AuthStateContext` first, or the root layout's
  guard will bounce the navigation right back.** The guard re-runs on every route
  change using whatever `useAuthState` last computed; if that screen just changed
  what the "right" status is (onboarding completing, a questionnaire submitted, a
  status check finding ACTIVE) without telling the hook, the guard still has the old
  value and reasserts it. Import `useAuthStateContext` (not `useAuthState` directly —
  that makes an independent, useless copy) and `await refresh()` before
  `router.replace`.
- **`verifyOtp({type:"recovery"})` fires a distinct `PASSWORD_RECOVERY` auth event**,
  not a normal sign-in event — `useAuthState` explicitly ignores it so the guard
  doesn't yank the user into onboarding/pending/tabs before `reset-password.tsx` has
  let them actually set a new password.
- **SQL injection isn't reachable in this codebase** — every DB read/write goes
  through the Supabase JS client's query builder (parameterized under the hood via
  PostgREST), and there's no raw SQL string-building anywhere in
  `simpl-trading-backend/src`. Input validation (zod schemas, format checks) is real
  defense-in-depth, not a fix for an actual injection hole.

---

## 13. Alpaca specifics

- Sandbox base URL: `https://broker-api.sandbox.alpaca.markets`
  (production: `https://broker-api.alpaca.markets`).
- Auth: **HTTP Basic** — key ID as username, secret as password, base64-encoded.
- **Market Data API is a separate host, and sandbox has its OWN data host** —
  `https://data.sandbox.alpaca.markets` for sandbox, `https://data.alpaca.markets` for
  production (confirmed: sandbox Broker API keys get a 401 from the production data
  host). Auth style also differs from the Broker API: `APCA-API-KEY-ID` /
  `APCA-API-SECRET-KEY` headers, not HTTP Basic. Same key id/secret either way. See
  `alpaca-data.ts` / `config.ts` (`alpacaDataBaseUrl`).
- **Sandbox quotes can have a $0 side** (e.g. ask price 0 with a populated bid) —
  simulated data, not always a full two-sided quote. Code that uses the quote (cost
  estimates, etc.) should treat a 0 price as "no data" rather than a real price.
- **We're on the free IEX-only data feed, and its top-of-book tick is sometimes
  wildly unrepresentative.** SIP (the consolidated tape) is a paid add-on — asking
  for it returns `"subscription does not permit querying recent SIP data"` — so
  quotes come from IEX alone, ~2-3% of consolidated volume. Observed live: MSFT
  quoted bid $490.01 / ask $496.75 (a 1.4% spread) at the same instant its last
  trade was $496.13, while SPY/AAPL/TSLA/NVDA/KO/GOOGL all sat under 0.2%. The
  last-trade price stayed accurate throughout — it's only the quote that goes bad.
  `alpaca-data.ts`'s `isReliableQuote()` therefore flags a quote as unreliable when
  the spread exceeds 0.5% of the last trade (or a side is 0, or it's crossed), and
  `getQuoteDetail()` returns `{...quote, lastPrice, reliable}`. The trade screen
  shows Bid/Ask only when `reliable`, otherwise a single "Last Price" box plus a
  one-line explanation — never a misleading spread. A separate, standing disclaimer
  ("Quotes reflect one exchange only — your fill price may differ.", added
  2026-09-02) always renders below the price box regardless of `reliable` — the
  thin-quote note above covers the specific unreliable-spread case, this one covers
  the general fact that even a normal-looking quote is IEX-only, not the full
  consolidated market. Execution itself is unaffected: Alpaca is bound by
  Regulation NMS's best-execution rule to fill at or better than the true
  cross-exchange NBBO regardless of what data tier the display quote came from —
  the disclaimer is about what's shown, not about fill quality.
  - **Do NOT use quote condition code `"R"` as an odd-lot signal.** This feed
    stamps `"R"` on *every* quote including obvious round lots (NVDA at 500x400,
    KO at 500x700), so filtering on it flags 100% of quotes. This was tried and
    reverted; the spread-vs-last-trade ratio is the signal that actually works.
- **Alpaca has NO Level 2 / order-book depth for equities, at any tier.** Their
  equities market data is top-of-book only — even paid SIP carries just the best
  bid/ask per exchange plus the NBBO, not depth. Order-book depth exists in their
  API for *crypto* only. Real equity depth needs a direct exchange feed (Nasdaq
  TotalView etc.), a separate and expensive product. So a Level 2 panel cannot be
  built from real data here — anything resembling one would be fabricated numbers
  presented as a market, which is both misleading and squarely the day-trading
  tooling §1/§2 rule out.
- Rate limit: ~1,000 calls/min. Cache aggressively (react-query on the client, cached
  assets list, avoid redundant calls) to stay well under it and control data cost.
  The trade screen polls its quote every **3 seconds** (`QUOTE_POLL_MS` in
  `[symbol].tsx`), and each poll is 2 upstream calls (quote + last trade) — that's
  ~40/min per open trade screen, comfortably within budget, but don't add more
  pollers without re-checking the math.
- Before production: confirm partner tier, pricing, cash-account default, market-data
  subscription tier, and tech-partner scope with Alpaca in writing.

---

## 14. Finnhub specifics

Company profile + fundamentals for the stock screen's Company Info/Financials tabs
(added 2026-09-02). Picked over Financial Modeling Prep specifically because FMP's
free/individual tiers explicitly disallow displaying their data to an app's own end
users without a separate Data Display & Licensing Agreement — exactly what this
feature does — while Finnhub's structure is simpler: a personal/non-commercial free
tier to build and test against, then a self-serve Starter paid tier (~$50/mo as of
this research) for real commercial use, no sales negotiation required to get started.

- Base URL `https://finnhub.io/api/v1`. Auth is a `token=` query param (`FINNHUB_API_KEY`
  in `.env`), not a header — different style from both Alpaca APIs. See `finnhub.ts`.
- `GET /stock/profile2?symbol=` → company profile (name, exchange, industry, IPO date,
  market cap, shares outstanding, website, country, currency). **Returns `{}` with a
  200, not a 404, for a symbol it has no profile for** — `companyData.ts` treats a
  missing `name` as the real "not found" signal, not the HTTP status.
- `GET /stock/metric?symbol=&metric=all` → a large (100+ field) fundamentals object
  under `metric`. Field naming is inconsistent across TTM/Annual/Quarterly variants
  and has shifted before (see `finnhubio/Finnhub-API` issue #337) — `companyData.ts`
  reads a curated handful defensively (a couple of known key-name variants per field,
  each falling back to `null`/"—" rather than guessing) instead of passing the raw
  blob through. This is also a brand call, not just a data-hygiene one: showing all
  100+ fields would be a fundamentals-flavored version of the "dozens of metrics" §1
  explicitly rules out.
- `marketCapitalization` and `shareOutstanding` are both in **millions**, not billions
  or raw units (confirmed via Finnhub's own example: Delta Air Lines' `21794.52` ==
  $21.79B). `CompanyInfoPane.tsx` divides by 1000 for the billions display threshold.
- **Free tier is personal/non-commercial use only per Finnhub's terms; a paid plan is
  required once real (paying) users see this data** — same "confirm in writing before
  production" posture already applied to Alpaca's partner tier (§13). Everything
  shipped 2026-09-02 was built and tested against a free-tier key only.
- Both `/api/company/:symbol/*` routes 503 with `{error: "company_data_unavailable"}`
  when `FINNHUB_API_KEY` is unset, rather than 500ing — confirmed live. The app's
  panes render this as a plain "no data available yet" message, not an error state.
- **Field names confirmed live against a real key (2026-09-02, AAPL)**: `profile2`
  and `metric?metric=all` both matched `companyData.ts`'s guessed field names
  exactly on the first try — `marketCapitalization`/`shareOutstanding` in millions
  confirmed (AAPL: `4745005.73` == $4.75T, `14687.36` == ~14.69B shares), and every
  curated `metric` key (`peBasicExclExtraTTM`, `epsBasicExclExtraItemsTTM`,
  `dividendYieldIndicatedAnnual`, `52WeekHigh`/`Low`, `beta`, `netProfitMarginTTM`,
  `revenuePerShareTTM`) returned a real, plausible number. Re-verify if Finnhub ever
  changes these field names (see the issue #337 note above) — nothing here is
  fabricated, but it also isn't contractually guaranteed to stay named this way.
- `companyData.ts` caches each symbol's profile/financials for 24h (mirrors
  `assetSearch.ts`'s reasoning: this data changes slowly, and there's no reason to
  spend Finnhub calls re-fetching the same symbol for every user who opens it).

---

## 15. RevenueCat specifics

Subscription infrastructure (~$20–30/yr, CLAUDE.md §6), added 2026-09-02. RevenueCat
itself is free until $2,500/mo tracked revenue, then 1% — unlike Finnhub, there's no
ongoing cost pressure at this app's current scale, just a percentage that only shows
up once real money is flowing.

**What's built:**
- `react-native-purchases` (SDK) + `expo-dev-client` installed. `Purchases.configure()`
  is called from `useAuthState.ts` with the Supabase user id as RevenueCat's own
  `app_user_id` (`lib/purchases.ts`) — chosen specifically so the webhook can trust
  `event.app_user_id` as a real `auth.users.id` with no separate identity-mapping step.
- `POST /api/webhooks/revenuecat` — the only writer of `public.subscriptions`,
  authenticated by a shared secret in the Authorization header (`REVENUECAT_WEBHOOK_SECRET`),
  not Supabase auth, since RevenueCat's own servers call this. Status is recomputed from
  the event's expiration timestamp every time, not remembered from the event type — a
  CANCELLATION means "won't renew," not "revoke now," so this is self-healing the same
  way the Alpaca SUBMITTED→ACTIVE sync is (a missed or out-of-order webhook can't leave
  the row permanently wrong). Verified live: wrong secret → 401, missing secret → 503,
  the dashboard's "Send Test Webhook" event → 200 no-op, an event for an unrelated
  entitlement → 200 no-op. NOT yet verified: an actual real-entitlement write, since
  that needs `0004_subscriptions.sql` applied first (§8, §9).
- `useEntitlement()` (`{ isPremium, loading }`) reads `public.subscriptions` directly
  via RLS — built, typechecks, not called from anywhere yet.

**Still needed — genuinely open, not just unbuilt:**
1. **What premium actually gates.** Nothing in the app checks `useEntitlement()` yet.
   Whatever the answer is has to avoid gating the trading loop itself (§2/§6 — that's
   the IAP-exempt real-world service, and also just the core business) and avoid
   anything that could read as advice (§2). The Company Info/Financials tabs (§14) are
   a natural fit — they're the one feature with a real recurring cost (Finnhub) to
   offset, and they're pure data display, not advice.
2. **Paywall screen: custom Terminal Amber design vs. RevenueCat's hosted Paywall UI**
   (`react-native-purchases-ui`, dashboard-configured, not installed yet). Faster to
   ship vs. on-brand — a real tradeoff, not a technical question.
3. **External accounts only the founder can create** — RevenueCat project + iOS/Android
   app entries + entitlement + offering; Apple Developer Program enrollment ($99/yr) +
   App Store Connect subscription product; Google Play Console ($25 one-time) + Play
   Console subscription product. None of this is code — it's dashboards, business
   verification, and banking/tax info for payouts.
4. Once those exist: the RevenueCat public SDK keys go in the app's `.env`
   (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`/`_ANDROID_KEY`), the webhook shared secret and
   entitlement id go in the backend's `.env` (`REVENUECAT_WEBHOOK_SECRET`,
   `REVENUECAT_ENTITLEMENT_ID`), and `0004_subscriptions.sql` gets applied — same
   "hand me the key once you have one" sequencing as Finnhub (§14).
5. A real device/dev-client test of an actual sandbox purchase end to end — nothing
   about purchases can be verified through Expo Go or the web preview (§12).

## 16. How to work in this repo

- Prefer small, testable increments over big rewrites. Add one feature, run it, confirm
  it works against the live sandbox backend, then move on.
- Two terminals for local dev: backend (`npm run dev` in simpl-trading-backend) and app
  (`npx expo start` in simpl-trading-app; press `w` for fast web preview).
- Web is the fast logic/data preview; it is NOT an accurate visual preview — do real
  visual/interaction tuning on a device or emulator.
- When adding a money feature: new function in `alpaca.ts` + new route in `routes/`
  (or `routes/me/`) + client call in `src/lib/api.ts`. Keep the Alpaca client isolated
  so a future broker migration touches one file.
- When adding app-owned data (watchlists, settings): the app talks straight to Supabase
  under RLS — no backend route needed.
- Prefer an actual Playwright script over "it typechecks / the bundle builds" when
  verifying navigation or interaction changes — this project shipped a real routing
  bug once that both typecheck and bundle build missed entirely.
- Keep this file updated when a decision changes.
