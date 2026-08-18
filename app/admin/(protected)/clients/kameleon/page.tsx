import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { CopyUrlButton } from "@/components/admin/CopyUrlButton";
import { ExperiencePreviewModal } from "@/components/admin/ExperiencePreviewModal";
import { MockDataNote } from "@/components/admin/MockDataNote";
import { ExternalLinkIcon } from "@/components/admin/icons";
import { getClientBySlug, mockAnalyticsByClientSlug } from "@/lib/mock-data/clients";
import { kameleonPathways } from "@/lib/mock-data/kameleon-pathways";
import { kameleonMobileStates } from "@/lib/kameleon-mobile-states";
import { formatDateTime, formatPercent } from "@/lib/format";
import { MODERATION_ROUTE } from "@/lib/testimonials/routes";
import { requireAdminAccess } from "@/lib/auth/admin";

export const metadata = { title: "Kameleon" };

const assetStatusTone = {
  "not-uploaded": "danger",
  placeholder: "warning",
  ready: "success",
} as const;

const assetStatusLabel = {
  "not-uploaded": "Not uploaded",
  placeholder: "Placeholder",
  ready: "Ready",
} as const;

export default async function KameleonClientPage() {
  await requireAdminAccess();

  const client = getClientBySlug("kameleon");
  if (!client) notFound();

  const analytics = mockAnalyticsByClientSlug[client.slug];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            <Badge tone={client.status === "active" ? "success" : "neutral"}>{client.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-admin-text-muted">
            {client.experienceType} · /{client.slug}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={MODERATION_ROUTE} size="sm">
            Moderate Testimonials
          </LinkButton>
          <CopyUrlButton path={client.experienceRoute} />
          <ExperiencePreviewModal path={client.experienceRoute} />
          <LinkButton
            href={client.experienceRoute}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="secondary"
          >
            Open Experience
            <ExternalLinkIcon className="h-4 w-4" />
          </LinkButton>
        </div>
      </div>

      {/* Real data, unlike the analytics and pathway cards below it — this
          links to the live moderation queue backed by
          testimonial_moderation_queue, not to mock content. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Testimonial moderation</CardTitle>
            <CardDescription>
              Review visitor photos and videos before they can appear in the public Gallery
            </CardDescription>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-admin-text-muted">
            Nothing can reach the Gallery without an explicit approval here. Visitor capture
            is not live yet, so the queue is currently empty.
          </p>
          <Link
            href={MODERATION_ROUTE}
            className="text-sm font-medium text-admin-primary hover:underline"
          >
            Open moderation queue →
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-admin-text-muted">Client name</dt>
            <dd className="font-medium">{client.name}</dd>
          </div>
          <div>
            <dt className="text-admin-text-muted">Status</dt>
            <dd className="font-medium capitalize">{client.status}</dd>
          </div>
          <div>
            <dt className="text-admin-text-muted">Slug</dt>
            <dd className="font-medium">{client.slug}</dd>
          </div>
          <div>
            <dt className="text-admin-text-muted">Experience type</dt>
            <dd className="font-medium">{client.experienceType}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-admin-text-muted">Customer-facing URL</dt>
            <dd className="font-medium">{client.experienceRoute}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-admin-text-muted">Last updated</dt>
            <dd className="font-medium">{formatDateTime(client.lastUpdatedIso)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand assets &amp; media status</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-admin-border p-3">
            <div>
              <p className="font-medium">Brand assets</p>
              <p className="text-admin-text-muted">{client.brandAssets.logoLabel}</p>
              <p className="text-admin-text-muted">{client.brandAssets.primaryColorLabel}</p>
            </div>
            {client.brandAssets.isPlaceholder && <Badge tone="warning">Placeholder</Badge>}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-admin-border p-3">
            <p className="font-medium">Commercial video</p>
            <Badge tone={assetStatusTone[client.commercialVideoStatus]}>
              {assetStatusLabel[client.commercialVideoStatus]}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-admin-border p-3">
            <p className="font-medium">AR introduction</p>
            <Badge tone={assetStatusTone[client.arIntroductionStatus]}>
              {assetStatusLabel[client.arIntroductionStatus]}
            </Badge>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Experience-flow overview</CardTitle>
            <CardDescription>All 18 states of the Kameleon mobile experience</CardDescription>
          </div>
        </CardHeader>
        <ol className="grid list-decimal gap-x-6 gap-y-1.5 pl-5 text-sm sm:grid-cols-2">
          {kameleonMobileStates.map((state) => (
            <li key={state}>{state}</li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Story-path summary</CardTitle>
            <CardDescription>Pathways authored as binary branching trees (mock content)</CardDescription>
          </div>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {kameleonPathways.map((pathway) => (
            <div key={pathway.id} className="rounded-lg border border-admin-border p-3">
              <p className="font-medium">{pathway.label}</p>
              <p className="text-sm text-admin-text-muted">{pathway.subtitle}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Analytics</CardTitle>
              <MockDataNote />
            </div>
            <CardDescription>Shown until Supabase + Phase 9 analytics are connected</CardDescription>
          </div>
        </CardHeader>
        {analytics && (
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-admin-text-muted">Scans/taps</dt>
              <dd className="text-lg font-semibold">{analytics.scansOrTaps}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Commercial completion</dt>
              <dd className="text-lg font-semibold">{formatPercent(analytics.commercialCompletionRate)}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">AR launch rate</dt>
              <dd className="text-lg font-semibold">{formatPercent(analytics.arLaunchRate)}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Journey completion</dt>
              <dd className="text-lg font-semibold">{formatPercent(analytics.journeyCompletionRate)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-admin-text-muted">Most selected path</dt>
              <dd className="font-medium">{analytics.mostSelectedPath}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <p className="text-sm text-admin-text">{client.notes}</p>
      </Card>
    </div>
  );
}
