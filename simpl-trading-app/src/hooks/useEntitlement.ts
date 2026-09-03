import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";

/**
 * Whether the logged-in user currently has the premium entitlement — reads
 * `public.subscriptions` directly via RLS (CLAUDE.md §15), the same
 * "backend writes, client reads straight from Supabase" pattern as
 * alpaca_accounts. No backend round trip needed per check: the RevenueCat
 * webhook (routes/webhooks/revenuecat.ts) is the only writer, so this row
 * is already the source of truth by the time the app reads it.
 *
 * Refetches on focus, not just on mount — same reasoning as Holdings/
 * TradeScreen: a purchase made elsewhere (or a renewal/expiration landing
 * via webhook) shouldn't require a full app relaunch to reflect here.
 */
export function useEntitlement(): { isPremium: boolean; loading: boolean } {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    setIsPremium(!error && data?.status === "active");
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { isPremium, loading };
}
