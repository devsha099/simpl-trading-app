import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    load();
  }, [load]);

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
    setWatchlists((prev) =>
      prev.map((w) =>
        w.id === watchlistId && !w.symbols.includes(clean) ? { ...w, symbols: [...w.symbols, clean] } : w,
      ),
    );
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
