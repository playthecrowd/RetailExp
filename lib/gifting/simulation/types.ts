/**
 * The shapes the gifting experience works in, and the service interfaces it
 * will eventually be served by.
 *
 * WHY THE INTERFACES EXIST BEFORE THE BACKEND DOES
 *   The simulation is meant to be thrown away from the waist down, not from
 *   the neck down. Every screen talks to one of the interfaces below; the
 *   simulation implements them from local fixtures and React state, and a
 *   later Supabase-backed implementation replaces the module without any
 *   component changing. If a component ever reaches for a fixture directly,
 *   that swap stops being free — so it does not.
 *
 * NOTHING HERE TOUCHES THE DATABASE
 *   No Supabase types, no table names, no provider SDKs. This file compiles
 *   with the gifting migration unapplied, which is the whole point of the
 *   checkpoint.
 */

export type GateKind = "disabled" | "age_18" | "age_21" | "acknowledgement";

export type GiftVideoKind = "standard" | "ai";

/** The genuine stages of a generation, named for what is actually happening.
 *  There is no percentage: a progress bar the provider cannot substantiate is
 *  a lie with a nice animation. */
export type AiJobStage =
  | "preparing"
  | "building_scene"
  | "preserving_audio"
  | "finalizing"
  | "ready"
  | "failed";

export const AI_STAGE_LABELS: Record<AiJobStage, string> = {
  preparing: "Preparing your message",
  building_scene: "Building your scene",
  preserving_audio: "Preserving your original audio",
  finalizing: "Finalizing your gift",
  ready: "Gift ready",
  failed: "Generation did not complete",
};

export interface MediaRef {
  /** Portrait poster, shown behind the video itself. Every media slot in this
   *  experience has one, so no screen can ever show an empty rectangle while a
   *  video loads. */
  poster: string;
  /** A landscape crop for card thumbnails. A 9:16 poster squeezed into a 16:10
   *  card shows the middle of a bottle and nothing else, which reads as a
   *  broken image even though it loaded perfectly. */
  thumb?: string;
  video?: string;
  alt: string;
}

export interface SceneTemplate {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  creditPrice: number;
  active: boolean;
  sortOrder: number;
}

/**
 * The physical thing a gift is attached to.
 *
 * A gift is not a video. The video is how someone says why they chose the
 * thing; the thing is what arrives. Keeping the product as its own identity is
 * what lets a reveal show the ACTUAL item, and what lets regifting carry that
 * item forward instead of asking the visitor to name it again.
 */
export interface GiftProduct {
  id: string;
  name: string;
  /** Portrait product still, shown as the focal point of the reveal. */
  image: string;
  alt: string;
  /** The code printed beside the QR on this physical package. It travels WITH
   *  the product: regifting the same bottle reuses this code by definition. */
  packageCode: string;
  /** The Signature Product Experience — the film about this item, shown after
   *  the visitor has met the person who sent it. Belongs to the product rather
   *  than to the gift, because it is the same film whoever passes it on. */
  experience: MediaRef;
}

/** Where a gift stands. One package can only have one live assignment, so
 *  regifting moves the old one aside rather than deleting it. */
export type AssignmentStatus = "active" | "regifted" | "ready_to_send";

/** A previous assignment of the same physical product, kept so a regifted
 *  item can still show where it came from. */
export interface GiftHistoryEntry {
  senderName: string;
  recipientName: string;
  messageCode: string;
  when: string;
}

export interface GalleryItem {
  id: string;
  kind: GiftVideoKind;
  /** Received from someone, or created by this visitor. Drives which actions
   *  a card offers: you can regift what you received, not what you sent. */
  direction: "received" | "created";
  title: string;
  subtitle: string;
  media: MediaRef;
  stage?: AiJobStage;
  templateTitle?: string;
  createdLabel: string;
  packageCode?: string;
  messageCode?: string;
  deleted?: boolean;
  /** The item itself. */
  product: GiftProduct;
  senderName: string;
  recipientName?: string;
  /** What the sender wrote, as distinct from what they recorded. */
  message: string;
  recipientNote?: string;
  assignment: AssignmentStatus;
  history?: GiftHistoryEntry[];
}

export interface GiftAssignmentView {
  senderName: string;
  recipientName: string;
  recipientNote?: string;
  packageCode: string;
  messageCode: string;
  reveal: MediaRef;
  kind: GiftVideoKind;
}

export interface ExperienceConfig {
  gateKind: GateKind;
  gateHeading: string;
  gateBody: string;
  gateConfirmLabel: string;
  gateDeclineLabel: string;
  /** Whether Video Phase 2 — the Signature Product Experience — plays after
   *  the visitor's details are captured. */
  signatureExperienceEnabled: boolean;
  signaturePosterId: string;
  standardGiftingEnabled: boolean;
  aiGiftingEnabled: boolean;
  regiftingEnabled: boolean;
  phoneRequired: boolean;
  marketingConsentEnabled: boolean;
}

export interface CreditSummary {
  available: number;
  reserved: number;
  purchased: number;
  consumed: number;
  promotional: number;
  lowBalanceThreshold: number;
}

/**
 * What the screens are allowed to ask for.
 *
 * The simulation satisfies this from fixtures; a Supabase implementation will
 * satisfy it from `gift_assignments`, `gift_packages` and friends. Neither the
 * shape nor the caller changes.
 */
export interface GiftCodeService {
  /** Both codes must resolve to the SAME assignment. Either alone reveals
   *  nothing, and two valid codes from two different gifts is a failure. */
  resolve(packageCode: string, messageCode: string): Promise<GiftAssignmentView | null>;
  /** A fresh, opaque, non-sequential message code for a new gift. */
  issueMessageCode(): Promise<string>;
  /** Whether a package is free to take a new assignment. */
  isPackageAvailable(packageCode: string): Promise<boolean>;
}

export interface AiGenerationService {
  start(input: { templateId: string; preserveOriginalAudio: boolean }): Promise<{ jobId: string }>;
  /** Genuine named stages only — never a synthetic countdown. */
  observe(jobId: string, onStage: (stage: AiJobStage) => void): () => void;
}
