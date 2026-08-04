# Simpl Trading — Backend

The secure middle layer between the mobile app and Alpaca's Broker API.
All Alpaca secrets live here and nowhere else.

```
[ Mobile app ] --> [ THIS backend ] --> [ Alpaca Broker API ]
```

## Prerequisites

- Node.js 20 or newer (`node -v` to check)
- Alpaca Broker API sandbox account
- Your sandbox API Key ID + Secret (dashboard -> API/Devs -> generate keys)

## Setup

```bash
npm install
cp .env.example .env
# open .env and paste your sandbox ALPACA_API_KEY_ID and ALPACA_API_SECRET
npm run dev
```

The server starts on http://localhost:4000

## Prove it works (in a second terminal)

1. Server is up:
   ```bash
   curl http://localhost:4000/health
   # -> {"status":"ok"}
   ```

2. Alpaca auth works (THE key test). Empty array = success:
   ```bash
   curl http://localhost:4000/api/alpaca/accounts
   # -> []   (or a list, if you've created test accounts)
   # -> a 401 error here means your keys are wrong
   ```

3. Create a throwaway sandbox brokerage account:
   ```bash
   curl -X POST http://localhost:4000/api/alpaca/test-account
   # -> {"id":"...", "account_number":"...", ...}
   ```

   Run step 2 again and you'll see the new account in the list.

## Project structure

```
src/
  index.ts          Fastify server + error handling
  config.ts         Loads/validates env vars (secrets)
  alpaca.ts         Alpaca Broker API client (HTTP Basic auth)
  routes/
    alpaca.ts       Proof-of-life endpoints; real product routes go here
```

## Next steps (later phases)

- Add Postgres (Supabase/Neon) to map YOUR user IDs -> Alpaca account IDs
- Add user auth (Supabase Auth / Clerk) + MFA
- Sandbox funding endpoint, then stock search, buy (notional), holdings, sell
- Only after the full loop works in sandbox: swap base URL to live + live keys
