import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" options={{ headerShown: true, title: "Log In" }} />
      <Stack.Screen name="signup" options={{ headerShown: true, title: "Sign Up" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: true, title: "Verify Your Identity" }} />
      <Stack.Screen name="pending" />
    </Stack>
  );
}
