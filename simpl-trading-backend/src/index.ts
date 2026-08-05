import Fastify from "fastify";
import { config } from "./config.js";
import { alpacaRoutes } from "./routes/alpaca.js";
import { meRoutes } from "./routes/me/onboarding.js";
import { AlpacaError } from "./alpaca.js";

const app = Fastify({ logger: true });
import cors from "@fastify/cors";
app.register(cors, { origin: true });

// Health check — no Alpaca call, just proves the server is up.
app.get("/health", async () => ({ status: "ok" }));

// Turn Alpaca errors into clean JSON responses instead of 500s.
app.setErrorHandler((error, _req, reply) => {
  if (error instanceof AlpacaError) {
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

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`Simpl Trading backend listening on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
