/**
 * Typed reader for the three Snap Camera Kit configuration values. Never
 * logs, returns, or otherwise exposes the actual values anywhere — only
 * reports which ones are present — so nothing calling this can accidentally
 * print a token into a report, error message, or log line.
 *
 * Each variable is referenced by its full literal name
 * (`process.env.NEXT_PUBLIC_...`), never through a dynamic lookup
 * (`process.env[name]`) — Next.js only inlines `NEXT_PUBLIC_` values into
 * the browser bundle for literal references; a dynamic lookup would always
 * read as `undefined` client-side. See node_modules/next/dist/docs/01-app/
 * 02-guides/environment-variables.md ("Note that dynamic lookups will not
 * be inlined").
 *
 * The project owner enters these values directly into `.env.local`
 * (git-ignored, never committed) — this module never asks for, searches
 * for, or fabricates them.
 */

export type SnapCameraKitConfigField = "apiToken" | "lensId" | "lensGroupId";

export interface SnapCameraKitConfig {
  apiToken: string;
  lensId: string;
  lensGroupId: string;
}

export interface SnapCameraKitConfigStatus {
  configured: boolean;
  missing: SnapCameraKitConfigField[];
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSnapCameraKitConfigStatus(): SnapCameraKitConfigStatus {
  const missing: SnapCameraKitConfigField[] = [];
  if (!present(process.env.NEXT_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN)) missing.push("apiToken");
  if (!present(process.env.NEXT_PUBLIC_SNAP_LENS_ID)) missing.push("lensId");
  if (!present(process.env.NEXT_PUBLIC_SNAP_LENS_GROUP_ID)) missing.push("lensGroupId");
  return { configured: missing.length === 0, missing };
}

/**
 * Returns the actual configuration once all three values are present.
 * Callers must check `getSnapCameraKitConfigStatus().configured` first —
 * this throws rather than ever returning a partially-`undefined` shape, so
 * a future Camera Kit session initializer can never accidentally start
 * with a missing token.
 */
export function getSnapCameraKitConfig(): SnapCameraKitConfig {
  const apiToken = process.env.NEXT_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN;
  const lensId = process.env.NEXT_PUBLIC_SNAP_LENS_ID;
  const lensGroupId = process.env.NEXT_PUBLIC_SNAP_LENS_GROUP_ID;
  if (!present(apiToken) || !present(lensId) || !present(lensGroupId)) {
    throw new Error("Snap Camera Kit configuration is incomplete.");
  }
  return { apiToken, lensId, lensGroupId };
}
