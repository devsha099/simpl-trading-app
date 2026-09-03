import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SelectField } from "../components/SelectField";
import { API_BASE, apiFetch } from "../lib/api";
import { colors, fonts, labelCaps, radius } from "../lib/theme";

const QUOTE_POLL_MS = 3000;

type Position = {
  symbol: string;
  qty: string;
  qty_available?: string;
  market_value: string;
  current_price: string;
  avg_entry_price?: string;
  unrealized_pl?: string;
  unrealized_plpc?: string;
};

type Account = { cash: string };

type Quote = {
  bidPrice: number;
  askPrice: number;
  bidSize?: number;
  askSize?: number;
  lastPrice?: number | null;
  // False for a quote that shouldn't be shown as the market — e.g. an
  // odd-lot print or a spread implausibly wide vs. the last trade (backend
  // flags this; see alpaca-data.ts). Falls back to lastPrice when false.
  reliable?: boolean;
};
type BuyMode = "dollars" | "shares";
type OrderType = "market" | "limit" | "stop";
type Side = "buy" | "sell";
type Hours = "regular" | "extended";

const SIDE_OPTIONS = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
] as const;
const ORDER_TYPE_OPTIONS = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
  { value: "stop", label: "Stop Loss" },
] as const;
const HOURS_OPTIONS = [
  { value: "regular", label: "Regular Hours" },
  { value: "extended", label: "Extended Hours" },
] as const;

// toFixed preserves the sign of a tiny negative even once rounding makes it
// display as zero (e.g. -0.0001 -> "-0.00") — normalize that one case so a
// near-zero P&L never reads as a misleadingly-signed "-$0.00".
const fixed2 = (n: number) => {
  const s = n.toFixed(2);
  return s === "-0.00" ? "0.00" : s;
};

const money = (v: string | number | undefined) =>
  v === undefined ? "—" : `$${fixed2(Number(v))}`;

// unrealized_plpc from Alpaca is a raw fraction (0.036 = 3.6%), not
// pre-multiplied like the watchlist snapshot's changePercent is.
const pctFromFraction = (v: string | undefined) =>
  v === undefined ? "—" : `${Number(v) >= 0 ? "+" : ""}${fixed2(Number(v) * 100)}%`;

/**
 * The Trade pane — bid/ask (or last price), order form, Buy/Sell. One of
 * StockScreen's three tabs (Company Info / Trade / Financials — see
 * screens/StockScreen.tsx) and the default one, since buying/selling is the
 * app's core loop (CLAUDE.md §1). Takes `symbol` as a prop rather than
 * reading the route itself — StockScreen is the single owner of the route
 * param, the screen title, and the outer SafeAreaView; this only ever
 * renders as a child of it.
 *
 * Order form redesign (2026-09-02): Side/Order Type/Trading Hours are
 * dropdowns (SelectField, same component the questionnaire/banking screens
 * use) that all start unselected — the single Buy/Sell action button only
 * appears once Side has a value, and only becomes tappable once every
 * currently-visible dropdown does. Amount starts empty rather than
 * prefilled with a guessed default (20 / 0.2), so nobody can submit a size
 * they didn't actually type.
 */
