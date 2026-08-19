import "server-only";

import { accountId } from "./config";

/**
 * The only place a Cloudflare bearer token is attached to a request.
 *
 * Uses native fetch. No SDK is installed: the surface we need is five REST
 * calls, and an SDK would add a dependency that can read our token without
 * offering any security or correctness advantage over an explicit request.
 *
 * WHAT NEVER LEAVES THIS MODULE
 *   The token is passed to fetch and referenced nowhere else. Errors thrown
 *   from here carry a sanitized code and the HTTP status — never the
 *   Authorization header, never the response body, never a one-time upload
 *   URL, never a signed delivery URL. Cloudflare error bodies can echo request
 *   content, so they are read only to extract documented error codes and are
 *   otherwise discarded.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

/** A failure that is safe to log and safe to surface internally. */
export class CloudflareApiError extends Error {
  readonly status: number;
  /** Documented Cloudflare error codes only — never free-text detail. */
  readonly providerErrorCodes: readonly number[];

  constructor(operation: string, status: number, providerErrorCodes: readonly number[]) {
    super(
      `Cloudflare ${operation} failed with status ${status}` +
        (providerErrorCodes.length > 0 ? ` (codes: ${providerErrorCodes.join(",")})` : ""),
    );
    this.name = "CloudflareApiError";
    this.status = status;
    this.providerErrorCodes = providerErrorCodes;
  }
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
}

/**
 * Extracts only the numeric error codes. Messages are deliberately dropped:
 * Cloudflare's error text can quote back parts of the request, and this value
 * ends up in logs.
 */
function safeErrorCodes(body: unknown): number[] {
  const errors = (body as CloudflareEnvelope<unknown> | null)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((e) => (typeof e?.code === "number" ? e.code : null))
    .filter((c): c is number => c !== null)
    .slice(0, 5);
}

interface RequestOptions {
  operation: string;
  token: string;
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  body?: unknown;
  /** Bounded so a hung provider cannot hold a Server Action open. */
  timeoutMs?: number;
}

export async function cloudflareRequest<T>(options: RequestOptions): Promise<T> {
  const { operation, token, method, path, body, timeoutMs = 10_000 } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    // Network failure or timeout. The cause is deliberately not attached: an
    // abort/DNS error can contain the full URL, and callers only need to know
    // the operation did not complete.
    throw new CloudflareApiError(operation, 0, []);
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok || (parsed as CloudflareEnvelope<T> | null)?.success !== true) {
    throw new CloudflareApiError(operation, response.status, safeErrorCodes(parsed));
  }

  return (parsed as CloudflareEnvelope<T>).result;
}

/** Path helper so no caller assembles an account path by hand. */
export function accountPath(suffix: string): string {
  return `/accounts/${accountId()}${suffix}`;
}
