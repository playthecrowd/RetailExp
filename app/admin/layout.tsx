import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — RetailExp Admin",
    default: "RetailExp Admin",
  },
};

/**
 * Deliberately does nothing but set metadata.
 *
 * The authorization gate and the AdminShell chrome live in
 * app/admin/(protected)/layout.tsx instead, so that /admin/login and
 * /admin/access-denied — which sit outside that route group — cannot inherit
 * them. A gate here with a path-based exemption list would work until the
 * first typo, and the failure mode is either an infinite redirect loop or an
 * unprotected route. Structure enforces it instead of a condition.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
