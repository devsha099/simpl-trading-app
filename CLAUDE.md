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
    into the per-symbol trade screen (bid/ask, order type, dollars/shares, Buy/Sell).
    You must add a symbol to a watchlist before you can trade it from this flow.
    Ticker rows show last price + %-change since previous close.
  - **Account** ← portfolio value + cash at the top, then three sub-screens:
    **Holdings** (current positions + unrealized P/L), **Orders** (still-working
    orders), **Trade History** (filled/closed orders).
  - **Research** ← placeholder ("coming soon")
  - **Settings** ← **Profile** (read-only view of everything on file, see §9) and
    Sign Out. More settings TBD.

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
- **Investment-profile data (income/net worth/employment/marital status) is treated
  like KYC-adjacent data, not casual app data**: pushed to Alpaca via PATCH first,
  saved locally only if Alpaca accepted, so the two can't drift. Not the same as SSN
  (still never stored) — this is descriptive financial data Alpaca itself requires.
- **Subscription (~$20–30/yr) via RevenueCat**, gates premium *app features* (IAP-required,
  Apple/Google take a cut) — NOT the trading itself (a real-world service, IAP-exempt).
  Mirror entitlement to Supabase via a RevenueCat webhook so the server knows who's premium.
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
  separately or `expo-font`'s web build fails to resolve it).
- Still planned: `@tanstack/react-query` (for the Supabase-backed watchlists — see
  §11 next steps), `nativewind`.
- Later: `react-native-purchases` (RevenueCat), Plaid.

