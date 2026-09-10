// Thin re-export so a stock opened from Education pushes onto EDUCATION's
// own back-stack, keeping it out of the Watchlists and Account stacks
// (CLAUDE.md §8: duplicate the route file, never the component logic).
export { default } from "../../../../screens/StockScreen";
