import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { colors, fonts } from "../../lib/theme";
import { supabase } from "../../lib/supabase";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async ({ email }: FormValues) => {
    setSubmitting(true);
    setServerError(null);
    // Deliberately doesn't reveal whether the email is actually registered
    // (Supabase always returns success here regardless) — unlike signup's
    // duplicate-email check, telling someone "this email has no account" on
    // a password-reset screen is exactly the enumeration leak worth avoiding.
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push(`/reset-password?email=${encodeURIComponent(email)}`);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>
          Enter your email and, if there&apos;s an account, we&apos;ll send a code to reset your
          password.
        </Text>
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <FormField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.email?.message}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
        />
        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.buttonInk} />
          ) : (
            <Text style={styles.buttonText}>Send Reset Code</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 24, paddingTop: 32 },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim, marginBottom: 20, lineHeight: 21 },
  serverError: { fontFamily: fonts.body, color: colors.rust, fontSize: 14, marginBottom: 12 },
  button: {
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 16 },
});
