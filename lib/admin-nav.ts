import type { ComponentType, SVGProps } from "react";
import {
  OverviewIcon,
  ClientsIcon,
  ExperiencesIcon,
  MediaIcon,
  AnalyticsIcon,
  SettingsIcon,
} from "@/components/admin/icons";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Routes not yet built in the current phase render as disabled, not as dead links. */
  available: boolean;
}

export const adminNavItems: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: OverviewIcon, available: true },
  { label: "Clients", href: "/admin/clients", icon: ClientsIcon, available: true },
  { label: "Experiences", href: "/admin/experiences", icon: ExperiencesIcon, available: false },
  { label: "Media", href: "/admin/media", icon: MediaIcon, available: false },
  { label: "Analytics", href: "/admin/analytics", icon: AnalyticsIcon, available: false },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon, available: false },
];
