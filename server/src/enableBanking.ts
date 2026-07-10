import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config, loadPrivateKey } from "./config";

/**
 * Minimal Enable Banking API client.
 *
 * Auth model: every request carries a short-lived RS256 JWT signed with the
 * application's private key. The JWT header's `kid` is the application ID; the
 * body identifies Enable Banking as the audience. See:
 *   https://enablebanking.com/docs/api/reference/
 *   https://github.com/enablebanking/enablebanking-api-samples
 */

const privateKey = loadPrivateKey();

/** Build a signed bearer token valid for a short window. */
function makeJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 3600, // 1 hour
    },
    privateKey,
    {
      algorithm: "RS256",
      header: { alg: "RS256", typ: "JWT", kid: config.appId },
    },
  );
}

async function ebFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const body = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const detail =
      body && typeof body === "object" ? JSON.stringify(body) : text;
    throw new EbApiError(
      `Enable Banking ${init.method || "GET"} ${path} failed: ${res.status} ${res.statusText} — ${detail}`,
      res.status,
      body,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class EbApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "EbApiError";
  }
}

// --- API surface -----------------------------------------------------------

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  [k: string]: unknown;
}

/** List the banks (ASPSPs) available for a country. */
export async function getAspsps(country = config.country): Promise<Aspsp[]> {
  const data = await ebFetch<{ aspsps: Aspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country)}`,
  );
  return data.aspsps || [];
}

/**
 * Start a bank authorization. Returns the URL to send the user to (where they
 * approve access — on mobile this hands off to the bank app + Face ID) plus the
 * `state` we generated so the callback can be correlated.
 */
export async function startAuth(params: {
  aspspName: string;
  country?: string;
  psuType?: "personal" | "business";
  validForDays?: number;
}): Promise<{ url: string; authorization_id?: string; state: string }> {
  const state = randomUUID();
  const validUntil = new Date(
    Date.now() + (params.validForDays ?? 90) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const data = await ebFetch<{ url: string; authorization_id?: string }>(
    "/auth",
    {
      method: "POST",
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: params.aspspName, country: params.country ?? config.country },
        state,
        redirect_url: config.redirectUrl,
        psu_type: params.psuType ?? "personal",
      }),
    },
  );

  return { ...data, state };
}

export interface EbAccount {
  uid: string;
  name?: string;
  product?: string;
  cash_account_type?: string;
  currency?: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  [k: string]: unknown;
}

/** Exchange the `code` from the redirect for a session + its accounts. */
export async function createSession(code: string): Promise<{
  session_id: string;
  accounts: EbAccount[];
  aspsp?: { name?: string; country?: string };
  access?: { valid_until?: string };
}> {
  return ebFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/** Balances for one account. */
export async function getAccountBalances(uid: string): Promise<any[]> {
  const data = await ebFetch<{ balances: any[] }>(
    `/accounts/${encodeURIComponent(uid)}/balances`,
  );
  return data.balances || [];
}

/** Transactions for one account, optionally from a date (YYYY-MM-DD). */
export async function getAccountTransactions(
  uid: string,
  dateFrom?: string,
): Promise<any[]> {
  const qs = dateFrom ? `?date_from=${encodeURIComponent(dateFrom)}` : "";
  const data = await ebFetch<{ transactions: any[] }>(
    `/accounts/${encodeURIComponent(uid)}/transactions${qs}`,
  );
  return data.transactions || [];
}
