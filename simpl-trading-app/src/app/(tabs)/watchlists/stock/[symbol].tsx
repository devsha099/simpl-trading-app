// The stock screen (Company Info / Trade / Financials), reached from a
// watchlist ticker row. Lives under a static "stock/" segment rather than
// directly in watchlists/ — a bare [symbol].tsx there would be a second
// dynamic segment sibling to [watchlistId]/, which expo-router resolves
// ambiguously (confirmed live: it silently matched [watchlistId]/index
// instead, treating the symbol as a watchlist id and rendering an empty
// watchlist screen). The screen itself never used watchlistId anyway, and
// dropping it from the route lets the SAME symbol be reached from the
// Account tab's Holdings screen too (see (tabs)/account/[symbol].tsx) —
// which watchlist you came from is preserved by the navigation stack
// itself, not the URL.
export { default } from "../../../../screens/StockScreen";
