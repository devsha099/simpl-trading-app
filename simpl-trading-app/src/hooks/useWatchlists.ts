import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";

export type Watchlist = { id: string; name: string; symbols: string[] };

/**
 * Supabase-backed, RLS-scoped to the logged-in user (watchlists/watchlist_items
 * tables, 0001_init.sql) — replaces the old on-device AsyncStorage version now
 * that real auth exists (see CLAUDE.md §11's "ownership and personalization"
 * milestone). create/add/remove update local state optimistically before the
 * Supabase write resolves, so callers keep firing them without awaiting,
 * matching the previous synchronous-feeling API. Low-stakes data (not money),
 * so a failed background write just logs a warning rather than rolling back
 * the optimistic update — worth revisiting if watchlists ever affect trading.
 */
export function useWatchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setWatchlists([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("watchlists")
      .select("id, name, watchlist_items(symbol)")
      // RLS already scopes this to the owner, so this filter is redundant
      // for correctness — it's here as defense in depth, so a future policy
      // edit can't silently turn this into "every user's watchlists".
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      setWatchlists([]);
      setLoading(false);
      return;
    }

    setWatchlists(
      (data as { id: string; name: string; watchlist_items: { symbol: string }[] }[]).map((w) => ({
        id: w.id,
        name: w.name,
        symbols: (w.watchlist_items ?? []).map((i) => i.symbol),
      })),
    );
    setLoading(false);
  }, []);

  // Refetch on focus, not just on mount. Each screen that calls this hook
  // gets its OWN independent copy of the state (unlike useAuthState, which
  // is shared through a context), and React Navigation keeps stack screens
  // mounted — so the watchlists list screen would otherwise keep showing
  // the ticker count it loaded the first time. Repro before this fix:
  // open a watchlist showing "3 tickers", go in, add a fourth, come back —
  // still "3 tickers" until a full app reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const createWatchlist = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data, error } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, name: clean })
        .select("id, name")
        .single();
      if (error || !data) {
        console.warn("Failed to create watchlist:", error?.message);
        return;
      }
      setWatchlists((prev) => [...prev, { id: data.id, name: data.name, symbols: [] }]);
    })();
  }, []);

  const addSymbol = useCallback((watchlistId: string, symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    // watchlist_items has no unique constraint on (watchlist_id, symbol),
    // so skip the insert entirely for an already-present symbol — otherwise
    // it'd write a literal duplicate row (a repeated ticker in the list,
    // and a duplicate React key). Checked against the SAME state snapshot
    // the update applies to, not a possibly-stale outer closure.
    let alreadyPresent = false;
    setWatchlists((prev) =>
      prev.map((w) => {
        if (w.id !== watchlistId) return w;
        if (w.symbols.includes(clean)) {
          alreadyPresent = true;
          return w;
        }
        return { ...w, symbols: [...w.symbols, clean] };
      }),
    );
    if (alreadyPresent) return;
    supabase
      .from("watchlist_items")
      .insert({ watchlist_id: watchlistId, symbol: clean })
      .then(({ error }) => {
        if (error) console.warn("Failed to add symbol:", error.message);
      });
  }, []);

  const removeSymbol = useCallback((watchlistId: string, symbol: string) => {
    setWatchlists((prev) =>
      prev.map((w) => (w.id === watchlistId ? { ...w, symbols: w.symbols.filter((s) => s !== symbol) } : w)),
    );
    supabase
      .from("watchlist_items")
      .delete()
      .eq("watchlist_id", watchlistId)
      .eq("symbol", symbol)
      .then(({ error }) => {
        if (error) console.warn("Failed to remove symbol:", error.message);
      });
  }, []);

  return { watchlists, loading, createWatchlist, addSymbol, removeSymbol };
}
