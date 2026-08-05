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
};
