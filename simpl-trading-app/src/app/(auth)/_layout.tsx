import { Stack } from "expo-router";
import { colors, fonts } from "../../lib/theme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ink },
        headerStyle: { backgroundColor: colors.ink },
        headerShadowVisible: false,
        headerTintColor: colors.amber,
        headerTitleStyle: { fontFamily: fonts.bodySemiBold, color: colors.paper, fontSize: 16 },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" options={{ headerShown: true, title: "Log In" }} />
      <Stack.Screen name="signup" options={{ headerShown: true, title: "Sign Up" }} />
      <Stack.Screen name="verify-email" options={{ headerShown: true, title: "Confirm Email" }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: true, title: "Forgot Password" }} />
      <Stack.Screen name="reset-password" options={{ headerShown: true, title: "Reset Password" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: true, title: "Verify Your Identity" }} />
      <Stack.Screen name="investment-profile" options={{ headerShown: true, title: "A Few More Questions" }} />
      <Stack.Screen name="pending" />
    </Stack>
  );
}
