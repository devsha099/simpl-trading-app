import { Stack } from "expo-router";
import { colors, fonts } from "../../../lib/theme";

/**
 * Education's own nested stack. NOTE: adding this file changed the tab's
 * route name from "education/index" to "education" — a folder with a
 * _layout registers as the folder name, a bare index.tsx keeps the /index
 * suffix (CLAUDE.md §12). `(tabs)/_layout.tsx`'s <Tabs.Screen name> was
 * updated to match; without that the tab renders its raw route string as
 * its label.
 *
 * `stock` is a STATIC prefix segment so `[section]` and `[symbol]` are never
 * dynamic siblings — the exact fix §12 prescribes after expo-router silently
 * matched one dynamic route for every URL.
 */
export default function EducationLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.amber,
        headerTitleStyle: { fontFamily: fonts.displayBold, color: colors.paper },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[section]" options={{ title: "" }} />
      <Stack.Screen name="stock/[symbol]" options={{ title: "" }} />
    </Stack>
  );
}
