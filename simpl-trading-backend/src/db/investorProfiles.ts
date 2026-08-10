import { getSupabaseAdmin } from "../supabase.js";

export type InvestorProfileInput = {
  annualIncomeMin: number;
  annualIncomeMax: number;
  totalNetWorthMin: number;
  totalNetWorthMax: number;
  liquidNetWorthMin: number;
  liquidNetWorthMax: number;
  timeHorizon: string;
  employmentStatus: string;
  employerName: string | null;
  maritalStatus: string;
};

export async function getInvestorProfileForUser(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("investor_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Written only after Alpaca accepts the same data — see routes/me/investmentProfile.ts. */
export async function saveInvestorProfileForUser(userId: string, input: InvestorProfileInput): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("investor_profiles")
    .upsert({
      user_id: userId,
      annual_income_min: input.annualIncomeMin,
      annual_income_max: input.annualIncomeMax,
      total_net_worth_min: input.totalNetWorthMin,
      total_net_worth_max: input.totalNetWorthMax,
      liquid_net_worth_min: input.liquidNetWorthMin,
      liquid_net_worth_max: input.liquidNetWorthMax,
      time_horizon: input.timeHorizon,
      employment_status: input.employmentStatus,
      employer_name: input.employerName,
      marital_status: input.maritalStatus,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}
