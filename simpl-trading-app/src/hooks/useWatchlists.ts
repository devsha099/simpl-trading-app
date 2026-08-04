import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "simpl.watchlists.v2";
// Old single-watchlist storage, from before multiple named watchlists existed.
// Migrated into a single "My Watchlist" the first time this hook loads.
const LEGACY_KEY = "simpl.watchlist.symbols";

export type Watchlist = { id: string; name: string; symbols: string[] };

// On-device only for now — there's no logged-in user yet to key a real
// Supabase watchlist on. Swap for Supabase at the Phase 2 auth milestone.
export function useWatchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setWatchlists(JSON.parse(raw));
          return;
        }

        const legacyRaw = await AsyncStorage.getItem(LEGACY_KEY);
        const legacySymbols: string[] = legacyRaw ? JSON.parse(legacyRaw) : [];
        const migrated: Watchlist[] =
          legacySymbols.length > 0
            ? [{ id: `${Date.now()}`, name: "My Watchlist", symbols: legacySymbols }]
            : [];
        setWatchlists(migrated);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        setWatchlists([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next: Watchlist[]) => {
    setWatchlists(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const createWatchlist = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      persist([...watchlists, { id: `${Date.now()}`, name: clean, symbols: [] }]);
    },
    [watchlists, persist],
  );

  const addSymbol = useCallback(
    (watchlistId: string, symbol: string) => {
      const clean = symbol.trim().toUpperCase();
      if (!clean) return;
      persist(
        watchlists.map((w) =>
          w.id === watchlistId && !w.symbols.includes(clean)
            ? { ...w, symbols: [...w.symbols, clean] }
            : w,
        ),
      );
    },
    [watchlists, persist],
  );

  const removeSymbol = useCallback(
    (watchlistId: string, symbol: string) => {
      persist(
        watchlists.map((w) =>
          w.id === watchlistId ? { ...w, symbols: w.symbols.filter((s) => s !== symbol) } : w,
        ),
      );
    },
    [watchlists, persist],
  );

  return { watchlists, loading, createWatchlist, addSymbol, removeSymbol };
}
