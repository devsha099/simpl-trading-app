import { useCallback, useState } from "react";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { apiFetch } from "../../../lib/api";
import {
  MARKET_CAP_OPTIONS,
  MAX_ROUND_TRADE_LIMIT,
  NO_LIMITS,
  formatEffectiveAt,
  marketCapLabel,
  type TradeLimits,
  type TradeLimitsState,
} from "../../../lib/tradeLimits";
import { colors, fonts, labelCaps, radius } from "../../../lib/theme";

const ROUND_TRADE_INFO =
  "Amount of round-trades you want to limit yourself to every week (Mon-Fri). You will not be able to open another position after reaching this limit.";
const MARKET_CAP_INFO =
  "Limits you to buying stocks above this market cap. You will not be able to buy a security lower than this market cap limit.";
const RESET_INFO = "Resets your limits back to no limits.";
const COOLDOWN_INFO =
  "Changes that weaken a limit — raising it, removing it, or switching this off — wait until the next trading day at 9:30 AM ET. Tightening a limit always applies right away.";

/**
 * Trade Limits (CLAUDE.md §17) — self-imposed guardrails against weekly churn
 * and micro-cap speculation, the two behaviors §1's audience is trying to quit.
 *
 * This screen only edits the settings. Enforcement lives server-side in
 * POST /api/me/orders, because a limit that exists only in the UI is
 * bypassable by anything that can reach the API.
 */
