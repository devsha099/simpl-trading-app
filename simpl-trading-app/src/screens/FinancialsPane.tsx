import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { PaywallSheet } from "../components/PaywallSheet";
import { SankeyChart } from "../components/SankeyChart";
import { SheetSelect } from "../components/SheetSelect";
import { useEntitlement } from "../hooks/useEntitlement";
import {
  fetchStatements,
  formatPeriod,
  formatPeriodLong,
  formatValue,
  STATEMENTS,
  StatementsUnavailable,
  type Frequency,
  type StatementKind,
  type StatementRow,
  type Statements,
} from "../lib/statements";
import { colors, fonts, radius } from "../lib/theme";

/**
 * Financials tab — the company's actual income statement, balance sheet and
 * cash flow, every line item straight from Finnhub's standardized endpoint.
 *
 * This replaced a curated eight-ratio summary. That summary existed because
 * CLAUDE.md §1 rules out "dozens of metrics," and the reasoning still holds
 * for RATIOS — a wall of P/E variants is noise. A statement is different:
 * it's one structured document a company actually files, read top to bottom,
 * and showing eight numbers from it was the incomplete version.
 *
 * Two ways to read the same figures:
 * - The table (free): one period at a time, a dropdown to move between them
 *   — a 40-row × 10-column grid does not survive a 430 px phone.
 * - "Simpl Financials" (premium): the same period as a flow diagram. The
 *   toggle is the first thing in the app gated on useEntitlement(); locked,
 *   it opens the paywall. The backend ships the flow alongside the table, so
 *   switching is instant and the two can never disagree.
 *
 * Values are NOT colored by sign in the table, unlike the P&L screens. A
 * negative capex or accumulated depreciation is a normal part of a
 * statement, not a loss, and rust-on-negative would read as "something is
 * wrong" on rows where nothing is.
 */
export function FinancialsPane({ symbol }: { symbol: string }) {
  const [statement, setStatement] = useState<StatementKind>("ic");
  const [frequency, setFrequency] = useState<Frequency>("annual");
  const [data, setData] = useState<Statements | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    planLimited: boolean;
    availableSymbols: string[];
  } | null>(null);

  const { isPremium, loading: entitlementLoading, refresh: refreshEntitlement } = useEntitlement();
  const [simpl, setSimpl] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [wrapWidth, setWrapWidth] = useState(0);

  // A subscriber lands on the flow view — it's what they paid for — and
  // can switch back to the table with the same toggle. Runs once when the
  // entitlement resolves, so a subscriber who turns it off stays off.
  useEffect(() => {
    if (isPremium) setSimpl(true);
  }, [isPremium]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStatements(symbol, statement, frequency);
      setData(result);
      setPeriod((prev) => (prev && result.periods.includes(prev) ? prev : (result.periods[0] ?? null)));
    } catch (err) {
      setData(null);
      setError(
        err instanceof StatementsUnavailable
          ? { message: err.message, planLimited: err.planLimited, availableSymbols: err.availableSymbols }
          : { message: "Couldn’t load statements. Check your connection.", planLimited: false, availableSymbols: [] },
      );
    } finally {
      setLoading(false);
    }
  }, [symbol, statement, frequency]);

  useEffect(() => {
    load();
  }, [load]);

  const active = period ?? data?.periods[0] ?? null;
  const showFlow = isPremium && simpl;
  // A flow diagram needs width to breathe; below 640 it scrolls sideways
  // rather than crushing its columns, above 900 the ribbons just get long.
  const chartWidth = wrapWidth > 0 ? Math.min(Math.max(wrapWidth, 640), 900) : 640;

  const onSimplPress = () => {
    if (entitlementLoading) return;
    if (isPremium) setSimpl((v) => !v);
    else setPaywallOpen(true);
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWrapWidth(e.nativeEvent.layout.width)}>
      <View style={styles.switcher}>
        {STATEMENTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.segment, statement === s.key && styles.segmentActive]}
            onPress={() => setStatement(s.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: statement === s.key }}
          >
            <Text style={[styles.segmentText, statement === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.controls}>
        {(["annual", "quarterly"] as Frequency[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, frequency === f && styles.chipActive]}
            onPress={() => setFrequency(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: frequency === f }}
          >
            <Text style={[styles.chipText, frequency === f && styles.chipTextActive]}>
              {f === "annual" ? "Annual" : "Quarterly"}
            </Text>
          </Pressable>
        ))}

        <Pressable
          style={[
            styles.chip,
            styles.simplChip,
            showFlow && styles.chipActive,
            entitlementLoading && styles.chipPending,
          ]}
          onPress={onSimplPress}
          accessibilityRole={isPremium ? "switch" : "button"}
          accessibilityState={isPremium ? { checked: simpl } : undefined}
          accessibilityLabel={isPremium ? "Simpl Financials view" : "Simpl Financials — locked, tap to unlock"}
        >
          {!isPremium && !entitlementLoading ? <LockIcon color={colors.amberDeep} /> : null}
          <Text style={[styles.chipText, showFlow && styles.chipTextActive, !isPremium && styles.lockedText]}>
            Simpl Financials
          </Text>
        </Pressable>
      </View>

      {data && data.periods.length > 0 ? (
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>Period</Text>
          <SheetSelect
            compact
            value={active ?? ""}
            onValueChange={setPeriod}
            options={data.periods.map((p) => ({
              value: p,
              label: formatPeriod(p, data.frequency),
              description: `Period ending ${formatPeriodLong(p)}`,
            }))}
            title="Reporting period"
            subtitle={`Which ${data.frequency === "annual" ? "fiscal year" : "quarter"} to show.`}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>
            {error.planLimited ? "Not on the current data plan" : "Statements unavailable"}
          </Text>
          <Text style={styles.errorBody}>{error.message}</Text>
          {error.planLimited && error.availableSymbols.length > 0 ? (
            <Text style={styles.errorHint}>Currently available for {error.availableSymbols.join(", ")}.</Text>
          ) : null}
        </View>
      ) : data && active && showFlow ? (
        <View style={styles.card}>
          {data.flow[active] ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={chartWidth > wrapWidth}
                contentContainerStyle={[styles.flowScroll, chartWidth <= wrapWidth && styles.flowCentered]}
              >
                <SankeyChart
                  graph={data.flow[active]!}
                  width={chartWidth}
                  formatValue={(v) => formatValue(v, "currency")}
                />
              </ScrollView>
              <Text style={styles.legend}>
                <Text style={{ color: colors.amber }}>Amber</Text> is the company’s own money on its way to
                the bottom line · <Text style={{ color: colors.phosphor }}>green</Text> comes in from
                elsewhere · <Text style={{ color: colors.rust }}>rust</Text> goes out · grey is what the
                filing didn’t itemise. Every ribbon is drawn to scale.
              </Text>
            </>
          ) : (
            <Text style={styles.errorBody}>Not enough reported figures to draw this period as a flow.</Text>
          )}
          <Text style={styles.attribution}>
            {data.title} for the period ending {formatPeriodLong(active)}. Reported in USD.
            {"\n"}Data via Finnhub. Informational only, not investment advice.
          </Text>
        </View>
      ) : data && active ? (
        <View style={styles.card}>
          {data.sections.map((section, i) => (
            <View key={section.title ?? `s${i}`} style={i > 0 ? styles.sectionSpaced : undefined}>
              {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
              {section.rows.map((row) => (
                <Line key={row.key} row={row} period={active} />
              ))}
            </View>
          ))}
          {data.memo.length > 0 ? (
            <View style={styles.sectionSpaced}>
              <Text style={styles.sectionTitle}>Also reported</Text>
              {data.memo.map((row) => (
                <Line key={row.key} row={row} period={active} />
              ))}
            </View>
          ) : null}
          <Text style={styles.attribution}>
            {data.title} for the period ending {formatPeriodLong(active)}. Reported in USD.
            {"\n"}Data via Finnhub. Informational only, not investment advice.
          </Text>
        </View>
      ) : null}

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => {
          setPaywallOpen(false);
          refreshEntitlement();
        }}
      />
    </View>
  );
}

