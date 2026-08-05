import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import { supabase } from "../../lib/supabase";

export default function PendingScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        router.replace("/welcome");
        return;
      }

      const { data, error } = await supabase
        .from("alpaca_accounts")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        setMessage("Couldn't check your status. Try again in a moment.");
        return;
      }
      if (data.account_status === "ACTIVE") {
        router.replace("/watchlists");
      } else {
        setMessage(`Still ${String(data.account_status).toLowerCase()}. This can take a little while.`);
      }
    } finally {
      setChecking(false);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Almost there</Text>
      <Text style={styles.body}>
        We&apos;ve sent your application to Alpaca for review. This is usually quick
        in sandbox — production approval can take longer.
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable style={styles.button} onPress={checkStatus} disabled={checking}>
        {checking ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Check status</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", textAlign: "center" },
  body: { fontSize: 15, color: "#6b7280", textAlign: "center", marginTop: 12, lineHeight: 21 },
  message: { fontSize: 14, color: "#111827", textAlign: "center", marginTop: 16 },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
