import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { alpacaRoutes } from "./routes/alpaca.js";
import { meRoutes } from "./routes/me/onboarding.js";
import { statusRoutes } from "./routes/me/status.js";
import { investmentProfileRoutes } from "./routes/me/investmentProfile.js";
import { tradingRoutes } from "./routes/me/trading.js";
import { kycDetailsRoutes } from "./routes/me/kycDetails.js";
import { bankingRoutes } from "./routes/me/banking.js";
import { tradeLimitsRoutes } from "./routes/me/tradeLimits.js";
import { companyRoutes } from "./routes/company.js";
import { revenuecatWebhookRoutes } from "./routes/webhooks/revenuecat.js";
import { AlpacaError } from "./alpaca.js";
import { FinnhubError } from "./finnhub.js";

const app = Fastify({ logger: true });

// `methods` must be listed explicitly: @fastify/cors defaults to only the
// CORS-safelisted GET,HEAD,POST, so a browser preflight rejects DELETE
// before it ever reaches a route (removing a bank / canceling a transfer
// failed silently on Expo web because of exactly this). Native clients
// don't preflight, so this only ever bit the web build.
app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });

/**
 * Rate limiting. This is a real exposure, not just hygiene: /api/alpaca/*
 * and /api/company/* are deliberately unauthenticated (same data for every
 * user, nothing to protect), but they spend OUR third-party quota —
 * Finnhub's free tier is 60 calls/min for the whole app, and Alpaca's is
 * ~1,000/min. Without a limit, anyone who learns the backend's URL can
 * exhaust either one and break those features for real users, with no
 * account needed.
 *
 * Keyed on the authenticated user id when there is one, falling back to IP.
 * Per-user is the more meaningful unit for /api/me/* (a stolen token can't
 * spread its abuse across IPs), while IP is the only option for the public
 * routes. NB: requireAuth runs as a route preHandler, i.e. AFTER this hook,
 * so req.user is only populated on a retry within the same window — the IP
 * fallback is what actually does the work for most first requests. That's
 * fine; it's defense in depth, not an access-control mechanism.
 *
 * The global max is deliberately generous. The trade screen polls a quote
 * every 3s (QUOTE_POLL_MS) = ~20 req/min per open screen, and a normal
 * session has several screens fetching on focus, so anything tight enough
 * to matter would break ordinary use.
 */
app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.user?.id ?? req.ip,
  // /health is how a host/monitor checks liveness — throttling it would
  // make the server look down under load, which is exactly backwards.
  // The RevenueCat webhook is exempt because dropping those events costs a
  // user their paid entitlement: RevenueCat retries a non-2xx, but a 429
  // storm could exhaust its retry budget and silently lose an upgrade. It
  // is already authenticated by a shared secret, and only RevenueCat's own
  // servers know the URL.
  allowList: (req) => req.url === "/health" || req.url.startsWith("/api/webhooks/"),
  // statusCode is REQUIRED here. Whatever this returns is what the plugin
  // throws, and a plain {error, message} object carries no status — so it
  // fell through to the catch-all below and every rate-limited request came
  // back as an opaque 500 "internal_error" instead of a 429. The limiter was
  // working correctly the whole time; only the response was wrong. Found by
  // firing 35 real requests and reading the status codes, which is the only
  // reason it surfaced at all.
  errorResponseBuilder: (_req, context) => ({
    statusCode: 429,
    error: "rate_limited",
    message: `Too many requests. Try again in ${context.after}.`,
  }),
});

// Health check — no Alpaca call, just proves the server is up.
app.get("/health", async () => ({ status: "ok" }));

// Turn Alpaca errors into clean JSON responses instead of 500s.
app.setErrorHandler((error, _req, reply) => {
  // Anything that already carries a 4xx (rate-limit 429s, Fastify's own
  // body-parse and validation errors) is a deliberate, well-formed client
  // response — pass it straight through. Without this, the catch-all at the
  // bottom rewrites all of them to an opaque 500 "internal_error": the
  // rate limiter was correctly blocking the 31st request and correctly
  // building a 429 body, and this handler was throwing that away and
  // reporting a server fault instead. Caught by actually firing 35 requests
  // at it rather than trusting the config looked right.
  const clientError = error as {
    statusCode?: number;
    code?: string;
    error?: string;
    message?: string;
  };
  if (
    typeof clientError.statusCode === "number" &&
    clientError.statusCode >= 400 &&
    clientError.statusCode < 500
  ) {
    return reply.code(clientError.statusCode).send({
      // `error` is what the rate limiter's own builder sets ("rate_limited");
      // `code` is what Fastify's built-in client errors carry. Prefer the
      // explicit one so a caller can branch on a stable machine-readable
      // string either way.
      error: clientError.error ?? clientError.code ?? "request_rejected",
      message: clientError.message ?? "Request rejected.",
    });
  }
  if (error instanceof AlpacaError) {
    // Previously silent — these are "handled" (not a 500), but silently
    // returning Alpaca's rejection to the client with nothing in our own
    // logs made every one of these effectively unreproducible from the
    // server side alone. Warn-level since a rejection here is often just an
    // expected validation failure (bad SSN, duplicate account, etc.), not a
    // system fault.
    app.log.warn({ status: error.status, body: error.body }, "Alpaca rejected a request");
    return reply.code(error.status).send({
      error: "alpaca_error",
      status: error.status,
      details: error.body,
    });
  }
  if (error instanceof FinnhubError) {
    // status 0 means FINNHUB_API_KEY isn't set at all — routes/company.ts
    // already turns that into a clean 503 itself, so reaching here means a
    // real Finnhub-side failure (rate limit, invalid key, outage).
    app.log.warn({ status: error.status, body: error.body }, "Finnhub rejected a request");
    return reply.code(error.status || 502).send({
      error: "finnhub_error",
      status: error.status,
      details: error.body,
    });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error" });
});

app.register(alpacaRoutes, { prefix: "/api/alpaca" });
app.register(meRoutes, { prefix: "/api/me" });
app.register(statusRoutes, { prefix: "/api/me" });
app.register(investmentProfileRoutes, { prefix: "/api/me" });
app.register(tradingRoutes, { prefix: "/api/me" });
app.register(kycDetailsRoutes, { prefix: "/api/me" });
app.register(bankingRoutes, { prefix: "/api/me" });
app.register(tradeLimitsRoutes, { prefix: "/api/me" });
app.register(companyRoutes, { prefix: "/api/company" });
app.register(revenuecatWebhookRoutes, { prefix: "/api/webhooks" });

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`Simpl Trading backend listening on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
