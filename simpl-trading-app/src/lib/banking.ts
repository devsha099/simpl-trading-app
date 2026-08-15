import { colors } from "./theme";

/**
 * Shared shapes + display rules for the Banking screens. These mirror what
 * routes/me/banking.ts sends — the app never sees Alpaca relationship ids
 * or full bank account numbers (masked to last 4 server-side).
 */

export type BankView = {
  nickname: string;
  bankAccountType: "CHECKING" | "SAVINGS" | string;
  last4: string;
  status: string; // QUEUED | APPROVED | PENDING | ...
  createdAt: string | null;
};

export type TransferView = {
  id: string;
  direction: "deposit" | "withdraw";
  amount: string;
  status: "pending" | "complete" | "rejected" | "canceled";
  rawStatus: string;
  cancelable: boolean;
  reason: string | null;
  createdAt: string;
};

/** Status pill styling — semantic colors, never the brand amber for "good". */
export const TRANSFER_STATUS_DISPLAY: Record<
  TransferView["status"],
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: colors.amberSoft },
  complete: { label: "Complete", color: colors.phosphor },
  rejected: { label: "Rejected", color: colors.rust },
  canceled: { label: "Canceled", color: colors.paperDim },
};

/** "Savings ••8453" — how a linked bank reads everywhere it appears. */
export function bankLabel(bank: BankView): string {
  return `${bank.nickname} ••${bank.last4}`;
}

/** "#335725994 Cash Account" — how the user's own account reads. */
export function cashAccountLabel(accountNumber: string | undefined): string {
  return accountNumber ? `#${accountNumber} Cash Account` : "Cash Account";
}

/**
 * ABA routing-number checksum (3,7,1 weights, mod 10) — same rule the
 * backend enforces; running it client-side just catches typos before a
 * round trip.
 */
export function isValidRoutingNumber(routingNumber: string): boolean {
  if (!/^\d{9}$/.test(routingNumber)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = routingNumber
    .split("")
    .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
  return sum % 10 === 0;
}
