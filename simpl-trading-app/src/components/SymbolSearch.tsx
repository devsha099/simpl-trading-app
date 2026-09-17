import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { API_BASE } from "../lib/api";
import { colors, fonts, radius } from "../lib/theme";

export type AssetSuggestion = { symbol: string; name: string; exchange: string };

const SUGGEST_DEBOUNCE_MS = 250;

/**
 * Ticker/company autocomplete — the same backend search the watchlist add-box
 * uses (/api/alpaca/assets/search, capped at 6 and already filtered to
 * tradable non-OTC names), so a symbol found here is always one the trade
 * screen can actually open.
 *
 * Selection-only by design: unlike the watchlist box there's no free-text
 * "Add" path, so there's nothing to validate separately — every suggestion
 * comes straight from the cached tradable-asset list.
 */
export function SymbolSearch({
  onSelect,
  placeholder = "Search a stock — ticker or company name",
}: {
  onSelect: (suggestion: AssetSuggestion) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AssetSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/alpaca/assets/search?q=${encodeURIComponent(q)}`);
        if (!res.ok || cancelled) return;
        setSuggestions(await res.json());
      } catch {
        // Silent: a failed lookup just means no dropdown this keystroke.
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (s: AssetSuggestion) => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onSelect(s);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        onFocus={() => setOpen(true)}
        // Delayed so a tap on a suggestion registers before the list unmounts
        // out from under the finger.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        placeholderTextColor={colors.paperDim}
        selectionColor={colors.amber}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={12}
      />

      {open && query.trim() ? (
        <View style={styles.suggestions}>
          {suggestions.length === 0 ? (
            <Text style={styles.empty}>No matches</Text>
          ) : (
            suggestions.map((s) => (
              <Pressable key={s.symbol} style={styles.row} onPress={() => handleSelect(s)}>
                <Text style={styles.symbol}>{s.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {s.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex so the dropdown floats over the sections below instead of shoving
  // them down as the user types.
  wrap: { position: "relative", zIndex: 20, elevation: 20 },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    color: colors.paper,
  },
  suggestions: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.inkRaised2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
  },
  symbol: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: colors.amberSoft },
  name: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.paperDim,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
