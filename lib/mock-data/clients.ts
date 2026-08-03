export type ClientStatus = "active" | "draft" | "paused";
export type MediaAssetStatus = "not-uploaded" | "placeholder" | "ready";

export interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  status: ClientStatus;
  experienceType: string;
  experienceRoute: string;
  brandAssets: {
    /** true until real, approved brand assets are supplied. */
    isPlaceholder: boolean;
    logoLabel: string;
    primaryColorLabel: string;
  };
  commercialVideoStatus: MediaAssetStatus;
  arIntroductionStatus: MediaAssetStatus;
  notes: string;
  lastUpdatedIso: string;
}

/**
 * Mock analytics only — clearly labeled, replaced once Supabase + Phase 9
 * analytics tracking are connected. Never presented as real user data.
 */
export interface MockAnalyticsSnapshot {
  isMock: true;
  scansOrTaps: number;
  commercialCompletionRate: number;
  arLaunchRate: number;
  journeyCompletionRate: number;
  mostSelectedPath: string;
}

export const clients: ClientRecord[] = [
  {
    id: "kameleon",
    name: "Kameleon",
    slug: "kameleon",
    status: "active",
    experienceType: "Choice-Based Video Journey",
    experienceRoute: "/experience/kameleon",
    brandAssets: {
      isPlaceholder: true,
      logoLabel: "Kameleon wordmark (placeholder text lockup)",
      primaryColorLabel: "Near-black + copper (#c08552)",
    },
    commercialVideoStatus: "placeholder",
    arIntroductionStatus: "placeholder",
    notes:
      "First RetailExp client. Premium choice-based video + WebAR experience tied to the Kameleon bottle via NFC/QR.",
    lastUpdatedIso: "2026-08-02T00:00:00.000Z",
  },
];

export const mockAnalyticsByClientSlug: Record<string, MockAnalyticsSnapshot> = {
  kameleon: {
    isMock: true,
    scansOrTaps: 128,
    commercialCompletionRate: 0.81,
    arLaunchRate: 0.64,
    journeyCompletionRate: 0.37,
    mostSelectedPath: "Private Pour → Social Shift → Create → The Table",
  },
};

export function getClientBySlug(slug: string): ClientRecord | undefined {
  return clients.find((client) => client.slug === slug);
}
