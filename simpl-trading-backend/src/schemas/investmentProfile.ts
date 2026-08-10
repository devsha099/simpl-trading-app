import { z } from "zod";
import {
  EMPLOYMENT_STATUSES,
  FINANCIAL_BRACKETS,
  MARITAL_STATUSES,
  TIME_HORIZONS,
} from "../data/financialProfile.js";

const bracketLabels = FINANCIAL_BRACKETS.map((b) => b.label) as [string, ...string[]];
const timeHorizonValues = TIME_HORIZONS.map((t) => t.value) as [string, ...string[]];
const employmentValues = EMPLOYMENT_STATUSES.map((e) => e.value) as [string, ...string[]];
const maritalValues = MARITAL_STATUSES.map((m) => m.value) as [string, ...string[]];

export const investmentProfileSchema = z
  .object({
    annualIncomeBracket: z.enum(bracketLabels),
    totalNetWorthBracket: z.enum(bracketLabels),
    liquidNetWorthBracket: z.enum(bracketLabels),
    timeHorizon: z.enum(timeHorizonValues),
    employmentStatus: z.enum(employmentValues),
    employerName: z.string().trim().max(100).optional(),
    maritalStatus: z.enum(maritalValues),
  })
  .refine((data) => data.employmentStatus !== "EMPLOYED" || !!data.employerName, {
    message: "Employer name is required when employed.",
    path: ["employerName"],
  });

export type InvestmentProfileInput = z.infer<typeof investmentProfileSchema>;
