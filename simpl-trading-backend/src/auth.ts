import type { FastifyReply, FastifyRequest } from "fastify";
import { getSupabaseAdmin } from "./supabase.js";

export type AuthedUser = { id: string; email: string | undefined };

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

/**
 * preHandler for every /api/me/* route: verifies the Supabase session token
 * the app sent and attaches the user to the request. Routes then derive the
 * Alpaca account id from `req.user.id` via db/accounts.ts — NEVER from
 * anything the client sends directly (see CLAUDE.md's security boundary).
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return reply.code(401).send({ error: "unauthorized", message: "Missing bearer token." });
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    return reply.code(401).send({ error: "unauthorized", message: "Invalid or expired session." });
  }

  req.user = { id: data.user.id, email: data.user.email };
}
