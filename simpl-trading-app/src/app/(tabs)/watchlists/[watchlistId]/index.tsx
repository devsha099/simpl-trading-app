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

type Snapshot = {
  lastPrice: number | null;
  changePercent: number | null;
};
type SnapshotMap = Record<string, Snapshot>;

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function WatchlistDetailScreen() {
  const { watchlistId } = useLocalSearchParams<{ watchlistId: string }>();
  const router = useRouter();
  const { watchlists, loading, addSymbol, removeSymbol } = useWatchlists();
  const watchlist = watchlists.find((w) => w.id === watchlistId);
  const symbols = watchlist?.symbols ?? [];

  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [newSymbol, setNewSymbol] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

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

  const handleAdd = () => {
    if (!newSymbol.trim() || !watchlistId) return;
    addSymbol(watchlistId, newSymbol);
    setNewSymbol("");
  };

  const handleRemove = () => {
    if (removeTarget && watchlistId) removeSymbol(watchlistId, removeTarget);
    setRemoveTarget(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: watchlist?.name ?? "Watchlist" }} />

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newSymbol}
          onChangeText={setNewSymbol}
          onSubmitEditing={handleAdd}
          placeholder="Add a ticker, e.g. MSFT"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

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
                  pathname: "/watchlists/[watchlistId]/[symbol]",
                  params: { watchlistId: watchlistId ?? "", symbol: item },
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
  screen: { flex: 1, backgroundColor: "#ffffff" },
  center: { justifyContent: "center", alignItems: "center" },
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
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    color: "#111827",
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  addButtonText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  symbol: { fontSize: 17, fontWeight: "600", color: "#111827" },
  priceCol: { alignItems: "flex-end" },
  price: { fontSize: 17, fontWeight: "500", color: "#111827" },
  change: { fontSize: 13, color: "#15803d", marginTop: 2 },
  changeNegative: { color: "#b91c1c" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: {
    textAlign: "center",
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "600",
    marginBottom: 12,
  },
  sheetDestructive: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#fef2f2",
  },
  sheetDestructiveText: { color: "#b91c1c", fontWeight: "600", fontSize: 16 },
  sheetCancel: { paddingVertical: 14, alignItems: "center", marginTop: 10 },
  sheetCancelText: { color: "#111827", fontWeight: "600", fontSize: 16 },
});
