import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { colors, fonts } from "../../lib/theme";
import { isValidPassword } from "../../lib/passwordRules";
import { supabase } from "../../lib/supabase";

// North America only (see CLAUDE.md §1) — 10 digits, with or without a
// leading country code / formatting characters.
function isValidUsCaPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

const schema = z
  .object({
    firstName: z.string().min(1, "Enter your first name"),
    lastName: z.string().min(1, "Enter your last name"),
    phone: z.string().refine(isValidUsCaPhone, "Enter a valid 10-digit US/Canada phone number"),
    email: z.string().email("Enter a valid email"),
    password: z.string().refine(isValidPassword, "Password doesn't meet all requirements"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

export default function SignupScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setServerError(null);

    // Normalize whatever format the user typed (dashes, parens, +1, none of
    // the above) to E.164 — this is what ends up in `profiles.phone` and
    // later in Alpaca's KYC payload, which expects a clean phone number.
    const digits = values.phone.replace(/\D/g, "");
    const normalizedPhone = `+${digits.length === 11 ? digits : `1${digits}`}`;

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { first_name: values.firstName, last_name: values.lastName, phone: normalizedPhone },
      },
    });

    setSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    // Supabase deliberately returns a 200 with a fake user object instead of
    // an error when the email already belongs to a confirmed account — this
    // stops attackers from probing which emails are registered. The one
    // documented tell is an empty `identities` array (a real new signup
    // always has exactly one, for the email provider). Without this check,
    // the UI would claim "check your email for a code" even though Supabase
    // silently sent nothing, leaving the user waiting on an email that will
    // never arrive.
    if (data.user?.identities?.length === 0) {
      setServerError("This email is already registered. Try logging in instead.");
      return;
    }
    if (!data.session) {
      // Email confirmation is required before Supabase issues a session.
      // Route to a typed-code screen rather than relying on the emailed
      // magic link — that link points at whatever Site URL is configured
      // (e.g. localhost during dev), which is dead on arrival if the email
      // is opened on a different device. A 6-digit code works from anywhere.
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      return;
    }
    // A session was issued immediately — the root layout's auth-state
    // listener picks it up and redirects to onboarding automatically.
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="firstName"
          render={({ field }) => (
            <FormField
              label="First name"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.firstName?.message}
              autoComplete="given-name"
            />
          )}
        />
        <Controller
          control={control}
          name="lastName"
          render={({ field }) => (
            <FormField
              label="Last name"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.lastName?.message}
              autoComplete="family-name"
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <FormField
              label="Phone"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.phone?.message}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="5551234567"
            />
          )}
        />
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
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <>
              <FormField
                label="Password"
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
              label="Confirm password"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.confirmPassword?.message}
              secureTextEntry
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
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/login")}>
          <Text style={styles.link}>Already have an account? Log in</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 24, paddingTop: 32 },
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
  link: { fontFamily: fonts.body, color: colors.paperDim, fontSize: 14, textAlign: "center", marginTop: 20 },
});
