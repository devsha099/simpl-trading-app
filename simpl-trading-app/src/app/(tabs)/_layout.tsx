import { Tabs } from "expo-router";
import { colors, fonts } from "../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.paperDim,
        tabBarStyle: { backgroundColor: colors.ink, borderTopColor: colors.inkLine },
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.ink },
      }}
    >
      <Tabs.Screen name="watchlists" options={{ title: "Watchlists" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      {/* "research/index", not "research": the other three tabs are folders
          with their own _layout.tsx, so their route is the folder name.
          Research is a bare index.tsx with no layout, so its route keeps the
          /index suffix — naming it "research" here matched nothing and the
          tab rendered the raw route string as its label. */}
      <Tabs.Screen name="research/index" options={{ title: "Research" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
