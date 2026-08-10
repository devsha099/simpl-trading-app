import type { FastifyInstance } from "fastify";
import { alpaca } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser } from "../../db/accounts.js";
import { saveInvestorProfileForUser } from "../../db/investorProfiles.js";
import { FINANCIAL_BRACKETS } from "../../data/financialProfile.js";
import { investmentProfileSchema } from "../../schemas/investmentProfile.js";

function bracketByLabel(label: string) {
  const bracket = FINANCIAL_BRACKETS.find((b) => b.label === label);
  if (!bracket) throw new Error(`Unknown financial bracket: ${label}`);
  return bracket;
}

/**
 * Submitted right after KYC (see the router state machine's
 * "needs-investment-profile" status in useAuthState.ts), while the Alpaca
 * account is still SUBMITTED — this is what's shown INSTEAD of the pending
 * screen for that step, not an optional add-on.
 */
export async function investmentProfileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/investment-profile", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.id;

    const account = await getAccountForUser(userId);
    if (!account) {
      return reply.code(400).send({ error: "not_onboarded", message: "Complete KYC before this step." });
    }

    const parsed = investmentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const input = parsed.data;

    const annualIncome = bracketByLabel(input.annualIncomeBracket);
    const totalNetWorth = bracketByLabel(input.totalNetWorthBracket);
    const liquidNetWorth = bracketByLabel(input.liquidNetWorthBracket);

    // Push to Alpaca first — if it rejects the update, don't save a local
    // copy that would then be out of sync with what Alpaca actually has.
    await alpaca.updateAccount(account.alpacaAccountId, {
      identity: {
        marital_status: input.maritalStatus,
        annual_income_min: annualIncome.min,
        annual_income_max: annualIncome.max,
        total_net_worth_min: totalNetWorth.min,
        total_net_worth_max: totalNetWorth.max,
        liquid_net_worth_min: liquidNetWorth.min,
        liquid_net_worth_max: liquidNetWorth.max,
      },
      disclosures: {
        employment_status: input.employmentStatus,
        employer_name: input.employerName,
      },
    });

    await saveInvestorProfileForUser(userId, {
      annualIncomeMin: annualIncome.min,
      annualIncomeMax: annualIncome.max,
      totalNetWorthMin: totalNetWorth.min,
      totalNetWorthMax: totalNetWorth.max,
      liquidNetWorthMin: liquidNetWorth.min,
      liquidNetWorthMax: liquidNetWorth.max,
      timeHorizon: input.timeHorizon,
      employmentStatus: input.employmentStatus,
      employerName: input.employerName ?? null,
      maritalStatus: input.maritalStatus,
    });

    return reply.code(200).send({ ok: true });
  });
}
