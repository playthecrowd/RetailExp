import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { ModerationCard } from "./ModerationCard";
import { cn } from "@/lib/cn";
import {
  MEDIA_FILTERS,
  MODERATION_TABS,
  type MediaFilter,
  type ModerationPage,
  type ModerationQuery,
  type ModerationTab,
} from "@/lib/testimonials/moderation";

/**
 * The queue shell: counts, tabs, filters, sorting and pagination.
 *
 * A Server Component. All state lives in the URL, so a filtered view is
 * shareable, survives a refresh, and is rendered server-side — which also
 * means no client-side store can drift out of step with what authorization
 * actually returned.
 */

const TAB_LABELS: Record<ModerationTab, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  removed: "Removed",
  all: "All Eligible",
};

const MEDIA_LABELS: Record<MediaFilter, string> = {
  all: "All media",
  image: "Photos",
  video: "Videos",
};

function href(query: ModerationQuery, patch: Partial<ModerationQuery>) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.tab !== "pending") params.set("tab", next.tab);
  if (next.media !== "all") params.set("media", next.media);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export function ModerationQueue({
  page,
  query,
}: {
  page: ModerationPage;
  query: ModerationQuery;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Summary counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["pending", "approved", "rejected", "removed"] as const).map((tab) => (
          <Card key={tab}>
            <p className="text-sm text-admin-text-muted">{TAB_LABELS[tab]}</p>
            <p className="mt-1 text-3xl font-semibold">{page.counts[tab]}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <nav aria-label="Moderation status" className="flex flex-wrap gap-1 border-b border-admin-border">
        {MODERATION_TABS.map((tab) => {
          const active = query.tab === tab;
          return (
            <Link
              key={tab}
              href={href(query, { tab, page: 1 })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-b-2 border-admin-primary text-admin-primary"
                  : "text-admin-text-muted hover:bg-admin-surface-muted hover:text-admin-text",
              )}
            >
              {TAB_LABELS[tab]}
              <span className="ml-1.5 text-xs text-admin-text-muted">{page.counts[tab]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Filters and sorting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Media type">
          {MEDIA_FILTERS.map((media) => (
            <Link
              key={media}
              href={href(query, { media, page: 1 })}
              aria-current={query.media === media ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                query.media === media
                  ? "bg-admin-primary text-admin-primary-foreground"
                  : "bg-admin-surface-muted text-admin-text-muted hover:text-admin-text",
              )}
            >
              {MEDIA_LABELS[media]}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Sort order">
          <Link
            href={href(query, { sort: "newest", page: 1 })}
            aria-current={query.sort === "newest" ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              query.sort === "newest"
                ? "bg-admin-primary text-admin-primary-foreground"
                : "bg-admin-surface-muted text-admin-text-muted hover:text-admin-text",
            )}
          >
            Newest
          </Link>
          <Link
            href={href(query, { sort: "oldest", page: 1 })}
            aria-current={query.sort === "oldest" ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              query.sort === "oldest"
                ? "bg-admin-primary text-admin-primary-foreground"
                : "bg-admin-surface-muted text-admin-text-muted hover:text-admin-text",
            )}
          >
            Oldest
          </Link>
        </div>
      </div>

      {/* Items */}
      {page.items.length === 0 ? (
        <EmptyState
          title={
            query.tab === "pending"
              ? "Nothing waiting for review"
              : `No ${TAB_LABELS[query.tab].toLowerCase()} submissions`
          }
          message="Visitor photo and video capture is not live yet, so no testimonials have been submitted. Approved items will appear in the Kameleon Gallery once secure media delivery is configured."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((item) => (
            <ModerationCard key={item.submissionId} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {page.pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <Link
            href={href(query, { page: Math.max(1, query.page - 1) })}
            aria-disabled={query.page <= 1}
            className={cn(
              "rounded-md border border-admin-border px-3 py-1.5 text-sm",
              query.page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:bg-admin-surface-muted",
            )}
          >
            Previous
          </Link>
          <span className="text-sm text-admin-text-muted">
            Page {page.page} of {page.pageCount} · {page.total} item{page.total === 1 ? "" : "s"}
          </span>
          <Link
            href={href(query, { page: Math.min(page.pageCount, query.page + 1) })}
            aria-disabled={query.page >= page.pageCount}
            className={cn(
              "rounded-md border border-admin-border px-3 py-1.5 text-sm",
              query.page >= page.pageCount
                ? "pointer-events-none opacity-40"
                : "hover:bg-admin-surface-muted",
            )}
          >
            Next
          </Link>
        </nav>
      )}
    </div>
  );
}
