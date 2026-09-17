/**
 * Per-route rate limits, in one place so the whole policy can be read at
 * once rather than reconstructed from thirty scattered route options.
 *
 * Sizing rule: each cap is set from what the request COSTS us, not from a
 * guess at human behaviour — an endpoint that fans out to fifteen Alpaca
 * calls deserves a tighter cap than one that reads an in-memory map, even
 * though a person taps both the same way. Every cap here is still well above
 * real use; the point is a ceiling, not a product constraint.
 *
 * The global default (index.ts) stays as a backstop for anything not listed.
 * Authenticated routes key on user id, so these are per-account; public ones
 * key on IP, which is weaker — see the note in index.ts.
 */

const limit = (max: number, timeWindow = "1 minute") => ({ config: { rateLimit: { max, timeWindow } } });

export const RATE_LIMITS = {
  /**
   * Spends real money. No human places 20 orders a minute, and the
   * idempotency key only dedupes a REPEAT of the same order, not a flood of
   * distinct ones.
   */
  placeOrder: limit(20),

  /** Moves real money in or out of a bank account. */
  transfer: limit(10),

  /**
   * Links or unlinks the bank account itself. Tighter than transfers: a
   * flood here is how you'd brute-force routing/account numbers against
   * Alpaca's validator, and one person links one bank roughly once.
   */
  bankMutation: limit(5),

  /**
   * Creates a REAL brokerage account at Alpaca, with KYC attached. Both are
   * idempotent per user, so a legitimate client never repeats them.
   */
  onboard: limit(5),
  investmentProfile: limit(10),

  /** Self-imposed guardrails (§17) — cheap, but a write, and per-account. */
  tradeLimitsWrite: limit(20),

  /** Authenticated reads that hit Alpaca once each. */
  accountRead: limit(120),

  /**
   * The Trade screen polls quotes every 3s (~20/min per open screen) and
   * watchlist rows batch into snapshots. 60 leaves room for a couple of
   * screens without ever throttling a real session.
   */
  marketData: limit(60),

  /**
   * Autocomplete fires per keystroke behind a 250 ms debounce — a fast
   * typist can sustain ~4/s in bursts. Served from an in-memory cache, so
   * this is generous; it exists to stop a scraper walking the whole
   * 13k-symbol list, not to pace typing.
   */
  assetSearch: limit(120),

  /** The authoritative exists-and-tradable check before a watchlist add. */
  assetLookup: limit(30),

  /**
   * Finnhub-backed. Finnhub's own ceiling is 60/min for the ENTIRE app and
   * companyData.ts's 24h cache only helps on repeat symbols — a client
   * walking distinct tickers misses every time and would drain the quota.
   */
  companyData: limit(30),

  /**
   * The most expensive endpoint in the app: a cold /markets/overview fans
   * out to ~15 batched Alpaca calls across 503 symbols and takes ~6s. It's
   * cached 6h behind a shared in-flight promise, so a flood mostly hits the
   * cache — but the cold path is exactly what an attacker would try to
   * stampede right after a deploy.
   */
  marketsOverview: limit(30),

  /** The other market sections read the same warm cache. */
  markets: limit(60),
} as const;
