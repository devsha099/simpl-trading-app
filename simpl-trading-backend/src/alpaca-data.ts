import { config } from "./config.js";
import { AlpacaError } from "./alpaca.js";

/**
 * Thin wrapper around Alpaca's Market Data API — a separate host from the
 * Broker API, with its own auth header style (APCA-API-KEY-ID /
 * APCA-API-SECRET-KEY instead of HTTP Basic). Same key id/secret as the
 * Broker API credentials.
 */
async function alpacaDataFetch(path: string): Promise<unknown> {
  const res = await fetch(`${config.alpacaDataBaseUrl}${path}`, {
    headers: {
      "APCA-API-KEY-ID": config.alpacaKeyId,
      "APCA-API-SECRET-KEY": config.alpacaSecret,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    throw new AlpacaError(res.status, body);
  }
  return body;
}

type RawQuote = {
  t: string; // timestamp
  ap: number; // ask price
  as: number; // ask size
  bp: number; // bid price
  bs: number; // bid size
  c?: string[]; // condition codes. NB: this feed stamps "R" on every quote,
  //               round lots included — it is NOT an odd-lot marker here.
};

type RawTrade = { t: string; p: number; s: number };

type LatestQuoteResponse = { symbol: string; quote: RawQuote };
type LatestTradeResponse = { symbol: string; trade: RawTrade };

export type Quote = {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
};

const toQuote = (symbol: string, raw: RawQuote): Quote => ({
  symbol,
  bidPrice: raw.bp,
  bidSize: raw.bs,
  askPrice: raw.ap,
  askSize: raw.as,
  timestamp: raw.t,
});

// We're on Alpaca's free IEX-only feed (~2-3% of consolidated volume; SIP is
// a paid add-on and returns "subscription does not permit querying recent SIP
// data"). A single thin IEX tick is occasionally nowhere near the real market:
// observed live on MSFT as bid $490.01 / ask $496.75 — a 1.4% spread — while
// the same instant's last trade was $496.13 and every other liquid name sat
// under 0.06%. Showing that verbatim would misrepresent the price you'd
// actually get filled at, so flag it and let the last real trade stand in.
//
// Measured empirically across MSFT/SPY/AAPL/TSLA/NVDA/KO/GOOGL: healthy
// spreads were all <0.06% of last price, the bad MSFT tick ~1.4%. 0.5% sits
// well clear of both, so it catches the outlier without touching normal
// quotes — including genuinely wider spreads on less liquid names.
const MAX_PLAUSIBLE_SPREAD_RATIO = 0.005;

function isReliableQuote(raw: RawQuote, lastPrice: number | null): boolean {
  if (raw.bp <= 0 || raw.ap <= 0) return false; // known sandbox one-sided-quote quirk
  if (raw.ap < raw.bp) return false; // crossed quote — never a real market
  if (lastPrice && (raw.ap - raw.bp) / lastPrice > MAX_PLAUSIBLE_SPREAD_RATIO) return false;
  return true;
}

export type QuoteDetail = Quote & {
  lastPrice: number | null;
  /**
   * False when bidPrice/askPrice shouldn't be trusted as a representative
   * market (see isReliableQuote). The client falls back to displaying
   * lastPrice instead of a potentially misleading bid/ask split.
   */
  reliable: boolean;
};

type RawSnapshot = {
  latestTrade?: { p: number };
  prevDailyBar?: { c: number };
};

export type Snapshot = {
  symbol: string;
  lastPrice: number | null;
  previousClose: number | null;
  changePercent: number | null;
};

const toSnapshot = (symbol: string, raw: RawSnapshot): Snapshot => {
  const lastPrice = raw.latestTrade?.p ?? null;
  const previousClose = raw.prevDailyBar?.c ?? null;
  const changePercent =
    lastPrice !== null && previousClose
      ? ((lastPrice - previousClose) / previousClose) * 100
      : null;
  return { symbol, lastPrice, previousClose, changePercent };
};

/** One daily bar, trimmed to what performance math needs. */
export type DailyBar = { date: string; close: number };

type RawBar = { t: string; c: number };
type BarsResponse = { bars: Record<string, RawBar[]> | null; next_page_token: string | null };

export const alpacaData = {
  /**
   * Split-adjusted daily closes for many symbols at once, from `start` to now.
   *
   * `adjustment=split` matters: without it a stock that split mid-window shows
   * a fake ~50% "loss" on every return calculation. Dividends are deliberately
   * NOT adjusted for — these feed a price-return figure, and quietly showing
   * total return under a "1 Year" label would overstate what a holder saw in
   * their own account.
   *
   * Alpaca caps a response at 10,000 bars and pages the rest behind
   * next_page_token, so a year of daily data tops out around 35 symbols per
   * page — callers batch, and this follows the tokens until a batch is whole.
   */
  getDailyBars: async (symbols: string[], start: string): Promise<Record<string, DailyBar[]>> => {
    const out: Record<string, DailyBar[]> = {};
    let pageToken: string | null = null;

    do {
      const params = new URLSearchParams({
        symbols: symbols.join(","),
        timeframe: "1Day",
        start,
        limit: "10000",
        adjustment: "split",
      });
      if (pageToken) params.set("page_token", pageToken);

      const page = (await alpacaDataFetch(`/v2/stocks/bars?${params.toString()}`)) as BarsResponse;
      for (const [symbol, bars] of Object.entries(page.bars ?? {})) {
        // A paged symbol arrives in chunks; append rather than replace.
        (out[symbol] ??= []).push(...bars.map((b) => ({ date: b.t.slice(0, 10), close: b.c })));
      }
      pageToken = page.next_page_token;
    } while (pageToken);

    return out;
  },

  /**
   * Quote + last trade together, with a reliability flag — what the
   * per-symbol trade screen actually polls. Fetches both in parallel since
   * judging the quote needs the trade price to compare against.
   */
  getQuoteDetail: async (symbol: string): Promise<QuoteDetail> => {
    const [quoteResult, tradeResult] = await Promise.all([
      alpacaDataFetch(`/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`) as Promise<LatestQuoteResponse>,
      alpacaDataFetch(`/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`) as Promise<LatestTradeResponse>,
    ]);
    const raw = quoteResult.quote;
    const lastPrice = tradeResult.trade?.p ?? null;
    return {
      ...toQuote(quoteResult.symbol, raw),
      lastPrice,
      reliable: isReliableQuote(raw, lastPrice),
    };
  },

  /**
   * GET /v2/stocks/snapshots?symbols=A,B — last traded price + previous close
   * (for %-change) for many symbols in one call. Used by watchlist rows.
   */
  getSnapshots: async (symbols: string[]): Promise<Record<string, Snapshot>> => {
    const result = (await alpacaDataFetch(
      `/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(","))}`,
    )) as Record<string, RawSnapshot>;
    return Object.fromEntries(
      Object.entries(result).map(([symbol, raw]) => [symbol, toSnapshot(symbol, raw)]),
    );
  },
};
