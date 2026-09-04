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
  /**
   * GET /v1/assets — every active US-equity asset (~14k, ~13.3k tradable).
   * Not account-scoped; the caller (assetSearch.ts) caches this in memory
   * rather than fetching it per request.
   */
  listAssets: () => alpacaFetch("/v1/assets?status=active&asset_class=us_equity"),

  /** GET /v1/accounts/{id} — fetch one account. */
  getAccount: (id: string) => alpacaFetch(`/v1/accounts/${id}`),

  /** POST /v1/accounts — open a brokerage account for an end user. */
  createAccount: (payload: unknown) =>
    alpacaFetch("/v1/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** PATCH /v1/accounts/{id} — update identity/disclosures on an existing account. */
  updateAccount: (id: string, payload: unknown) =>
    alpacaFetch(`/v1/accounts/${id}`, {
      method: "PATCH",
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

  /**
   * DELETE /v1/accounts/{id}/ach_relationships/{relationshipId} — unlink a
   * bank. Alpaca allows only ONE active ACH relationship per account, so
   * "switch banks" is always delete-then-create. 204 on success.
   */
  deleteAchRelationship: (accountId: string, relationshipId: string) =>
    alpacaFetch(`/v1/accounts/${accountId}/ach_relationships/${relationshipId}`, {
      method: "DELETE",
    }),

  /** POST /v1/accounts/{id}/transfers — deposit/withdraw. Sandbox: instant. */
  createTransfer: (accountId: string, payload: unknown) =>
    alpacaFetch(`/v1/accounts/${accountId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /v1/accounts/{id}/transfers — deposit/withdrawal history. */
  listTransfers: (accountId: string, limit = 50) =>
    alpacaFetch(`/v1/accounts/${accountId}/transfers?limit=${limit}`),

  /**
   * DELETE /v1/accounts/{id}/transfers/{transferId} — cancel a transfer
   * that hasn't reached clearing yet (QUEUED/APPROVAL_PENDING/PENDING).
   * 204 on success, 404 if it's already past the point of no return.
   */
  cancelTransfer: (accountId: string, transferId: string) =>
    alpacaFetch(`/v1/accounts/${accountId}/transfers/${transferId}`, {
      method: "DELETE",
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

  /**
   * GET /v1/trading/accounts/{id}/orders — list orders. `status` is Alpaca's
   * own filter: "open" | "closed" | "all". Closed = filled/canceled/expired,
   * i.e. trade history; open = still working.
   *
   * `after` (ISO timestamp) narrows server-side. The round-trip counter passes
   * the start of the trading week so the 100-row cap can't silently truncate
   * the window it's counting over and under-report someone's usage.
   */
  getOrders: (accountId: string, status: "open" | "closed" | "all", after?: string) =>
    alpacaFetch(
      `/v1/trading/accounts/${accountId}/orders?status=${status}&limit=100` +
        (after ? `&after=${encodeURIComponent(after)}` : ""),
    ),
};
