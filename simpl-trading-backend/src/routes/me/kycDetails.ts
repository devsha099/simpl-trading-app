import type { FastifyInstance } from "fastify";
import { alpaca } from "../../alpaca.js";
import { requireAuth } from "../../auth.js";
import { getAccountForUser } from "../../db/accounts.js";

type AlpacaAccountDetails = {
  identity?: { date_of_birth?: string };
  contact?: {
    street_address?: string[];
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
};

/**
 * On-demand live lookup of the KYC fields we deliberately never store in
 * our own DB (address, DOB — see CLAUDE.md §2/§9's "never store KYC PII").
 * Called only when the Settings > Profile screen is opened, not eagerly.
 * Returns ONLY these specific fields — never the raw Alpaca account
 * response, which also includes tax_id/SSN.
 */
export async function kycDetailsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/kyc-details", { preHandler: requireAuth }, async (req, reply) => {
    const account = await getAccountForUser(req.user!.id);
    if (!account) return reply.code(404).send({ error: "not_onboarded" });

    const details = (await alpaca.getAccount(account.alpacaAccountId)) as AlpacaAccountDetails;

    return reply.code(200).send({
      streetAddress: details.contact?.street_address?.[0] ?? null,
      city: details.contact?.city ?? null,
      state: details.contact?.state ?? null,
      postalCode: details.contact?.postal_code ?? null,
      country: details.contact?.country ?? null,
      dateOfBirth: details.identity?.date_of_birth ?? null,
    });
  });
}
