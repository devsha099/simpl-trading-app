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

export const config = {
  port: Number(process.env.PORT ?? 4000),
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
