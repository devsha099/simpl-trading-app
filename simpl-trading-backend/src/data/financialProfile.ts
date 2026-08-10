/**
 * Investment-profile questionnaire options, collected right after KYC
 * onboarding. Mirrored (not shared) in simpl-trading-app/src/lib/financialProfile.ts.
 *
 * Income/net-worth brackets map to Alpaca's identity.annual_income_min/max
 * (and the liquid/total net worth equivalents), which are numeric ranges,
 * not free-form figures — the label is what the user sees, min/max is what
 * gets sent to Alpaca and stored locally.
 */
export const FINANCIAL_BRACKETS = [
  { label: "Under $25,000", min: 0, max: 25_000 },
  { label: "$25,000 – $50,000", min: 25_000, max: 50_000 },
  { label: "$50,000 – $100,000", min: 50_000, max: 100_000 },
  { label: "$100,000 – $200,000", min: 100_000, max: 200_000 },
  { label: "$200,000 – $500,000", min: 200_000, max: 500_000 },
  { label: "$500,000 – $1,000,000", min: 500_000, max: 1_000_000 },
  { label: "Over $1,000,000", min: 1_000_000, max: 100_000_000 },
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
