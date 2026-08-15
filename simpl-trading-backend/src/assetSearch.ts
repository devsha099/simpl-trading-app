import { alpaca } from "./alpaca.js";

/**
 * Ticker autocomplete + existence validation, backed by an in-memory cache
 * of Alpaca's tradable-assets list (~13k US equities) instead of a call per
 * keystroke (CLAUDE.md §11's "cache Alpaca's tradable-assets list" note).
 *
 * Loaded lazily on first use, not at server boot: `tsx watch` restarts the
 * whole process on every save during dev, so an eager fetch would add a
 * multi-second delay to every single hot-reload (same reasoning as
 * supabase.ts's lazy validation).
 */

export type AssetSuggestion = { symbol: string; name: string; exchange: string };

type RawAsset = {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
};

const REFRESH_MS = 24 * 60 * 60 * 1000; // asset lists change rarely — daily is plenty

let cache: AssetSuggestion[] = [];
let cachedAt = 0;

async function ensureLoaded(): Promise<void> {
  const stale = Date.now() - cachedAt > REFRESH_MS;
  if (cache.length > 0 && !stale) return;

  try {
    const raw = (await alpaca.listAssets()) as RawAsset[];
    cache = raw
      // Only what's actually tradable, and off OTC — OTC skews toward thin,
      // speculative penny stocks/foreign shells, which cuts against a
      // simple buy-and-hold app aimed at people trying to stop day trading
      // (CLAUDE.md §1). Major exchanges (NYSE/NASDAQ/ARCA/AMEX/BATS) only.
      .filter((a) => a.tradable && a.exchange !== "OTC")
      .map((a) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange }));
    cachedAt = Date.now();
  } catch (err) {
    if (cache.length === 0) throw err; // nothing to fall back to
    // Keep serving the stale cache rather than breaking search over a
    // transient Alpaca hiccup; it'll retry on the next call.
  }
}

/**
 * Ranked autocomplete: exact symbol, then symbol-prefix, then
 * name-prefix, then name-substring — so typing "MS" surfaces MS itself
 * before MSFT, and typing "micro" finds Microsoft by company name.
 */
export async function searchAssets(rawQuery: string, limit = 6): Promise<AssetSuggestion[]> {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return [];
  await ensureLoaded();

  const ranked: { asset: AssetSuggestion; rank: number }[] = [];
  for (const asset of cache) {
    const symbol = asset.symbol.toUpperCase();
    const name = asset.name.toUpperCase();
    let rank: number | null = null;
    if (symbol === q) rank = 0;
    else if (symbol.startsWith(q)) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (name.includes(q)) rank = 3;
    if (rank !== null) ranked.push({ asset, rank });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank >= 2) {
      // Name-based match: shorter, plainer names (usually the actual
      // operating company, e.g. "Microsoft Corporation Common Stock")
      // before long structured-product names (leveraged ETNs etc., e.g.
      // "MicroSectors -3x Short Artificial Intelligence (AI) ETNs") that
      // happen to share a word prefix — alphabetical-by-symbol has no
      // relationship to what the user actually typed here.
      return a.asset.name.length - b.asset.name.length;
    }
    // Symbol-based match: the user typed a ticker prefix, so alphabetical
    // by symbol is the order they'd expect while scanning.
    return a.asset.symbol.length - b.asset.symbol.length || a.asset.symbol.localeCompare(b.asset.symbol);
  });
  return ranked.slice(0, limit).map((r) => r.asset);
}

/** Exact-match lookup — the authoritative "does this ticker exist and is it tradable" check before adding it. */
export async function lookupAsset(rawSymbol: string): Promise<AssetSuggestion | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) return null;
  await ensureLoaded();
  return cache.find((a) => a.symbol === symbol) ?? null;
}
