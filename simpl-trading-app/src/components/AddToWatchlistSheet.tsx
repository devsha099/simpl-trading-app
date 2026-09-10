import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useWatchlists } from "../hooks/useWatchlists";
import { colors, fonts, radius } from "../lib/theme";

/**
 * "Add to Watchlist" from a stock's own page — the other direction from the
 * watchlist screen's search box, which only ever went list -> stock.
 *
 * A list already holding this symbol is shown, checked and non-tappable,
 * rather than hidden: hiding it would make the sheet look like the symbol
 * isn't saved anywhere, and re-tapping is a no-op the user can't see the
 * result of. useWatchlists.addSymbol also guards duplicates internally
 * (watchlist_items has no unique constraint), so this is the visible half of
 * a rule enforced in both places.
 */
export function AddToWatchlistSheet({
  symbol,
  visible,
  onClose,
}: {
  symbol: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { watchlists, loading, addSymbol } = useWatchlists();
  // Which lists this sheet just added to, so a row can confirm in place
  // instead of the sheet closing out from under the user on first tap.
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const handleAdd = (watchlistId: string) => {
    addSymbol(watchlistId, symbol);
    setJustAdded((prev) => (prev.includes(watchlistId) ? prev : [...prev, watchlistId]));
  };

  const handleClose = () => {
    setJustAdded([]);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add {symbol} to</Text>

          {loading ? (
            <Text style={styles.empty}>Loading your watchlists…</Text>
          ) : watchlists.length === 0 ? (
            <Text style={styles.empty}>
              You don’t have any watchlists yet. Create one on the Watchlists tab first.
            </Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {watchlists.map((w) => {
                const has = w.symbols.includes(symbol) || justAdded.includes(w.id);
                return (
                  <Pressable
                    key={w.id}
                    style={[styles.row, has && styles.rowDone]}
                    onPress={() => handleAdd(w.id)}
                    disabled={has}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: has }}
                    accessibilityLabel={
                      has ? `${symbol} is already in ${w.name}` : `Add ${symbol} to ${w.name}`
                    }
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, has && styles.rowNameDone]} numberOfLines={1}>
                        {w.name}
                      </Text>
                      <Text style={styles.rowCount}>
                        {w.symbols.length} {w.symbols.length === 1 ? "ticker" : "tickers"}
                      </Text>
                    </View>
                    <Text style={[styles.action, has && styles.actionDone]}>
                      {has ? "✓ Added" : "Add"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable style={styles.close} onPress={handleClose}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.inkRaised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: colors.inkLine,
    maxHeight: "70%",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.paper,
    textAlign: "center",
    marginBottom: 14,
  },
  list: { flexGrow: 0 },
  listContent: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised2,
  },
  rowDone: { borderColor: colors.amberDeep, backgroundColor: "rgba(226,162,60,0.08)" },
  rowText: { flex: 1 },
  rowName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.paper },
  rowNameDone: { color: colors.amberSoft },
  rowCount: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.paperDim, marginTop: 2 },
  action: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.amber },
  actionDone: { color: colors.amberDeep },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.paperDim,
    textAlign: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    lineHeight: 20,
  },
  close: { paddingVertical: 14, alignItems: "center", marginTop: 12 },
  closeText: { fontFamily: fonts.bodySemiBold, color: colors.paper, fontSize: 16 },
});
