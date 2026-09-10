import { Tabs } from "expo-router";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { colors, fonts } from "../../lib/theme";

/**
 * Route names — within each tab's OWN nested Stack (see that tab's
 * _layout.tsx for the literal Stack.Screen `name`s these must match) —
 * where the bottom tab bar hides entirely (added 2026-09-02). Hidden means
 * gone, not just faded: there's no bar to tap, so the only way back to it
 * is pressing back and popping the screen off that tab's stack. That's the
 * point, not a side effect — it's what guarantees the same stock (or
 * Holdings, or Profile) screen can never end up pushed and left open in two
 * tabs' stacks at once: you always have to fully back out of a sub-route
 * before a different tab is reachable again.
 *
 * The one exception is watchlists' own [watchlistId]/index — browsing a
 * single watchlist's ticker list still shows all 4 tabs. Only diving into
 * an individual stock hides them.
 */
const TAB_BAR_HIDDEN_ROUTES: Record<string, string[]> = {
  watchlists: ["stock/[symbol]"],
  account: [
    "holdings",
    "orders",
    "trade-history",
    "[symbol]",
    "banking/index",
    "banking/transfer",
    "banking/bank",
    "trade-limits",
  ],
  education: ["[section]", "stock/[symbol]"],
  settings: ["profile"],
};

const VISIBLE_TAB_BAR = { backgroundColor: colors.ink, borderTopColor: colors.inkLine };
const HIDDEN_TAB_BAR = { display: "none" as const };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const focusedRoute = getFocusedRouteNameFromRoute(route) ?? "index";
        const hidden = TAB_BAR_HIDDEN_ROUTES[route.name]?.includes(focusedRoute) ?? false;
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.amber,
          tabBarInactiveTintColor: colors.paperDim,
          tabBarStyle: hidden ? HIDDEN_TAB_BAR : VISIBLE_TAB_BAR,
          tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
          sceneStyle: { backgroundColor: colors.ink },
        };
      }}
    >
      <Tabs.Screen name="watchlists" options={{ title: "Watchlists" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      {/* "education", not "education/index": this tab gained its own
          _layout.tsx when the market sections were added, so it now
          registers as the folder name like the other three. It was
          "education/index" while it was a bare index.tsx — getting this
          wrong makes the tab render its raw route string as the label
          (CLAUDE.md §12; happened once already under the old "Research"
          name). */}
      <Tabs.Screen name="education" options={{ title: "Education" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
