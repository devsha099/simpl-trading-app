import { zodResolver } from "@hookform/resolvers/zod";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { ToggleField } from "../../components/ToggleField";
import { useAuthStateContext } from "../../context/AuthStateContext";
import { API_BASE } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { US_STATES } from "../../lib/usStates";

// v1 simplification: one "country" field doubles as citizenship, birth, and
// tax-residence country on submit — matches the shape already proven against
// the Alpaca sandbox (routes/alpaca.ts's /test-account). Revisit for
// non-US users. Funding source defaults to "employment_income" server-side.
//
// Mirrors the backend's schemas/onboarding.ts validation (state enum, ZIP
// format, length bounds) so bad input is caught here with an immediate
// message instead of round-tripping to the server first. The backend copy is
// still the real boundary — this is only ever a UX shortcut, since a client
// can always send whatever it wants directly to the API.
const schema = z.object({
  streetAddress: z.string().trim().min(1, "Enter your street address").max(100),
  city: z.string().trim().min(1, "Enter your city").max(100),
  state: z.string().min(1, "Select your state"),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP or ZIP+4"),
  country: z.string().length(3, "3-letter code, e.g. USA"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  taxId: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, "Enter a valid 9-digit SSN"),
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
  const { refresh } = useAuthStateContext();
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

      // Completing onboarding isn't a Supabase auth event, so the shared
      // auth state (which the root layout's guard routes on) doesn't know
      // anything changed yet. Refresh it BEFORE navigating — otherwise the
      // guard re-runs on the route change with its old "needs-onboarding"
      // value and immediately bounces this navigation right back here.
      await refresh();
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
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>State</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={field.value} onValueChange={field.onChange}>
                  <Picker.Item label="Select a state..." value="" />
                  {US_STATES.map((s) => (
                    <Picker.Item key={s.code} label={`${s.name} (${s.code})`} value={s.code} />
                  ))}
                </Picker>
              </View>
              {errors.state ? <Text style={styles.pickerError}>{errors.state.message}</Text> : null}
            </View>
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
              keyboardType="numbers-and-punctuation"
              placeholder="12345"
              maxLength={10}
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
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  pickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    overflow: "hidden",
  },
  pickerError: { fontSize: 12, color: "#b91c1c", marginTop: 4 },
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
