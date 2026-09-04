import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius } from "../lib/theme";

/**
 * The small "i" affordance next to a setting, with its explanation.
 *
 * Tap-to-toggle AND hover, deliberately. Hover alone is what a desktop design
 * reaches for, but this is a mobile-first app (§16) and touch devices have no
 * hover state at all — a hover-only tooltip is simply invisible on the primary
 * platform. Web gets both; native gets tap.
 *
 * The bubble is absolutely positioned so opening it never reflows the row it
 * belongs to.
 */
export function InfoTooltip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onHoverIn: () => setOpen(true), onHoverOut: () => setOpen(false) }
      : {};

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label} — more information` : "More information"}
        style={[styles.badge, open && styles.badgeActive]}
        {...hoverProps}
      >
        <Text style={[styles.badgeText, open && styles.badgeTextActive]}>i</Text>
      </Pressable>
      {open ? (
        <View style={styles.bubble} pointerEvents="none">
          <Text style={styles.bubbleText}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  badge: {
    width: 17,
    height: 17,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.amberDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.amberSoft,
  },
  badgeTextActive: { color: colors.buttonInk },
  bubble: {
    position: "absolute",
    // Sits below the badge and is wide enough to read; left-shifted so it
    // stays on screen when the badge is near the right edge of a row.
    top: 22,
    left: -140,
    width: 250,
    backgroundColor: colors.inkRaised2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    paddingVertical: 10,
    paddingHorizontal: 12,
    zIndex: 50,
    elevation: 50,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleText: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.paper },
});
