import Fastify from "fastify";
import { config } from "./config.js";
import { alpacaRoutes } from "./routes/alpaca.js";
import { meRoutes } from "./routes/me/onboarding.js";
import { statusRoutes } from "./routes/me/status.js";
import { investmentProfileRoutes } from "./routes/me/investmentProfile.js";
import { tradingRoutes } from "./routes/me/trading.js";
import { kycDetailsRoutes } from "./routes/me/kycDetails.js";
import { AlpacaError } from "./alpaca.js";

const app = Fastify({ logger: true });
import cors from "@fastify/cors";
app.register(cors, { origin: true });

// Health check — no Alpaca call, just proves the server is up.
app.get("/health", async () => ({ status: "ok" }));

// Turn Alpaca errors into clean JSON responses instead of 500s.
app.setErrorHandler((error, _req, reply) => {
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
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error" });
});

app.register(alpacaRoutes, { prefix: "/api/alpaca" });
app.register(meRoutes, { prefix: "/api/me" });
app.register(statusRoutes, { prefix: "/api/me" });
app.register(investmentProfileRoutes, { prefix: "/api/me" });
app.register(tradingRoutes, { prefix: "/api/me" });
app.register(kycDetailsRoutes, { prefix: "/api/me" });

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`Simpl Trading backend listening on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
