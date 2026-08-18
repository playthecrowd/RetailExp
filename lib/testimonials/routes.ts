/**
 * Route constants for the testimonial surfaces.
 *
 * Centralized so the moderation page, its links and the revalidation calls in
 * the Server Actions cannot drift apart. A revalidatePath() that silently
 * points at a stale path is invisible until someone notices the Gallery
 * serving a removed submission, so the path is declared once.
 */

/** The moderation dashboard, nested beneath the Kameleon client area. */
export const MODERATION_ROUTE = "/admin/clients/kameleon/testimonials";

/**
 * The public Gallery. Does NOT exist yet — it is built in Phase 5.
 *
 * Declared and revalidated now on purpose: approval is what makes a submission
 * Gallery-eligible, so the invalidation boundary belongs with the decision that
 * crosses it, not with the page that is written later. revalidatePath() on a
 * path with no cache entry is a no-op, so wiring it early costs nothing and
 * removes the chance of the Gallery being added without anyone remembering to
 * invalidate it.
 */
export const GALLERY_ROUTE = "/experience/kameleon/gallery";
