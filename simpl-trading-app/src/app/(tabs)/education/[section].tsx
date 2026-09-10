import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CompanyRow, PerformanceRow, SectorRow } from "../../../components/MarketRows";
import {
  fetchCompanies,
  fetchPerformance,
  fetchSectors,
  formatAsOf,
  WINDOWS,
  WINDOW_LABELS,
  type CompanyRow as CompanyRowType,
  type SectorPerformance,
  type SymbolPerformance,
  type Window,
} from "../../../lib/markets";
import { colors, fonts, radius } from "../../../lib/theme";

type Section = "companies" | "sectors" | "stocks";

const TITLES: Record<Section, string> = {
  companies: "The S&P 500",
  sectors: "Sector Performance",
  stocks: "Stock Performance",
};

const isSection = (v: string): v is Section => v in TITLES;

/**
 * The expanded view behind each Education section's "See all".
 *
 * One screen for all three rather than three near-identical files — they
 * share the header, the window switcher, the empty/error states and the
 * navigation, and differ only in which fetcher runs and which row renders.
 */
export default function SectionScreen() {
  const { section: raw } = useLocalSearchParams<{ section: string }>();
  const router = useRouter();
  const section = isSection(raw ?? "") ? (raw as Section) : null;

  const [window, setWindow] = useState<Window>("1Y");
  const [stocks, setStocks] = useState<SymbolPerformance[]>([]);
  const [sectors, setSectors] = useState<SectorPerformance[]>([]);
  const [companies, setCompanies] = useState<CompanyRowType[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    setError(null);
    try {
      if (section === "stocks") {
        const d = await fetchPerformance(window, 100);
        setStocks(d.results);
        setAsOf(d.asOf);
      } else if (section === "sectors") {
        const d = await fetchSectors(window);
        setSectors(d.results);
        setAsOf(d.asOf);
      } else {
        const d = await fetchCompanies({ sector: sectorFilter ?? undefined, limit: 100 });
        setCompanies(d.results);
        setAsOf(d.asOf);
      }
    } catch {
      setError("Couldn’t load this section.");
    } finally {
      setLoading(false);
    }
  }, [section, window, sectorFilter]);

  useEffect(() => {
    load();
  }, [load]);

  if (!section) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: "Not found" }} />
        <Text style={styles.error}>That section doesn’t exist.</Text>
      </SafeAreaView>
    );
  }

  const openStock = (symbol: string) => router.push(`/education/stock/${symbol}`);
  // Companies are listed alphabetically, not ranked, so a window switcher
  // there would change nothing on screen.
  const showWindows = section !== "companies";

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: TITLES[section] }} />

      {showWindows ? (
        <View style={styles.switcher}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w}
              style={[styles.chip, window === w && styles.chipActive]}
              onPress={() => setWindow(w)}
              accessibilityRole="button"
              accessibilityState={{ selected: window === w }}
            >
              <Text style={[styles.chipText, window === w && styles.chipTextActive]}>
                {WINDOW_LABELS[w]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {section === "companies" ? (
        <View style={styles.filterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Pressable
              style={[styles.chip, sectorFilter === null && styles.chipActive]}
              onPress={() => setSectorFilter(null)}
            >
              <Text style={[styles.chipText, sectorFilter === null && styles.chipTextActive]}>All</Text>
            </Pressable>
            {SECTOR_NAMES.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, sectorFilter === s && styles.chipActive]}
                onPress={() => setSectorFilter(s)}
              >
                <Text style={[styles.chipText, sectorFilter === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : section === "stocks" ? (
        <FlatList
          data={stocks}
          keyExtractor={(s) => s.symbol}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <PerformanceRow
              item={item}
              window={window}
              rank={index + 1}
              onPress={() => openStock(item.symbol)}
            />
          )}
          ListFooterComponent={
            <Footer
              asOf={asOf}
              note="Past performance over the selected period. Not a recommendation, and no indication of future results."
            />
          }
        />
      ) : section === "sectors" ? (
        <FlatList
          data={sectors}
          keyExtractor={(s) => s.sector}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <SectorRow item={item} window={window} />}
          ListFooterComponent={
            <Footer
              asOf={asOf}
              note="Equal-weighted average of each sector’s S&P 500 members — not a cap-weighted sector index, so these figures won’t match a sector ETF."
            />
          }
        />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(c) => c.symbol}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CompanyRow company={item} onPress={() => openStock(item.symbol)} />
          )}
          ListEmptyComponent={<Text style={styles.error}>No companies in that sector.</Text>}
          ListFooterComponent={<Footer asOf={asOf} />}
        />
      )}
    </SafeAreaView>
  );
}

function Footer({ asOf, note }: { asOf: string | null; note?: string }) {
  return (
    <View style={styles.footer}>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {asOf ? <Text style={styles.asOf}>Market data as of {formatAsOf(asOf)}</Text> : null}
    </View>
  );
}

// Mirrors the backend's GICS_SECTORS (data/sp500.ts) — the same
// mirrored-not-shared pattern as usStates.ts / financialProfile.ts.
const SECTOR_NAMES = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  switcher: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterWrap: { paddingTop: 10, paddingBottom: 2 },
  filters: { gap: 6, paddingHorizontal: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  chipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.paperDim },
  chipTextActive: { color: colors.buttonInk },
  list: { paddingTop: 10, paddingBottom: 32 },
  footer: { paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  note: { fontFamily: fonts.body, fontSize: 11.5, color: colors.paperDim, lineHeight: 16 },
  asOf: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.paperDim },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.rust, textAlign: "center" },
});
