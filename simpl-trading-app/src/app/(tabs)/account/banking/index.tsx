import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../../../../lib/api";
import {
  bankLabel,
  cashAccountLabel,
  TRANSFER_STATUS_DISPLAY,
  type BankView,
  type TransferView,
} from "../../../../lib/banking";
import { colors, fonts, labelCaps, radius } from "../../../../lib/theme";

type TradingAccount = {
  account_number?: string;
  cash: string;
  cash_withdrawable?: string;
};

const money = (v: string | number | undefined) =>
  v === undefined ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Banking hub: where the money lives, what's linked, what's moving.
 * Everything here is fetched live from Alpaca through our backend —
 * transfers and bank links are never stored in our own database.
 */
export default function BankingScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [bank, setBank] = useState<BankView | null>(null);
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accountRes, bankRes, transfersRes] = await Promise.all([
        apiFetch("/api/me/account"),
        apiFetch("/api/me/bank"),
        apiFetch("/api/me/transfers"),
      ]);
      if (!accountRes.ok || !bankRes.ok || !transfersRes.ok) throw new Error("Backend returned an error");
      setAccount(await accountRes.json());
      setBank((await bankRes.json()).bank);
      setTransfers(await transfersRes.json());
    } catch {
      setError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch on focus so a transfer submitted on the next screen shows up in
  // the history the moment you come back to this one.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const cancelTransfer = useCallback(
    async (transfer: TransferView) => {
      setCancelingId(transfer.id);
      setError(null);
      try {
        const res = await apiFetch(`/api/me/transfers/${transfer.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.message ?? "Couldn't cancel that transfer.");
          return;
        }
        await load();
      } catch {
        setError("Couldn't reach the backend.");
      } finally {
        setCancelingId(null);
      }
    },
    [load],
  );

  const confirmCancel = useCallback(
    (transfer: TransferView) => {
      const message = `Cancel the ${transfer.direction === "deposit" ? "deposit" : "withdrawal"} of ${money(transfer.amount)}?`;
      // Alert has no web implementation in RN — fall back to confirm() so
      // this stays testable in the browser preview.
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(message)) cancelTransfer(transfer);
        return;
      }
      Alert.alert("Cancel transfer", message, [
        { text: "Keep it", style: "cancel" },
        { text: "Cancel transfer", style: "destructive", onPress: () => cancelTransfer(transfer) },
      ]);
    },
    [cancelTransfer],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const withdrawable = Number(account?.cash_withdrawable ?? 0);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.amber}
          />
        }
      >
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Cash Balance</Text>
          <Text style={styles.balanceValue}>{money(account?.cash)}</Text>
          <Text style={styles.balanceSub}>
            {money(withdrawable)} settled and available to withdraw
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>Linked Bank</Text>
        <Pressable style={styles.bankCard} onPress={() => router.push("/account/banking/bank")}>
          <View style={styles.bankCardText}>
            {bank ? (
              <>
                <Text style={styles.bankName}>{bankLabel(bank)}</Text>
                <Text style={styles.bankSub}>
                  {bank.bankAccountType === "SAVINGS" ? "Savings" : "Checking"} ·{" "}
                  {bank.status === "APPROVED" ? "Verified" : "Verifying"}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.bankName}>No bank linked</Text>
                <Text style={styles.bankSub}>Link one to move money in and out</Text>
              </>
            )}
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Move Money</Text>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionButton, styles.actionPrimary]}
            onPress={() => router.push("/account/banking/transfer?direction=deposit")}
          >
            <Text style={styles.actionPrimaryText}>Transfer Money</Text>
            <Text style={styles.actionPrimarySub}>Bank → Simpl</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.actionSecondary]}
            onPress={() => router.push("/account/banking/transfer?direction=withdraw")}
          >
            <Text style={styles.actionSecondaryText}>Withdraw Money</Text>
            <Text style={styles.actionSecondarySub}>Simpl → Bank</Text>
          </Pressable>
        </View>
        <Pressable style={styles.manageRow} onPress={() => router.push("/account/banking/bank")}>
          <Text style={styles.manageText}>{bank ? "Add / Remove Bank Account" : "Add a Bank Account"}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Transfer History</Text>
        {transfers.length === 0 ? (
          <Text style={styles.empty}>No transfers yet.</Text>
        ) : (
          transfers.map((t) => {
            const display = TRANSFER_STATUS_DISPLAY[t.status];
            return (
              <View key={t.id} style={styles.transferRow}>
                <View style={styles.transferMain}>
                  <Text style={styles.transferTitle}>
                    {t.direction === "deposit" ? "Deposit" : "Withdrawal"}
                  </Text>
                  <Text style={styles.transferDate}>
                    {shortDate(t.createdAt)}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </Text>
                  {t.cancelable ? (
                    <Pressable onPress={() => confirmCancel(t)} disabled={cancelingId === t.id}>
                      <Text style={styles.cancelLink}>
                        {cancelingId === t.id ? "Canceling…" : "Cancel transfer"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.transferRight}>
                  <Text
                    style={[
                      styles.transferAmount,
                      t.direction === "deposit" ? styles.amountIn : styles.amountOut,
                    ]}
                  >
                    {t.direction === "deposit" ? "+" : "−"}
                    {money(t.amount)}
                  </Text>
                  <View style={[styles.pill, { borderColor: display.color }]}>
                    <Text style={[styles.pillText, { color: display.color }]}>{display.label}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.footnote}>
          Transfers to and from {cashAccountLabel(account?.account_number)} settle by ACH, which
          normally takes 1–3 business days. Money from a sale can be withdrawn the next business
          day after it settles (T+1).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingBottom: 40 },
  balanceCard: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, alignItems: "center" },
  balanceLabel: { ...labelCaps, fontSize: 11 },
  balanceValue: { fontFamily: fonts.monoSemiBold, fontSize: 34, color: colors.paper, marginTop: 8 },
  balanceSub: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 6 },
  error: { fontFamily: fonts.body, marginHorizontal: 24, marginBottom: 12, color: colors.rust, fontSize: 14 },
  sectionLabel: { ...labelCaps, marginHorizontal: 24, marginTop: 8, marginBottom: 10 },
  bankCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
  },
  bankCardText: { flex: 1 },
  bankName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.paper },
  bankSub: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 3 },
  chevron: { fontSize: 24, color: colors.amberDeep, marginLeft: 12 },
  actionRow: { flexDirection: "row", gap: 12, marginHorizontal: 20 },
  actionButton: { flex: 1, borderRadius: radius.lg, paddingVertical: 18, paddingHorizontal: 14 },
  actionPrimary: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  actionPrimaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.buttonInk },
  actionPrimarySub: { fontFamily: fonts.mono, fontSize: 11, color: colors.buttonInk, opacity: 0.7, marginTop: 4 },
  actionSecondary: { borderWidth: 1.5, borderColor: colors.inkLine, backgroundColor: colors.inkRaised },
  actionSecondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper },
  actionSecondarySub: { fontFamily: fonts.mono, fontSize: 11, color: colors.paperDim, marginTop: 4 },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  manageText: { fontFamily: fonts.body, fontSize: 15, color: colors.paper },
  empty: { fontFamily: fonts.body, color: colors.paperDim, fontSize: 15, marginHorizontal: 24, marginBottom: 8 },
  transferRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.inkLine,
  },
  transferMain: { flex: 1, paddingRight: 12 },
  transferTitle: { fontFamily: fonts.body, fontSize: 15, color: colors.paper },
  transferDate: { fontFamily: fonts.mono, fontSize: 12, color: colors.paperDim, marginTop: 3 },
  cancelLink: { fontFamily: fonts.body, fontSize: 13, color: colors.amber, marginTop: 6 },
  transferRight: { alignItems: "flex-end" },
  transferAmount: { fontFamily: fonts.monoMedium, fontSize: 16 },
  amountIn: { color: colors.phosphor },
  amountOut: { color: colors.paper },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  pillText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.paperDim,
    marginHorizontal: 24,
    marginTop: 24,
  },
});
