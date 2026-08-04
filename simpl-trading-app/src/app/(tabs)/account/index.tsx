import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE, ACCOUNT_ID } from "../../../lib/api";

type Position = {
  symbol: string;
  qty: string;
  market_value: string;
  current_price: string;
};

type TradingAccount = {
  cash: string;
  buying_power: string;
  portfolio_value: string;
};

const money = (v: string | undefined) =>
  v === undefined ? "—" : `$${Number(v).toFixed(2)}`;

export default function AccountScreen() {
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accRes, posRes] = await Promise.all([
        fetch(`${API_BASE}/api/alpaca/accounts/${ACCOUNT_ID}/trading`),
        fetch(`${API_BASE}/api/alpaca/accounts/${ACCOUNT_ID}/positions`),
      ]);
      if (!accRes.ok || !posRes.ok) throw new Error("Backend returned an error");
      setAccount(await accRes.json());
      setPositions(await posRes.json());
    } catch (e) {
      setError(
        "Couldn't reach the backend. Check that it's running and that API_BASE points to it.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>Simpl</Text>
        <Text style={styles.portfolio}>{money(account?.portfolio_value)}</Text>
        <Text style={styles.sub}>{money(account?.cash)} available to invest</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={positions}
        keyExtractor={(p) => p.symbol}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing held yet. Buy your first share from a watchlist.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text style={styles.qty}>{Number(item.qty).toFixed(4)} shares</Text>
            </View>
            <Text style={styles.value}>{money(item.market_value)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  center: { justifyContent: "center", alignItems: "center" },
  header: { padding: 24, paddingTop: 32 },
  brand: { fontSize: 15, fontWeight: "600", color: "#6b7280", letterSpacing: 1 },
  portfolio: { fontSize: 40, fontWeight: "700", color: "#111827", marginTop: 8 },
  sub: { fontSize: 15, color: "#6b7280", marginTop: 4 },
  error: { marginHorizontal: 24, marginBottom: 8, color: "#b91c1c", fontSize: 14 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  symbol: { fontSize: 17, fontWeight: "600", color: "#111827" },
  qty: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  value: { fontSize: 17, fontWeight: "500", color: "#111827" },
});
