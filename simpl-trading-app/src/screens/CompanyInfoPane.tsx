import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { API_BASE } from "../lib/api";
import { colors, fonts, radius } from "../lib/theme";

type CompanyProfile = {
  symbol: string;
  name: string;
  exchange: string | null;
  industry: string | null;
  ipo: string | null;
  marketCapitalization: number | null;
  shareOutstanding: number | null;
  webUrl: string | null;
  country: string | null;
  currency: string | null;
};

const fallback = "—";

// Finnhub's marketCapitalization comes back in millions of USD.
const formatMarketCap = (millions: number | null) => {
  if (millions === null || millions <= 0) return fallback;
  return millions >= 1000 ? `$${(millions / 1000).toFixed(2)}B` : `$${millions.toFixed(0)}M`;
};

const formatShares = (millions: number | null) => (millions === null ? fallback : `${millions.toFixed(1)}M`);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Company Info tab — one of StockScreen's three panes. Backed by
 * GET /api/company/:symbol/profile (Finnhub, since Alpaca itself has no
 * company metadata beyond symbol/name/exchange — see CLAUDE.md §13).
 * Public, non-account-scoped data: a plain fetch against API_BASE, same
 * pattern TradeScreen already uses for quotes, no apiFetch/session needed.
 */
export function CompanyInfoPane({ symbol }: { symbol: string }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/company/${symbol}/profile`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: CompanyProfile) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError("No company info available for this symbol yet.");
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

  if (error || !profile) {
    return <Text style={styles.empty}>{error ?? "No company info available for this symbol yet."}</Text>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.companyName}>{profile.name}</Text>
      <Text style={styles.subLine}>
        {profile.exchange ?? fallback}
        {profile.country ? ` · ${profile.country}` : ""}
      </Text>
      <View style={styles.divider} />
      <Row label="Industry" value={profile.industry ?? fallback} />
      <Row label="Market Cap" value={formatMarketCap(profile.marketCapitalization)} />
      <Row label="Shares Outstanding" value={formatShares(profile.shareOutstanding)} />
      <Row label="IPO Date" value={profile.ipo ?? fallback} />
      <Row label="Currency" value={profile.currency ?? fallback} />
      {profile.webUrl ? <Row label="Website" value={profile.webUrl.replace(/^https?:\/\//, "")} /> : null}
      <Text style={styles.attribution}>Company data via Finnhub.</Text>
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
  companyName: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.paper },
  subLine: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.inkLine, marginVertical: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  rowValue: { fontFamily: fonts.mono, fontSize: 13, color: colors.paper },
  attribution: { fontFamily: fonts.body, fontSize: 11, color: colors.paperDim, marginTop: 14 },
});
