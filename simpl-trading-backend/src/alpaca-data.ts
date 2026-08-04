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
};

type LatestQuoteResponse = { symbol: string; quote: RawQuote };
type LatestQuotesResponse = { quotes: Record<string, RawQuote> };

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

export const alpacaData = {
  /** GET /v2/stocks/{symbol}/quotes/latest — current best bid/ask for one symbol. */
  getLatestQuote: async (symbol: string): Promise<Quote> => {
    const result = (await alpacaDataFetch(
      `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`,
    )) as LatestQuoteResponse;
    return toQuote(result.symbol, result.quote);
  },

  /**
   * GET /v2/stocks/quotes/latest?symbols=A,B — best bid/ask for many symbols in
   * one call. Use this for list views (e.g. a watchlist) instead of one request
   * per symbol.
   */
  getLatestQuotes: async (symbols: string[]): Promise<Record<string, Quote>> => {
    const result = (await alpacaDataFetch(
      `/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols.join(","))}`,
    )) as LatestQuotesResponse;
    return Object.fromEntries(
      Object.entries(result.quotes).map(([symbol, raw]) => [symbol, toQuote(symbol, raw)]),
    );
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
