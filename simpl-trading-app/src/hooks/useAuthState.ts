import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import { configurePurchases, resetPurchases } from "../lib/purchases";
import { supabase } from "../lib/supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "needs-onboarding" }
  | { status: "needs-investment-profile" }
  | { status: "pending" }
  | { status: "active" };

/**
 * The data behind the router state machine (CLAUDE.md §4): not logged in ->
 * welcome; logged in with no alpaca_accounts row -> onboarding; has a row,
 * not yet ACTIVE, no investor_profiles row -> the investment-profile
 * questionnaire (shown INSTEAD of the pending screen for that one step, see
 * investment-profile.tsx); has both rows but not ACTIVE -> pending;
 * ACTIVE -> the main app.
 *
 * "needs-investment-profile" is deliberately checked AFTER "ACTIVE", not
 * before — it's a one-time step for accounts still going through onboarding,
 * not a retroactive requirement. An already-ACTIVE account (including ones
 * onboarded before this questionnaire existed) never gets sent back for it.
 *
 * Re-evaluates on every Supabase auth event (login/logout/token refresh) and
 * on mount (so relaunching the app re-checks), plus on demand via the
 * returned `refresh()` — onboarding.tsx and pending.tsx call it right before
 * navigating after their own actions, since completing onboarding or a
 * pending account going ACTIVE are NOT Supabase auth events. Without that,
 * the root layout's guard (_layout.tsx) re-runs on every route change with
 * whatever status it last computed and fights the very navigation that just
 * happened — e.g. replacing to "/pending" right after onboarding immediately
 * got bounced back to "/onboarding" because this hook didn't yet know
 * anything had changed. Consumed through a single shared instance via
 * AuthStateContext (see context/AuthStateContext.tsx) so a screen's
 * `refresh()` call actually updates the same state the root layout reads,
 * not an independent copy.
 *
 * Also: the DB's account_status is only ever written once, at onboarding
 * time, so re-evaluating still isn't enough on its own — refresh() (and the
 * initial/auth-event evaluation) ask the backend to re-check Alpaca directly
 * rather than trusting a value that may just be stale. See routes/me/status.ts.
 */
export function useAuthState(): AuthState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const mountedRef = useRef(true);

  const evaluate = useCallback(async (session: Session | null | undefined) => {
    const userId = session?.user.id;
    if (!userId) {
      resetPurchases();
      if (mountedRef.current) setState({ status: "signed-out" });
      return;
    }
    // Identify RevenueCat as this user as soon as a session resolves — every
    // status below this point still requires a real userId, so this is the
    // one place that covers all of them (CLAUDE.md §15).
    configurePurchases(userId);

    const { data, error } = await supabase
      .from("alpaca_accounts")
      .select("account_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!mountedRef.current) return;
    if (error || !data) {
      setState({ status: "needs-onboarding" });
      return;
    }
    if (data.account_status === "ACTIVE") {
      setState({ status: "active" });
      return;
    }

    // Not ACTIVE in our DB yet — ask the backend to re-check with Alpaca
    // directly rather than trusting a value that may just be stale. Falls
    // back to the not-active path (not stuck loading) if it's unreachable.
    let isActive = false;
    try {
      const res = await fetch(`${API_BASE}/api/me/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => null);
      isActive = res.ok && body?.status === "ACTIVE";
    } catch {
      isActive = false;
    }
    if (!mountedRef.current) return;
    if (isActive) {
      setState({ status: "active" });
      return;
    }

    // Still not active: fill in the questionnaire while Alpaca reviews, and
    // only fall through to the pending screen once it's done.
    const { data: investorProfile } = await supabase
      .from("investor_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!mountedRef.current) return;
    setState({ status: investorProfile ? "pending" : "needs-investment-profile" });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data }) => evaluate(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // verifyOtp({type:"recovery"}) establishes a real session but fires
      // this distinct event instead of a normal SIGNED_IN specifically so
      // the app can tell the difference — evaluating it here like any other
      // sign-in would route the guard straight to onboarding/pending/tabs
      // before reset-password.tsx has actually let the user set a new
      // password. That screen calls refresh() itself once updateUser
      // succeeds, which is the correct moment to route.
      if (event === "PASSWORD_RECOVERY") return;
      evaluate(session);
    });

    return () => {
      mountedRef.current = false;
      subscription.subscription.unsubscribe();
    };
  }, [evaluate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluate(data.session);
  }, [evaluate]);

  return { ...state, refresh };
}
