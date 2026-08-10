import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "../../../lib/api";
import {
  bracketLabel,
  employmentStatusLabel,
  maritalStatusLabel,
  timeHorizonLabel,
} from "../../../lib/financialProfile";
import { colors, fonts, labelCaps } from "../../../lib/theme";
import { supabase } from "../../../lib/supabase";

type Profile = { first_name: string | null; last_name: string | null; phone: string | null };
type InvestorProfile = {
  annual_income_min: number;
  annual_income_max: number;
  total_net_worth_min: number;
  total_net_worth_max: number;
  liquid_net_worth_min: number;
  liquid_net_worth_max: number;
  time_horizon: string;
  employment_status: string;
  employer_name: string | null;
  marital_status: string;
};
type KycDetails = {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  dateOfBirth: string | null;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

/**
 * Read-only for now (editing comes later). Address and date of birth are
 * deliberately NOT stored in our database (CLAUDE.md §2/§9) — they're
 * fetched live from Alpaca via /api/me/kyc-details when this screen opens,
 * and never cached. SSN is never fetched or displayed at all.
 */
export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [investor, setInvestor] = useState<InvestorProfile | null>(null);
  const [kyc, setKyc] = useState<KycDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [kycError, setKycError] = useState(false);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLoading(false);
      return;
    }
    setEmail(session.user.email ?? null);

    const [profileRes, investorRes] = await Promise.all([
      supabase.from("profiles").select("first_name, last_name, phone").eq("id", session.user.id).maybeSingle(),
      supabase.from("investor_profiles").select("*").eq("user_id", session.user.id).maybeSingle(),
    ]);
    setProfile(profileRes.data);
    setInvestor(investorRes.data as InvestorProfile | null);

    try {
      const res = await apiFetch("/api/me/kyc-details");
      if (res.ok) setKyc(await res.json());
      else setKycError(true);
    } catch {
      setKycError(true);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const address = kyc
    ? [kyc.streetAddress, kyc.city, [kyc.state, kyc.postalCode].filter(Boolean).join(" "), kyc.country]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Personal</Text>
        <Row label="Name" value={[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")} />
        <Row label="Email" value={email} />
        <Row label="Phone" value={profile?.phone} />
        <Row label="Date of birth" value={kyc?.dateOfBirth} />
        <Row label="Address" value={address} />
        {kycError ? (
          <Text style={styles.note}>Couldn&apos;t load your address and date of birth right now.</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Investment Profile</Text>
        <Row
          label="Annual net income"
          value={bracketLabel(investor?.annual_income_min, investor?.annual_income_max)}
        />
        <Row
          label="Total net worth"
          value={bracketLabel(investor?.total_net_worth_min, investor?.total_net_worth_max)}
        />
        <Row
          label="Liquid net worth"
          value={bracketLabel(investor?.liquid_net_worth_min, investor?.liquid_net_worth_max)}
        />
        <Row label="Time horizon" value={investor ? timeHorizonLabel(investor.time_horizon) : "—"} />

        <Text style={styles.sectionTitle}>Employment</Text>
        <Row label="Status" value={investor ? employmentStatusLabel(investor.employment_status) : "—"} />
        <Row label="Employer" value={investor?.employer_name} />

        <Text style={styles.sectionTitle}>About You</Text>
        <Row label="Marital status" value={investor ? maritalStatusLabel(investor.marital_status) : "—"} />

        <Text style={styles.note}>
          These details can&apos;t be edited here yet. Your Social Security number is held only by our
          broker, never by us.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingBottom: 48 },
  sectionTitle: {
    ...labelCaps,
    fontSize: 12,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
    gap: 16,
  },
  rowLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim },
  rowValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.paper, flexShrink: 1, textAlign: "right" },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, paddingHorizontal: 24, paddingTop: 16, lineHeight: 19 },
});
