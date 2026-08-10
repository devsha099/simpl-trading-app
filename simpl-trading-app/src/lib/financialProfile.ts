/**
 * Investment-profile questionnaire options. Mirrors (not shares)
 * simpl-trading-backend/src/data/financialProfile.ts — two separate npm
 * projects, no shared package. The backend validates against its own copy,
 * so these two lists must stay in sync.
 */
export const FINANCIAL_BRACKETS = [
  "Under $25,000",
  "$25,000 – $50,000",
  "$50,000 – $100,000",
  "$100,000 – $200,000",
  "$200,000 – $500,000",
  "$500,000 – $1,000,000",
  "Over $1,000,000",
] as const;

export const TIME_HORIZONS = [
  { value: "SHORT_TERM", label: "Short-term (under 3 years)" },
  { value: "MEDIUM_TERM", label: "Medium-term (3–10 years)" },
  { value: "LONG_TERM", label: "Long-term (10+ years)" },
] as const;

export const EMPLOYMENT_STATUSES = [
  { value: "EMPLOYED", label: "Employed" },
  { value: "UNEMPLOYED", label: "Unemployed" },
  { value: "RETIRED", label: "Retired" },
  { value: "STUDENT", label: "Student" },
] as const;

export const MARITAL_STATUSES = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "DIVORCED", label: "Divorced" },
  { value: "WIDOWED", label: "Widowed" },
] as const;

const labelFrom = (options: readonly { value: string; label: string }[], value: string | null | undefined) =>
  options.find((o) => o.value === value)?.label ?? value ?? "—";

export const timeHorizonLabel = (v: string | null | undefined) => labelFrom(TIME_HORIZONS, v);
export const employmentStatusLabel = (v: string | null | undefined) => labelFrom(EMPLOYMENT_STATUSES, v);
export const maritalStatusLabel = (v: string | null | undefined) => labelFrom(MARITAL_STATUSES, v);

/** Renders a stored min/max pair back into its bracket label for display. */
export function bracketLabel(min: number | null | undefined, max: number | null | undefined): string {
  if (min === null || min === undefined || max === null || max === undefined) return "—";
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (min === 0) return `Under ${fmt(max)}`;
  if (max >= 100_000_000) return `Over ${fmt(min)}`;
  return `${fmt(min)} – ${fmt(max)}`;
}
