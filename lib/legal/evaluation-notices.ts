/**
 * The stakeholder evaluation notices.
 *
 * Declared in one place because three things must agree exactly and are
 * otherwise easy to drift apart: the routes the pages are served at, the
 * version string recorded against every submission, and the URLs written into
 * public.consent_document_versions.
 *
 * THE VERSION IS AN IDENTIFIER, NOT A DATE. It is stored on every submission
 * as consent_version and is immutable afterwards, so it must never be reused
 * for altered text. Any substantive change to either page requires a NEW
 * version and a new registry row — the old row stays, because submissions
 * consented under it and the record has to keep meaning what it meant.
 */

export const EVALUATION_CONSENT_VERSION = "2026-08-19.evaluation.v1";

export const TERMS_ROUTE = "/legal/kameleon-evaluation-terms";
export const PRIVACY_ROUTE = "/legal/kameleon-evaluation-privacy";

/**
 * Deliberately OUTSIDE /experience/kameleon.
 *
 * proxy.ts gates that prefix, and a consent document behind an access gate is
 * not readable by everyone it binds. These are ungated on purpose.
 */
export const NOTICE_LAST_UPDATED = "19 August 2026";

/**
 * The administering party, as agreed: Plotabl administers this stakeholder
 * evaluation for the Kameleon Beverages project.
 *
 * NO LEGAL SUFFIX APPEARS ANYWHERE. Plotabl's registered form is not confirmed,
 * and writing "LLC" or "Inc." into a notice that people rely on would be
 * inventing a fact about a legal entity. The pages say "Plotabl" and the
 * activation checklist requires the operator to be confirmed before the
 * consent version is made active.
 */
export const ADMINISTRATOR = "Plotabl";
export const PROJECT = "Kameleon Beverages";
export const CONTACT_EMAIL = "plotablstudio@gmail.com";
export const GOVERNING_LAW = "the State of Georgia, United States";
