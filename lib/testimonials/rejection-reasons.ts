/**
 * The closed set of reasons a submission may be rejected.
 *
 * Server-enforced. The dashboard renders these as a <select>, but the action
 * re-checks the submitted value against this list before it reaches the
 * database — a Server Action is a public POST endpoint, so the dropdown is a
 * convenience, not a constraint.
 *
 * The stored value is the `id`, never the label: labels are UI copy and will
 * be reworded, and a rejection record that changes meaning when someone edits
 * a string is not an audit record.
 */

export interface RejectionReason {
  id: string;
  label: string;
  /** Shown under the option so a moderator picks the same reason for the
   *  same situation as their colleague. */
  description: string;
}

export const REJECTION_REASONS: readonly RejectionReason[] = [
  {
    id: "possible_minor",
    label: "Possible minor visible",
    description: "Anyone who may be under 18 appears in the media.",
  },
  {
    id: "non_consenting_person",
    label: "Person who has not consented",
    description: "Someone other than the submitter appears without evident consent.",
  },
  {
    id: "unsafe_or_offensive",
    label: "Unsafe or offensive content",
    description: "Violence, harassment, hate, nudity or other content unfit to publish.",
  },
  {
    id: "unsafe_alcohol_depiction",
    label: "Unsafe depiction of alcohol",
    description: "Excessive consumption, driving, or anyone who appears underage with alcohol.",
  },
  {
    id: "personal_information",
    label: "Personal information visible",
    description: "A face, document, address, screen or badge exposing someone's details.",
  },
  {
    id: "third_party_content",
    label: "Third-party or copyrighted content",
    description: "Recorded music, broadcast footage, or artwork the submitter does not own.",
  },
  {
    id: "off_topic",
    label: "Not about the experience",
    description: "Unrelated to Kameleon or the visit.",
  },
  {
    id: "poor_quality",
    label: "Unusable quality",
    description: "Too dark, blurred, silent or short to publish.",
  },
  {
    id: "other",
    label: "Other",
    description: "Something else — explain in the moderation note.",
  },
] as const;

const REJECTION_REASON_IDS: ReadonlySet<string> = new Set(REJECTION_REASONS.map((r) => r.id));

/** True only for an id in the allow-list above. Used by the Server Action. */
export function isValidRejectionReason(value: unknown): value is string {
  return typeof value === "string" && REJECTION_REASON_IDS.has(value);
}

export function rejectionReasonLabel(id: string | null): string | null {
  if (!id) return null;
  return REJECTION_REASONS.find((r) => r.id === id)?.label ?? id;
}

/** Maximum stored length of a free-text moderation note. Capped so a note
 *  cannot be used as unbounded storage, and truncation happens server-side. */
export const MAX_MODERATION_NOTE_LENGTH = 500;
