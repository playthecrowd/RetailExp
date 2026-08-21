import type { Metadata } from "next";
import { Landing } from "@/components/home/Landing";

/**
 * Metadata is declared HERE rather than in the root layout, so replacing the
 * homepage cannot change the title of any other route that relies on the
 * layout's default.
 */
export const metadata: Metadata = {
  title: "Retail eXp | Experience Platform",
  description: "Create personalized gifting and interactive retail experiences with Retail eXp.",
};

export default function Home() {
  return <Landing />;
}
