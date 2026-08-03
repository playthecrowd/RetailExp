import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { clients } from "@/lib/mock-data/clients";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Clients" };

const statusTone = {
  active: "success",
  draft: "neutral",
  paused: "warning",
} as const;

export default function AdminClientsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-admin-text-muted">
          Every RetailExp client and their connected experience.
        </p>
      </div>

      <Card padded={false}>
        <ul className="divide-y divide-admin-border">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/admin/clients/${client.slug}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-admin-surface-muted"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-admin-text-muted">{client.experienceType}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-admin-text-muted">/{client.slug}</span>
                  <Badge tone={statusTone[client.status]}>{client.status}</Badge>
                  <span className="hidden text-sm text-admin-text-muted sm:inline">
                    Updated {formatDate(client.lastUpdatedIso)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
