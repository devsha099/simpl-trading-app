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
      <Tabs.Screen name="research" options={{ title: "Research" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
