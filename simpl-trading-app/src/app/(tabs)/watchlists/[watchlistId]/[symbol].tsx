import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE, apiFetch } from "../../../../lib/api";
import { colors, fonts, labelCaps, radius } from "../../../../lib/theme";

const QUOTE_POLL_MS = 5000;

type Position = {
  symbol: string;
  qty: string;
  market_value: string;
  current_price: string;
};

type Quote = { bidPrice: number; askPrice: number };
type BuyMode = "dollars" | "shares";
type OrderType = "market" | "limit" | "stop";
type Side = "buy" | "sell";

const money = (v: string | number | undefined) =>
  v === undefined ? "—" : `$${Number(v).toFixed(2)}`;

export default function SymbolScreen() {
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

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

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

  const midPrice =
    quote && quote.bidPrice > 0 && quote.askPrice > 0
      ? (quote.bidPrice + quote.askPrice) / 2
      : undefined;
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

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: symbol }} />

      <View style={styles.header}>
        <Text style={styles.symbolTitle}>{symbol}</Text>
        <Text style={styles.positionLine}>
          {position
            ? `You own ${Number(position.qty).toFixed(4)} shares · ${money(position.market_value)}`
            : "You don't own this yet."}
        </Text>
      </View>

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
  positionLine: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 8 },
  error: { fontFamily: fonts.body, marginHorizontal: 24, marginBottom: 8, color: colors.rust, fontSize: 14 },
  statPair: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 12 },
  statBox: { flex: 1, backgroundColor: colors.inkRaised, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.inkLine },
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