function Line({ row, period }: { row: StatementRow; period: string }) {
  const isTotal = row.emphasis === "total";
  const isSubtotal = row.emphasis === "subtotal";
  return (
    <View style={[styles.row, (isTotal || isSubtotal) && styles.rowRuled]}>
      <Text
        style={[styles.label, row.indent && styles.labelIndent, isSubtotal && styles.labelStrong, isTotal && styles.labelTotal]}
        numberOfLines={2}
      >
        {row.label}
      </Text>
      <Text style={[styles.value, isSubtotal && styles.valueStrong, isTotal && styles.valueTotal]}>
        {formatValue(row.values[period] ?? null, row.unit)}
      </Text>
    </View>
  );
}

/** A padlock drawn in SVG rather than an emoji, so it matches the brand on every platform. */
function LockIcon({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M3.6 5.2V3.7a2.4 2.4 0 0 1 4.8 0v1.5" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Rect x={2.3} y={5.2} width={7.4} height={5.4} rx={1.3} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10 },

  switcher: { flexDirection: "row", gap: 4, backgroundColor: colors.inkRaised, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.inkRaised2, borderWidth: 1, borderColor: colors.amberDeep },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.paperDim },
  segmentTextActive: { color: colors.amberSoft },

  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 12 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  simplChip: { borderColor: colors.amberDeep, marginLeft: 4 },
  chipPending: { opacity: 0.5 },
  chipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.paperDim },
  chipTextActive: { color: colors.buttonInk },
  lockedText: { color: colors.amberSoft },

  periodRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  periodLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.paperDim,
  },
  pickerWrap: {
    width: 170,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    overflow: "hidden",
  },
  picker: { color: colors.paper, backgroundColor: "transparent", fontFamily: fonts.mono, height: 36 },

  center: { alignItems: "center", paddingVertical: 60 },

  card: {
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  flowScroll: { paddingVertical: 4 },
  flowCentered: { flexGrow: 1, justifyContent: "center" },
  legend: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 17, color: colors.paperDim, marginTop: 10 },

  sectionSpaced: { marginTop: 18 },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.amberDeep,
    marginBottom: 6,
  },
  row: { flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 7 },
  rowRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.inkLine, marginTop: 2, paddingTop: 9 },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  labelIndent: { paddingLeft: 12 },
  labelStrong: { fontFamily: fonts.bodySemiBold, color: colors.paper },
  labelTotal: { fontFamily: fonts.bodySemiBold, color: colors.amberSoft },
  value: { fontFamily: fonts.mono, fontSize: 13, color: colors.paper },
  valueStrong: { fontFamily: fonts.monoSemiBold },
  valueTotal: { fontFamily: fonts.monoSemiBold, color: colors.amberSoft },

  errorTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.paper },
  errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 6, lineHeight: 19 },
  errorHint: { fontFamily: fonts.body, fontSize: 12, color: colors.amberDeep, marginTop: 10, lineHeight: 17 },

  attribution: { fontFamily: fonts.body, fontSize: 11, color: colors.paperDim, marginTop: 18, lineHeight: 16 },
});
