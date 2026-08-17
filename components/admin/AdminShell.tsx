"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems } from "@/lib/admin-nav";
import { MenuIcon, CloseIcon } from "./icons";
import { AdminSignOutButton } from "./AdminSignOutButton";
import { cn } from "@/lib/cn";

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-1 p-3">
      {adminNavItems.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        if (!item.available) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-admin-text-muted/50"
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
              <span className="ml-auto rounded-full bg-admin-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                Soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-admin-primary/10 text-admin-primary"
                : "text-admin-text hover:bg-admin-surface-muted",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The DevAuthNotice banner that used to sit at the top of this shell has been
 * removed: it declared the dashboard unauthenticated, which stopped being
 * true when app/admin/(protected)/layout.tsx started gating every route
 * beneath it. Leaving a stale security banner in place is worse than having
 * none.
 *
 * `adminEmail` is passed down purely so the signed-in administrator can see
 * which account they are using before they act on someone's submission. It
 * is display-only and confers nothing — authorization is resolved
 * server-side in lib/auth/admin.ts on every request.
 */
export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode;
  adminEmail?: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-admin-bg text-admin-text">
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-admin-border bg-admin-surface md:flex md:flex-col">
          <div className="flex h-16 items-center border-b border-admin-border px-5">
            <span className="text-sm font-semibold tracking-wide">RetailExp Admin</span>
          </div>
          <NavList pathname={pathname} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-admin-surface shadow-xl">
              <div className="flex h-16 items-center justify-between border-b border-admin-border px-5">
                <span className="text-sm font-semibold tracking-wide">RetailExp Admin</span>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 text-admin-text-muted hover:bg-admin-surface-muted"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-admin-border bg-admin-surface px-4 md:px-6">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-admin-text-muted hover:bg-admin-surface-muted md:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-admin-text-muted md:hidden">RetailExp Admin</span>
            <div className="ml-auto flex items-center gap-3">
              {adminEmail && (
                <span className="hidden max-w-[16rem] truncate text-sm text-admin-text-muted sm:inline">
                  {adminEmail}
                </span>
              )}
              <AdminSignOutButton />
            </div>
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
