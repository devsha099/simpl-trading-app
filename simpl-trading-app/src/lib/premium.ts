import Purchases from "react-native-purchases";

/**
 * The premium tier — "Simpl Financials" — and the purchase call behind it.
 *
 * Prices live here as ONE constant on purpose. They're also configured in
 * App Store Connect / Google Play (via RevenueCat, §15), and those stores are
 * the source of truth at checkout; these are the DISPLAY prices on the
 * paywall, and if they drift from the store the paywall is lying. Change
 * both together.
 */
export type Plan = "monthly" | "annual";

export const PREMIUM_PLANS: Record<
  Plan,
  { price: string; per: string; note: string | null; rcPackage: string }
> = {
  monthly: { price: "$6.99", per: "month", note: null, rcPackage: "$rc_monthly" },
  // $49.99 vs 12 × $6.99 = $83.88 — the annual plan is the one to lead with.
  annual: { price: "$49.99", per: "year", note: "Save 40%", rcPackage: "$rc_annual" },
};

export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string };

/**
 * Runs the real RevenueCat purchase for a plan. On success the store talks
 * to RevenueCat, RevenueCat's webhook writes public.subscriptions, and
 * useEntitlement() sees it on next focus — this function never marks the
 * user premium itself, because the client is not trusted to (§3, §15).
 *
 * Until the external accounts in §15 exist (RevenueCat project, App Store /
 * Play products, SDK keys in .env) every path here ends in "unavailable" —
 * and on web or Expo Go it always will, since the native module isn't
 * there. That is reported honestly rather than faked.
 */
export async function purchasePremium(plan: Plan): Promise<PurchaseOutcome> {
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.identifier === PREMIUM_PLANS[plan].rcPackage,
    );
    if (!pkg) {
      return {
        status: "unavailable",
        message: "This plan isn't set up in the store yet. Please try again later.",
      };
    }
    await Purchases.purchasePackage(pkg);
    return { status: "purchased" };
  } catch (err) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { status: "cancelled" };
    return {
      status: "unavailable",
      message: "Purchases aren't available in this build yet.",
    };
  }
}
