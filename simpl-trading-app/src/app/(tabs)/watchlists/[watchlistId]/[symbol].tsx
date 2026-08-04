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
import { API_BASE, ACCOUNT_ID } from "../../../../lib/api";

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
      const res = await fetch(`${API_BASE}/api/alpaca/accounts/${ACCOUNT_ID}/positions`);
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

        const res = await fetch(
          `${API_BASE}/api/alpaca/accounts/${ACCOUNT_ID}/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );

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
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const buying = pendingSide !== null;

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: symbol }} />

      <View style={styles.header}>
        <Text style={styles.symbolTitle}>{symbol}</Text>
        <Text style={styles.quoteLine}>
          Bid {money(quote?.bidPrice)} · Ask {money(quote?.askPrice)}
        </Text>
        <Text style={styles.positionLine}>
          {position
            ? `You own ${Number(position.qty).toFixed(4)} shares · ${money(position.market_value)}`
            : "You don't own this yet."}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.modeToggle}>
        {(["market", "limit", "stop"] as OrderType[]).map((type) => (
          <Pressable
            key={type}
            style={[styles.modeButton, orderType === type && styles.modeButtonActive]}
            onPress={() => setOrderType(type)}
          >
            <Text style={[styles.modeText, orderType === type && styles.modeTextActive]}>
              {type === "market" ? "Market" : type === "limit" ? "Limit" : "Stop Loss"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeButton, buyMode === "dollars" && styles.modeButtonActive]}
          onPress={() => {
            setBuyMode("dollars");
            setAmount("20");
          }}
        >
          <Text style={[styles.modeText, buyMode === "dollars" && styles.modeTextActive]}>
            Dollars
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, buyMode === "shares" && styles.modeButtonActive]}
          onPress={() => {
            setBuyMode("shares");
            setAmount("0.2");
          }}
        >
          <Text style={[styles.modeText, buyMode === "shares" && styles.modeTextActive]}>
            Shares
          </Text>
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        {buyMode === "dollars" ? <Text style={styles.amountAffix}>$</Text> : null}
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={buyMode === "dollars" ? "20" : "0.2"}
        />
        {buyMode === "shares" ? <Text style={styles.amountAffix}>shares</Text> : null}
      </View>

      {estimatedCost !== undefined ? (
        <Text style={styles.estimate}>≈ {money(estimatedCost)} at current price</Text>
      ) : null}

      {orderType === "limit" ? (
        <View style={styles.amountRow}>
          <Text style={styles.amountAffix}>Limit $</Text>
          <TextInput
            style={styles.amountInput}
            value={limitPrice}
            onChangeText={setLimitPrice}
            keyboardType="decimal-pad"
            placeholder={midPrice ? midPrice.toFixed(2) : "0.00"}
          />
        </View>
      ) : null}

      {orderType === "stop" ? (
        <View style={styles.amountRow}>
          <Text style={styles.amountAffix}>Stop $</Text>
          <TextInput
            style={styles.amountInput}
            value={stopPrice}
            onChangeText={setStopPrice}
            keyboardType="decimal-pad"
            placeholder={midPrice ? midPrice.toFixed(2) : "0.00"}
          />
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, styles.buyButton, buying && styles.buttonDisabled]}
          onPress={() => placeOrder("buy")}
          disabled={buying}
        >
          <Text style={styles.buttonText}>{pendingSide === "buy" ? "Placing…" : "Buy"}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.sellButton, buying && styles.buttonDisabled]}
          onPress={() => placeOrder("sell")}
          disabled={buying}
        >
          <Text style={styles.buttonText}>{pendingSide === "sell" ? "Placing…" : "Sell"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  center: { justifyContent: "center", alignItems: "center" },
  header: { padding: 24, paddingTop: 16 },
  symbolTitle: { fontSize: 32, fontWeight: "700", color: "#111827" },
  quoteLine: { fontSize: 15, color: "#6b7280", marginTop: 6 },
  positionLine: { fontSize: 14, color: "#9ca3af", marginTop: 8 },
  error: { marginHorizontal: 24, marginBottom: 8, color: "#b91c1c", fontSize: 14 },
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    gap: 12,
  },
  button: { flex: 1, padding: 18, borderRadius: 14, alignItems: "center" },
  buyButton: { backgroundColor: "#111827" },
  sellButton: { backgroundColor: "#b91c1c" },
  buttonDisabled: { opacity: 0.5 },
  estimate: { textAlign: "center", color: "#6b7280", fontSize: 13, marginTop: 6 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 12,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    minWidth: 80,
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  amountAffix: { fontSize: 16, color: "#6b7280", marginHorizontal: 6 },
  modeToggle: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    alignItems: "center",
  },
  modeButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  modeText: { color: "#111827", fontWeight: "600" },
  modeTextActive: { color: "#ffffff" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
