import { Stack } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

export default function WatchlistsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.ink },
        headerStyle: { backgroundColor: colors.ink },
        headerShadowVisible: false,
        headerTintColor: colors.amber,
        headerTitleStyle: { fontFamily: fonts.bodySemiBold, color: colors.paper, fontSize: 16 },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Watchlists" }} />
      <Stack.Screen name="[watchlistId]/index" options={{ title: "" }} />
      <Stack.Screen name="stock/[symbol]" options={{ title: "" }} />
    </Stack>
  );
}
