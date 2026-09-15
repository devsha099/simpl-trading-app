import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SankeyChart } from "./SankeyChart";
import { PREMIUM_PLANS, purchasePremium, type Plan } from "../lib/premium";
import { formatValue } from "../lib/statements";
import { TSLA_EXAMPLE_FLOW } from "../lib/tslaExampleFlow";
import { colors, fonts, radius } from "../lib/theme";

/**
 * The Simpl Financials paywall. Shown when a non-subscriber taps the locked
 * toggle on the Financials tab.
 *
 * Leads with the product, not the price: a real rendering of Tesla's income
 * statement as a flow, drawn by the same component subscribers get, so what
 * they see is what they'd buy. The plan cards sit under it.
 *
 * Two-step on purpose — pick a plan, then a separate Subscribe button —
 * because this is a money action and a single tap on a card is too easy to
 * do by accident while scrolling.
 *
 * Nothing here ever marks the user premium. A successful purchase goes
 * store -> RevenueCat -> our webhook -> public.subscriptions, and
 * `onPurchased` just asks the parent to re-read that row (§15).
 */
export function PaywallSheet({
  visible,
  onClose,
  onPurchased,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // A five-stage flow needs ~560 px to label cleanly; on a phone the
  // preview scrolls sideways a little rather than crushing its columns.
  const sheetInner = Math.min(windowWidth, 680) - 56;
  const chartWidth = Math.max(Math.min(sheetInner, 620), 560);
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const subscribe = async () => {
    setBusy(true);
    setNotice(null);
    const outcome = await purchasePremium(plan);
    setBusy(false);
    if (outcome.status === "purchased") {
      onPurchased();
    } else if (outcome.status === "unavailable") {
      setNotice(outcome.message);
    }
    // "cancelled" — the user changed their mind; nothing to say.
  };

  const chosen = PREMIUM_PLANS[plan];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            {/* flex:1 so the headline wraps instead of pushing the close
                button off the edge — the first render clipped both. */}
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Simpl Financials</Text>
              <Text style={styles.headline}>Unlock a whole new simpler way of visualizing financials</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.lede}>
              Every income statement, balance sheet and cash flow — drawn as the flow of money it
              actually is. Here's Tesla's income statement, to scale.
            </Text>

            <View style={styles.preview}>
              {/* alignSelf:stretch — the preview centres its children for the
                  caption, which would otherwise let this ScrollView size to
                  its content and overflow BOTH edges (clipping Revenue on the
                  left) instead of scrolling from the left. */}
              <ScrollView
                horizontal
                style={styles.previewScroll}
                showsHorizontalScrollIndicator={chartWidth > sheetInner}
              >
                <SankeyChart
                  graph={TSLA_EXAMPLE_FLOW}
                  width={chartWidth}
                  formatValue={(v) => formatValue(v, "currency")}
                />
              </ScrollView>
              <Text style={styles.previewCaption}>TSLA · Income statement · FY2025</Text>
            </View>

            <View style={styles.plans}>
              {(["annual", "monthly"] as Plan[]).map((p) => {
                const meta = PREMIUM_PLANS[p];
                const selected = plan === p;
                return (
                  <Pressable
                    key={p}
                    style={[styles.plan, selected && styles.planSelected]}
                    onPress={() => setPlan(p)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    {meta.note ? (
                      <Text style={[styles.planNote, selected && styles.planNoteSelected]}>{meta.note}</Text>
                    ) : null}
                    <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>{meta.price}</Text>
                    <Text style={styles.planPer}>per {meta.per}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.cta, busy && styles.ctaBusy]}
              onPress={subscribe}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={colors.buttonInk} />
              ) : (
                <Text style={styles.ctaText}>
                  Subscribe · {chosen.price}/{chosen.per}
                </Text>
              )}
            </Pressable>

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Text style={styles.fine}>
              Billed {chosen.per === "year" ? "annually" : "monthly"} through your app store and renews
              automatically until cancelled. Cancel anytime in your store's subscription settings.
              Simpl Financials is a way of viewing the same reported figures; it is informational only
              and not investment advice.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.inkLine,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 6,
  },
  headerText: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.amber,
    marginBottom: 6,
  },
  headline: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    lineHeight: 27,
    color: colors.paper,
    maxWidth: 480,
  },
  close: { fontFamily: fonts.body, fontSize: 30, lineHeight: 30, color: colors.paperDim, marginTop: -2 },
  body: { paddingHorizontal: 22, paddingBottom: 34 },
  lede: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.paperDim, marginTop: 8 },
  preview: {
    marginTop: 16,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    padding: 6,
    alignItems: "center",
  },
  previewScroll: { alignSelf: "stretch" },
  previewCaption: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.paperDim, paddingVertical: 8 },
  plans: { flexDirection: "row", gap: 10, marginTop: 18 },
  plan: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 2,
    minHeight: 96,
    justifyContent: "center",
  },
  planSelected: { borderColor: colors.amber, backgroundColor: "rgba(226,162,60,0.08)" },
  planNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.paperDim,
    marginBottom: 4,
  },
  planNoteSelected: { color: colors.amber },
  planPrice: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.paper },
  planPriceSelected: { color: colors.amberSoft },
  planPer: { fontFamily: fonts.body, fontSize: 12.5, color: colors.paperDim },
  cta: {
    marginTop: 14,
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: colors.amber,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.buttonInk },
  notice: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.rust,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
  },
  fine: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.paperDim, marginTop: 16 },
});
