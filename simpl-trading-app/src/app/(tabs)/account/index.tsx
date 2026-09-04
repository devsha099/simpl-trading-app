import { useCallback, useState } from "react";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { HazyText } from "../../../components/HazyText";
import { SpectrumStripe } from "../../../components/SpectrumStripe";
import { apiFetch } from "../../../lib/api";
import { cashAccountLabel } from "../../../lib/banking";
import { colors, fonts, labelCaps } from "../../../lib/theme";

type TradingAccount = {
  account_number?: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
};

const money = (v: string | undefined) => (v === undefined ? "—" : `$${Number(v).toFixed(2)}`);

const SECTIONS = [
  { route: "/account/holdings", title: "Holdings", subtitle: "What you own right now" },
  { route: "/account/orders", title: "Orders", subtitle: "Orders still working" },
  { route: "/account/trade-history", title: "Trade History", subtitle: "Everything that's filled or closed" },
  { route: "/account/banking", title: "Banking", subtitle: "Move money in and out" },
  { route: "/account/trade-limits", title: "Trade Limits", subtitle: "Guardrails you set for yourself" },
] as const;

export default function AccountScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/me/account");
      if (!res.ok) throw new Error("Backend returned an error");
      setAccount(await res.json());
    } catch {
      setError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on focus so the balance reflects an order placed elsewhere in
  // the app without needing a manual pull-to-refresh.
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
      {/* The nav header reads "#335725994 Cash Account" once the number
          loads — the account's real Alpaca-issued brokerage number, the
          same identifier that appears on statements. */}
      <Stack.Screen
        options={{ title: account?.account_number ? cashAccountLabel(account.account_number) : "Account" }}
      />
      <ScrollView>
        <View style={styles.header}>
          <SpectrumStripe size="sm" style={styles.stripe} />
          <Text style={styles.label}>Portfolio Value</Text>
          <HazyText style={styles.portfolio}>{money(account?.portfolio_value)}</HazyText>
          <Text style={styles.sub}>{money(account?.cash)} available to invest</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {SECTIONS.map((section) => (
          <Pressable key={section.route} style={styles.row} onPress={() => router.push(section.route)}>
            <View>
              <Text style={styles.rowTitle}>{section.title}</Text>
              <Text style={styles.rowSubtitle}>{section.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  header: { padding: 24, paddingTop: 20, alignItems: "center" },
  stripe: { width: "60%", marginBottom: 20 },
  label: { ...labelCaps, fontSize: 11 },
  portfolio: { fontFamily: fonts.monoSemiBold, fontSize: 40, color: colors.paper, marginTop: 8 },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.paperDim, marginTop: 6 },
  error: { fontFamily: fonts.body, marginHorizontal: 24, marginBottom: 8, color: colors.rust, fontSize: 14 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
  },
  rowTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.paper },
  rowSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.amberDeep },
});
