import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { useAuthStateContext } from "../../context/AuthStateContext";
import { colors, fonts } from "../../lib/theme";
import { isValidPassword } from "../../lib/passwordRules";
import { supabase } from "../../lib/supabase";

const schema = z
  .object({
    code: z.string().regex(/^\d{4,10}$/, "Enter the code from your email"),
    password: z.string().refine(isValidPassword, "Password doesn't meet all requirements"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

/**
 * Companion to forgot-password.tsx. verifyOtp({type:"recovery"}) fires a
 * PASSWORD_RECOVERY auth event rather than a normal sign-in — useAuthState
 * deliberately ignores that event (see its comment) so the router guard
 * doesn't yank the user away mid-flow, before a new password is actually
 * set. Once updateUser succeeds, refresh() tells the shared auth state a
 * real session now exists, and the guard takes it from there — wherever
 * this account actually belongs (onboarding/pending/active), not something
 * this screen needs to know.
 */
export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { refresh } = useAuthStateContext();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ code, password }: FormValues) => {
    if (!email) {
      setServerError("Missing email — go back and request a new code.");
      return;
    }
    setSubmitting(true);
    setServerError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
    if (verifyError) {
      setSubmitting(false);
      setServerError(verifyError.message);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setServerError(updateError.message);
      return;
    }

    await refresh();
  };

  const resendCode = async () => {
    if (!email) return;
    setResending(true);
    setResendMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResending(false);
    setResendMessage(error ? error.message : "New code sent.");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>
          Enter the code we sent to {email ?? "your email"} and choose a new password.
        </Text>
        <Controller
          control={control}
          name="code"
          render={({ field }) => (
            <FormField
              label="Reset code"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.code?.message}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="Enter code"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <>
              <FormField
                label="New password"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.password?.message}
                secureTextEntry
                autoComplete="new-password"
              />
              <PasswordRequirements password={field.value} />
            </>
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field }) => (
            <FormField
              label="Confirm new password"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.confirmPassword?.message}
              secureTextEntry
            />
          )}
        />
        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
        {resendMessage ? <Text style={styles.infoMessage}>{resendMessage}</Text> : null}
        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.buttonInk} />
          ) : (
            <Text style={styles.buttonText}>Reset Password</Text>
          )}
        </Pressable>
        <Pressable onPress={resendCode} disabled={resending}>
          <Text style={styles.link}>{resending ? "Sending..." : "Resend code"}</Text>
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
  infoMessage: { fontFamily: fonts.body, color: colors.phosphor, fontSize: 14, marginBottom: 12 },
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
  link: { fontFamily: fonts.body, color: colors.paperDim, fontSize: 14, textAlign: "center", marginTop: 20 },
});
