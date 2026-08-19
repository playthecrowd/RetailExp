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
    id: "visitor_withdrawal",
    label: "Withdrawn by the person who submitted it",
    description: "They asked for it to be taken down. Purges immediately rather than in 30 days.",
  },
  {
    id: "underage_submitter",
    label: "Submitter was not 18 or older",
    description: "The 18+ attestation turned out to be untrue. Purges immediately.",
  },
  {
    id: "other",
    label: "Other",
    description: "Something else — explain in the moderation note.",
  },
] as const;

/**
 * The reasons that shorten retention to immediate.
 *
 * The lifecycle trigger stamps media_purge_after 30 days out for every removal
 * and rejection. That window exists for moderation reversibility and for
 * abuse-report retention — neither of which applies when a person withdraws
 * their own consent, and both of which are outweighed when the submitter was
 * not an adult. For those two, purge_testimonial_media_now() brings the
 * deletion forward to the next sweep.
 *
 * Deliberately a set of two, not a boolean on RejectionReason: it must match
 * the reasons purge_testimonial_media_now() accepts, and keeping the list in
 * one shape makes a mismatch a one-line diff rather than a search.
 */
export const IMMEDIATE_PURGE_REASONS = ["visitor_withdrawal", "underage_submitter"] as const;
export type ImmediatePurgeReason = (typeof IMMEDIATE_PURGE_REASONS)[number];

export function isImmediatePurgeReason(value: unknown): value is ImmediatePurgeReason {
  return (
    typeof value === "string" &&
    (IMMEDIATE_PURGE_REASONS as readonly string[]).includes(value)
  );
}

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
