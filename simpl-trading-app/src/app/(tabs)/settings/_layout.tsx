import { Stack } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

export default function SettingsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
    </Stack>
  );
}
