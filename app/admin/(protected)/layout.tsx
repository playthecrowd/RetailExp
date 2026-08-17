import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminAccess } from "@/lib/auth/admin";

/**
 * Request-time rendering is mandatory here, not a preference.
 *
 * Before this phase the three admin pages built as static (○): prerendered
 * once and served byte-identically to everyone, which would make a
 * per-request authorization check meaningless. Next.js's own auth guide says
 * as much — "for static routes that share data between users, data will be
 * fetched at build time and not at request time". Reading cookies below
 * already opts these routes into dynamic rendering; this makes it explicit so
 * it cannot regress silently if the auth call is ever refactored.
 */
export const dynamic = "force-dynamic";

/**
 * The authorization gate for every protected admin route.
 *
 * `await requireAdminAccess()` completes before any child is rendered, and it
 * redirects rather than returning on denial, so protected content is never
 * produced for an unauthorized caller. Pages beneath this layout call the
 * same helper again — that repeat is deliberate defence in depth, and it is
 * free because resolveAdminAccess is request-cached.
 *
 * /admin/login and /admin/access-denied are outside this route group and so
 * never reach this gate, which is what makes a redirect loop structurally
 * impossible rather than conditionally avoided.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdminAccess();

  return <AdminShell adminEmail={access.email}>{children}</AdminShell>;
}
