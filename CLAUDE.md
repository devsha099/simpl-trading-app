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

The minimalism is not a limitation — it is the product and the brand.

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
3. Has an account but status ≠ `ACTIVE` → pending screen.
4. Account is `ACTIVE` → main app (bottom tabs).

This makes the app resilient: someone who quits mid-KYC resumes at onboarding next time,
because routing reads their real state instead of assuming a linear path.

---

## 5. App layout (v1)

- **Welcome screen** — philosophy + "Log In" / "Sign Up".
- **Sign Up** → email, password, first name, last name, phone (Supabase auth +
  email/phone verification).
- **Onboarding (KYC)** → DOB, address, citizenship, SSN, disclosures, agreements →
  creates the Alpaca cash account via our backend.
- **Pending screen** → shown until Alpaca approves (status ACTIVE).
- **Main app — bottom tab bar, 4 tabs:**
  - **Watchlists** ← default landing, always (changed from Account — decided 2026-07-26).
    Supports **multiple named watchlists** (decided 2026-08-01): the tab opens to a
    list of watchlists (blank except a "+ New Watchlist" action until you make one);
    tapping a watchlist opens its ticker list (add by typing, long-press/right-click a
    row for a "Remove from Watchlist" sheet); tapping a ticker pushes into the
    per-symbol trade screen (bid/ask, order type, dollars/shares, Buy/Sell) built in
    Phase 1. You must add a symbol to a watchlist before you can trade it from this
    flow. Ticker rows show last price + %-change since previous close.
  - **Account** ← shows portfolio (total value, cash, full positions list)
  - **Research**
  - **Settings**
  (Contents of Research and Settings TBD in later phases — currently placeholder
  "coming soon" screens.)

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
- Planned additions: `@supabase/supabase-js` (verify tokens, query DB), `zod` (validate
  every request body), `@fastify/cors`, `@fastify/rate-limit`.

**Mobile app** (`simpl-trading-app/`)
- React Native via **Expo**, TypeScript, **expo-router** (file-based routing).
- Screens live under **`src/app/`** (this project uses the `src/app` root, not `app/`).
- Planned additions: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`,
  `react-native-url-polyfill`, `expo-secure-store`, `react-hook-form` + `zod` +
  `@hookform/resolvers`, `@tanstack/react-query`, `nativewind`.
- Later: `react-native-purchases` (RevenueCat), Plaid.

**Data / services**
- Supabase (Postgres + Auth + RLS).
- Alpaca Broker API (sandbox now, production later).

---

## 8. File structure

```
workspace/
├── CLAUDE.md                     ← this file
├── simpl-trading-backend/
│   ├── src/
│   │   ├── index.ts              Fastify server + error handling
│   │   ├── config.ts             env loading/validation
│   │   ├── alpaca.ts             Alpaca Broker API client (Basic auth)
│   │   ├── alpaca-data.ts        Alpaca Market Data client (APCA-API-KEY headers, different host)
│   │   ├── supabase.ts           admin Supabase client (verify tokens, query DB)
│   │   ├── auth.ts               preHandler: verify session token, attach user
│   │   ├── db/
│   │   │   └── accounts.ts       look up a user's alpaca_account_id + status
│   │   ├── schemas/
│   │   │   ├── onboarding.ts     zod schema for KYC payload
│   │   │   └── orders.ts         zod schema for buys (dollars OR shares)
│   │   └── routes/
│   │       ├── me/               user-aware routes (onboarding, funding, orders, portfolio)
│   │       └── alpaca.ts         DEV/SANDBOX-ONLY test routes (URL-based account id) — remove before prod
│   ├── supabase/migrations/
│   │   └── 0001_init.sql         tables + RLS policies
│   ├── .env / .env.example       secrets (never commit .env)
│   ├── package.json / tsconfig.json / README.md
└── simpl-trading-app/
    ├── src/app/
    │   ├── _layout.tsx           root layout — plain Stack for now; becomes the
    │   │                         router state machine (§4) at the Phase 2 auth milestone
    │   ├── index.tsx             "/" → redirects to /watchlists (app always opens there)
    │   ├── (auth)/               PLANNED — welcome, login, signup, onboarding (no tab bar)
    │   └── (tabs)/               bottom tab bar — built:
    │       ├── _layout.tsx           Tabs navigator: watchlists, account, research, settings
    │       ├── watchlists/
    │       │   ├── _layout.tsx           Stack: index -> [watchlistId]/index -> [watchlistId]/[symbol]
    │       │   ├── index.tsx             list of watchlists + "+ New Watchlist" (name prompt modal)
    │       │   └── [watchlistId]/
    │       │       ├── index.tsx         one watchlist: add-ticker input, rows (price + %
    │       │       │                     change), long-press/right-click row -> remove sheet
    │       │       └── [symbol].tsx      per-symbol trade screen (bid/ask, order type,
    │       │                             dollars/shares, Buy/Sell) — Phase 1 screen, now
    │       │                             parameterized by route param instead of hardcoded AAPL
    │       ├── account/index.tsx     portfolio value, cash, full positions list
    │       ├── research/index.tsx    placeholder ("coming soon")
    │       └── settings/index.tsx    placeholder ("coming soon")
    ├── src/lib/
    │   ├── api.ts                API_BASE + hardcoded ACCOUNT_ID (replace at auth milestone)
    │   └── supabase.ts           PLANNED — Supabase client (auth + watchlists/settings)
    ├── src/hooks/
    │   └── useWatchlists.ts      on-device (AsyncStorage) watchlists: [{ id, name, symbols[] }].
    │                             No backend yet — there's no logged-in user to key a real
    │                             Supabase watchlist on. One-time migration on first load from
    │                             the old single-list storage key into a "My Watchlist" entry.
    │                             Swap for real Supabase-backed watchlists at the auth milestone.
    ├── app.json / package.json / tsconfig.json
