import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { ToggleField } from "../../components/ToggleField";
import { API_BASE } from "../../lib/api";
import { supabase } from "../../lib/supabase";

// v1 simplification: one "country" field doubles as citizenship, birth, and
// tax-residence country on submit — matches the shape already proven against
// the Alpaca sandbox (routes/alpaca.ts's /test-account). Revisit for
// non-US users. Funding source defaults to "employment_income" server-side.
const schema = z.object({
  streetAddress: z.string().min(1, "Enter your street address"),
  city: z.string().min(1, "Enter your city"),
  state: z.string().min(1, "Enter your state"),
  postalCode: z.string().min(1, "Enter your postal code"),
  country: z.string().length(3, "3-letter code, e.g. USA"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  taxId: z.string().min(9, "Enter a valid SSN"),
  countryOfCitizenship: z.string().length(3, "3-letter code, e.g. USA"),
  isControlPerson: z.boolean(),
  isAffiliatedExchangeOrFinra: z.boolean(),
  isPoliticallyExposed: z.boolean(),
  immediateFamilyExposed: z.boolean(),
  agreedToCustomerAgreement: z.boolean().refine((v) => v === true, {
    message: "You must agree to continue.",
  }),
});
type FormValues = z.infer<typeof schema>;

export default function OnboardingScreen() {
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
      streetAddress: "",
      city: "",
      state: "",
      postalCode: "",
      country: "USA",
      dateOfBirth: "",
      taxId: "",
      countryOfCitizenship: "USA",
      isControlPerson: false,
      isAffiliatedExchangeOrFinra: false,
      isPoliticallyExposed: false,
      immediateFamilyExposed: false,
      agreedToCustomerAgreement: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setServerError("Your session expired. Please log in again.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/me/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          streetAddress: [values.streetAddress],
          city: values.city,
          state: values.state,
          postalCode: values.postalCode,
          country: values.country.toUpperCase(),
          dateOfBirth: values.dateOfBirth,
          taxId: values.taxId,
          countryOfCitizenship: values.countryOfCitizenship.toUpperCase(),
          isControlPerson: values.isControlPerson,
          isAffiliatedExchangeOrFinra: values.isAffiliatedExchangeOrFinra,
          isPoliticallyExposed: values.isPoliticallyExposed,
          immediateFamilyExposed: values.immediateFamilyExposed,
          agreedToCustomerAgreement: values.agreedToCustomerAgreement,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setServerError(body?.message ?? "Something went wrong submitting your application.");
        return;
      }

      router.replace(body?.status === "ACTIVE" ? "/watchlists" : "/pending");
    } catch (e) {
      setServerError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Address</Text>
        <Controller
          control={control}
          name="streetAddress"
          render={({ field }) => (
            <FormField
              label="Street address"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.streetAddress?.message}
              autoComplete="street-address"
            />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <FormField
              label="City"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.city?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({ field }) => (
            <FormField
              label="State"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.state?.message}
              placeholder="CA"
              autoCapitalize="characters"
            />
          )}
        />
        <Controller
          control={control}
          name="postalCode"
          render={({ field }) => (
            <FormField
              label="Postal code"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.postalCode?.message}
              keyboardType="number-pad"
            />
          )}
        />
        <Controller
          control={control}
          name="country"
          render={({ field }) => (
            <FormField
              label="Country"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.country?.message}
              autoCapitalize="characters"
              maxLength={3}
            />
          )}
        />

        <Text style={styles.sectionTitle}>Identity</Text>
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field }) => (
            <FormField
              label="Date of birth"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.dateOfBirth?.message}
              placeholder="1990-01-01"
              keyboardType="numbers-and-punctuation"
            />
          )}
        />
        <Controller
          control={control}
          name="taxId"
          render={({ field }) => (
            <FormField
              label="Social Security Number"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.taxId?.message}
              placeholder="123-45-6789"
              secureTextEntry
            />
          )}
        />
        <Controller
          control={control}
          name="countryOfCitizenship"
          render={({ field }) => (
            <FormField
              label="Country of citizenship"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.countryOfCitizenship?.message}
              autoCapitalize="characters"
              maxLength={3}
            />
          )}
        />

        <Text style={styles.sectionTitle}>Disclosures</Text>
        <Controller
          control={control}
          name="isControlPerson"
          render={({ field }) => (
            <ToggleField
              label="I am a control person or senior executive of a publicly traded company."
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="isAffiliatedExchangeOrFinra"
          render={({ field }) => (
            <ToggleField
              label="I am affiliated with a stock exchange or FINRA member firm."
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="isPoliticallyExposed"
          render={({ field }) => (
            <ToggleField
              label="I am a politically exposed person."
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="immediateFamilyExposed"
          render={({ field }) => (
            <ToggleField
              label="An immediate family member is politically exposed."
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />

        <Text style={styles.sectionTitle}>Agreement</Text>
        <Controller
          control={control}
          name="agreedToCustomerAgreement"
          render={({ field }) => (
            <ToggleField
              label="I agree to Alpaca's Customer Agreement."
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
        {errors.agreedToCustomerAgreement ? (
          <Text style={styles.fieldError}>{errors.agreedToCustomerAgreement.message}</Text>
        ) : null}

        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Submit</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 24, paddingTop: 16, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 12,
  },
  fieldError: { fontSize: 12, color: "#b91c1c", marginTop: -8, marginBottom: 12 },
  serverError: { color: "#b91c1c", fontSize: 14, marginTop: 16, marginBottom: 4 },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