**Data / services**
- Supabase (Postgres + Auth + RLS), real project `avhnfuffwevdcwapkmnh`.
- Alpaca Broker API (sandbox now, production later).
- Resend (custom SMTP for Supabase auth emails — see §12). Sending domain
  `simplapp.us`, verification in progress.

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
│   │   ├── supabase.ts           admin Supabase client (service-role key, bypasses RLS);
│   │   │                         lazily validated so the server still boots without it
│   │   ├── auth.ts               preHandler: verify session token, attach req.user
│   │   ├── db/
│   │   │   ├── accounts.ts       look up / save / update a user's alpaca_account_id + status
│   │   │   └── investorProfiles.ts  read/upsert the questionnaire row
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
│   │       │   └── kycDetails.ts     GET /api/me/kyc-details — live address/DOB from Alpaca
│   │       │                         for the Profile screen; never returns tax_id
│   │       └── alpaca.ts         market-data routes (/quotes, /snapshots) still in use; its
│   │                             account-scoped routes are now dead — delete before prod
│   ├── supabase/migrations/
│   │   ├── 0001_init.sql         profiles, alpaca_accounts, watchlists, watchlist_items,
│   │   │                         user_settings — all tables + RLS policies
│   │   ├── 0002_grants.sql       base table GRANTs the tables actually needed — RLS
│   │   │                         policies alone left every query 403ing (see §12)
│   │   └── 0003_investor_profiles.sql  the questionnaire table + RLS + GRANT together
│   │                             in ONE file (0002's lesson). Applied.
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
    │       ├── _layout.tsx           Tabs navigator: watchlists, account, research, settings
    │       ├── watchlists/
    │       │   ├── _layout.tsx           Stack: index -> [watchlistId]/index -> [watchlistId]/[symbol]
    │       │   ├── index.tsx             list of watchlists + "+ New Watchlist" (name prompt modal)
    │       │   └── [watchlistId]/
    │       │       ├── index.tsx         one watchlist: add-ticker input, rows (price + %
    │       │       │                     change), long-press/right-click row -> remove sheet
    │       │       └── [symbol].tsx      per-symbol trade screen (bid/ask, order type,
    │       │                             dollars/shares, Buy/Sell) — symbol-agnostic
    │       │                             (route param, not hardcoded), session-derived
    │       │                             account via apiFetch()
    │       ├── account/
    │       │   ├── _layout.tsx            Stack: index -> holdings / orders / trade-history
    │       │   ├── index.tsx              portfolio value + cash, then links to the three below
    │       │   ├── holdings.tsx           current positions + unrealized P/L
    │       │   ├── orders.tsx             open orders (GET /api/me/orders?status=open)
    │       │   └── trade-history.tsx      closed orders (?status=closed)
    │       ├── research/index.tsx    placeholder ("coming soon")
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
    │   └── supabase.ts            anon-key client (auth + watchlists/settings). Session
    │                              storage uses AsyncStorage, not expo-secure-store. Never
    │                              throws on missing config (would crash web SSR);
    │                              degrades to a clean network-error message instead.
    │                              `detectSessionInUrl: true` — needed on web so clicking
    │                              an emailed confirmation/recovery link actually
    │                              establishes a session (see §12)
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
    │   └── useWatchlists.ts      Supabase-backed, RLS-scoped to the logged-in user
    │                             (watchlists + watchlist_items). Optimistic local updates
    │                             so callers keep a fire-and-forget-feeling API;
    │                             react-query still not wired in (§11 next steps)
    ├── src/components/
    │   ├── FormField.tsx         labeled TextInput + error text, used by every auth/KYC form
    │   ├── SelectField.tsx       labeled Picker row, used by the questionnaire dropdowns
    │   ├── PasswordRequirements.tsx  live checklist, green checks as each rule is met
    │   ├── OrderList.tsx         shared order-row list, used by both Orders and Trade History
    │   └── ToggleField.tsx       labeled Switch row, used by the KYC disclosure questions
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

Every table has RLS enabled. There is NO table for KYC PII (address, DOB, SSN) or
holdings — PII is passed through to Alpaca and discarded; holdings live at Alpaca and
are fetched live. The Settings → Profile screen fetches address/DOB from Alpaca
on-demand (only when Profile is opened, not eagerly) via `GET /api/me/kyc-details`,
which never returns `tax_id`.

Migrations `0001_init.sql`, `0002_grants.sql`, `0003_investor_profiles.sql` have all
been applied, in order, to the real project (`avhnfuffwevdcwapkmnh`). A fresh project
needs all three, in order — see §12 for why GRANTs and RLS are both required.

---

## 10. Backend API

**Dev-only, sandbox (account id in URL — remove before prod):**
- `GET  /health`
- `GET  /api/alpaca/accounts` — list accounts (connectivity test)
- `POST /api/alpaca/test-account` — create a sandbox test account
- `GET  /api/alpaca/accounts/:id`, `.../trading`, `.../positions` — status / cash / holdings
- `POST /api/alpaca/accounts/:id/fund` — sandbox funding
- `POST /api/alpaca/accounts/:id/orders` — buy/sell
- `GET  /api/alpaca/quotes/:symbol`, `/api/alpaca/quotes?symbols=`, `/api/alpaca/snapshots?symbols=` —
  market data (Alpaca Market Data API, separate host/auth from the Broker API — see
  `alpaca-data.ts`); these three are NOT account-scoped and are still in active use by
  the watchlist/trade screens.

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
- `GET  /api/me/kyc-details` — address + DOB fetched live from Alpaca for the Profile
  screen. Returns ONLY those fields, never the raw Alpaca response (which contains
  `tax_id`).

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
  Account (Holdings / Orders / Trade History, all session-derived), Research
  (placeholder), Settings → Profile (read-only — name/phone/email from `profiles`,
  questionnaire answers from `investor_profiles`, address/DOB fetched live from
  Alpaca only when Profile is opened, never stored — see §9).
- **Infrastructure:** real Supabase project (`avhnfuffwevdcwapkmnh`), real Alpaca
  sandbox (fake money). Custom SMTP via Resend is wired up and `simplapp.us` is fully
  verified (sender `noreply@simplapp.us`) — real signups now deliver an actual emailed
  OTP code to any address, confirmed end-to-end (see §12's plus-addressing gotcha).
- **Known gaps:**
  - No way to delete an entire watchlist (only individual symbols).
  - `@tanstack/react-query` isn't wired in for watchlists yet — works today via plain
    `useState` + optimistic updates, but caching/refetch is manual.
  - No stock search — adding a ticker is still manual-entry, no autocomplete.
  - The SUBMITTED→ACTIVE sandbox sync logic is proven correct (a
    deliberately-corrupted-status test confirmed it self-heals), but a real
    Alpaca-side approval landing on its own hasn't been directly observed yet.

**Immediate next steps:**
1. Stock search (cache Alpaca's tradable-assets list; don't hit it per keystroke).
2. Wire `@tanstack/react-query` into the watchlists hook.
3. Real Research content, editing on the Profile screen, subscription paywall.

---

## 12. Conventions & gotchas (READ THESE — they cause the most wasted time)

- **Secrets never on the device.** Alpaca keys live only in the backend `.env`. The app
  talks only to our backend.
- **Account id from the session, never from the client.**
- **NodeNext imports use `.js` extensions even for `.ts` files** (e.g.
  `import { x } from "./routes/alpaca.js"`). This is correct, not a bug.
- **`API_BASE` differs by test target:**
  - Expo web (browser) → `http://localhost:4000`
  - Android emulator → `http://10.0.2.2:4000`
  - Physical phone (Expo Go/dev build) → PC LAN IP, e.g. `http://192.168.1.18:4000`
    (phone + PC on same Wi-Fi; backend already listens on 0.0.0.0)
  - `localhost` NEVER works from a physical phone.
- **A VPN on the dev machine can silently break physical-device testing** even when
  Windows Firewall is configured correctly — many VPN clients (NordVPN included)
  block or reroute LAN traffic while connected, which looks identical to a
  firewall/network problem (Expo Go times out scanning the QR code) but isn't. Check
  for an active VPN before deep-diving into firewall rules. Also: your dev machine's
  LAN IP can change when a VPN disconnects (different adapter/subnet) — always
  restart `npx expo start` after a network change so the QR code reflects the current
  IP, and confirm the phone's own Wi-Fi IP is on the same subnet.
- **CORS:** required for Expo web testing (browser cross-origin). Registered via
  `@fastify/cors`. Native (phone/emulator) doesn't need it.
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
- Rate limit: ~1,000 calls/min. Cache aggressively (react-query on the client, cached
  assets list, avoid redundant calls) to stay well under it and control data cost.
- Before production: confirm partner tier, pricing, cash-account default, market-data
  subscription tier, and tech-partner scope with Alpaca in writing.

---

## 14. How to work in this repo

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
