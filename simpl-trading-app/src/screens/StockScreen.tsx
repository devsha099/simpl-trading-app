import { useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CompanyInfoPane } from "./CompanyInfoPane";
import { FinancialsPane } from "./FinancialsPane";
import TradeScreen from "./TradeScreen";
import { colors, fonts, radius } from "../lib/theme";

type Pane = "info" | "trade" | "financials";

const TABS: { key: Pane; label: string }[] = [
  { key: "info", label: "Company Info" },
  { key: "trade", label: "Trade" },
  { key: "financials", label: "Financials" },
];

/**
 * The shared per-stock screen — one symbol, three switchable panes. Reached
 * two ways: from a watchlist ticker row, or from a held position on the
 * Holdings screen (both `watchlists/stock/[symbol].tsx` and
 * `account/[symbol].tsx` re-export this same component so each stays within
 * its own tab's back-stack — see CLAUDE.md §8). Owns the route param, the
 * screen title, and the single SafeAreaView; TradeScreen/CompanyInfoPane/
 * FinancialsPane are body-only content, not full screens.
 *
 * Trade is the landing pane, not Company Info or Financials — buying/
 * holding stays the app's default, one-tap-away action (CLAUDE.md §1);
 * the other two are there when wanted, not the first thing shown.
 */
export default function StockScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? "").toUpperCase();
  const [pane, setPane] = useState<Pane>("trade");

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: symbol }} />

      <View style={styles.header}>
        <Text style={styles.symbolTitle}>{symbol}</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, pane === tab.key && styles.tabActive]}
            onPress={() => setPane(tab.key)}
          >
            <Text style={[styles.tabText, pane === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* iOS: the keyboard overlays the screen instead of resizing it, so
          without this the Amount field (and its own on-screen keyboard)
          would sit right where the keyboard covers it. "padding" shrinks
          this view by the keyboard's height, which combined with the
          ScrollView below reveals whatever's focused. Android already
          resizes the window itself (Expo's default softwareKeyboardLayoutMode)
          so no behavior is needed there — adding "height" on top of that
          double-shrinks and causes jank. */}
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {pane === "info" ? <CompanyInfoPane symbol={symbol} /> : null}
          {pane === "trade" ? <TradeScreen symbol={symbol} /> : null}
          {pane === "financials" ? <FinancialsPane symbol={symbol} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
  symbolTitle: { fontFamily: fonts.monoSemiBold, fontSize: 30, color: colors.paper, letterSpacing: 0.3 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 14,
    gap: 6,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center" },
  tabActive: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  tabText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.paperDim },
  tabTextActive: { color: colors.buttonInk },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 24 },
});
