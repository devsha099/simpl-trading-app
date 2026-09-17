import "dotenv/config";

/**
 * Central config. All secrets come from environment variables — never hard-code
 * Alpaca keys, and never ship them to the mobile client.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

/**
 * Who is allowed to tell us a client's real IP via X-Forwarded-For.
 *
 * Rate limiting for unauthenticated routes keys on req.ip, so getting this
 * wrong breaks in one of two ways, and BOTH are bad:
 *
 * - Left off behind a proxy (Render/Fly/nginx/Cloudflare), req.ip is the
 *   PROXY's address for every request, so all traffic shares one bucket and
 *   the first burst locks out every user at once.
 * - Set to `true`, Fastify believes X-Forwarded-For from anyone — so a
 *   client sends a fresh fake IP per request and gets an unlimited quota.
 *   That is the IP-rotation bypass, handed out for free.
 *
 * So it is neither: give it the proxy's IP/CIDR (or a hop count) and only
 * that hop is believed. Unset means "no proxy", correct for local dev and
 * the safe default if the env var is ever forgotten.
 */
function parseTrustProxy(): boolean | string | ((addr: string, hop: number) => boolean) {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return false;
  if (raw === "true") {
    throw new Error(
      "TRUST_PROXY=true would trust X-Forwarded-For from any client, letting anyone " +
        "forge a new IP per request and bypass rate limiting entirely. Set it to your " +
        "proxy's IP or CIDR (e.g. 10.0.0.0/8), or to a hop count (e.g. 1).",
    );
  }
  const hops = Number(raw);
  // A hop count is the right setting on hosts that don't publish a stable
  // proxy IP. Fastify's types don't take a number, so it's expressed as the
  // predicate it actually means: believe the first N hops, nothing beyond.
  if (Number.isInteger(hops) && hops > 0) return (_addr: string, hop: number) => hop < hops;
  return raw;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  trustProxy: parseTrustProxy(),
  // Sandbox by default. Switch to https://broker-api.alpaca.markets only when going live.
  alpacaBaseUrl:
    process.env.ALPACA_BASE_URL ?? "https://broker-api.sandbox.alpaca.markets",
  // Market data lives on a separate host from the Broker API, with its own auth
  // header style. Same key id/secret. Sandbox Broker API keys only work against the
  // sandbox data host — data.alpaca.markets (production) 401s them. Switch to
  // https://data.alpaca.markets only when going live, same as alpacaBaseUrl.
  alpacaDataBaseUrl:
    process.env.ALPACA_DATA_BASE_URL ?? "https://data.sandbox.alpaca.markets",
  alpacaKeyId: required("ALPACA_API_KEY_ID"),
  alpacaSecret: required("ALPACA_API_SECRET"),
  // Not required() eagerly: the server should still boot and serve the
  // existing /api/alpaca/* sandbox routes even before Supabase is set up.
  // supabase.ts validates these itself, lazily, only when /api/me/* routes
  // actually need a Supabase client.
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Company profile + fundamentals — Alpaca has neither at any tier (see
  // CLAUDE.md §13), so the stock screen's Company Info/Financials tabs go
  // through Finnhub instead (finnhub.ts). Not required() eagerly, same
  // reasoning as Supabase above: the server should still boot without it,
  // and /api/company/* fails clearly on its own rather than the whole
  // server refusing to start over an optional data source.
  finnhubApiKey: process.env.FINNHUB_API_KEY,
  // RevenueCat webhook auth — the shared secret configured as the
  // "Authorization header value" in the RevenueCat dashboard's webhook
  // settings (CLAUDE.md §15). Not required() eagerly: the server should
  // still boot without it; the webhook route itself replies 503 clearly if
  // it's missing rather than the whole server refusing to start.
  revenuecatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET,
  // The RevenueCat entitlement identifier that means "premium" — configured
  // in the RevenueCat dashboard, not something the backend invents. Defaults
  // to "premium" so nothing breaks before it's explicitly set.
  revenuecatEntitlementId: process.env.REVENUECAT_ENTITLEMENT_ID ?? "premium",
};
