import { Badge } from "@/components/ui/Badge";
import type { ModerationItem } from "@/lib/testimonials/moderation";

/**
 * The media surface of a moderation card.
 *
 * Cloudflare is not configured, so `previewAvailable` is false for everything
 * and this always renders the unavailable state. That is deliberate and it is
 * honest: there is no provider handle in the props, no URL is constructed, and
 * nothing is guessed from a provider hostname. When signed delivery is added,
 * a short-lived URL will be minted server-side per request and passed in as a
 * rendered element — the handle still never reaches the browser.
 */
export function MediaPreview({ item }: { item: ModerationItem }) {
  const isVideo = item.mediaType === "video";

  const dimensions =
    item.width && item.height ? `${item.width} × ${item.height}` : null;
  const duration =
    isVideo && item.durationSeconds != null
      ? `${Math.round(item.durationSeconds)}s`
      : null;

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-admin-border bg-admin-surface-muted p-4 text-center">
      <Badge tone="neutral">
        {isVideo ? "Video" : item.mediaType === "image" ? "Photo" : "Media"}
      </Badge>

      <p className="text-sm font-medium text-admin-text">Preview unavailable</p>
      <p className="max-w-xs text-xs text-admin-text-muted">
        Secure media delivery is not configured yet. Previews appear here once it is,
        generated as short-lived signed links.
      </p>

      {(dimensions || duration || item.detectedMimeType) && (
        <p className="text-[11px] text-admin-text-muted">
          {[dimensions, duration, item.detectedMimeType].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