export default function TradeLimitsScreen() {
  const router = useRouter();
  const [state, setState] = useState<TradeLimitsState | null>(null);
  const [draft, setDraft] = useState<TradeLimits>(NO_LIMITS);
  const [roundInput, setRoundInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/me/trade-limits");
      if (!res.ok) throw new Error("Backend returned an error");
      const data: TradeLimitsState = await res.json();
      setState(data);
      setDraft(data.effective);
      setRoundInput(data.effective.roundTradeLimit === null ? "" : String(data.effective.roundTradeLimit));
    } catch {
      setError("Couldn't load your trade limits. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Empty means "no limit" (distinct from 0, which means "open nothing new").
  const onRoundInputChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "");
    setError(null);
    if (digits === "") {
      setRoundInput("");
      setDraft((d) => ({ ...d, roundTradeLimit: null }));
      return;
    }
    const n = Number(digits);
    if (n > MAX_ROUND_TRADE_LIMIT) return; // silently refuse out-of-range keystrokes
    setRoundInput(digits);
    setDraft((d) => ({ ...d, roundTradeLimit: n }));
  };

  const reset = () => {
    setError(null);
    // Reset clears the two limits but deliberately leaves the cooldown toggle
    // as-is: if the cooldown is on, this reset is itself a loosening and the
    // backend will queue it rather than apply it now.
    setDraft((d) => ({ ...NO_LIMITS, cooldownEnabled: d.cooldownEnabled }));
    setRoundInput("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/me/trade-limits", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Couldn't save your trade limits.");
        return;
      }
      router.back();
    } catch {
      setError("Couldn't reach the backend.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: "Trade Limits" }} />
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const current = state?.effective ?? NO_LIMITS;
  const used = state?.roundTripsThisWeek;
  // Mirrors the backend's isLoosening() so the button can warn before saving.
  const willDefer =
    current.cooldownEnabled &&
    ((current.roundTradeLimit !== null &&
      (draft.roundTradeLimit === null || draft.roundTradeLimit > current.roundTradeLimit)) ||
      (current.minMarketCap !== null &&
        (draft.minMarketCap === null || draft.minMarketCap < current.minMarketCap)) ||
      (current.cooldownEnabled && !draft.cooldownEnabled));

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Trade Limits" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Guardrails you set for yourself. They apply to opening new positions — selling is never
          blocked.
        </Text>

        {state?.pending && state.pendingEffectiveAt ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingLabel}>Change pending</Text>
            <Text style={styles.pendingText}>
              Round trades {state.pending.roundTradeLimit ?? "No limit"} · Market cap{" "}
              {marketCapLabel(state.pending.minMarketCap)} takes effect{" "}
              {formatEffectiveAt(state.pendingEffectiveAt)}.
            </Text>
          </View>
        ) : null}

        {/* Round trade limit */}
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.rowLabel}>Round trade limit</Text>
              <InfoTooltip text={ROUND_TRADE_INFO} label="Round trade limit" />
            </View>
            <TextInput
              style={styles.numberInput}
              value={roundInput}
              onChangeText={onRoundInputChange}
              keyboardType="number-pad"
              placeholder="0-10"
              placeholderTextColor={colors.paperDim}
              selectionColor={colors.amber}
              maxLength={2}
            />
          </View>
          {used !== null && used !== undefined ? (
            <Text style={styles.usage}>
              {used} round {used === 1 ? "trade" : "trades"} completed this week (Mon–Fri).
              {draft.roundTradeLimit !== null && used >= draft.roundTradeLimit
                ? " You're at your limit — resets Monday."
                : ""}
            </Text>
          ) : null}
          {draft.roundTradeLimit === 0 ? (
            <Text style={styles.usage}>Set to 0 — no new positions until Monday.</Text>
          ) : null}
        </View>

        {/* Market cap limit */}
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.rowLabel}>Market Cap limit</Text>
            <InfoTooltip text={MARKET_CAP_INFO} label="Market cap limit" />
          </View>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={draft.minMarketCap === null ? "" : String(draft.minMarketCap)}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, minMarketCap: v === "" ? null : Number(v) }))
              }
              style={styles.picker}
              dropdownIconColor={colors.amber}
            >
              <Picker.Item label="No limit" value="" color={colors.paperDim} />
              {MARKET_CAP_OPTIONS.map((o) => (
                <Picker.Item key={o.value} label={o.label} value={String(o.value)} color={colors.paper} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Cooldown */}
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.rowLabel}>Cooldown on loosening</Text>
              <InfoTooltip text={COOLDOWN_INFO} label="Cooldown" />
            </View>
            <Switch
              value={draft.cooldownEnabled}
              onValueChange={(v) => setDraft((d) => ({ ...d, cooldownEnabled: v }))}
              trackColor={{ false: colors.inkLine, true: colors.amberDeep }}
              thumbColor={draft.cooldownEnabled ? colors.amber : colors.paperDim}
            />
          </View>
          <Text style={styles.usage}>
            Weakening a limit waits until the next trading day at 9:30 AM ET. Tightening is always
            immediate.
          </Text>
        </View>

        <Pressable style={styles.resetRow} onPress={reset}>
          <Text style={styles.resetText}>Reset trade limits</Text>
          <InfoTooltip text={RESET_INFO} label="Reset trade limits" />
        </Pressable>

        {willDefer ? (
          <Text style={styles.deferNote}>
            Your cooldown is on, so this change won&apos;t take effect until the next trading day at
            9:30 AM ET.
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.saveButton, saving && styles.buttonDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.buttonInk} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.button, styles.cancelButton]}
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingBottom: 40 },
  intro: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.paperDim,
    marginBottom: 18,
  },
  pendingCard: {
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.amberDeep,
    padding: 14,
    marginBottom: 16,
  },
  pendingLabel: { ...labelCaps, fontSize: 10, color: colors.amberSoft },
  pendingText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.paper, marginTop: 6 },
  card: {
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    padding: 16,
    marginBottom: 14,
    // Keeps an open tooltip above the card that follows it.
    zIndex: 1,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper },
  numberInput: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 18,
    color: colors.paper,
    minWidth: 74,
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.ink,
  },
  usage: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.paperDim, marginTop: 10 },
  pickerWrapper: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.ink,
    overflow: "hidden",
  },
  picker: { color: colors.paper, backgroundColor: "transparent", fontFamily: fonts.body },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  resetText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.rust },
  deferNote: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.amberSoft,
    marginTop: 4,
    marginBottom: 4,
  },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.rust, marginTop: 10 },
  actions: { marginTop: 20, gap: 12 },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  saveButton: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  buttonDisabled: { opacity: 0.5 },
  saveText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.buttonInk },
  cancelButton: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.inkLine },
  cancelText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.paper },
});
