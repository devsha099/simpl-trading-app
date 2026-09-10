import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SpectrumStripe } from "../../../components/SpectrumStripe";
import { SymbolSearch } from "../../../components/SymbolSearch";
import { CompanyRow, PerformanceRow, SectorRow, rowStyles } from "../../../components/MarketRows";
import { fetchOverview, formatAsOf, type Overview } from "../../../lib/markets";
import { colors, fonts, radius } from "../../../lib/theme";

/**
 * Education — a search box, the (still-empty) video shelf, and a stack of
 * market sections you scroll through, each showing a few rows with the rest
 * behind a tap.
 *
 * What is deliberately NOT here: day gainers, most-actives, or any
 * whole-market mover feed. Alpaca serves those and they return penny stocks
 * and warrants — the micro-caps Trade Limits' market-cap floor exists to keep
 * users away from (CLAUDE.md §17). Every list here ranks inside the S&P 500,
 * which makes that structurally impossible instead of filtered-out.
 */
export default function EducationScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
      setError(null);
    } catch {
      setError("Couldn’t load market data. Pull the app forward and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // On focus, not just mount: this screen stays mounted while the user is off
  // in other tabs, and the underlying figures roll over daily (§12's
  // useFocusEffect rule, same as holdings/orders/useWatchlists).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openStock = (symbol: string) => router.push(`/education/stock/${symbol}`);
  const openSection = (id: string) => router.push(`/education/${id}`);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[]}
      >
        <View style={styles.masthead}>
          <Text style={styles.title}>Education</Text>
          <SpectrumStripe size="sm" style={styles.stripe} />
        </View>

        {/* 1 — Search. First, above everything, so looking up a specific
            company never means scrolling past the browsing sections. */}
        <View style={styles.searchWrap}>
          <SymbolSearch onSelect={(s) => openStock(s.symbol)} />
        </View>

        {/* 2 — Videos. Still the placeholder this tab was created for. */}
        <Section title="Video Lessons" subtitle="Investing fundamentals, explained simply">
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Coming soon.</Text>
          </View>
        </Section>

        {loading && !overview ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : error && !overview ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : overview ? (
          <>
            {/* 3 — Browse the index. */}
            <Section
              title={overview.sections.companies.title}
              subtitle={overview.sections.companies.subtitle}
              onSeeAll={() => openSection("companies")}
              seeAllLabel={`All ${overview.sections.companies.total}`}
            >
              <View style={rowStyles.card}>
                {overview.sections.companies.preview.map((c) => (
                  <CompanyRow key={c.symbol} company={c} onPress={() => openStock(c.symbol)} />
                ))}
              </View>
            </Section>

            {/* 4 — Sectors. Ahead of individual stocks on purpose: which part
                of the market moved is a more useful lesson than which single
                ticker moved most. */}
            <Section
              title={overview.sections.sectors.title}
              subtitle={overview.sections.sectors.subtitle}
              onSeeAll={() => openSection("sectors")}
              seeAllLabel="All 11"
            >
              <View style={rowStyles.card}>
                {overview.sections.sectors.preview.map((s) => (
                  <SectorRow key={s.sector} item={s} window="1Y" />
                ))}
              </View>
            </Section>

            {/* 5 — Individual performers. */}
            <Section
              title={overview.sections.stocks.title}
              subtitle={overview.sections.stocks.subtitle}
              onSeeAll={() => openSection("stocks")}
              seeAllLabel="See all"
            >
              <View style={rowStyles.card}>
                {overview.sections.stocks.preview.map((s, i) => (
                  <PerformanceRow
                    key={s.symbol}
                    item={s}
                    window="1Y"
                    rank={i + 1}
                    onPress={() => openStock(s.symbol)}
                  />
                ))}
              </View>
              <Text style={styles.disclaimer}>
                Past performance. Not a recommendation, and no indication of future results.
              </Text>
            </Section>

            {/* 6 — Sections we can't fill yet. Rendered rather than omitted so
                the gap is visible and honest, and so filling it later is a
                data change instead of a UI change. */}
            {overview.unavailable.map((u) => (
              <Section key={u.id} title={u.title} subtitle={u.subtitle}>
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>{u.reason}</Text>
                </View>
              </Section>
            ))}

            {overview.asOf ? (
              <Text style={styles.asOf}>Market data as of {formatAsOf(overview.asOf)}</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One scroll section: heading, optional "see all", body, then a real gap. */
function Section({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel = "See all",
  children,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.seeAll}>{seeAllLabel} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { paddingBottom: 48 },
  masthead: { paddingHorizontal: 20, paddingTop: 28 },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.paper },
  stripe: { width: 80, marginTop: 12 },
  searchWrap: { paddingHorizontal: 20, marginTop: 20, zIndex: 20, elevation: 20 },
  // The gap between sections IS the layout — each block reads as its own
  // thing rather than one continuous list.
  section: { marginTop: 34, paddingHorizontal: 20 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionHeadText: { flex: 1, gap: 3 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.paper },
  sectionSubtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.paperDim },
  seeAll: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.amber },
  placeholder: {
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    padding: 18,
  },
  placeholderText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.paperDim, lineHeight: 20 },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.paperDim,
    marginTop: 10,
    lineHeight: 16,
  },
  center: { paddingVertical: 48, alignItems: "center", paddingHorizontal: 20 },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.rust, textAlign: "center" },
  asOf: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.paperDim,
    textAlign: "center",
    marginTop: 34,
  },
});
