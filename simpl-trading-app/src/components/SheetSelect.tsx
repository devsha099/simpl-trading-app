import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fonts, radius } from "../lib/theme";

export type SheetOption = {
  value: string;
  label: string;
  /** One line on what this choice actually does. Shown under the label. */
  description?: string;
  /** Small trailing note — a price, a time window, a unit. */
  note?: string;
};

/**
 * A dropdown that opens as a full sheet instead of a native picker wheel.
 *
 * The native `<Picker>` this replaces gave a user a bare list of words with
 * nowhere to explain them — which is a real problem here, because the
 * choices are things like "Limit" vs "Stop" and "Extended Hours", where the
 * label alone is the least useful part. Every option can carry a line of
 * explanation, so the screen teaches while it collects (CLAUDE.md §1: the
 * PRODUCT stays narrow, not the UI).
 *
 * A sheet rather than an inline popover for two reasons: on a phone it's the
 * only shape with room for descriptions, and it renders identically on web
 * and native — the native Picker looks like a wheel on iOS, a dialog on
 * Android, and an HTML <select> on web, which is three different products.
 *
 * Long lists (states, market caps) get a filter box automatically; short
 * ones don't, because a search field above four options is furniture.
 */
export function SheetSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  title,
  subtitle,
  error,
  disabled,
  compact,
}: {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SheetOption[];
  placeholder?: string;
  /** Sheet heading. Falls back to `label`. */
  title?: string;
  subtitle?: string;
  error?: string;
  disabled?: boolean;
  /** Inline trigger with no field label — for toolbars. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);
  const searchable = options.length > 12;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q),
    );
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (v: string) => {
    onValueChange(v);
    close();
  };

  return (
    <View style={compact ? undefined : styles.field}>
      {label && !compact ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        style={[
          compact ? styles.triggerCompact : styles.trigger,
          open && styles.triggerOpen,
          !!error && styles.triggerError,
          disabled && styles.triggerDisabled,
        ]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? title ?? "Select"}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
      >
        <Text
          style={[
            compact ? styles.triggerTextCompact : styles.triggerText,
            !selected && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Chevron />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Stop propagation so a tap inside the sheet doesn't dismiss it. */}
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title ?? label ?? "Select"}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Filter…"
                placeholderTextColor={colors.paperDim}
                selectionColor={colors.amber}
                autoCorrect={false}
                maxLength={40}
              />
            ) : null}

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {shown.length === 0 ? (
                <Text style={styles.empty}>No matches</Text>
              ) : (
                shown.map((o) => {
                  const isSelected = o.value === value;
                  return (
                    <Pressable
                      key={o.value}
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => choose(o.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.optionText}>
                        <View style={styles.optionTitleRow}>
                          <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                            {o.label}
                          </Text>
                          {o.note ? <Text style={styles.optionNote}>{o.note}</Text> : null}
                        </View>
                        {o.description ? (
                          <Text style={styles.optionDescription}>{o.description}</Text>
                        ) : null}
                      </View>
                      {isSelected ? <Check /> : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Chevron() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      <Path
        d="M2.5 4.5 L6 8 L9.5 4.5"
        stroke={colors.amber}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Check() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <Path
        d="M3 8.5 L6.5 12 L13 4.5"
        stroke={colors.amber}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.paperDim,
    marginBottom: 8,
  },

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  triggerCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  triggerOpen: { borderColor: colors.amberDeep },
  triggerError: { borderColor: colors.rust },
  triggerDisabled: { opacity: 0.5 },
  triggerText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.paper },
  triggerTextCompact: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.paper },
  triggerPlaceholder: { color: colors.paperDim },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.rust, marginTop: 6 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.inkLine,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inkLine,
    alignSelf: "center",
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.paper },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.paperDim },
  close: { fontFamily: fonts.body, fontSize: 28, lineHeight: 28, color: colors.paperDim, marginTop: -4 },

  search: {
    marginHorizontal: 20,
    marginBottom: 6,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    color: colors.paper,
  },

  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  optionSelected: { borderColor: colors.amber, backgroundColor: "rgba(226,162,60,0.09)" },
  optionText: { flex: 1, gap: 3 },
  optionTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  optionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper },
  optionLabelSelected: { color: colors.amberSoft },
  optionNote: { fontFamily: fonts.mono, fontSize: 11, color: colors.paperDim },
  optionDescription: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.paperDim },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.paperDim,
    textAlign: "center",
    paddingVertical: 28,
  },
});
