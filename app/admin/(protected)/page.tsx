import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MockDataNote } from "@/components/admin/MockDataNote";
import { clients, mockAnalyticsByClientSlug } from "@/lib/mock-data/clients";
import { mockRecentActivity } from "@/lib/mock-data/admin-activity";
import { formatDateTime, formatPercent } from "@/lib/format";
import { requireAdminAccess } from "@/lib/auth/admin";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  // Repeated deliberately. The layout above already gated this route, but a
  // page that depends on a parent for its own authorization is one refactor
  // away from being reachable. Request-cached, so this costs no extra
  // round trip.
  await requireAdminAccess();

  const activeClients = clients.filter((c) => c.status === "active");
  const kameleon = clients.find((c) => c.slug === "kameleon");
  const kameleonAnalytics = kameleon ? mockAnalyticsByClientSlug[kameleon.slug] : undefined;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-admin-text-muted">
          RetailExp administration — clients, experiences, and platform status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-admin-text-muted">Total clients</p>
          <p className="mt-1 text-3xl font-semibold">{clients.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-admin-text-muted">Active clients</p>
          <p className="mt-1 text-3xl font-semibold">{activeClients.length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <p className="text-sm text-admin-text-muted">Journey completion rate</p>
            <MockDataNote />
          </div>
          <p className="mt-1 text-3xl font-semibold">
            {kameleonAnalytics ? formatPercent(kameleonAnalytics.journeyCompletionRate) : "—"}
          </p>
        </Card>
      </div>

      {kameleon && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Kameleon</CardTitle>
              <CardDescription>{kameleon.experienceType}</CardDescription>
            </div>
            <Badge tone={kameleon.status === "active" ? "success" : "neutral"}>{kameleon.status}</Badge>
          </CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-admin-text-muted">
              <p>
                Route: <code className="text-admin-text">{kameleon.experienceRoute}</code>
              </p>
              <p className="mt-1">Last updated {formatDateTime(kameleon.lastUpdatedIso)}</p>
            </div>
            <Link
              href="/admin/clients/kameleon"
              className="text-sm font-medium text-admin-primary hover:underline"
            >
              View client details →
            </Link>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Recent activity</CardTitle>
            <MockDataNote />
          </div>
        </CardHeader>
        <ul className="flex flex-col divide-y divide-admin-border">
          {mockRecentActivity.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span>{entry.message}</span>
              <span className="shrink-0 text-admin-text-muted">{formatDateTime(entry.timestampIso)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
