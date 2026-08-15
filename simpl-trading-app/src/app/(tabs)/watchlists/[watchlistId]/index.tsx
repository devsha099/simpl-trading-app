import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE } from "../../../../lib/api";
import { useWatchlists } from "../../../../hooks/useWatchlists";
import { colors, fonts } from "../../../../lib/theme";

type Snapshot = {
  lastPrice: number | null;
  changePercent: number | null;
};
type SnapshotMap = Record<string, Snapshot>;

type AssetSuggestion = { symbol: string; name: string; exchange: string };

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const SUGGEST_DEBOUNCE_MS = 250;

export default function WatchlistDetailScreen() {
  const { watchlistId } = useLocalSearchParams<{ watchlistId: string }>();
  const router = useRouter();
  const { watchlists, loading, addSymbol, removeSymbol } = useWatchlists();
  const watchlist = watchlists.find((w) => w.id === watchlistId);
  const symbols = watchlist?.symbols ?? [];

  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [newSymbol, setNewSymbol] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AssetSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    if (symbols.length === 0) {
      setSnapshots({});
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/alpaca/snapshots?symbols=${symbols.join(",")}`);
      if (!res.ok) return;
      setSnapshots(await res.json());
    } catch (e) {
      // Silent — the list still renders with symbols, just without a price.
    }
    // symbols is derived from storage each render; join() keeps the effect
    // from re-firing on every unrelated re-render while still reacting to
    // actual membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(",")]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // Debounced autocomplete-as-you-type — matches ticker prefix OR company
  // name, from the backend's cached tradable-assets list (no per-keystroke
  // Alpaca call). Empty input just clears the dropdown.
  useEffect(() => {
    const query = newSymbol.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/alpaca/assets/search?q=${encodeURIComponent(query)}`);
        if (!res.ok || cancelled) return;
        setSuggestions(await res.json());
      } catch {
        // Silent — a failed suggestion fetch just means no dropdown; typing
        // + Add still works via the validation check below.
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newSymbol]);

  const addValidatedSymbol = useCallback(
    (symbol: string) => {
      if (!watchlistId) return;
      if (symbols.includes(symbol)) {
        setAddError(`${symbol} is already in this watchlist.`);
        return;
      }
      addSymbol(watchlistId, symbol);
      setNewSymbol("");
      setSuggestions([]);
      setSuggestionsOpen(false);
      setAddError(null);
    },
    [addSymbol, symbols, watchlistId],
  );

  // A suggestion row is already a known-tradable symbol straight from the
  // cache, so selecting one adds it immediately — no extra round trip,
  // which is the whole point of surfacing suggestions in the first place.
  const handleSelectSuggestion = (suggestion: AssetSuggestion) => {
    addValidatedSymbol(suggestion.symbol);
  };

  // Typed-and-submitted path (Enter key / Add button, no suggestion
  // tapped): the one thing that's NOT already known-valid, so it gets a
  // final authoritative existence check before it can be added — this is
  // what stops something like "BAAAAA" from ever reaching the watchlist.
  const handleAdd = async () => {
    const clean = newSymbol.trim().toUpperCase();
    if (!clean || !watchlistId) return;
    if (symbols.includes(clean)) {
      setAddError(`${clean} is already in this watchlist.`);
      return;
    }
    setValidating(true);
    setAddError(null);
    try {
      const res = await fetch(`${API_BASE}/api/alpaca/assets/${encodeURIComponent(clean)}`);
      if (!res.ok) {
        setAddError(`"${clean}" isn't a recognized ticker.`);
        return;
      }
      addValidatedSymbol(clean);
    } catch {
      setAddError("Couldn't verify that ticker. Check your connection.");
    } finally {
      setValidating(false);
    }
  };

  const handleRemove = () => {
    if (removeTarget && watchlistId) removeSymbol(watchlistId, removeTarget);
    setRemoveTarget(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: watchlist?.name ?? "Watchlist" }} />

      <View style={styles.addWrap}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newSymbol}
            onChangeText={(text) => {
              setNewSymbol(text);
              setAddError(null);
            }}
            onSubmitEditing={handleAdd}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => {
              // Delay so a tap on a suggestion row below registers as a
              // press before the dropdown disappears out from under it.
              setTimeout(() => setSuggestionsOpen(false), 150);
            }}
            placeholder="Ticker or company name, e.g. MSFT"
            placeholderTextColor={colors.paperDim}
            selectionColor={colors.amber}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.addButton, validating && styles.addButtonDisabled]}
            onPress={handleAdd}
            disabled={validating}
          >
            {validating ? (
              <ActivityIndicator color={colors.buttonInk} size="small" />
            ) : (
              <Text style={styles.addButtonText}>Add</Text>
            )}
          </Pressable>
        </View>

        {suggestionsOpen && newSymbol.trim() ? (
          <View style={styles.suggestions}>
            {suggestions.length === 0 ? (
              <Text style={styles.suggestionEmpty}>No matches</Text>
            ) : (
              suggestions.map((s) => (
                <Pressable
                  key={s.symbol}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectSuggestion(s)}
                >
                  <Text style={styles.suggestionSymbol}>{s.symbol}</Text>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {s.name}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </View>

      {addError ? <Text style={styles.addError}>{addError}</Text> : null}

      <FlatList
        data={symbols}
        keyExtractor={(s) => s}
        ListEmptyComponent={
          <Text style={styles.empty}>Add a stock above to start watching it.</Text>
        }
        renderItem={({ item }) => {
          const snap = snapshots[item];
          const negative = (snap?.changePercent ?? 0) < 0;
          return (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/watchlists/stock/[symbol]",
                  params: { symbol: item },
                })
              }
              onLongPress={() => setRemoveTarget(item)}
              {...(Platform.OS === "web"
                ? {
                    onContextMenu: (e: any) => {
                      e.preventDefault();
                      setRemoveTarget(item);
                    },
                  }
                : {})}
            >
              <Text style={styles.symbol}>{item}</Text>
              <View style={styles.priceCol}>
                <Text style={styles.price}>{money(snap?.lastPrice)}</Text>
                <Text style={[styles.change, negative && styles.changeNegative]}>
                  {pct(snap?.changePercent)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={removeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveTarget(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRemoveTarget(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{removeTarget}</Text>
            <Pressable style={styles.sheetDestructive} onPress={handleRemove}>
              <Text style={styles.sheetDestructiveText}>Remove from Watchlist</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setRemoveTarget(null)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  // zIndex/elevation so the suggestions dropdown floats above the ticker
  // list below it instead of pushing it down.
  addWrap: { position: "relative", zIndex: 10, elevation: 10 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    color: colors.paper,
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.amber,
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 15 },
  addError: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.rust,
    marginHorizontal: 20,
    marginTop: 2,
    marginBottom: 4,
  },
  suggestions: {
    position: "absolute",
    top: "100%",
    left: 20,
    right: 20,
    marginTop: 2,
    backgroundColor: colors.inkRaised,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
  },
  suggestionSymbol: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: colors.amberSoft },
  suggestionName: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  suggestionEmpty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.paperDim,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  empty: { fontFamily: fonts.body, textAlign: "center", color: colors.paperDim, marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  symbol: { fontFamily: fonts.monoSemiBold, fontSize: 16, color: colors.paper, letterSpacing: 0.3 },
  priceCol: { alignItems: "flex-end" },
  price: { fontFamily: fonts.mono, fontSize: 16, color: colors.paper },
  change: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.phosphor, marginTop: 2 },
  changeNegative: { color: colors.rust },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.inkRaised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: colors.inkLine,
  },
  sheetTitle: {
    fontFamily: fonts.monoSemiBold,
    textAlign: "center",
    fontSize: 13,
    color: colors.paperDim,
    marginBottom: 12,
  },
  sheetDestructive: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(201,107,76,0.15)",
    borderWidth: 1,
    borderColor: colors.rust,
  },
  sheetDestructiveText: { fontFamily: fonts.bodySemiBold, color: colors.rust, fontSize: 16 },
  sheetCancel: { paddingVertical: 14, alignItems: "center", marginTop: 10 },
  sheetCancelText: { fontFamily: fonts.bodySemiBold, color: colors.paper, fontSize: 16 },
});
