import Link from "next/link";
import { requireAdminAccess } from "@/lib/auth/admin";
import { loadModerationQueue, parseModerationQuery } from "@/lib/testimonials/moderation";
import { ModerationQueue } from "@/components/admin/testimonials/ModerationQueue";
import { MODERATION_ROUTE } from "@/lib/testimonials/routes";

export const metadata = { title: "Testimonial moderation" };

/**
 * Beneath app/admin/(protected), so the layout gate has already run. The
 * re-check below is the same deliberate defence in depth as the other admin
 * pages, and is free because resolveAdminAccess is request-cached.
 *
 * force-dynamic because this reads per-request authorization and live data;
 * a prerendered moderation queue would be both stale and shared.
 */
export const dynamic = "force-dynamic";

export default async function KameleonTestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess();

  // Allow-listed with safe defaults. No search parameter is ever used as a
  // tenant identifier — loadModerationQueue scopes to the client id that
  // authorization resolved.
  const query = parseModerationQuery(await searchParams);
  const page = await loadModerationQueue(query);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-admin-text-muted">
          <Link href="/admin/clients" className="hover:underline">
            Clients
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/admin/clients/kameleon" className="hover:underline">
            Kameleon
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={MODERATION_ROUTE} aria-current="page" className="text-admin-text">
            Testimonials
          </Link>
        </nav>

        <h1 className="text-xl font-semibold">Testimonial moderation</h1>
        <p className="mt-1 max-w-2xl text-sm text-admin-text-muted">
          Review visitor photos and videos before they can appear in the public Kameleon
          Gallery. This queue holds moderation-eligible submissions only — uploads that
          failed, were abandoned, or did not pass validation never reach it, and are not
          counted here.
        </p>
      </div>

      <ModerationQueue page={page} query={query} />
    </div>
  );
}
