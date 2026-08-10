import { Picker } from "@react-native-picker/picker";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, labelCaps, radius, spacing } from "../lib/theme";

type Props = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  error?: string;
};

export function SelectField({ label, value, onValueChange, options, placeholder, error }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={value}
          onValueChange={onValueChange}
          style={styles.picker}
          dropdownIconColor={colors.amber}
        >
          <Picker.Item label={placeholder ?? "Select..."} value="" color={colors.paperDim} />
          {options.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} color={colors.paper} />
          ))}
        </Picker>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { ...labelCaps, marginBottom: spacing.sm },
  pickerWrapper: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    overflow: "hidden",
  },
  picker: {
    color: colors.paper,
    backgroundColor: "transparent",
    fontFamily: fonts.body,
  },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.rust, marginTop: 6 },
});
