import { Stack } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

export default function AccountLayout() {
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
      <Stack.Screen name="index" options={{ title: "Account" }} />
      <Stack.Screen name="holdings" options={{ title: "Holdings" }} />
      <Stack.Screen name="orders" options={{ title: "Orders" }} />
      <Stack.Screen name="trade-history" options={{ title: "Trade History" }} />
    </Stack>
  );
}
