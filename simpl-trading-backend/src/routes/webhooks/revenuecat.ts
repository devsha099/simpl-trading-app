import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { upsertSubscription } from "../../db/subscriptions.js";

type RevenueCatEvent = {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  entitlement_ids?: string[];
  product_id?: string;
  expiration_at_ms?: number | null;
};

/**
 * RevenueCat webhook — the only writer of public.subscriptions (CLAUDE.md
 * §15), mirroring the alpaca_accounts pattern of "backend writes, client
 * only ever reads via RLS." This call comes from RevenueCat's own servers,
 * not a logged-in user, so it's authenticated by a shared secret in the
 * Authorization header (set to match in the RevenueCat dashboard's webhook
 * settings) instead of the usual Supabase session check.
 *
 * The SDK is configured client-side with the Supabase user id as
 * RevenueCat's own app_user_id (lib/purchases.ts) — so `event.app_user_id`
 * here IS a real auth.users.id, no separate identity mapping needed.
 */
export async function revenuecatWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { api_version?: string; event?: RevenueCatEvent } }>("/revenuecat", async (req, reply) => {
    if (!config.revenuecatWebhookSecret) {
      app.log.error("REVENUECAT_WEBHOOK_SECRET not set — rejecting webhook");
      return reply.code(503).send({ error: "webhook_not_configured" });
    }
    if (req.headers.authorization !== config.revenuecatWebhookSecret) {
      app.log.warn("RevenueCat webhook received with a bad/missing Authorization header");
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const event = req.body?.event;
    if (!event) return reply.code(400).send({ error: "missing_event" });

    // The dashboard's "Send Test Webhook" button — acknowledge without
    // writing anything, so a test click never pollutes real entitlement data.
    if (event.type === "TEST") return reply.code(200).send({ ok: true });

    const userId = event.app_user_id;
    if (!userId || !event.entitlement_ids?.includes(config.revenuecatEntitlementId)) {
      // Not our entitlement (or no identifiable user) — nothing to record.
      // Still 200, not an error: RevenueCat retries non-2xx responses, and
      // an irrelevant event isn't a failure.
      return reply.code(200).send({ ok: true });
    }

    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    // Derived from the expiration timestamp, not remembered from the event
    // TYPE — a CANCELLATION means "won't renew," not "revoke now," the user
    // stays entitled until expiresAt actually passes. Recomputing this fresh
    // on every webhook (rather than a stored state machine) is the same
    // self-healing philosophy as the Alpaca SUBMITTED->ACTIVE status sync
    // elsewhere in this codebase — a missed or out-of-order webhook can't
    // leave the row permanently wrong.
    const status = !expiresAt || new Date(expiresAt).getTime() > Date.now() ? "active" : "expired";

    await upsertSubscription(userId, event.original_app_user_id ?? userId, {
      entitlement: config.revenuecatEntitlementId,
      status,
      productId: event.product_id ?? null,
      expiresAt,
    });

    return reply.code(200).send({ ok: true });
  });
}
