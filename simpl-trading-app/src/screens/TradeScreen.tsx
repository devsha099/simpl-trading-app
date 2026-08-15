import { useCallback, useEffect, useState } from "react";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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

const money = (v: string | number | undefined) =>
  v === undefined ? "—" : `$${Number(v).toFixed(2)}`;

// unrealized_plpc from Alpaca is a raw fraction (0.036 = 3.6%), not
// pre-multiplied like the watchlist snapshot's changePercent is.
const pctFromFraction = (v: string | undefined) =>
  v === undefined ? "—" : `${Number(v) >= 0 ? "+" : ""}${(Number(v) * 100).toFixed(2)}%`;

/**
 * The trade screen — bid/ask (or last price), order form, Buy/Sell. Reached
 * two ways: from a watchlist ticker row, or from a held position on the
 * Holdings screen (both `(tabs)/watchlists/[symbol].tsx` and
 * `(tabs)/account/[symbol].tsx` re-export this same component so each stays
 * within its own tab's back-stack — see CLAUDE.md §8). Reads only `symbol`
 * from the route; nothing here depends on how the user got here.
 */
export default function TradeScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? "").toUpperCase();

  const [position, setPosition] = useState<Position | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSide, setPendingSide] = useState<Side | null>(null);
  const [buyMode, setBuyMode] = useState<BuyMode>("dollars");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState("20");
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

  // Refetch on focus, not just on mount: React Navigation keeps stack
  // screens mounted across tab switches, so backing out to another tab and
  // switching back would otherwise show this exact position as it was
  // before you left — not necessarily reflecting a trade placed elsewhere
  // in the meantime.
  useFocusEffect(
    useCallback(() => {
      loadPosition();
    }, [loadPosition]),
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
  const estimatedCost =
    buyMode === "shares" && midPrice && Number(amount) > 0
      ? Number(amount) * midPrice
      : undefined;

  const placeOrder = useCallback(
    async (side: Side) => {
      if (!amount || Number(amount) <= 0) {
        setError("Enter an amount greater than 0.");
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

      setPendingSide(side);
      setError(null);
      try {
        const body: Record<string, string> = {
          symbol,
          side,
          type: orderType,
          ...(buyMode === "dollars" ? { notional: amount } : { qty: amount }),
          ...(orderType === "limit" ? { limit_price: limitPrice } : {}),
          ...(orderType === "stop" ? { stop_price: stopPrice } : {}),
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
        // Re-fetches real position data from Alpaca — this is what makes a
        // sell "physically" show up here: nothing about the position is
        // ever computed or cached client-side, it's whatever
        // GET /api/me/positions returns right now, same source of truth
        // the Holdings screen reads (which also now refreshes on focus,
        // not just on mount — see holdings.tsx).
        await loadPosition();
      } catch (e) {
        setError("Couldn't reach the backend.");
      } finally {
        setPendingSide(null);
      }
    },
    [amount, buyMode, limitPrice, loadPosition, orderType, stopPrice, symbol],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const buying = pendingSide !== null;

  // qty vs qty_available differ only when some shares are already tied up
  // in another pending order — Alpaca reduces qty_available the instant an
  // order is PLACED (not just when it fills), so this is real, live data,
  // not something we compute.
  const qtyAvailable = position?.qty_available ?? position?.qty;
  const hasPendingHold =
    position && qtyAvailable !== undefined && Number(qtyAvailable) !== Number(position.qty);
  const pl = position?.unrealized_pl !== undefined ? Number(position.unrealized_pl) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: symbol }} />

      <View style={styles.header}>
        <Text style={styles.symbolTitle}>{symbol}</Text>
      </View>

      {position ? (
        <View style={styles.positionCard}>
          <View style={styles.positionHeaderRow}>
            <Text style={styles.positionLabel}>Your Position</Text>
            {pl !== null ? (
              <View style={[styles.plPill, pl < 0 && styles.plPillNegative]}>
                <Text style={[styles.plPillText, pl < 0 && styles.plPillTextNegative]}>
                  {pl >= 0 ? "+" : ""}
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.segmented}>
        {(["market", "limit", "stop"] as OrderType[]).map((type) => (
          <Pressable
            key={type}
            style={[styles.segment, orderType === type && styles.segmentActive]}
            onPress={() => setOrderType(type)}
          >
            <Text style={[styles.segmentText, orderType === type && styles.segmentTextActive]}>
              {type === "market" ? "Market" : type === "limit" ? "Limit" : "Stop Loss"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.segmented}>
        <Pressable
          style={[styles.segment, buyMode === "dollars" && styles.segmentActive]}
          onPress={() => {
            setBuyMode("dollars");
            setAmount("20");
          }}
        >
          <Text style={[styles.segmentText, buyMode === "dollars" && styles.segmentTextActive]}>
            Dollars
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, buyMode === "shares" && styles.segmentActive]}
          onPress={() => {
            setBuyMode("shares");
            setAmount("0.2");
          }}
        >
          <Text style={[styles.segmentText, buyMode === "shares" && styles.segmentTextActive]}>
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
            placeholder={buyMode === "dollars" ? "20" : "0.2"}
            placeholderTextColor={colors.paperDim}
            selectionColor={colors.amber}
          />
          {buyMode === "shares" ? <Text style={styles.amountAffix}>shares</Text> : null}
        </View>
        {estimatedCost !== undefined ? (
          <Text style={styles.estimate}>≈ {money(estimatedCost)} at current price</Text>
        ) : null}
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

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, styles.buyButton, buying && styles.buttonDisabled]}
          onPress={() => placeOrder("buy")}
          disabled={buying}
        >
          <Text style={styles.buyButtonText}>{pendingSide === "buy" ? "Placing…" : "Buy"}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.sellButton, buying && styles.buttonDisabled]}
          onPress={() => placeOrder("sell")}
          disabled={buying}
        >
          <Text style={styles.sellButtonText}>{pendingSide === "sell" ? "Placing…" : "Sell"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  header: { padding: 24, paddingTop: 12, paddingBottom: 4 },
  symbolTitle: { fontFamily: fonts.monoSemiBold, fontSize: 30, color: colors.paper, letterSpacing: 0.3 },
  positionLine: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginHorizontal: 24, marginTop: 4 },
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
  statLabel: { ...labelCaps, fontSize: 10 },
  statValue: { fontFamily: fonts.mono, fontSize: 17, color: colors.paper, marginTop: 4 },
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    gap: 12,
  },
  button: { flex: 1, padding: 18, borderRadius: 14, alignItems: "center" },
  buyButton: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sellButton: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.inkLine },
  buttonDisabled: { opacity: 0.5 },
  buyButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.buttonInk },
  sellButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.paper },
  estimate: { fontFamily: fonts.body, textAlign: "center", color: colors.paperDim, fontSize: 13, marginTop: 10 },
  amountBox: {
    marginHorizontal: 20,
    marginTop: 16,
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
  segmented: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 14,
    gap: 6,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.md,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.paperDim },
  segmentTextActive: { color: colors.buttonInk },
});
