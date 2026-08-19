import type { Metadata } from "next";
import Link from "next/link";
import {
  ADMINISTRATOR,
  CONTACT_EMAIL,
  EVALUATION_CONSENT_VERSION,
  GOVERNING_LAW,
  NOTICE_LAST_UPDATED,
  PRIVACY_ROUTE,
  PROJECT,
} from "@/lib/legal/evaluation-notices";

export const metadata: Metadata = {
  title: "Kameleon stakeholder evaluation — Terms",
  robots: { index: false, follow: false },
};

/**
 * The evaluation Terms.
 *
 * Every statement here is one the code actually enforces. Where a control is
 * an attestation rather than a verification, it says so in those words — a
 * notice that claims an age check nobody performs is worse than no notice.
 */
export default function EvaluationTermsPage() {
  return (
    <article className="flex flex-col gap-6 text-[15px] leading-relaxed">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Closed stakeholder evaluation
        </p>
        <h1 className="text-2xl font-semibold">Terms of Participation</h1>
        <p className="text-sm text-neutral-600">
          Version {EVALUATION_CONSENT_VERSION} · Last updated {NOTICE_LAST_UPDATED}
        </p>
      </header>

      <p>
        {ADMINISTRATOR} administers this stakeholder evaluation for the {PROJECT} project.
        This is a private, invitation-only evaluation of a product experience that has not
        launched. It is not a public release.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Who may take part</h2>
        <p>
          You must be <strong>18 or older</strong> to submit a photo or video. We do not
          verify anyone&rsquo;s age; the confirmation you give is your own statement, and we
          rely on it.
        </p>
        <p>
          Access is by invitation. The access code you were given is for you and the
          evaluation; please do not pass it on.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What you may submit</h2>
        <p>Before submitting you confirm all four of the following:</p>
        <ul className="list-disc pl-6">
          <li>You are 18 or older.</li>
          <li>
            <strong>No minors appear</strong> in your photo or video. Media depicting anyone
            under 18 is prohibited outright.
          </li>
          <li>Everyone who appears has consented to appearing.</li>
          <li>
            Your submission may appear in the stakeholder Gallery if it is approved.
          </li>
        </ul>
        <p>
          Do not submit anything unlawful, hateful, harassing, sexual, or that you do not
          have the right to share, and do not include other people&rsquo;s personal
          information.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What you permit, and what you do not</h2>
        <p>
          You permit {ADMINISTRATOR} to store your submission and, if it is approved, to
          display it in the stakeholder Gallery inside this evaluation, to the people
          invited to it.
        </p>
        <p className="rounded-md bg-neutral-100 p-3">
          <strong>That is the whole permission.</strong> Your submission will not be used in
          marketing or advertising, will not be posted to social media, will not be sold or
          licensed to anyone, and will not be used to train anything. Any other use would
          need your separate, explicit permission, recorded separately.
        </p>
        <p>
          You keep ownership of what you submit. You may ask for it to be taken down at any
          time — see <Link className="underline" href={PRIVACY_ROUTE}>the Privacy Notice</Link>.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Review</h2>
        <p>
          Every submission is reviewed by a person before it can appear. Approval is not
          guaranteed and we may decline anything for any reason, including reasons of taste.
          A submission that is not approved never appears in the Gallery.
        </p>
        <p>
          We may remove an approved submission at any time. Removal takes it out of the
          Gallery immediately.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">The evaluation is temporary</h2>
        <p>
          This evaluation will end. When it does, submitted media is deleted. The Privacy
          Notice sets out the retention and deletion schedule in detail.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">No warranty, and limits</h2>
        <p>
          The experience is provided as-is for evaluation. It may be interrupted, changed or
          withdrawn without notice. To the extent the law allows, {ADMINISTRATOR} is not
          liable for indirect or consequential loss arising from your participation.
        </p>
        <p>Nothing here limits any right you have that cannot be limited by agreement.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Governing law</h2>
        <p>
          These Terms are governed by the laws of {GOVERNING_LAW}, without regard to its
          conflict-of-laws rules.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Changes</h2>
        <p>
          These Terms are versioned. The version you agreed to is recorded with your
          submission and does not change afterwards. A substantive change produces a new
          version, which applies only to submissions made after it.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>
    </article>
  );
}
