import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatPrice,
  formatReturn,
  type Company,
  type CompanyRow as CompanyRowType,
  type SectorPerformance,
  type SymbolPerformance,
  type Window,
} from "../lib/markets";
import { colors, fonts, radius } from "../lib/theme";

/**
 * Row renderers shared by the Education tab's section previews and their
 * expanded screens, so the three-row teaser and the full list can't drift
 * apart visually.
 */

const toneStyle = (v: number | null | undefined) =>
  v === null || v === undefined ? styles.flat : v >= 0 ? styles.up : styles.down;

/** A company: symbol + name + sector. Taps through to the stock screen. */
export function CompanyRow({
  company,
  onPress,
  right,
}: {
  company: Company | CompanyRowType;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={styles.main}>
        <Text style={styles.symbol}>{company.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {company.name}
        </Text>
      </View>
      {right ?? <Text style={styles.sector}>{company.sector}</Text>}
    </Pressable>
  );
}

/** A ranked performer: price on top, the window's return under it. */
export function PerformanceRow({
  item,
  window,
  rank,
  onPress,
}: {
  item: SymbolPerformance;
  window: Window;
  rank?: number;
  onPress: () => void;
}) {
  const value = item.returns[window];
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {rank !== undefined ? <Text style={styles.rank}>{rank}</Text> : null}
      <View style={styles.main}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.numbers}>
        <Text style={styles.price}>{formatPrice(item.lastPrice)}</Text>
        <Text style={[styles.change, toneStyle(value)]}>{formatReturn(value)}</Text>
      </View>
    </Pressable>
  );
}

/** A sector: name, member count, and its equal-weighted return. */
export function SectorRow({
  item,
  window,
  onPress,
}: {
  item: SectorPerformance;
  window: Window;
  onPress?: () => void;
}) {
  const value = item.returns[window];
  const body = (
    <>
      <View style={styles.main}>
        <Text style={styles.sectorName} numberOfLines={1}>
          {item.sector}
        </Text>
        <Text style={styles.name}>
          {item.count} {item.count === 1 ? "company" : "companies"}
        </Text>
      </View>
      <Text style={[styles.sectorChange, toneStyle(value)]}>{formatReturn(value)}</Text>
    </>
  );
  return onPress ? (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  rank: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.paperDim,
    width: 22,
    textAlign: "right",
  },
  main: { flex: 1, gap: 2 },
  symbol: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.paper, letterSpacing: 0.3 },
  sectorName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper },
  name: { fontFamily: fonts.body, fontSize: 12.5, color: colors.paperDim },
  sector: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.paperDim,
    maxWidth: 110,
    textAlign: "right",
  },
  numbers: { alignItems: "flex-end", gap: 2 },
  price: { fontFamily: fonts.mono, fontSize: 14, color: colors.paper },
  // Tabular figures so a column of returns lines up like a ledger (§1).
  change: { fontFamily: fonts.monoMedium, fontSize: 12.5 },
  sectorChange: { fontFamily: fonts.monoMedium, fontSize: 15 },
  up: { color: colors.phosphor },
  down: { color: colors.rust },
  flat: { color: colors.paperDim },
});

export const rowStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    overflow: "hidden",
  },
});
