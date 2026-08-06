import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { supabase } from "../../lib/supabase";

// Not hardcoding a length: Supabase's OTP length is a dashboard-configurable
// setting (this project's happens to generate 8 digits, not the commonly
// assumed 6) — validate it's digits-only and let verifyOtp be the actual
// source of truth on whether the code is right.
const schema = z.object({
  code: z.string().regex(/^\d{4,10}$/, "Enter the code from your email"),
});
type FormValues = z.infer<typeof schema>;

/**
 * Confirms signup via the emailed OTP code rather than the emailed magic
 * link. The link points at whatever Supabase's "Site URL" is configured to
 * (localhost during dev), which is dead on arrival if the email is opened on
 * a different device — the code has no such dependency, it's just text you
 * read and type in. Requires the Supabase dashboard's "Confirm signup" email
 * template to actually display {{ .Token }} (see CLAUDE.md).
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
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
    defaultValues: { code: "" },
  });

  const onSubmit = async ({ code }: FormValues) => {
    if (!email) {
      setServerError("Missing email — go back and sign up again.");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    // Verified -> Supabase issues a real session -> the root layout's
    // auth-state listener picks it up and redirects to onboarding on its own.
  };

  const resendCode = async () => {
    if (!email) return;
    setResending(true);
    setResendMessage(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    setResendMessage(error ? error.message : "New code sent.");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent a confirmation code to {email ?? "your email"}. Enter it below — this works
        from any device, you don&apos;t need to open the email on this one.
      </Text>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <FormField
            label="Confirmation code"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.code?.message}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="Enter code"
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
        {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Verify</Text>}
      </Pressable>
      <Pressable onPress={resendCode} disabled={resending}>
        <Text style={styles.link}>{resending ? "Sending..." : "Resend code"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", textAlign: "center" },
  body: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
    lineHeight: 21,
  },
  serverError: { color: "#b91c1c", fontSize: 14, marginBottom: 12 },
  infoMessage: { color: "#111827", fontSize: 14, marginBottom: 12, textAlign: "center" },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  link: { color: "#6b7280", fontSize: 14, textAlign: "center", marginTop: 20 },
});
