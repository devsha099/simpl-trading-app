import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth.js";
import { getAccountForUser } from "../../db/accounts.js";
import { getTradeLimits, saveTradeLimits, isLoosening } from "../../db/tradeLimits.js";
import { countRoundTripsThisWeek } from "../../roundTrips.js";
import { MAX_ROUND_TRADE_LIMIT, VALID_MARKET_CAPS } from "../../data/tradeLimits.js";

const tradeLimitsSchema = z.object({
  roundTradeLimit: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROUND_TRADE_LIMIT)
    .nullable(),
  minMarketCap: z
    .number()
    .int()
    .nullable()
    // Only the exact dropdown values — an arbitrary number here would mean the
    // client invented an option the UI can't render back.
    .refine((v) => v === null || VALID_MARKET_CAPS.has(v), "Not a valid market-cap option."),
  cooldownEnabled: z.boolean(),
});

/**
 * Trade Limits settings (CLAUDE.md §17). Read/write go through the backend
 * rather than straight to Supabase (the usual pattern for app-owned data, §3)
 * for two reasons: resolving a matured cooldown belongs in exactly one place,
 * and the weekly round-trip count comes from Alpaca's order history, which the
 * client can't reach.
 */
export async function tradeLimitsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/trade-limits", { preHandler: requireAuth }, async (req) => {
    const state = await getTradeLimits(req.user!.id);

    // Usage is informational — a user who hasn't onboarded has no Alpaca
    // account to count against, and that shouldn't fail the whole screen.
    let roundTripsThisWeek: number | null = null;
    const account = await getAccountForUser(req.user!.id);
    if (account) {
      try {
        roundTripsThisWeek = await countRoundTripsThisWeek(account.alpacaAccountId);
      } catch {
        roundTripsThisWeek = null;
      }
    }

    return { ...state, roundTripsThisWeek };
  });

  app.put("/trade-limits", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = tradeLimitsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const { effective: before } = await getTradeLimits(req.user!.id);
    const state = await saveTradeLimits(req.user!.id, parsed.data);

    return {
      ...state,
      // Lets the client say "saved" vs "queued for <date>" without re-deriving
      // the loosening rule on its own and risking a different answer.
      deferred: state.pending !== null,
      wasLoosening: isLoosening(before, parsed.data),
    };
  });
}
