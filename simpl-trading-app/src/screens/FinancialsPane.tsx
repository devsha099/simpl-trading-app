import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { API_BASE } from "../lib/api";
import { colors, fonts, radius } from "../lib/theme";

type BasicFinancials = {
  symbol: string;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  profitMargin: number | null;
  revenuePerShare: number | null;
};

const fallback = "—";
const num = (v: number | null, decimals = 2) => (v === null ? fallback : v.toFixed(decimals));
const money = (v: number | null) => (v === null ? fallback : `$${v.toFixed(2)}`);
const pct = (v: number | null) => (v === null ? fallback : `${v.toFixed(2)}%`);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Financials tab — one of StockScreen's three panes. Backed by
 * GET /api/company/:symbol/financials (Finnhub — Alpaca has zero
 * fundamentals data at any tier, see CLAUDE.md §13).
 *
 * Deliberately a curated handful of figures, not a dense fundamentals
 * dashboard: CLAUDE.md §1 explicitly rules out "dozens of metrics" as
 * against this app's calm, minimalist brand — a wall of ratios here would
 * just be that same thing on a different tab. This is one tap away from
 * Trade, not the landing view, which is the compromise that let this
 * feature happen at all (see the plan discussion the day this was built).
 */
export function FinancialsPane({ symbol }: { symbol: string }) {
  const [financials, setFinancials] = useState<BasicFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/company/${symbol}/financials`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: BasicFinancials) => {
        if (!cancelled) setFinancials(data);
      })
      .catch(() => {
        if (!cancelled) setError("No financial data available for this symbol yet.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (error || !financials) {
    return <Text style={styles.empty}>{error ?? "No financial data available for this symbol yet."}</Text>;
  }

  return (
    <View style={styles.card}>
      <Row label="P/E Ratio (TTM)" value={num(financials.peRatio)} />
      <Row label="EPS (TTM)" value={money(financials.eps)} />
      <Row label="Dividend Yield" value={pct(financials.dividendYield)} />
      <Row label="Profit Margin" value={pct(financials.profitMargin)} />
      <Row label="Revenue per Share (TTM)" value={money(financials.revenuePerShare)} />
      <Row label="52-Week High" value={money(financials.week52High)} />
      <Row label="52-Week Low" value={money(financials.week52Low)} />
      <Row label="Beta" value={num(financials.beta)} />
      <Text style={styles.attribution}>
        Financial data via Finnhub. Figures are informational only, not investment advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingVertical: 60 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.paperDim,
    marginHorizontal: 20,
    marginTop: 32,
    textAlign: "center",
  },
  card: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  rowValue: { fontFamily: fonts.mono, fontSize: 13, color: colors.paper },
  attribution: { fontFamily: fonts.body, fontSize: 11, color: colors.paperDim, marginTop: 14 },
});