```

Note: `(auth)` and `(tabs)` folder names include the literal parentheses — they are
expo-router route groups that don't appear in the URL. Layout files must be named
`_layout.tsx` with the leading underscore.

**Typed routes gotcha — CORRECTED 2026-08-01, verified in a real browser (was wrong
before):** app.json has the `typedRoutes` experiment on. For an index route (e.g.
`[watchlistId]/index.tsx`), the generated `.expo/types/router.d.ts` often only lists
the literal `.../index` form, and TypeScript will suggest it
(`Did you mean ".../index"?`). **Do not follow that suggestion for `router.push`/
`Redirect` — it's wrong at runtime.** Navigating to a literal `.../index` URL does NOT
collapse to the index screen; if a sibling dynamic segment exists at that position
(e.g. `[symbol].tsx` next to `index.tsx`), the router matches the dynamic route
instead, with `"index"` as its param value. (This shipped as a real bug: clicking a
watchlist opened the trade screen for a fake symbol called "INDEX".) The fix is the
**collapsed path with no `/index` suffix** (`/watchlists/[watchlistId]`, the same
pattern that works for `/account`, `/research`, `/settings`), cast with `as Href`
since typed-routes doesn't always recognize the collapsed form as valid:
```ts
router.push({ pathname: "/watchlists/[watchlistId]", params: { watchlistId } } as Href);
```
A genuinely dynamic leaf (not an index file, e.g. `[symbol].tsx`) doesn't have this
problem — `router.push({ pathname: "/watchlists/[watchlistId]/[symbol]", params })`
works as typed, no cast needed. The gotcha is specifically about index routes with a
dynamic sibling. When in doubt, check the URL bar after navigating — a URL ending in a
literal `/index` segment (rather than the parent path) is the tell that this bug has
recurred.

---

## 9. Database schema (Supabase Postgres)

Supabase provides `auth.users` automatically. Around it:

- **profiles** — id (→ auth.users), first_name, last_name, phone, created_at.
  (Auto-created by a DB trigger on signup; non-sensitive display data only.)
- **alpaca_accounts** — user_id, alpaca_account_id, account_status, created_at.
  THE critical mapping from logged-in user → brokerage account.
- **watchlists** — id, user_id, name, created_at.
- **watchlist_items** — id, watchlist_id, symbol, added_at.
- **user_settings** — user_id + preference columns (theme, notifications, etc.).

Every table has an RLS policy: `user_id = auth.uid()`. There is NO table for KYC PII or
holdings — PII is passed through to Alpaca and discarded; holdings live at Alpaca and are
fetched live.

---

## 10. Backend API

**Existing (Phase 1, working, sandbox — account id in URL, DEV ONLY):**
- `GET  /health`
- `GET  /api/alpaca/accounts` — list accounts (connectivity test; `[]` = auth works)
- `POST /api/alpaca/test-account` — create a sandbox test account
- `GET  /api/alpaca/accounts/:id` — account status (look for ACTIVE)
- `GET  /api/alpaca/accounts/:id/trading` — cash / buying power
- `POST /api/alpaca/accounts/:id/fund` — sandbox funding (ACH relationship + transfer)
- `GET  /api/alpaca/quotes/:symbol` — latest best bid/ask for one symbol (Alpaca Market
  Data API, separate host + auth header from the Broker API — see `alpaca-data.ts`);
  polled by the client, not pushed
- `GET  /api/alpaca/quotes?symbols=A,B,C` — same, batched for many symbols in one call
  (used by the per-symbol trade screen's bid/ask — don't do one request per row)
- `GET  /api/alpaca/snapshots?symbols=A,B,C` — last traded price + %-change since
  previous close, batched (used by watchlist rows; see `alpacaData.getSnapshots`)
- `POST /api/alpaca/accounts/:id/orders` — buy or sell, market/limit/stop, notional or
  qty (never both); sells are checked against current holdings first, no short selling
- `GET  /api/alpaca/accounts/:id/positions` — holdings

**Planned (Phase 2, user-aware — account id derived from session, NEVER from client):**
- `POST /api/me/onboard` — create cash account from KYC, save id+status, discard PII
- `POST /api/me/fund`
- `POST /api/me/orders` — buy/sell, dollars or shares, market/limit/stop
- `GET  /api/me/positions`
- `GET  /api/me/trading`

When Phase 2 lands, the `me/*` routes replace the URL-based ones for real users, and
`routes/alpaca.ts` is removed before production.

---

## 11. Current state

- **Phase 1 complete and tested in sandbox:** open account, check status, fund, buy
  (notional), read positions — all working through the backend.
- **4-tab app shell built:** Watchlists (default), Account, Research, Settings — see
  §8 for the file tree. Uses a **hardcoded ACCOUNT_ID** everywhere (no auth yet).
- **Watchlists tab supports multiple named watchlists:** opens to a list of
  watchlists (just a "+ New Watchlist" action + name-prompt modal until you make one).
  Tapping a watchlist opens its ticker list: add a ticker by typing it (no
  search/autocomplete yet — see next steps), long-press a row (right-click on web) for
  a "Remove from Watchlist" action sheet. Rows show symbol, last price, and %-change
  since previous close (no name/logo/chart — deliberately minimal, see CLAUDE.md §1).
  Watchlists persist on-device via AsyncStorage (`useWatchlists.ts`) — not tied to a
  user, since there's no login yet. Tapping a ticker pushes into the per-symbol trade
  screen: dollars/shares toggle, a Market/Limit/Stop Loss order-type selector,
  side-by-side Buy/Sell buttons, and a live-polled bid/ask + estimated cost. This trade
  screen is genuinely symbol-agnostic (route param, not hardcoded AAPL) — works for
  any valid ticker.
- Web right-click-to-remove uses an `onContextMenu` handler conditionally spread onto
  the row `Pressable` (`Platform.OS === "web"`) — **verified working** via a real
  Playwright browser click-through 2026-08-01 (see below). Long-press is the native
  equivalent, untested on an actual device/emulator (only reasoned to be correct).
- **Account tab:** portfolio value, cash available, full positions list. This is what
  used to be the top of the old single-screen thin slice.
- **Research / Settings tabs:** placeholder "coming soon" screens only.
- **Everything is on Alpaca SANDBOX** (fake money). Base URL + keys swap for production.
- Market data (bid/ask, last trade, previous close) is confirmed working in sandbox via
  `GET /api/alpaca/quotes/:symbol`, `/quotes?symbols=`, and `/snapshots?symbols=`, but
  only against `data.sandbox.alpaca.markets` — see §13. Sandbox quotes/snapshots can
  come back with a $0 bid/ask or null trade (simulated data) — code that displays them
  treats missing/zero as "no data," not a real price.
- Known gap: you can remove a ticker from a watchlist, but there's no way to delete an
  entire watchlist yet (not requested as of 2026-08-01) — only individual symbol removal.
- **Playwright is now a dev dependency** (`simpl-trading-app`, added 2026-08-01,
  Chromium installed via `npx playwright install chromium`) specifically because
  skipping real click-through testing previously let a routing bug ship (see the typed
  routes gotcha above) — TypeScript passing and the bundle compiling both looked clean
  while the app was actually broken. A real click-through caught it immediately. Prefer
  an actual Playwright script over "it typechecks / the bundle builds" when verifying
  navigation or interaction changes, not just data-fetching ones.
- Verified 2026-08-01 via a real Playwright click-through against the live sandbox
  backend: create a watchlist → open it → add AAPL (shows live price + %-change) →
  open the trade screen (correct symbol, real bid/ask, real position) → right-click AAPL
  → "Remove from Watchlist" sheet → confirm → AAPL gone. Zero console errors.
  Screenshots aren't retained anywhere in the repo; rerun the script to re-verify.

**Immediate next steps (build iteratively, test after each):**
1. Stock search (cache Alpaca's tradable-assets list; don't hit it per keystroke) —
   replaces the manual-ticker-entry watchlist add flow.
2. **Auth milestone:** replace the hardcoded ACCOUNT_ID with a logged-in Supabase user
   (Phase 2). This is when it becomes a real multi-user app, not a prototype. Also
   swaps the on-device watchlist for a real Supabase-backed one keyed on the user.
3. Then: onboarding/KYC screens, real Settings/Research content, subscription paywall
   (last).

Build valuable money screens first, wrap onboarding/auth around them after.

---

## 12. Conventions & gotchas (READ THESE — they cause the most wasted time)

- **Secrets never on the device.** Alpaca keys live only in the backend `.env`. The app
  talks only to our backend.
- **Account id from the session, never from the client** (once auth exists).
- **NodeNext imports use `.js` extensions even for `.ts` files** (e.g.
  `import { x } from "./routes/alpaca.js"`). This is correct, not a bug.
- **`API_BASE` differs by test target:**
  - Expo web (browser) → `http://localhost:4000`
  - Android emulator → `http://10.0.2.2:4000`
  - Physical phone (Expo Go/dev build) → PC LAN IP, e.g. `http://192.168.1.216:4000`
    (phone + PC on same Wi-Fi; backend already listens on 0.0.0.0)
  - `localhost` NEVER works from a physical phone.
- **CORS:** required for Expo web testing (browser cross-origin). Register `@fastify/cors`
  on the backend. Native (phone/emulator) doesn't need it.
- **Fractional / notional orders are market + day only** and fill during regular US
  market hours (9:30am–4pm ET, weekdays). Off-hours orders queue and positions stay
  empty until the next open — this is expected, not a bug.
- **Sandbox funding simulates ACH delay** (can take ~10–30 min to reflect); production
  ACH takes 1–3 business days — set that expectation in the UI.
- **Alpaca tax_id validation** (sandbox): rejects area 000/666, rejects sequential
  numbers (123456789), rejects invalid characters. Use realistic-looking test SSNs.
- **Money-app safety:** generate a unique client order id per buy so a network retry
  can't place a duplicate order.
- **Dev environment:** Windows + PowerShell. Use `curl.exe` (not the `curl` alias) for
  API testing; quote JSON bodies with single quotes.

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
- Test account id currently used in the thin slice:
  `9f6103d8-9e59-450d-bda8-103c450e6114` (sandbox only).
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
- Keep this file updated when a decision changes.
