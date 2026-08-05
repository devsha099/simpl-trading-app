import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { supabase } from "../../lib/supabase";

const schema = z
  .object({
    firstName: z.string().min(1, "Enter your first name"),
    lastName: z.string().min(1, "Enter your last name"),
    phone: z.string().min(7, "Enter a valid phone number"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
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
    setInfoMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { first_name: values.firstName, last_name: values.lastName, phone: values.phone },
      },
    });

    setSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is required before Supabase issues a session.
      setInfoMessage("Check your email to confirm your account, then log in.");
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
              placeholder="+15551234567"
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
            <FormField
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.password?.message}
              secureTextEntry
              autoComplete="new-password"
            />
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
        {infoMessage ? <Text style={styles.infoMessage}>{infoMessage}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
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
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 24, paddingTop: 32 },
  serverError: { color: "#b91c1c", fontSize: 14, marginBottom: 12 },
  infoMessage: { color: "#111827", fontSize: 14, marginBottom: 12 },
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
