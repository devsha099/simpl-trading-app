import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";
import { FormField } from "../../../../components/FormField";
import { SelectField } from "../../../../components/SelectField";
import { apiFetch } from "../../../../lib/api";
import { bankLabel, isValidRoutingNumber, type BankView } from "../../../../lib/banking";
import { colors, fonts, labelCaps, radius } from "../../../../lib/theme";

const schema = z.object({
  bankAccountType: z.enum(["CHECKING", "SAVINGS"], {
    errorMap: () => ({ message: "Pick checking or savings." }),
  }),
  routingNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Routing numbers are exactly 9 digits.")
    .refine(isValidRoutingNumber, "That doesn't look like a valid routing number."),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{4,17}$/, "Account numbers are 4–17 digits."),
  nickname: z.string().trim().max(40).optional(),
});
type FormValues = z.infer<typeof schema>;

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
] as const;

/**
 * Add or remove the linked bank. Alpaca allows exactly one active ACH
 * relationship per brokerage account, so this screen is either "here's your
 * bank, remove it" or "add one" — never a list. Switching banks is remove
 * then add, and the copy says so.
 */
export default function BankScreen() {
  const router = useRouter();
  const [bank, setBank] = useState<BankView | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bankAccountType: "CHECKING", routingNumber: "", accountNumber: "", nickname: "" },
  });

  const load = useCallback(async () => {
    setServerError(null);
    try {
      const res = await apiFetch("/api/me/bank");
      if (!res.ok) throw new Error("Backend returned an error");
      setBank((await res.json()).bank);
    } catch {
      setServerError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const res = await apiFetch("/api/me/bank", {
        method: "POST",
        body: JSON.stringify({
          bankAccountType: values.bankAccountType,
          routingNumber: values.routingNumber,
          accountNumber: values.accountNumber,
          ...(values.nickname ? { nickname: values.nickname } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setServerError(data?.message ?? "Couldn't link that bank account.");
        return;
      }
      setBank((await res.json()).bank);
    } catch {
      setServerError("Couldn't reach the backend.");
    }
  };

  const removeBank = useCallback(async () => {
    setRemoving(true);
    setServerError(null);
    try {
      const res = await apiFetch("/api/me/bank", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setServerError(data?.message ?? "Couldn't remove that bank account.");
        return;
      }
      setBank(null);
    } catch {
      setServerError("Couldn't reach the backend.");
    } finally {
      setRemoving(false);
    }
  }, []);

  const confirmRemove = useCallback(() => {
    if (!bank) return;
    const message = `Remove ${bankLabel(bank)}? Pending transfers already on their way aren't affected.`;
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) removeBank();
      return;
    }
    Alert.alert("Remove bank account", message, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: removeBank },
    ]);
  }, [bank, removeBank]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  if (bank) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Linked Bank</Text>
          <View style={styles.bankCard}>
            <Text style={styles.bankName}>{bankLabel(bank)}</Text>
            <Text style={styles.bankSub}>
              {bank.bankAccountType === "SAVINGS" ? "Savings" : "Checking"} ·{" "}
              {bank.status === "APPROVED" ? "Verified" : "Verifying with your bank"}
            </Text>
          </View>

          {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

          <Text style={styles.body}>
            One bank account can be linked at a time. To use a different one, remove this account
            first, then add the new one.
          </Text>

          <Pressable
            style={[styles.dangerButton, removing && styles.buttonDisabled]}
            onPress={confirmRemove}
            disabled={removing}
          >
            {removing ? (
              <ActivityIndicator color={colors.rust} />
            ) : (
              <Text style={styles.dangerButtonText}>Remove Bank Account</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push("/account/banking/transfer?direction=deposit")}>
            <Text style={styles.link}>Transfer money instead</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>
          Link the bank account you&apos;ll use to fund your investing. It has to be in your own
          name — the same name on your Simpl account.
        </Text>

        <Controller
          control={control}
          name="bankAccountType"
          render={({ field }) => (
            <SelectField
              label="Account Type"
              value={field.value}
              onValueChange={field.onChange}
              options={ACCOUNT_TYPES}
              error={errors.bankAccountType?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="routingNumber"
          render={({ field }) => (
            <FormField
              label="Routing Number"
              value={field.value}
              onChangeText={(t) => field.onChange(t.replace(/\D/g, "").slice(0, 9))}
              error={errors.routingNumber?.message}
              keyboardType="number-pad"
              placeholder="9 digits"
            />
          )}
        />
        <Controller
          control={control}
          name="accountNumber"
          render={({ field }) => (
            <FormField
              label="Account Number"
              value={field.value}
              onChangeText={(t) => field.onChange(t.replace(/\D/g, "").slice(0, 17))}
              error={errors.accountNumber?.message}
              keyboardType="number-pad"
              placeholder="Your bank account number"
            />
          )}
        />
        <Controller
          control={control}
          name="nickname"
          render={({ field }) => (
            <FormField
              label="Nickname (optional)"
              value={field.value ?? ""}
              onChangeText={field.onChange}
              error={errors.nickname?.message}
              placeholder="Savings"
            />
          )}
        />

        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.buttonInk} />
          ) : (
            <Text style={styles.buttonText}>Link Bank Account</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Your bank details go straight to Alpaca, the regulated broker that holds your funds.
          Simpl never stores your account number — only the last four digits come back to this
          screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: 24, paddingTop: 20 },
  sectionLabel: { ...labelCaps, marginBottom: 10 },
  bankCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.inkRaised,
    padding: 18,
  },
  bankName: { fontFamily: fonts.bodySemiBold, fontSize: 17, color: colors.paper },
  bankSub: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, marginTop: 4 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.paperDim, marginBottom: 22 },
  serverError: { fontFamily: fonts.body, fontSize: 14, color: colors.rust, marginTop: 16 },
  button: {
    backgroundColor: colors.amber,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: colors.amber,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.buttonInk },
  dangerButton: {
    borderWidth: 1.5,
    borderColor: colors.rust,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  dangerButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.rust },
  link: { fontFamily: fonts.body, fontSize: 14, color: colors.amber, textAlign: "center", marginTop: 20 },
  footnote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.paperDim, marginTop: 24 },
});
