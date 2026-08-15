import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch } from "../../../../lib/api";
import { bankLabel, cashAccountLabel, type BankView } from "../../../../lib/banking";
import { colors, fonts, labelCaps, radius } from "../../../../lib/theme";

type Direction = "deposit" | "withdraw";
type TradingAccount = { account_number?: string; cash: string; cash_withdrawable?: string };

const QUICK_AMOUNTS = ["100", "500", "1000"];

const money = (v: string | number | undefined) =>
  v === undefined
    ? "—"
    : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One screen for both directions — "Transfer Money" (bank → Simpl) and
 * "Withdraw Money" (Simpl → bank) are the same flow with From/To swapped,
 * so they share a component and differ only by the `direction` param.
 *
 * Two steps on purpose: enter an amount, then confirm what's about to move.
 * Money leaving an account should never be one tap away from a typo.
 */
export default function TransferScreen() {
  const router = useRouter();
  const { direction: rawDirection } = useLocalSearchParams<{ direction?: string }>();
  const direction: Direction = rawDirection === "withdraw" ? "withdraw" : "deposit";
  const isWithdraw = direction === "withdraw";

  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [bank, setBank] = useState<BankView | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accountRes, bankRes] = await Promise.all([
          apiFetch("/api/me/account"),
          apiFetch("/api/me/bank"),
        ]);
        if (!accountRes.ok || !bankRes.ok) throw new Error("Backend returned an error");
        const accountJson = await accountRes.json();
        const bankJson = await bankRes.json();
        if (!cancelled) {
          setAccount(accountJson);
          setBank(bankJson.bank);
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the backend. Check that it's running.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withdrawable = Number(account?.cash_withdrawable ?? 0);
  const numericAmount = Number(amount);
  const amountIsValid = amount !== "" && Number.isFinite(numericAmount) && numericAmount > 0;
  const overWithdrawable = isWithdraw && amountIsValid && numericAmount > withdrawable;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/me/transfers", {
        method: "POST",
        body: JSON.stringify({ direction, amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "That transfer didn't go through.");
        setReviewing(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't reach the backend.");
      setReviewing(false);
    } finally {
      setSubmitting(false);
    }
  }, [amount, direction]);

  const title = isWithdraw ? "Withdraw Money" : "Transfer Money";

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  // No bank linked — nothing can move, so send them to link one instead of
  // showing a form that can only fail.
  if (!bank) {
    return (
      <SafeAreaView style={styles.screen}>
        <Stack.Screen options={{ title }} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Link a bank first</Text>
          <Text style={styles.emptyBody}>
            You need a linked bank account before you can move money{" "}
            {isWithdraw ? "out of" : "into"} Simpl.
          </Text>
          <Pressable style={styles.button} onPress={() => router.replace("/account/banking/bank")}>
            <Text style={styles.buttonText}>Add a Bank Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <Stack.Screen options={{ title }} />
        <View style={styles.emptyState}>
          <Text style={styles.doneAmount}>{money(amount)}</Text>
          <Text style={styles.emptyTitle}>
            {isWithdraw ? "Withdrawal started" : "Transfer started"}
          </Text>
          <Text style={styles.emptyBody}>
            It&apos;s pending now and normally clears in 1–3 business days. You can follow it — or
            cancel it while it&apos;s still pending — from the Banking screen.
          </Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const fromLabel = isWithdraw ? cashAccountLabel(account?.account_number) : bankLabel(bank);
  const toLabel = isWithdraw ? bankLabel(bank) : cashAccountLabel(account?.account_number);
  const fromSub = isWithdraw ? `${money(withdrawable)} settled` : "Your bank";
  const toSub = isWithdraw ? "Your bank" : "Buys settle here";

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>From</Text>
            <View style={styles.routeText}>
              <Text style={styles.routeName}>{fromLabel}</Text>
              <Text style={styles.routeSub}>{fromSub}</Text>
            </View>
          </View>
          <View style={styles.routeDivider}>
            <Text style={styles.routeArrow}>↓</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>To</Text>
            <View style={styles.routeText}>
              <Text style={styles.routeName}>{toLabel}</Text>
              <Text style={styles.routeSub}>{toSub}</Text>
            </View>
          </View>
        </View>

        {reviewing ? (
          <View style={styles.reviewBox}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.reviewAmount}>{money(amount)}</Text>
            <Text style={styles.reviewNote}>
              {isWithdraw
                ? "Leaving Simpl for your bank. ACH transfers normally take 1–3 business days."
                : "Moving from your bank into Simpl. ACH transfers normally take 1–3 business days."}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Amount (USD)</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountAffix}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(text) => {
                    setError(null);
                    // Digits with at most two decimals — the same shape the
                    // backend's schema accepts.
                    const cleaned = text.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d{0,2}).*$/, "$1");
                    setAmount(cleaned);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.paperDim}
                  selectionColor={colors.amber}
                  autoFocus
                />
              </View>
              {isWithdraw ? (
                <Text style={styles.availableNote}>{money(withdrawable)} available to withdraw</Text>
              ) : null}
            </View>

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((quick) => (
                <Pressable key={quick} style={styles.quickChip} onPress={() => setAmount(quick)}>
                  <Text style={styles.quickChipText}>${quick}</Text>
                </Pressable>
              ))}
              {isWithdraw && withdrawable > 0 ? (
                <Pressable style={styles.quickChip} onPress={() => setAmount(withdrawable.toFixed(2))}>
                  <Text style={styles.quickChipText}>All</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}

        {overWithdrawable ? (
          <Text style={styles.error}>
            That&apos;s more than your settled cash. Money from a sale becomes available to
            withdraw the next business day (T+1).
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {reviewing ? (
          <>
            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.buttonInk} />
              ) : (
                <Text style={styles.buttonText}>
                  {isWithdraw ? `Withdraw ${money(amount)}` : `Transfer ${money(amount)}`}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setReviewing(false)} disabled={submitting}>
              <Text style={styles.backLink}>Edit amount</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.button, (!amountIsValid || overWithdrawable) && styles.buttonDisabled]}
            onPress={() => {
              setError(null);
              setReviewing(true);
            }}
            disabled={!amountIsValid || overWithdrawable}
          >
            <Text style={styles.buttonText}>Review</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingTop: 16 },
  routeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    paddingVertical: 6,
  },
  routeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  routeLabel: { ...labelCaps, fontSize: 10, width: 44 },
  routeText: { flex: 1 },
  routeName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper },
  routeSub: { fontFamily: fonts.mono, fontSize: 11, color: colors.paperDim, marginTop: 3 },
  routeDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
    marginHorizontal: 16,
    alignItems: "center",
  },
  routeArrow: { fontFamily: fonts.mono, fontSize: 14, color: colors.amberDeep, marginTop: -9, backgroundColor: colors.inkRaised, paddingHorizontal: 6 },
  amountBox: {
    marginTop: 20,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    paddingVertical: 20,
    alignItems: "center",
  },
  amountLabel: { ...labelCaps, fontSize: 10 },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10 },
  amountAffix: { fontFamily: fonts.mono, fontSize: 22, color: colors.paperDim, marginRight: 4 },
  amountInput: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 34,
    color: colors.paper,
    minWidth: 140,
    textAlign: "center",
    paddingVertical: 4,
  },
  availableNote: { fontFamily: fonts.body, fontSize: 12, color: colors.paperDim, marginTop: 10 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14, justifyContent: "center" },
  quickChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  quickChipText: { fontFamily: fonts.mono, fontSize: 13, color: colors.paper },
  reviewBox: {
    marginTop: 20,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.amberDeep,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  reviewAmount: { fontFamily: fonts.monoSemiBold, fontSize: 38, color: colors.paper, marginTop: 8 },
  reviewNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.paperDim,
    textAlign: "center",
    marginTop: 12,
  },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.rust, marginTop: 16, lineHeight: 20 },
  button: {
    backgroundColor: colors.amber,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.buttonInk },
  backLink: { fontFamily: fonts.body, fontSize: 14, color: colors.amber, textAlign: "center", marginTop: 16 },
  emptyState: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.paper, textAlign: "center" },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.paperDim,
    textAlign: "center",
    marginTop: 10,
  },
  doneAmount: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 40,
    color: colors.phosphor,
    textAlign: "center",
    marginBottom: 14,
  },
});
