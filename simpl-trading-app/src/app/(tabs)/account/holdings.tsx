import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "../../../lib/api";
import { colors, fonts } from "../../../lib/theme";

type Position = {
  symbol: string;
  qty: string;
  market_value: string;
  current_price: string;
  unrealized_pl?: string;
};

const money = (v: string | undefined) => (v === undefined ? "—" : `$${Number(v).toFixed(2)}`);

export default function HoldingsScreen() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/me/positions");
      if (!res.ok) throw new Error("Backend returned an error");
      setPositions(await res.json());
    } catch {
      setError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on focus, not just on mount — otherwise selling a position on
  // the trade screen and pressing back here would still show the
  // pre-sale quantity until a manual pull-to-refresh or app restart.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
        data={positions}
        keyExtractor={(p) => p.symbol}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.amber} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing held yet. Buy your first share from a watchlist.</Text>
        }
        renderItem={({ item }) => {
          const pl = item.unrealized_pl !== undefined ? Number(item.unrealized_pl) : null;
          return (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({ pathname: "/account/[symbol]", params: { symbol: item.symbol } })
              }
            >
              <View>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.qty}>{Number(item.qty).toFixed(4)} shares</Text>
              </View>
              <View style={styles.valueCol}>
                <Text style={styles.value}>{money(item.market_value)}</Text>
                {pl !== null ? (
                  <Text style={[styles.pl, pl < 0 && styles.plNegative]}>
                    {pl >= 0 ? "+" : ""}
                    {money(item.unrealized_pl)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
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
  empty: { fontFamily: fonts.body, textAlign: "center", color: colors.paperDim, marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  symbol: { fontFamily: fonts.monoSemiBold, fontSize: 16, color: colors.paper },
  qty: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 2 },
  valueCol: { alignItems: "flex-end" },
  value: { fontFamily: fonts.mono, fontSize: 16, color: colors.paper },
  pl: { fontFamily: fonts.mono, fontSize: 13, color: colors.phosphor, marginTop: 2 },
  plNegative: { color: colors.rust },
});
