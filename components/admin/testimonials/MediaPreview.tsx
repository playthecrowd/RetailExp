"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requestPreviewAction } from "@/app/admin/(protected)/clients/kameleon/testimonials/actions";
import type { ModerationItem, SignedModerationPreview } from "@/lib/testimonials/moderation";

/**
 * The media surface of a moderation card.
 *
 * A reviewer who cannot see the media cannot moderate it. Until now this
 * always rendered "preview unavailable", which was honest while Cloudflare was
 * unconfigured and is not honest any more.
 *
 * MINTED ON DEMAND, ONE ITEM AT A TIME
 *   The signed URL is fetched when the reviewer asks for it, not when the page
 *   renders. Signing an image re-reads the Cloudflare variant every time —
 *   deliberately uncached, because a variant can be reconfigured in the
 *   dashboard at any moment — so minting for a whole page would mean one API
 *   round trip per card before anything appeared.
 *
 * WHAT THIS COMPONENT NEVER RECEIVES
 *   No provider handle. `item` is a ModerationItem, which has no field capable
 *   of carrying provider_delivery_id, and the URL that arrives here is already
 *   signed and already short-lived. Nothing is constructed from a provider
 *   hostname, and the URL is held in component state for the life of the view
 *   and never persisted.
 */
export function MediaPreview({ item }: { item: ModerationItem }) {
  const isVideo = item.mediaType === "video";

  const [preview, setPreview] = useState<SignedModerationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const dimensions = item.width && item.height ? `${item.width} × ${item.height}` : null;
  const duration =
    isVideo && item.durationSeconds != null ? `${Math.round(item.durationSeconds)}s` : null;

  const meta = [dimensions, duration, item.detectedMimeType].filter(Boolean).join(" · ");

  async function load() {
    setLoading(true);
    setFailed(false);
    // The action returns null for every refusal — unknown id, wrong tenant,
    // ineligible, unconfigured — so the reviewer learns "no preview" and not
    // which of those it was.
    const result = await requestPreviewAction(item.submissionId);
    if (result === null) setFailed(true);
    else setPreview(result);
    setLoading(false);
  }

  if (preview !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="overflow-hidden rounded-lg border border-admin-border bg-black">
          {isVideo ? (
            <video
              src={preview.mediaUrl}
              poster={preview.posterUrl ?? undefined}
              controls
              preload="metadata"
              className="aspect-video w-full"
            />
          ) : (
            // Plain <img>, not next/image, on purpose: the optimizer would
            // fetch and CACHE this URL server-side, and a signed delivery URL
            // is a bearer credential for its lifetime. Caching one is the
            // thing lib/testimonials/delivery.ts exists to prevent.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.mediaUrl}
              alt={item.caption ?? "Submitted photo awaiting moderation"}
              className="aspect-video w-full object-contain"
            />
          )}
        </div>
        {meta && <p className="text-[11px] text-admin-text-muted">{meta}</p>}
      </div>
    );
  }

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-admin-border bg-admin-surface-muted p-4 text-center">
      <Badge tone="neutral">
        {isVideo ? "Video" : item.mediaType === "image" ? "Photo" : "Media"}
      </Badge>

      {item.previewAvailable ? (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={load} loading={loading}>
            {loading ? "Preparing…" : "Show preview"}
          </Button>
          <p className="max-w-xs text-xs text-admin-text-muted">
            Opens a short-lived signed link. It expires on its own and is not stored.
          </p>
          {failed && (
            <p role="alert" className="text-xs text-admin-danger">
              That preview could not be prepared.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-admin-text">Preview unavailable</p>
          <p className="max-w-xs text-xs text-admin-text-muted">
            The media has not finished processing, so there is no delivery version to
            show yet.
          </p>
        </>
      )}

      {meta && <p className="text-[11px] text-admin-text-muted">{meta}</p>}
    </div>
  );
}
