import { getSupabaseAdmin } from "../supabase.js";

export type SubscriptionStatus = "active" | "expired";

/**
 * Mirrors the RevenueCat entitlement state for one user. Only
 * routes/webhooks/revenuecat.ts ever writes this — see the migration's
 * comment for why (same reasoning as db/accounts.ts's alpaca_accounts).
 */
export async function upsertSubscription(
  userId: string,
  revenuecatAppUserId: string,
  fields: { entitlement: string; status: SubscriptionStatus; productId: string | null; expiresAt: string | null },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .upsert({
      user_id: userId,
      revenuecat_app_user_id: revenuecatAppUserId,
      entitlement: fields.entitlement,
      status: fields.status,
      product_id: fields.productId,
      expires_at: fields.expiresAt,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}
