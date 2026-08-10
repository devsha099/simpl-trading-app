import { useState } from "react";
import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, fonts, labelCaps, radius, spacing } from "../lib/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function FormField({ label, error, style, onFocus, onBlur, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, focused && styles.inputFocused, style]}
        placeholderTextColor={colors.paperDim}
        selectionColor={colors.amber}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { ...labelCaps, marginBottom: spacing.sm },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    color: colors.paper,
  },
  inputFocused: {
    borderColor: colors.amberDeep,
    shadowColor: colors.amber,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.rust, marginTop: 6 },
});
