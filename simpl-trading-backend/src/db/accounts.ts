import { getSupabaseAdmin } from "../supabase.js";

export type AlpacaAccountRow = {
  alpacaAccountId: string;
  accountStatus: string;
};

/** Look up a user's Alpaca account id + status. Null if they haven't onboarded yet. */
export async function getAccountForUser(userId: string): Promise<AlpacaAccountRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("alpaca_accounts")
    .select("alpaca_account_id, account_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { alpacaAccountId: data.alpaca_account_id, accountStatus: data.account_status };
}

/** Save the Alpaca account created during onboarding. One row per user. */
export async function saveAccountForUser(
  userId: string,
  alpacaAccountId: string,
  accountStatus: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("alpaca_accounts")
    .insert({ user_id: userId, alpaca_account_id: alpacaAccountId, account_status: accountStatus });

  if (error) throw error;
}

/** Update the status of an already-saved account (e.g. after re-checking with Alpaca). */
export async function updateAccountStatus(userId: string, accountStatus: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("alpaca_accounts")
    .update({ account_status: accountStatus })
    .eq("user_id", userId);

  if (error) throw error;
}
