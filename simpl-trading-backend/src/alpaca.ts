import { config } from "./config.js";

/**
 * Thin wrapper around Alpaca's Broker API.
 *
 * Auth: HTTP Basic — key ID as username, secret as password, base64-encoded.
 * This header is built once and reused. It lives ONLY on the server.
 */
const AUTH_HEADER =
  "Basic " +
  Buffer.from(`${config.alpacaKeyId}:${config.alpacaSecret}`).toString("base64");

export class AlpacaError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Alpaca API error (${status})`);
    this.name = "AlpacaError";
    this.status = status;
    this.body = body;
  }
}

async function alpacaFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${config.alpacaBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();

  // Alpaca normally returns JSON, but guard against empty or non-JSON bodies
  // (e.g. gateway errors) so a parse failure never becomes an opaque 500.
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    throw new AlpacaError(res.status, body);
  }
  return body;
}

export const alpaca = {
  /** GET /v1/accounts — lists broker accounts. Empty [] on a fresh sandbox. */
  listAccounts: () => alpacaFetch("/v1/accounts"),

  /** GET /v1/accounts/{id} — fetch one account. */
  getAccount: (id: string) => alpacaFetch(`/v1/accounts/${id}`),

  /** POST /v1/accounts — open a brokerage account for an end user. */
  createAccount: (payload: unknown) =>
    alpacaFetch("/v1/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /v1/trading/accounts/{id}/account — cash, buying power, equity. */
  getTradingAccount: (accountId: string) =>
    alpacaFetch(`/v1/trading/accounts/${accountId}/account`),

  /** GET /v1/accounts/{id}/ach_relationships — existing bank links. */
  listAchRelationships: (accountId: string) =>
    alpacaFetch(`/v1/accounts/${accountId}/ach_relationships`),

  /** POST /v1/accounts/{id}/ach_relationships — create a (sandbox) bank link. */
  createAchRelationship: (accountId: string, payload: unknown) =>
    alpacaFetch(`/v1/accounts/${accountId}/ach_relationships`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** POST /v1/accounts/{id}/transfers — deposit/withdraw. Sandbox: instant. */
  createTransfer: (accountId: string, payload: unknown) =>
    alpacaFetch(`/v1/accounts/${accountId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /v1/trading/accounts/{id}/positions — holdings for one account. */
  getPositions: (accountId: string) =>
    alpacaFetch(`/v1/trading/accounts/${accountId}/positions`),

  /** POST /v1/trading/accounts/{id}/orders — place an order for one account. */
  createOrder: (accountId: string, order: unknown) =>
    alpacaFetch(`/v1/trading/accounts/${accountId}/orders`, {
      method: "POST",
      body: JSON.stringify(order),
    }),
};
