import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
 * and showing eight numbers from it was the incomplete version. The premium
 * tier turns this same data into proportional flow diagrams (the paywall
 * feature); this is the plain-statement tier underneath it.
 *
 * One period at a time with chips to move between them, rather than a
 * spreadsheet of years — a 40-row × 10-column grid does not survive a 430 px
 * phone, and scrolling sideways to read a balance sheet is worse than
 * tapping a year.
 *
 * Values are NOT colored by sign here, unlike the P&L screens. A negative
 * capex or accumulated depreciation is a normal part of a statement, not a
 * loss, and rust-on-negative would read as "something is wrong" on rows
 * where nothing is.
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStatements(symbol, statement, frequency);
      setData(result);
      // Keep the selected period across a statement switch when that period
      // also exists in the new one — switching Income -> Balance for the same
      // year shouldn't silently jump you back to the latest.
      setPeriod((prev) => (prev && result.periods.includes(prev) ? prev : (result.periods[0] ?? null)));
    } catch (err) {
      setData(null);
      setError(
        err instanceof StatementsUnavailable
          ? {
              message: err.message,
              planLimited: err.planLimited,
              availableSymbols: err.availableSymbols,
            }
          : {
              message: "Couldn’t load statements. Check your connection.",
              planLimited: false,
              availableSymbols: [],
            },
      );
    } finally {
      setLoading(false);
    }
  }, [symbol, statement, frequency]);

  useEffect(() => {
    load();
  }, [load]);

  const active = period ?? data?.periods[0] ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.switcher}>
        {STATEMENTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.segment, statement === s.key && styles.segmentActive]}
            onPress={() => setStatement(s.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: statement === s.key }}
          >
            <Text style={[styles.segmentText, statement === s.key && styles.segmentTextActive]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.freqRow}>
        {(["annual", "quarterly"] as Frequency[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.freqChip, frequency === f && styles.chipActive]}
            onPress={() => setFrequency(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: frequency === f }}
          >
            <Text style={[styles.chipText, frequency === f && styles.chipTextActive]}>
              {f === "annual" ? "Annual" : "Quarterly"}
            </Text>
          </Pressable>
        ))}
      </View>

      {data && data.periods.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periods}
        >
          {data.periods.map((p) => (
            <Pressable
              key={p}
              style={[styles.periodChip, active === p && styles.chipActive]}
              onPress={() => setPeriod(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: active === p }}
            >
              <Text style={[styles.chipText, active === p && styles.chipTextActive]}>
                {formatPeriod(p, data.frequency)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
            <Text style={styles.errorHint}>
              Currently available for {error.availableSymbols.join(", ")}.
            </Text>
          ) : null}
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
    </View>
  );
}

function Line({ row, period }: { row: StatementRow; period: string }) {
  const isTotal = row.emphasis === "total";
  const isSubtotal = row.emphasis === "subtotal";
  return (
    <View style={[styles.row, (isTotal || isSubtotal) && styles.rowRuled]}>
      <Text
        style={[
          styles.label,
          row.indent && styles.labelIndent,
          isSubtotal && styles.labelStrong,
          isTotal && styles.labelTotal,
        ]}
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

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10 },

  switcher: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.md,
    padding: 4,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.inkRaised2, borderWidth: 1, borderColor: colors.amberDeep },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.paperDim },
  segmentTextActive: { color: colors.amberSoft },

  freqRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  freqChip: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  periods: { gap: 6, paddingVertical: 2 },
  periodChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  chipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.paperDim },
  chipTextActive: { color: colors.buttonInk },

  center: { alignItems: "center", paddingVertical: 60 },

  card: {
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
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
  // A rule ABOVE a subtotal is how a statement signals "these add up to the
  // next line" — the same cue a printed filing uses.
  rowRuled: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
    marginTop: 2,
    paddingTop: 9,
  },
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

  attribution: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.paperDim,
    marginTop: 18,
    lineHeight: 16,
  },
});
