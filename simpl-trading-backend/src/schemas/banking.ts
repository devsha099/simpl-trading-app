import { z } from "zod";

/**
 * ABA routing number checksum — every real US routing number satisfies
 * (3,7,1 weights repeating over its 9 digits) % 10 === 0. Catches typos
 * before the round-trip to Alpaca; Alpaca still validates for real.
 */
export function isValidRoutingNumber(routingNumber: string): boolean {
  if (!/^\d{9}$/.test(routingNumber)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = routingNumber
    .split("")
    .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
  return sum % 10 === 0;
}

/**
 * Linking a bank by typed routing + account number (Alpaca's manual ACH
 * relationship). account_owner_name is NOT accepted from the client — the
 * backend fills it from the signed-up profile, same rule as onboarding.
 * A Plaid processor-token path can be added later on the same endpoint.
 */
export const linkBankSchema = z.object({
  bankAccountType: z.enum(["CHECKING", "SAVINGS"]),
  routingNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Routing numbers are exactly 9 digits.")
    .refine(isValidRoutingNumber, "That doesn't look like a valid routing number."),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{4,17}$/, "Account numbers are 4–17 digits."),
  nickname: z.string().trim().min(1).max(40).optional(),
});

export type LinkBankInput = z.infer<typeof linkBankSchema>;

/**
 * Moving money. Directions are app-vocabulary ("deposit"/"withdraw"), not
 * Alpaca's INCOMING/OUTGOING — the route translates. Amount is a string of
 * dollars with at most 2 decimals, like everywhere else money crosses this
 * API (never floats).
 */
export const createTransferSchema = z.object({
  direction: z.enum(["deposit", "withdraw"]),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter a valid dollar amount.")
    .refine((a) => Number(a) > 0, "Amount must be more than $0."),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
