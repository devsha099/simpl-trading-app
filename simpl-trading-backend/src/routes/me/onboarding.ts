import type { FastifyInstance } from "fastify";
import { alpaca } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser, saveAccountForUser } from "../../db/accounts.js";
import { getSupabaseAdmin } from "../../supabase.js";
import { onboardingSchema } from "../../schemas/onboarding.js";

/**
 * User-aware routes under /api/me. Account id is ALWAYS derived from the
 * verified session (req.user.id), never from anything the client sends.
 */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Submit KYC, create the Alpaca cash account, and save only the id+status.
   * The request body is deliberately just the KYC-specific fields (see
   * schemas/onboarding.ts) — name/email/phone come from the already-signed-up
   * profile, not the client, so KYC can't be submitted under a different
   * identity than the account that's actually logged in.
   */
  app.post("/onboard", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.id;

    const existing = await getAccountForUser(userId);
    if (existing) {
      // Already onboarded — don't create a second Alpaca account. Just
      // report back where they stand (mirrors what the pending screen polls).
      return reply.code(200).send({ status: existing.accountStatus });
    }

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const input = parsed.data;

    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.first_name || !profile?.last_name || !profile?.phone) {
      return reply.code(400).send({
        error: "incomplete_profile",
        message: "Your profile is missing a name or phone number. Complete sign up first.",
      });
    }

    const payload = {
      contact: {
        email_address: req.user!.email,
        phone_number: profile.phone,
        street_address: input.streetAddress,
        city: input.city,
        state: input.state,
        postal_code: input.postalCode,
        country: input.country,
      },
      identity: {
        given_name: profile.first_name,
        family_name: profile.last_name,
        date_of_birth: input.dateOfBirth,
        // Normalize to NNN-NN-NNNN: the schema accepts the SSN with or
        // without dashes, but Alpaca expects the dashed format.
        tax_id: input.taxId.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3"),
        tax_id_type: "USA_SSN",
        country_of_citizenship: input.countryOfCitizenship,
        country_of_birth: input.countryOfCitizenship,
        country_of_tax_residence: input.countryOfCitizenship,
        funding_source: ["employment_income"],
      },
      disclosures: {
        is_control_person: input.isControlPerson,
        is_affiliated_exchange_or_finra: input.isAffiliatedExchangeOrFinra,
        is_politically_exposed: input.isPoliticallyExposed,
        immediate_family_exposed: input.immediateFamilyExposed,
      },
      agreements: [
        {
          agreement: "customer_agreement",
          signed_at: new Date().toISOString(),
          ip_address: req.ip,
        },
      ],
    };

    const account = (await alpaca.createAccount(payload)) as { id: string; status: string };
    await saveAccountForUser(userId, account.id, account.status);

    return reply.code(201).send({ status: account.status });
  });
}