export default function TradeScreen({ symbol }: { symbol: string }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [side, setSide] = useState<Side | "">("");
  const [buyMode, setBuyMode] = useState<BuyMode>("dollars");
  const [orderType, setOrderType] = useState<OrderType | "">("");
  // Alpaca only accepts extended_hours on Limit+day orders (market/stop are
  // rejected outright), so this dropdown only ever shows — and only ever
  // applies — when Limit is selected. Always cleared when leaving Limit so
  // switching back to it never silently carries a stale choice from earlier.
  const [hours, setHours] = useState<Hours | "">("");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadPosition = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/me/positions");
      if (!res.ok) throw new Error("Backend returned an error");
      const positions: Position[] = await res.json();
      setPosition(positions.find((p) => p.symbol === symbol) ?? null);
    } catch (e) {
      setError(
        "Couldn't reach the backend. Check that it's running and that API_BASE points to it.",
      );
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Backs the "Amount left to invest" / "Max quantity allowed" caption on
  // the Buy side — silent on failure, since that caption is a convenience,
  // not something that should block placing an order if it can't load.
  const loadAccount = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me/account");
      if (!res.ok) return;
      setAccount(await res.json());
    } catch (e) {
      // Silent — see comment above.
    }
  }, []);

  // Refetch on focus, not just on mount: React Navigation keeps stack
  // screens mounted across tab switches, so backing out to another tab and
  // switching back would otherwise show this exact position (and cash
  // balance) as it was before you left — not necessarily reflecting a trade
  // or deposit made elsewhere in the meantime.
  useFocusEffect(
    useCallback(() => {
      loadPosition();
      loadAccount();
    }, [loadPosition, loadAccount]),
  );

  // Live best bid/ask, polled on an interval — not push/streaming, just a
  // plain GET, good enough for showing roughly what price you'd get filled at.
  useEffect(() => {
    let cancelled = false;
    const fetchQuote = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/alpaca/quotes/${symbol}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuote(data);
      } catch (e) {
        // Silent — the buy/sell flow doesn't depend on the quote refreshing.
      }
    };
    fetchQuote();
    const interval = setInterval(fetchQuote, QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  // Prefer the real midpoint only when the quote is trustworthy; otherwise
  // the last trade price is the more accurate reference (see Quote's
  // `reliable` comment above).
  const midPrice =
    quote?.reliable && quote.bidPrice > 0 && quote.askPrice > 0
      ? (quote.bidPrice + quote.askPrice) / 2
      : quote?.lastPrice ?? undefined;

  const handleOrderTypeChange = useCallback((value: string) => {
    const next = value as OrderType | "";
    setOrderType(next);
    if (next !== "limit") setHours("");
  }, []);

  // Every dropdown currently on screen needs an explicit choice before the
  // action button is tappable — Trading Hours only counts while it's
  // actually showing (Limit orders only).
  const canSubmit = side !== "" && orderType !== "" && (orderType !== "limit" || hours !== "");

  const placeOrder = useCallback(async () => {
    if (!side || !orderType) return; // guarded by canSubmit; belt-and-suspenders
    if (!amount || Number(amount) <= 0) {
      setError(buyMode === "dollars" ? "Enter a dollar amount greater than 0." : "Enter a share quantity greater than 0.");
      return;
    }
    if (orderType === "limit" && (!limitPrice || Number(limitPrice) <= 0)) {
      setError("Enter a limit price.");
      return;
    }
    if (orderType === "stop" && (!stopPrice || Number(stopPrice) <= 0)) {
      setError("Enter a stop price.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string | boolean> = {
        symbol,
        side,
        type: orderType,
        ...(buyMode === "dollars" ? { notional: amount } : { qty: amount }),
        ...(orderType === "limit" ? { limit_price: limitPrice } : {}),
        ...(orderType === "stop" ? { stop_price: stopPrice } : {}),
        ...(orderType === "limit" && hours === "extended" ? { extended_hours: true } : {}),
      };

      const res = await apiFetch("/api/me/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          data?.message ??
            (side === "sell"
              ? "Sell order didn't go through. It may be outside market hours."
              : "Order didn't go through. It may be outside market hours, or funds haven't settled."),
        );
        return;
      }
      // Re-fetches real position/account data from Alpaca — this is what
      // makes a sell "physically" show up here: nothing about the position
      // is ever computed or cached client-side, it's whatever
      // GET /api/me/positions (and /account, for the cash caption) return
      // right now, same source of truth the Holdings screen reads.
      await loadPosition();
      await loadAccount();
    } catch (e) {
      setError("Couldn't reach the backend.");
    } finally {
      setSubmitting(false);
    }
  }, [side, orderType, amount, buyMode, limitPrice, stopPrice, hours, loadPosition, loadAccount, symbol]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  // qty vs qty_available differ only when some shares are already tied up
  // in another pending order — Alpaca reduces qty_available the instant an
  // order is PLACED (not just when it fills), so this is real, live data,
  // not something we compute.
  const qtyAvailable = position?.qty_available ?? position?.qty;
  const qtyAvailableNum = Number(qtyAvailable ?? 0);
  const hasPendingHold =
    position && qtyAvailable !== undefined && Number(qtyAvailable) !== Number(position.qty);
  // Rounded to cents before the sign check, so a P&L that's technically a
  // tiny negative but displays as $0.00 doesn't show a red "down" pill next
  // to text that reads as neutral.
  const pl = position?.unrealized_pl !== undefined ? Number(fixed2(Number(position.unrealized_pl))) : null;

  // "Amount left to invest" / "Max quantity allowed" — the same `cash`
  // figure the Account tab already labels "available to invest" (not
  // cash_withdrawable, which is a stricter, unrelated T+1-settlement gate
  // that only applies to ACH withdrawals — using it here would understate
  // what's actually usable to buy with). Sell side mirrors this against the
  // position's own qtyAvailable instead, since that's the real ceiling.
  const cash = account?.cash !== undefined ? Number(account.cash) : undefined;
  let capCaption: string | null = null;
  if (side === "buy") {
    if (buyMode === "dollars") {
      capCaption = cash !== undefined ? `Amount left to invest: ${money(cash)}` : null;
    } else if (cash !== undefined && midPrice) {
      capCaption = `Max quantity allowed: ${(cash / midPrice).toFixed(4)} shares`;
    }
  } else if (side === "sell") {
    if (buyMode === "shares") {
      capCaption = `Max quantity allowed: ${qtyAvailableNum.toFixed(4)} shares`;
    } else if (midPrice) {
      capCaption = `Max amount you can sell: ${money(qtyAvailableNum * midPrice)}`;
    }
  }

  return (
    <View>
      {position ? (
        <View style={styles.positionCard}>
          <View style={styles.positionHeaderRow}>
            <Text style={styles.positionLabel}>Your Position</Text>
            {pl !== null ? (
              <View style={[styles.plPill, pl < 0 && styles.plPillNegative]}>
                <Text style={[styles.plPillText, pl < 0 && styles.plPillTextNegative]}>
                  {pl > 0 ? "+" : ""}
                  {money(position.unrealized_pl)} ({pctFromFraction(position.unrealized_plpc)})
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.positionQty}>{Number(position.qty).toFixed(4)} shares</Text>
          <Text style={styles.positionSub}>
            {money(position.market_value)} value
            {position.avg_entry_price ? ` · avg cost ${money(position.avg_entry_price)}/share` : ""}
          </Text>
          {hasPendingHold ? (
            <Text style={styles.positionNote}>
              {Number(qtyAvailable).toFixed(4)} available to sell —{" "}
              {(Number(position.qty) - Number(qtyAvailable)).toFixed(4)} tied up in another order
            </Text>
          ) : (
            <Text style={styles.positionNote}>All of it available to sell</Text>
          )}
        </View>
      ) : (
        <Text style={styles.positionLine}>You don't own this yet.</Text>
      )}

      {quote === null || quote.reliable ? (
        <View style={styles.statPair}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Bid</Text>
            <Text style={styles.statValue}>{money(quote?.bidPrice)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ask</Text>
            <Text style={styles.statValue}>{money(quote?.askPrice)}</Text>
          </View>
        </View>
      ) : (
        // The live quote is an odd-lot/thin print, not a trustworthy
        // bid/ask (see Quote's `reliable` comment) — show the real last
        // trade price instead of a potentially misleading wide spread.
        <View style={styles.statPairSingle}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Last Price</Text>
            <Text style={styles.statValue}>{money(quote.lastPrice ?? undefined)}</Text>
          </View>
          <Text style={styles.thinQuoteNote}>
            The live quote is thin right now, so this is the last traded price instead of a
            bid/ask spread.
          </Text>
        </View>
      )}

      {/* Standing disclaimer, shown regardless of `reliable` — separate from
          the thin-quote note above, which only covers the specific case of
          an implausible spread. This covers the general fact that our quote
          data is IEX-only (CLAUDE.md §13): even a normal-looking bid/ask
          reflects one exchange, not the full consolidated market, so the
          price you're actually filled at can differ. */}
      <Text style={styles.quoteDisclaimer}>
        Quotes reflect one exchange only — your fill price may differ.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.dropdowns}>
        <SelectField
          label="Side"
          value={side}
          onValueChange={(v) => setSide(v as Side | "")}
          options={SIDE_OPTIONS}
          placeholder="Select side"
        />
        <SelectField
          label="Order Type"
          value={orderType}
          onValueChange={handleOrderTypeChange}
          options={ORDER_TYPE_OPTIONS}
          placeholder="Select order type"
        />
        {orderType === "limit" ? (
          <SelectField
            label="Trading Hours"
            value={hours}
            onValueChange={(v) => setHours(v as Hours | "")}
            options={HOURS_OPTIONS}
            placeholder="Select hours"
          />
        ) : null}
      </View>
      {orderType === "limit" && hours === "extended" ? (
        <Text style={styles.extendedHoursNote}>
          Eligible to fill 4:00 AM – 8:00 PM ET (pre-market and after-hours), not just the regular
          9:30 AM – 4:00 PM session.
        </Text>
      ) : null}

      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeSegment, buyMode === "dollars" && styles.modeSegmentActive]}
          onPress={() => setBuyMode("dollars")}
        >
          <Text style={[styles.modeSegmentText, buyMode === "dollars" && styles.modeSegmentTextActive]}>
            Dollars
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeSegment, buyMode === "shares" && styles.modeSegmentActive]}
          onPress={() => setBuyMode("shares")}
        >
          <Text style={[styles.modeSegmentText, buyMode === "shares" && styles.modeSegmentTextActive]}>
            Shares
          </Text>
        </Pressable>
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Amount {buyMode === "dollars" ? "(USD)" : "(shares)"}</Text>
        <View style={styles.amountRow}>
          {buyMode === "dollars" ? <Text style={styles.amountAffix}>$</Text> : null}
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={buyMode === "dollars" ? "0.00" : "0"}
            placeholderTextColor={colors.paperDim}
            selectionColor={colors.amber}
          />
          {buyMode === "shares" ? <Text style={styles.amountAffix}>shares</Text> : null}
        </View>
        {capCaption ? <Text style={styles.capCaption}>{capCaption}</Text> : null}
      </View>

      {orderType === "limit" ? (
        <View style={styles.priceBox}>
          <Text style={styles.amountLabel}>Limit price</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountAffix}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={limitPrice}
              onChangeText={setLimitPrice}
              keyboardType="decimal-pad"
              placeholder={midPrice ? midPrice.toFixed(2) : "0.00"}
              placeholderTextColor={colors.paperDim}
              selectionColor={colors.amber}
            />
          </View>
        </View>
      ) : null}

      {orderType === "stop" ? (
        <View style={styles.priceBox}>
          <Text style={styles.amountLabel}>Stop price</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountAffix}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={stopPrice}
              onChangeText={setStopPrice}
              keyboardType="decimal-pad"
              placeholder={midPrice ? midPrice.toFixed(2) : "0.00"}
              placeholderTextColor={colors.paperDim}
              selectionColor={colors.amber}
            />
          </View>
        </View>
      ) : null}

      {side ? (
        <Pressable
          style={[
            styles.actionButton,
            side === "buy" ? styles.actionButtonBuy : styles.actionButtonSell,
            (!canSubmit || submitting) && styles.buttonDisabled,
          ]}
          onPress={placeOrder}
          disabled={!canSubmit || submitting}
        >
          <Text style={styles.actionButtonText}>
            {submitting ? "Placing…" : side === "buy" ? "Buy" : "Sell"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingVertical: 60 },
  positionLine: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginHorizontal: 24, marginTop: 12 },
  positionCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  positionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  positionLabel: { ...labelCaps, fontSize: 10.5 },
  plPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: "rgba(99,193,145,0.15)",
  },
  plPillNegative: { backgroundColor: "rgba(201,107,76,0.15)" },
  plPillText: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.phosphor },
  plPillTextNegative: { color: colors.rust },
  positionQty: { fontFamily: fonts.monoSemiBold, fontSize: 22, color: colors.paper, marginTop: 10 },
  positionSub: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 4 },
  positionNote: { fontFamily: fonts.body, fontSize: 12, color: colors.paperDim, marginTop: 8 },
  error: { fontFamily: fonts.body, marginHorizontal: 24, marginBottom: 8, color: colors.rust, fontSize: 14 },
  statPair: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 12 },
  statPairSingle: { marginHorizontal: 20, marginTop: 12 },
  statBox: { flex: 1, backgroundColor: colors.inkRaised, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.inkLine },
  thinQuoteNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.paperDim, marginTop: 8 },
  quoteDisclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.paperDim,
    marginHorizontal: 20,
    marginTop: 6,
  },
  statLabel: { ...labelCaps, fontSize: 10 },
  statValue: { fontFamily: fonts.mono, fontSize: 17, color: colors.paper, marginTop: 4 },
  dropdowns: { marginHorizontal: 20, marginTop: 16 },
  // Smaller than the dropdowns above it — this is a plain mode toggle, not
  // one of the "all dropdowns selected" gates on the action button, so it
  // deliberately reads as lighter-weight UI.
  modeToggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 4,
    gap: 4,
    alignSelf: "center",
    backgroundColor: colors.inkRaised,
    borderRadius: radius.sm,
    padding: 2,
  },
  modeSegment: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: radius.sm - 2 },
  modeSegmentActive: { backgroundColor: colors.amber },
  modeSegmentText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.paperDim },
  modeSegmentTextActive: { color: colors.buttonInk },
  amountBox: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    paddingVertical: 16,
    alignItems: "center",
  },
  priceBox: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    paddingVertical: 14,
    alignItems: "center",
  },
  amountLabel: { ...labelCaps, fontSize: 10 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  amountInput: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 26,
    color: colors.paper,
    minWidth: 90,
    textAlign: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  amountAffix: { fontFamily: fonts.mono, fontSize: 18, color: colors.paperDim, marginHorizontal: 4 },
  capCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.paperDim, marginTop: 8 },
  extendedHoursNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.paperDim,
    marginHorizontal: 20,
    marginTop: 6,
  },
  actionButton: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  actionButtonBuy: {
    backgroundColor: colors.buyGreen,
    shadowColor: colors.buyGreen,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  actionButtonSell: {
    backgroundColor: colors.sellRed,
    shadowColor: colors.sellRed,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  actionButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.buttonInk },
  buttonDisabled: { opacity: 0.5 },
});
