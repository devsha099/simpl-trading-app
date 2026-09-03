import { Platform } from "react-native";
import Purchases from "react-native-purchases";

// RevenueCat's own public SDK keys — safe to embed in the client (unlike
// the Alpaca keys), platform-specific. EXPO_PUBLIC_ vars are inlined at
// build time, same pattern as lib/supabase.ts's anon key.
const API_KEY = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/**
 * Configure the RevenueCat SDK with the Supabase user id as RevenueCat's
 * own app_user_id. This is what lets the backend's webhook
 * (routes/webhooks/revenuecat.ts) trust `event.app_user_id` as a real
 * `auth.users.id` directly — no separate anonymous-id-to-real-user mapping
 * step anywhere. Called from useAuthState.ts whenever a session resolves to
 * a real user, mirroring how that hook is already the one place auth-driven
 * side effects happen.
 *
 * Never throws when a key is missing (same philosophy as lib/supabase.ts's
 * placeholder-URL fallback) — a dev environment without RevenueCat keys set
 * should still boot and run everything else, just without purchases working.
 *
 * Also requires a native RevenueCat module that Expo Go doesn't ship — this
 * SDK only actually works in a custom dev client / EAS build (see CLAUDE.md
 * §12), so calling this under Expo Go is a silent no-op in practice, not a
 * crash, but don't expect real entitlement data there.
 */
export function configurePurchases(userId: string): void {
  if (!API_KEY) {
    if (__DEV__) {
      console.warn("RevenueCat: no API key set for this platform (EXPO_PUBLIC_REVENUECAT_*_KEY) — purchases disabled.");
    }
    return;
  }
  if (!configured) {
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    configured = true;
    return;
  }
  // Already configured from an earlier session in this same app process —
  // re-identify in case a different account just logged in without a full
  // app restart in between (logIn is a no-op if it's already this user).
  Purchases.logIn(userId).catch(() => {
    // Silent — a failed re-identify shouldn't block the rest of sign-in;
    // the entitlement check just falls back to whatever's mirrored in
    // Supabase (useEntitlement.ts), which is the source of truth anyway.
  });
}

/** Clears RevenueCat's identified user on sign-out, so a shared device doesn't keep the previous account's identity. */
export function resetPurchases(): void {
  if (!configured) return;
  Purchases.logOut().catch(() => {
    // Silent — same reasoning as above; sign-out itself still proceeds.
  });
}
