import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import { deliveryConfigurationComplete } from "@/lib/cloudflare/config";
import { signGalleryDelivery } from "./delivery";

/**
 * The stakeholder Gallery.
 *
 * READ WITH THE TRUSTED CLIENT, AFTER THE GATE
 *   20260821110000 revokes browser SELECT on testimonial_gallery_items, so
 *   "closed" is true of the data and not only of the route. The trusted tier
 *   was always going to be involved anyway: a signed delivery URL can only be
 *   minted server-side, so a browser could never have rendered this from a
 *   direct PostgREST read.
 *
 *   This function does NOT enforce the access gate. It is reached only from a
 *   page inside app/experience/kameleon/(gated), whose layout has already
 *   redirected anyone without a valid unlock cookie.
 *
 * WHAT THE VIEW GUARANTEES, SO THIS DOES NOT RE-CHECK IT
 *   Approved, trusted-valid, uploaded, published, delivery-ready, out of
 *   draft, signed-delivery-required, not purged, and environment_marker =
 *   'production'. A Preview submission therefore cannot appear here even
 *   though Preview and Production share one database — the predicate excludes
 *   it before this code runs, which is why signGalleryDelivery can state that
 *   a Preview asset is never signed.
 */

export const GALLERY_PAGE_SIZE = 12;

export interface GalleryEntry {
  submissionId: string;
  mediaType: "image" | "video";
  caption: string | null;
  publishedAt: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Short-lived and minted per request. Never stored, never logged. */
  mediaUrl: string;
  posterUrl: string | null;
}

export async function loadGallery(): Promise<GalleryEntry[]> {
  // Fail quiet rather than throwing out of a page render. An unconfigured
  // deployment shows an empty Gallery, which is what it honestly has.
  if (!deliveryConfigurationComplete()) return [];

  const supabase = createSecretClient();

  // Resolved by slug, the same way lib/kameleon/live-content.ts does it. The
  // shared schema stays client-neutral; the client-specific part is data.
  const { data: experience } = await supabase
    .from("experiences")
    .select("id")
    .eq("slug", "kameleon")
    .maybeSingle();

  if (!experience) return [];

  const { data, error } = await supabase
    .from("testimonial_gallery_items")
    .select(
      "submission_id, media_type, caption, published_at, width, height, duration_seconds, provider_delivery_id",
    )
    .eq("experience_id", experience.id)
    // Newest first, with a deterministic tie-break so two items sharing a
    // published_at cannot swap places between renders.
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("submission_id", { ascending: false })
    .limit(GALLERY_PAGE_SIZE);

  if (error || !data) return [];

  // Signed IN PARALLEL. An image signature re-reads the Cloudflare variant
  // every time — deliberately uncached — so signing sequentially would cost
  // one round trip per item. In parallel the whole page costs roughly one.
  const entries = await Promise.all(
    data.map(async (row): Promise<GalleryEntry | null> => {
      if (row.submission_id === null || row.provider_delivery_id === null) return null;
      if (row.media_type !== "image" && row.media_type !== "video") return null;

      try {
        const bundle = await signGalleryDelivery(row.media_type, row.provider_delivery_id);
        return {
          submissionId: row.submission_id,
          mediaType: row.media_type,
          caption: row.caption,
          publishedAt: row.published_at,
          width: row.width,
          height: row.height,
          durationSeconds: row.duration_seconds,
          mediaUrl: bundle.media.url,
          posterUrl: bundle.poster?.url ?? null,
        };
      } catch {
        // One unsignable item must not blank the whole Gallery. It is dropped
        // silently rather than rendered as a broken tile; the variant-safety
        // refusal that would cause this is already logged where it happens.
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is GalleryEntry => entry !== null);
}
