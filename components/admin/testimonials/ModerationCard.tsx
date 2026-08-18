"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MediaPreview } from "./MediaPreview";
import { ModerationActions } from "./ModerationActions";
import { rejectionReasonLabel } from "@/lib/testimonials/rejection-reasons";
import { formatDateTime } from "@/lib/format";
import type { ModerationItem } from "@/lib/testimonials/moderation";

/**
 * One submission, as a moderator sees it.
 *
 * Everything rendered comes from ModerationItem, which structurally cannot
 * carry a visitor's name, email, phone, Auth UUID, or any provider handle. The
 * caption is the only visitor-authored text on the card.
 */

const MODERATION_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  removed: "neutral",
} as const;

/** The view reports every column as nullable because Postgres cannot prove
 *  non-nullness through a view. These render an honest placeholder rather than
 *  inventing a value. */
const UNKNOWN = "—";

export function ModerationCard({ item }: { item: ModerationItem }) {
  const consentComplete = item.attestedNoMinors && item.attestedSubjectsConsented;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.moderationStatus ? MODERATION_TONE[item.moderationStatus] : "neutral"}>
            {item.moderationStatus ?? "unknown"}
          </Badge>
          <Badge tone="neutral">
            {item.mediaType === "video" ? "Video" : item.mediaType === "image" ? "Photo" : "Media"}
          </Badge>
          {item.validationStatus === "valid" && <Badge tone="success">validated</Badge>}
          {!item.deliveryReady && <Badge tone="warning">delivery pending</Badge>}
          {/* Poster readiness is shown because it is genuinely useful for a
              video, but it is NOT an approval requirement — the schema only
              requires delivery_ready_at — so it must not be presented as a
              blocker the database does not actually impose. */}
          {item.mediaType === "video" && !item.posterReady && (
            <Badge tone="neutral">poster pending</Badge>
          )}
        </div>
        {item.submittedAt && (
          <span className="text-xs text-admin-text-muted">
            Submitted {formatDateTime(item.submittedAt)}
          </span>
        )}
      </div>

      <MediaPreview item={item} />

      {item.caption && (
        <blockquote className="border-l-2 border-admin-border pl-3 text-sm text-admin-text">
          {item.caption}
        </blockquote>
      )}

      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <dt className="text-admin-text-muted">Consent</dt>
          <dd>
            {consentComplete ? (
              <Badge tone="success">attested</Badge>
            ) : (
              <Badge tone="danger">incomplete</Badge>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-admin-text-muted">Scope</dt>
          <dd className="text-admin-text">{item.consentScope?.replace(/_/g, " ") ?? UNKNOWN}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-admin-text-muted">Consent version</dt>
          <dd className="text-admin-text">{item.consentVersion ?? UNKNOWN}</dd>
        </div>
        {item.processingStatus && (
          <div className="flex items-center gap-1.5">
            <dt className="text-admin-text-muted">Processing</dt>
            <dd className="text-admin-text">{item.processingStatus}</dd>
          </div>
        )}
        {item.reviewedAt && (
          <div className="flex items-center gap-1.5">
            <dt className="text-admin-text-muted">Reviewed</dt>
            <dd className="text-admin-text">{formatDateTime(item.reviewedAt)}</dd>
          </div>
        )}
        {item.publishedAt && (
          <div className="flex items-center gap-1.5">
            <dt className="text-admin-text-muted">Published</dt>
            <dd className="text-admin-text">{formatDateTime(item.publishedAt)}</dd>
          </div>
        )}
      </dl>

      {item.rejectionReason && (
        <p className="rounded-md bg-admin-danger-bg px-3 py-2 text-sm text-admin-danger">
          Rejected — {rejectionReasonLabel(item.rejectionReason)}
        </p>
      )}

      {item.moderationNote && (
        <p className="text-sm text-admin-text-muted">
          <span className="font-medium text-admin-text">Note:</span> {item.moderationNote}
        </p>
      )}

      {item.mediaPurgeAfter && (
        <p className="text-xs text-admin-text-muted">
          Media scheduled for provider deletion after {formatDateTime(item.mediaPurgeAfter)}. The
          submission record is retained; only the media is removed, and the item then leaves
          this queue.
        </p>
      )}

      <ModerationActions item={item} />
    </Card>
  );
}
