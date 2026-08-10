import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import { useAuthStateContext } from "../../context/AuthStateContext";
import { API_BASE } from "../../lib/api";
import { colors, fonts } from "../../lib/theme";
import { supabase } from "../../lib/supabase";

export default function PendingScreen() {
  const router = useRouter();
  const { refresh } = useAuthStateContext();
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.replace("/welcome");
        return;
      }

      // Re-check with Alpaca through the backend (never read the DB's cached
      // status directly here) — the DB is only ever written once at
      // onboarding time, so a real approval since then would never show up
      // otherwise. See routes/me/status.ts.
      const res = await fetch(`${API_BASE}/api/me/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.status) {
        setMessage("Couldn't check your status. Try again in a moment.");
        return;
      }
      if (body.status === "ACTIVE") {
        // Becoming ACTIVE isn't a Supabase auth event, so the shared auth
        // state (which the root layout's guard routes on) doesn't know yet.
        // Refresh it before navigating — otherwise the guard re-runs on the
        // route change with its old "pending" value and bounces right back.
        await refresh();
        router.replace("/watchlists");
      } else {
        setMessage(`Still ${String(body.status).toLowerCase()}. This can take a little while.`);
      }
    } catch {
      setMessage("Couldn't reach the backend. Check that it's running.");
    } finally {
      setChecking(false);
    }
  }, [router, refresh]);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/welcome");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ActivityIndicator color={colors.amber} style={styles.spinner} />
      <Text style={styles.title}>Almost there</Text>
      <Text style={styles.body}>
        We&apos;ve sent your application to Alpaca for review. This is usually quick
        in sandbox — production approval can take longer.
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable style={styles.button} onPress={checkStatus} disabled={checking}>
        {checking ? (
          <ActivityIndicator color={colors.buttonInk} />
        ) : (
          <Text style={styles.buttonText}>Check status</Text>
        )}
      </Pressable>
      <Pressable onPress={signOut} disabled={signingOut} style={styles.signOutLink}>
        <Text style={styles.signOutText}>{signingOut ? "Signing out..." : "Not you? Sign out"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, padding: 24, justifyContent: "center" },
  spinner: { marginBottom: 20 },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.paper, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim, textAlign: "center", marginTop: 12, lineHeight: 21 },
  message: { fontFamily: fonts.body, fontSize: 14, color: colors.phosphor, textAlign: "center", marginTop: 16 },
  button: {
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 16 },
  signOutLink: { alignItems: "center", marginTop: 20 },
  signOutText: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
});
