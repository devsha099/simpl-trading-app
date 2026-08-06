import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet } from "react-native";
import { AuthStateProvider, useAuthStateContext } from "../context/AuthStateContext";

// The router state machine (CLAUDE.md §4). Runs on every launch and on every
// auth-state change, deciding where the user belongs:
//   not logged in -> welcome; no alpaca_accounts row -> onboarding;
//   row exists but not ACTIVE -> pending; ACTIVE -> the main app.
// This makes the app resilient to quitting mid-flow — routing reads real
// state instead of assuming a linear path.
export default function RootLayout() {
  return (
    <AuthStateProvider>
      <RootLayoutNav />
    </AuthStateProvider>
  );
}

function RootLayoutNav() {
  const authState = useAuthStateContext();
  // Widened to a plain string[] — the exact tuple type expo-router infers
  // depends on which route is currently matched, and a shorter array safely
  // yields `undefined` at unused indices anyway, which is what we want here.
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (authState.status === "loading") return;

    const inAuthGroup = segments[0] === "(auth)";
    const currentAuthScreen = inAuthGroup ? segments[1] : undefined;
    const atRoot = segments.length === 0;

    if (authState.status === "signed-out") {
      const alreadyOnEntryScreen =
        currentAuthScreen === "welcome" ||
        currentAuthScreen === "login" ||
        currentAuthScreen === "signup" ||
        currentAuthScreen === "verify-email";
      if (!alreadyOnEntryScreen) router.replace("/welcome");
    } else if (authState.status === "needs-onboarding") {
      if (currentAuthScreen !== "onboarding") router.replace("/onboarding");
    } else if (authState.status === "pending") {
      if (currentAuthScreen !== "pending") router.replace("/pending");
    } else if (authState.status === "active") {
      if (inAuthGroup || atRoot) router.replace("/watchlists");
    }
  }, [authState, segments, router]);

  if (authState.status === "loading") {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#ffffff" },
});
