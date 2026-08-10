import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { z } from "zod";
import { FormField } from "../../components/FormField";
import { SelectField } from "../../components/SelectField";
import { useAuthStateContext } from "../../context/AuthStateContext";
import { API_BASE } from "../../lib/api";
import {
  EMPLOYMENT_STATUSES,
  FINANCIAL_BRACKETS,
  MARITAL_STATUSES,
  TIME_HORIZONS,
} from "../../lib/financialProfile";
import { colors, fonts } from "../../lib/theme";
import { supabase } from "../../lib/supabase";

const bracketOptions = FINANCIAL_BRACKETS.map((b) => ({ value: b, label: b }));

const schema = z
  .object({
    annualIncomeBracket: z.string().min(1, "Select a range"),
    totalNetWorthBracket: z.string().min(1, "Select a range"),
    liquidNetWorthBracket: z.string().min(1, "Select a range"),
    timeHorizon: z.string().min(1, "Select a time horizon"),
    employmentStatus: z.string().min(1, "Select your employment status"),
    employerName: z.string().trim().max(100).optional(),
    maritalStatus: z.string().min(1, "Select your marital status"),
  })
  .refine((data) => data.employmentStatus !== "EMPLOYED" || !!data.employerName, {
    message: "Enter your employer's name",
    path: ["employerName"],
  });
type FormValues = z.infer<typeof schema>;

/**
 * Shown after KYC submission INSTEAD of the pending screen, while Alpaca
 * reviews the account (see useAuthState's "needs-investment-profile"). Once
 * submitted, refresh() re-evaluates: if Alpaca has approved in the meantime
 * the user goes straight to the app, otherwise they land on /pending.
 */
export default function InvestmentProfileScreen() {
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
      annualIncomeBracket: "",
      totalNetWorthBracket: "",
      liquidNetWorthBracket: "",
      timeHorizon: "",
      employmentStatus: "",
      employerName: "",
      maritalStatus: "",
    },
  });

  const employmentStatus = useWatch({ control, name: "employmentStatus" });

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

      const res = await fetch(`${API_BASE}/api/me/investment-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...values,
          employerName: values.employmentStatus === "EMPLOYED" ? values.employerName : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setServerError(
          body?.details?.message ?? body?.message ?? "Something went wrong saving your answers.",
        );
        return;
      }

      await refresh();
      router.replace("/pending");
    } catch {
      setServerError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          While your account is being reviewed, tell us a bit about your finances. Your broker is
          required to collect this.
        </Text>

        <Text style={styles.sectionTitle}>Investment Profile</Text>
        <Controller
          control={control}
          name="annualIncomeBracket"
          render={({ field }) => (
            <SelectField
              label="Approximate annual net income"
              value={field.value}
              onValueChange={field.onChange}
              options={bracketOptions}
              placeholder="Select a range..."
              error={errors.annualIncomeBracket?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="totalNetWorthBracket"
          render={({ field }) => (
            <SelectField
              label="Approximate total net worth"
              value={field.value}
              onValueChange={field.onChange}
              options={bracketOptions}
              placeholder="Select a range..."
              error={errors.totalNetWorthBracket?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="liquidNetWorthBracket"
          render={({ field }) => (
            <SelectField
              label="Approximate liquid net worth"
              value={field.value}
              onValueChange={field.onChange}
              options={bracketOptions}
              placeholder="Select a range..."
              error={errors.liquidNetWorthBracket?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="timeHorizon"
          render={({ field }) => (
            <SelectField
              label="Time horizon"
              value={field.value}
              onValueChange={field.onChange}
              options={TIME_HORIZONS}
              placeholder="Select a time horizon..."
              error={errors.timeHorizon?.message}
            />
          )}
        />

        <Text style={styles.sectionTitle}>Employment</Text>
        <Controller
          control={control}
          name="employmentStatus"
          render={({ field }) => (
            <SelectField
              label="Employment status"
              value={field.value}
              onValueChange={field.onChange}
              options={EMPLOYMENT_STATUSES}
              placeholder="Select your status..."
              error={errors.employmentStatus?.message}
            />
          )}
        />
        {employmentStatus === "EMPLOYED" ? (
          <Controller
            control={control}
            name="employerName"
            render={({ field }) => (
              <FormField
                label="Employer name"
                value={field.value ?? ""}
                onChangeText={field.onChange}
                error={errors.employerName?.message}
              />
            )}
          />
        ) : null}

        <Text style={styles.sectionTitle}>About You</Text>
        <Controller
          control={control}
          name="maritalStatus"
          render={({ field }) => (
            <SelectField
              label="Marital status"
              value={field.value}
              onValueChange={field.onChange}
              options={MARITAL_STATUSES}
              placeholder="Select your status..."
              error={errors.maritalStatus?.message}
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
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 24, paddingTop: 16, paddingBottom: 48 },
  intro: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim, lineHeight: 21, marginBottom: 8 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.amber,
    marginTop: 16,
    marginBottom: 12,
  },
  serverError: { fontFamily: fonts.body, color: colors.rust, fontSize: 14, marginTop: 16, marginBottom: 4 },
  button: {
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 16 },
});
