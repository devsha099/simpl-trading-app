import { z } from "zod";
import { US_STATE_CODES } from "../data/usStates.js";

/**
 * What the CLIENT submits for KYC. Deliberately does NOT include name, email,
 * or phone — those are already known from signup (profiles table / auth.users)
 * and the backend fills them in itself, so a client can't submit KYC under a
 * different identity than the one it signed up with.
 *
 * v1 simplification: citizenship/birth/tax-residence country are collapsed
 * into one `countryOfCitizenship` field (the backend applies it to all
 * three), and funding_source defaults to "employment_income" server-side —
 * both match the shape already proven against the Alpaca sandbox in
 * routes/alpaca.ts's /test-account route. Revisit if non-US users or other
 * funding sources become relevant.
 */
export const onboardingSchema = z.object({
  streetAddress: z.array(z.string().trim().min(1).max(100)).min(1).max(2),
  city: z.string().trim().min(1).max(100),
  state: z.enum([...US_STATE_CODES] as [string, ...string[]], {
    message: "Enter a valid US state",
  }),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP or ZIP+4"),
  country: z.string().length(3), // ISO 3166-1 alpha-3, e.g. "USA"
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  taxId: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, "Enter a valid 9-digit SSN"),
  countryOfCitizenship: z.string().length(3),
  isControlPerson: z.boolean(),
  isAffiliatedExchangeOrFinra: z.boolean(),
  isPoliticallyExposed: z.boolean(),
  immediateFamilyExposed: z.boolean(),
  agreedToCustomerAgreement: z
    .boolean()
    .refine((v) => v === true, { message: "You must agree to the customer agreement." }),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
