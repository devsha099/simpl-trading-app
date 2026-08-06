import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/api";
import { supabase } from "../lib/supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "needs-onboarding" }
  | { status: "pending" }
  | { status: "active" };

/**
 * The data behind the router state machine (CLAUDE.md §4): not logged in ->
 * welcome; logged in with no alpaca_accounts row -> onboarding; has a row but
 * not ACTIVE -> pending; ACTIVE -> the main app.
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
      if (mountedRef.current) setState({ status: "signed-out" });
      return;
    }

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
    // back to "pending" (not stuck loading) if the backend is unreachable.
    try {
      const res = await fetch(`${API_BASE}/api/me/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      setState({ status: res.ok && body?.status === "ACTIVE" ? "active" : "pending" });
    } catch {
      if (mountedRef.current) setState({ status: "pending" });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data }) => evaluate(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
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
