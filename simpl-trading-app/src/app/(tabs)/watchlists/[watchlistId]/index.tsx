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
        <ActivityIndicator color={colors.amber} />
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
          placeholderTextColor={colors.paperDim}
          selectionColor={colors.amber}
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
  screen: { flex: 1, backgroundColor: colors.ink },
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
  addButtonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 15 },
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
