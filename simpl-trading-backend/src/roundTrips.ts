import { alpaca } from "./alpaca.js";
import { startOfTradingWeekET } from "./marketTime.js";

type FilledOrder = {
  symbol: string;
  side: "buy" | "sell";
  status: string;
  filled_at: string | null;
};

/**
 * How many round trips the account has completed in the current Mon–Fri ET
 * week (CLAUDE.md §17).
 *
 * A round trip is **a buy and a sell of the same symbol, both filled inside
 * this week's window**. The consequence that matters: selling a position you
 * opened weeks ago does NOT count. That's deliberate — the limit exists to
 * slow in-week churn, and making a long-held exit burn a round trip would
 * penalize exactly the calm, long-horizon behavior the app is built to
 * encourage (§1). Counting every sell instead would do that.
 *
 * Partial fills are handled by intent, not quantity: buy-buy-sell is one round
 * trip, buy-sell-buy-sell is two. Tracking exact share counts to zero would
 * mean reconstructing a starting position from before the window, and would
 * still be wrong for anyone who sold only part of a holding.
 */
export async function countRoundTripsThisWeek(accountId: string): Promise<number> {
  const weekStart = startOfTradingWeekET();
  const orders = (await alpaca.getOrders(accountId, "closed", weekStart.toISOString())) as FilledOrder[];

  const filled = orders
    .filter((o) => o.status === "filled" && o.filled_at !== null)
    // `after` is Alpaca's own filter on submission time, so re-check the fill
    // time locally: an order submitted late Friday that filled Monday belongs
    // to the new week, not the one it was placed in.
    .filter((o) => Date.parse(o.filled_at as string) >= weekStart.getTime())
    .sort((a, b) => Date.parse(a.filled_at as string) - Date.parse(b.filled_at as string));

  const openedThisWeek = new Set<string>();
  let roundTrips = 0;
  for (const order of filled) {
    if (order.side === "buy") {
      openedThisWeek.add(order.symbol);
    } else if (openedThisWeek.has(order.symbol)) {
      roundTrips++;
      openedThisWeek.delete(order.symbol);
    }
  }
  return roundTrips;
}
