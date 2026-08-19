import type { Metadata } from "next";
import Link from "next/link";
import {
  ADMINISTRATOR,
  CONTACT_EMAIL,
  EVALUATION_CONSENT_VERSION,
  NOTICE_LAST_UPDATED,
  PROJECT,
  TERMS_ROUTE,
} from "@/lib/legal/evaluation-notices";

export const metadata: Metadata = {
  title: "Kameleon stakeholder evaluation — Privacy",
  robots: { index: false, follow: false },
};

/**
 * The evaluation Privacy Notice.
 *
 * Every retention figure here matches what the scheduled sweep actually does,
 * and the "what we keep" section says plainly that the consent record outlives
 * the media. A notice that promises a deletion the code does not perform is
 * the failure this whole phase existed to prevent.
 */
export default function EvaluationPrivacyPage() {
  return (
    <article className="flex flex-col gap-6 text-[15px] leading-relaxed">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Closed stakeholder evaluation
        </p>
        <h1 className="text-2xl font-semibold">Privacy Notice</h1>
        <p className="text-sm text-neutral-600">
          Version {EVALUATION_CONSENT_VERSION} · Last updated {NOTICE_LAST_UPDATED}
        </p>
      </header>

      <p>
        {ADMINISTRATOR} administers this stakeholder evaluation for the {PROJECT} project and
        decides how the information described here is used. Contact:{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What we collect</h2>
        <ul className="list-disc pl-6">
          <li>
            <strong>Your name, email and phone number</strong>, if you give them when
            setting up your quick account.
          </li>
          <li>
            <strong>The photo or video you submit</strong>, and the caption you write.
          </li>
          <li>
            <strong>Your confirmations</strong> — that you are 18 or older, that no minors
            appear, that everyone shown consented, and that approved media may appear in the
            Gallery — together with which version of the notices you agreed to and when.
          </li>
          <li>
            <strong>Technical details about the file</strong> that the media provider
            reports back: size, dimensions, duration and format.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect your IP address, location, device fingerprint or
          any advertising identifier, and there is no analytics in this experience.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Why, and on what basis</h2>
        <p>
          Media and captions are published to the stakeholder Gallery on the basis of{" "}
          <strong>your consent</strong>, which you give before submitting and can withdraw at
          any time. Contact details are used to administer the evaluation and to reach you
          about it. Everything else is used to run and review the evaluation itself.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Where your media is stored</h2>
        <p>
          Your photo or video is uploaded <strong>directly from your device to Cloudflare</strong>{" "}
          and is stored there, not on our servers. We hold only an opaque reference to it.
          Delivery always requires a short-lived signed link; there is no public URL, and
          links are generated per request and never stored.
        </p>
        <p>We use three processors:</p>
        <ul className="list-disc pl-6">
          <li><strong>Cloudflare</strong> — stores, processes and delivers the media.</li>
          <li>
            <strong>Supabase</strong> — the database holding your contact details, caption,
            consent record and review status.
          </li>
          <li><strong>Vercel</strong> — hosts the application.</li>
        </ul>
        <p>
          Cloudflare receives no information identifying you: the reference that links your
          media to your submission is a random value chosen so that it reveals nothing.
        </p>
        <p>
          These providers operate internationally, so your information may be processed
          outside your country.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What becomes visible, and to whom</h2>
        <p>
          Nothing is visible to anyone but reviewers until a person approves it. Reviewers
          see your media, your caption and your confirmations in order to decide.
        </p>
        <p>
          If approved, the Gallery shows <strong>your media and your caption, and nothing
          else</strong>. It never shows your name, email, phone number, who reviewed it, or
          any internal note.
        </p>
        <p>The Gallery is inside the closed evaluation. It is not public.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">How long we keep it</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-2 pr-4">Situation</th>
                <th className="py-2">Media deleted</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["You start but do not finish an upload", "Within about an hour"],
                ["Your upload fails, or you cancel", "Within about an hour"],
                ["Your submission is not approved", "30 days after the decision"],
                ["An approved submission is removed", "30 days after removal"],
                ["You ask us to take it down", "On the next cleanup — within about an hour"],
                ["The evaluation ends", "All remaining media is deleted"],
              ].map(([situation, when]) => (
                <tr key={situation} className="border-b border-neutral-200">
                  <td className="py-2 pr-4">{situation}</td>
                  <td className="py-2">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-neutral-700">
          A cleanup job runs every hour and carries these out; deletion is recorded when the
          provider confirms it.
        </p>
        <p className="rounded-md bg-neutral-100 p-3">
          <strong>What outlives the media.</strong> When your photo or video is deleted we
          keep the record that you submitted and what you agreed to — the caption, the
          version of these notices, your confirmations and the dates. That record is how we
          can show consent was given, and it is kept without the media.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your choices</h2>
        <p>
          <strong>Ask us to take it down.</strong> Email{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Tell
          us roughly when you submitted and what it showed, or the caption, so we can find
          it. We aim to acknowledge within three working days and remove it within seven. It
          leaves the Gallery immediately on removal and the media is deleted on the next
          cleanup.
        </p>
        <p>
          You can also ask what we hold about you, ask us to correct it, or withdraw your
          consent, using the same address.
        </p>
        <p className="text-sm text-neutral-700">
          Because taking part is anonymous, we cannot prove who submitted what. We will act
          on a plausible take-down request — the cost of being wrong is that something
          disappears. We will <strong>not</strong> disclose details about a submission
          without being satisfied it is yours, because the cost of being wrong there falls
          on someone else.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Minors</h2>
        <p>
          This evaluation is for adults. Submitting media in which anyone under 18 appears is
          prohibited. If you believe a minor appears in something here, email{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we
          will remove it and delete the media on the next cleanup.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cookies</h2>
        <p>
          Two, both strictly necessary: one that keeps you signed in to the experience, and
          one that records that you entered a valid access code. There are no advertising or
          analytics cookies.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Changes</h2>
        <p>
          This notice is versioned, and the version you agreed to is recorded with your
          submission. A substantive change produces a new version that applies only to
          submissions made after it.
        </p>
        <p>
          See also <Link className="underline" href={TERMS_ROUTE}>the Terms of Participation</Link>.
        </p>
      </section>
    </article>
  );
}
