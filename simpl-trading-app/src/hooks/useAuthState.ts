import { useEffect, useState } from "react";
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
 * Re-evaluates on every Supabase auth event (login/logout/token refresh).
 * It does NOT react to onboarding completing or a pending account becoming
 * ACTIVE — those aren't auth events, so onboarding.tsx and pending.tsx
 * navigate directly after their own actions instead.
 */
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;

    const evaluate = async (userId: string | undefined) => {
      if (!userId) {
        if (mounted) setState({ status: "signed-out" });
        return;
      }

      const { data, error } = await supabase
        .from("alpaca_accounts")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (!mounted) return;
      if (error || !data) {
        setState({ status: "needs-onboarding" });
      } else if (data.account_status !== "ACTIVE") {
        setState({ status: "pending" });
      } else {
        setState({ status: "active" });
      }
    };

    supabase.auth.getSession().then(({ data }) => evaluate(data.session?.user.id));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session?.user.id);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
