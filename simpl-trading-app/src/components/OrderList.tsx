import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";

export type Order = {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: string | null;
  notional: string | null;
  filled_qty: string | null;
  filled_avg_price: string | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
};

const money = (v: string | null | undefined) =>
  v === null || v === undefined ? "—" : `$${Number(v).toFixed(2)}`;

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/** Shared by the Orders (open) and Trade History (closed) screens. */
export function OrderList({
  orders,
  loading,
  error,
  emptyMessage,
  onRefresh,
}: {
  orders: Order[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.amber} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
        renderItem={({ item }) => {
          const isBuy = item.side === "buy";
          // Fractional orders are placed in dollars (notional) OR shares
          // (qty) — never both, so show whichever this order actually used.
          const amount = item.qty
            ? `${Number(item.qty).toFixed(4)} shares`
            : item.notional
              ? money(item.notional)
              : "—";
          return (
            <View style={styles.row}>
              <View style={styles.leftCol}>
                <Text style={styles.symbol}>
                  <Text style={isBuy ? styles.buy : styles.sell}>{isBuy ? "Buy" : "Sell"}</Text> {item.symbol}
                </Text>
                <Text style={styles.meta}>
                  {amount} · {item.type}
                </Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.status}>{item.status}</Text>
                <Text style={styles.meta}>{formatDate(item.filled_at ?? item.submitted_at)}</Text>
                {item.filled_avg_price ? (
                  <Text style={styles.meta}>at {money(item.filled_avg_price)}</Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  error: { fontFamily: fonts.body, marginHorizontal: 24, marginTop: 16, color: colors.rust, fontSize: 14 },
  empty: { fontFamily: fonts.body, textAlign: "center", color: colors.paperDim, marginTop: 48, fontSize: 15, paddingHorizontal: 32 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  leftCol: { flex: 1 },
  rightCol: { alignItems: "flex-end" },
  symbol: { fontFamily: fonts.mono, fontSize: 15, fontWeight: "600", color: colors.paper },
  buy: { color: colors.phosphor },
  sell: { color: colors.rust },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 2 },
  status: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.paper, textTransform: "capitalize" },
});
