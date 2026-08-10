import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../../lib/theme";
import { supabase } from "../../../lib/supabase";

export default function SettingsScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    // signOut() fires a real Supabase SIGNED_OUT auth event, which the shared
    // AuthStateContext already reacts to — the root layout's guard would
    // eventually redirect on its own. Navigating explicitly here just makes
    // the transition immediate instead of waiting on that event to land.
    router.replace("/welcome");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable style={styles.row} onPress={() => router.push("/settings/profile")}>
        <View>
          <Text style={styles.rowTitle}>Profile</Text>
          <Text style={styles.rowSubtitle}>Your details on file</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Text style={styles.note}>More settings coming soon.</Text>

      <Pressable style={[styles.button, signingOut && styles.buttonDisabled]} onPress={signOut} disabled={signingOut}>
        {signingOut ? <ActivityIndicator color={colors.rust} /> : <Text style={styles.buttonText}>Sign Out</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  rowTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.paper },
  rowSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.amberDeep },
  note: { fontFamily: fonts.body, fontSize: 14, color: colors.paperDim, paddingHorizontal: 24, paddingTop: 20 },
  button: {
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.inkLine,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.rust, fontSize: 16 },
});
