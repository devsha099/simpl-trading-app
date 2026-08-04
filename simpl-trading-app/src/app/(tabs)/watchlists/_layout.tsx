import { Stack } from "expo-router";

export default function WatchlistsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Watchlists" }} />
      <Stack.Screen name="[watchlistId]/index" options={{ title: "" }} />
      <Stack.Screen name="[watchlistId]/[symbol]" options={{ title: "" }} />
    </Stack>
  );
}
