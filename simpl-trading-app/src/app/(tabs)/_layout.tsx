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
      {/* "education/index", not "education": the other three tabs are
          folders with their own _layout.tsx, so their route is the folder
          name. Education is a bare index.tsx with no layout, so its route
          keeps the /index suffix — naming it "education" here would match
          nothing and the tab would render the raw route string as its
          label (this exact bug happened once under this tab's old name,
          "Research" — see CLAUDE.md §12). */}
      <Tabs.Screen name="education/index" options={{ title: "Education" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
