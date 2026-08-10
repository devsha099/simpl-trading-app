import { StyleSheet, Text, View } from "react-native";
import { PASSWORD_REQUIREMENTS } from "../lib/passwordRules";
import { colors, fonts } from "../lib/theme";

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <View style={styles.container}>
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <View key={req.label} style={styles.row}>
            <Text style={[styles.check, met && styles.checkMet]}>{met ? "✓" : "○"}</Text>
            <Text style={[styles.label, met && styles.labelMet]}>{req.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: -8, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  check: { width: 18, fontFamily: fonts.mono, fontSize: 13, color: colors.paperDim },
  checkMet: { color: colors.phosphor },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim },
  labelMet: { color: colors.phosphor },
});
