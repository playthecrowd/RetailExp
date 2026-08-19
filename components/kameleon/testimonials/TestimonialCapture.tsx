"use client";

import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { GALLERY_ROUTE } from "@/lib/testimonials/routes";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/legal/evaluation-notices";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import {
  CAPTURE_ACCEPT,
  CAPTURE_FACING,
  MAX_CAPTION_LENGTH,
  MAX_VIDEO_DURATION_SECONDS,
  checkCapturedFile,
  formatBytes,
  maxBytesFor,
  normalizeCaption,
  type CaptureMediaType,
} from "@/lib/testimonials/limits";
import {
  createTestimonialIntentAction,
  finalizeTestimonialUploadAction,
  requestUploadDestinationAction,
  updateTestimonialCaptionAction,
} from "@/app/experience/kameleon/testimonial-actions";

/**
 * The phone-first capture flow.
 *
 * Capture uses a native file input with `capture`, not MediaRecorder. That is
 * the approved v1 decision and it is the right one for this audience: the OS
 * camera is what the visitor already knows, it handles rotation, interruption
 * and codec selection itself, and it sidesteps the iOS Safari MediaRecorder
 * problems entirely. `capture` is a HINT — some browsers open a picker — so no
 * copy here promises a specific camera or forbids an existing file.
 *
 * THE UPLOAD IS DIRECT TO THE PROVIDER. The server returns a ONE-TIME
 * destination and the browser POSTs the file straight to it, so the file never
 * passes through our server. The provider's asset identifier is never returned
 * here: it is recorded server-side against a ledger reservation made before
 * the destination existed.
 *
 * NOTHING HERE IS TRUSTED. checkCapturedFile() below is convenience only - it
 * gives a fast, kind error instead of a slow rejection. Size, duration, type
 * and dimensions are all spoofable from a browser, so the real limits are
 * Cloudflare's own (maxDurationSeconds, the format and size ceilings) and the
 * server-side validation that reads them back from the provider.
 */

type Step =
  | "choose"
  | "permission"
  | "preview"
  | "caption"
  | "consent"
  | "uploading"
  | "submitted"
  | "blocked";

interface Consent {
  /** The submitter's OWN age. Distinct from noMinors, which is about who
   *  appears in the media — the two were conflated until the evaluation was
   *  scoped to adults, and nothing recorded the submitter's age at all. */
  submitterAdult: boolean;
  noMinors: boolean;
  subjectsConsented: boolean;
  galleryDisplay: boolean;
}

/** Every box starts unchecked. A pre-ticked consent box is not consent. */
/**
 * How many times the browser asks the server to finalize before giving up.
 *
 * Cloudflare needs a moment after the upload POST before an image is
 * queryable, so the first ask can legitimately answer "processing". Five
 * attempts two seconds apart covers that without leaving a visitor watching a
 * spinner if something is genuinely wrong.
 */
const FINALIZE_ATTEMPTS = 5;
const FINALIZE_RETRY_MS = 2000;

const EMPTY_CONSENT: Consent = {
  submitterAdult: false,
  noMinors: false,
  subjectsConsented: false,
  galleryDisplay: false,
};

/**
 * NOTE ON THE MISSING onSubmitted PROP.
 *
/**
 * THE SUCCESS SCREEN DOES NOT ADVANCE THE JOURNEY BY ITSELF.
 *
 * There was no way to report success at all until the upload chain existed —
 * an earlier draft declared an onSubmitted prop and never called it, which was
 * correct behaviour reached by accident, and one tidy-up would have restored
 * it. Now that a submission is real, advancing IS a legitimate outcome, but it
 * is the visitor's choice rather than a consequence of submitting: the screen
 * offers the Journey, the Gallery, or going back, and does nothing on its own.
 *
 * onContinueToJourney is what dispatches TESTIMONIAL_SUBMITTED. That action
 * deliberately does not set arCompleted and awards no reward — sharing a story
 * opens the journey on its own terms, it is not AR completion.
 */
export function TestimonialCapture({
  onCancel,
  onContinueToJourney,
}: {
  onCancel: () => void;
  onContinueToJourney: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [mediaType, setMediaType] = useState<CaptureMediaType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState<Consent>(EMPTY_CONSENT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are revoked when they are replaced or the flow unmounts,
  // otherwise a retake leaks a blob per attempt on a phone with little to spare.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pick(type: CaptureMediaType) {
    setMediaType(type);
    setError(null);
    setStep("permission");
  }

  function openCamera() {
    inputRef.current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    // Reset so choosing the SAME file again still fires a change event —
    // otherwise "retake" silently does nothing on a second identical capture.
    event.target.value = "";
    if (!chosen || !mediaType) return;

    const check = checkCapturedFile(mediaType, chosen);
    if (check.status === "too-large") {
      setError(
        `That ${mediaType === "image" ? "photo" : "video"} is larger than ${formatBytes(check.limitBytes)}. Try a shorter or smaller one.`,
      );
      return;
    }
    if (check.status === "wrong-type") {
      setError("That file type isn't supported. Please capture with your camera.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
    setError(null);
    setStep("preview");
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setError(null);
    setStep("permission");
  }

  const trimmedCaption = normalizeCaption(caption);
  const captionTooLong = trimmedCaption.length > MAX_CAPTION_LENGTH;
  // Every attestation must be explicitly ticked. Nothing is pre-checked, and
  // the submit control stays disabled until all three are true.
  const consentComplete =
    consent.submitterAdult &&
    consent.noMinors &&
    consent.subjectsConsented &&
    consent.galleryDisplay;

  async function submit() {
    if (!consentComplete || !file || !mediaType || busy) return;
    setBusy(true);
    setError(null);
    setStep("uploading");

    // 1. An intent, created server-side. Idempotent by state, so a reload
    //    mid-flow returns the existing one rather than accumulating orphans.
    const intent = await createTestimonialIntentAction(mediaType, consent.submitterAdult);
    if (intent.status === "error" || !intent.data) {
      setBusy(false);
      setError(intent.message);
      setStep("blocked");
      return;
    }

    // 2. A one-time destination. The reservation, the provider call and the
    //    attachment all happen server-side before this returns.
    const destination = await requestUploadDestinationAction(intent.data.submissionId, mediaType);
    if (destination.status === "error" || !destination.data) {
      setBusy(false);
      setError(destination.message);
      setStep("blocked");
      return;
    }

    // 3. Straight to the provider. Cloudflare documents a single multipart
    //    POST with the field name `file` for BOTH products - not PUT, and not
    //    reusable. The URL is used once, here, and never stored.
    try {
      const body = new FormData();
      body.set(destination.data.fileFieldName, file);
      const response = await fetch(destination.data.uploadUrl, { method: "POST", body });
      if (!response.ok) throw new Error("upload_rejected");
    } catch {
      setBusy(false);
      // Deliberately generic: the visitor cannot act on a provider error code,
      // and echoing one would leak provider detail into the browser.
      setError("That upload didn't finish. You can try again.");
      setStep("blocked");
      return;
    }

    // 4. The caption, if any. Sent after the upload so a failed upload does
    //    not leave a caption attached to nothing.
    if (trimmedCaption.length > 0) {
      await updateTestimonialCaptionAction(intent.data.submissionId, trimmedCaption);
    }

    // 5. Finalize.
    //
    //    THIS IS NOT A FORMALITY FOR PHOTOS. Cloudflare Images publishes no
    //    webhook this codebase can verify, so this call is the ONLY thing that
    //    ever moves an image submission to valid. A video is normally
    //    reconciled by the signed Stream webhook and this is its fallback.
    //
    //    The server does not believe us: it performs an authenticated read
    //    from the provider and decides for itself. All this loop does is ask
    //    again while the provider is still working, because an image asked for
    //    too early answers "processing" and nothing else would ever ask again.
    //
    //    Bounded, and giving up is safe: an unfinalized intent is expired by
    //    the retention sweep and its provider media deleted with it.
    for (let attempt = 0; attempt < FINALIZE_ATTEMPTS; attempt += 1) {
      const finalized = await finalizeTestimonialUploadAction(intent.data.submissionId);
      if (finalized.status === "error" || finalized.data?.state !== "processing") break;
      await new Promise((resolve) => setTimeout(resolve, FINALIZE_RETRY_MS));
    }

    setBusy(false);
    // Honest end state. The submission is NOT approved and NOT published: it
    // is now waiting on provider processing and then human moderation, and
    // this screen says exactly that rather than implying it is live.
    setStep("submitted");
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />

      <div className="relative flex flex-1 flex-col gap-5 px-6 py-8">
        <header className="flex items-start justify-between gap-3">
          <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Share your story
          </h1>
          <Button brand="kameleon" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </header>

        {/* One hidden input, retargeted per media type. `capture` is a hint. */}
        {mediaType && (
          <input
            ref={inputRef}
            type="file"
            accept={CAPTURE_ACCEPT[mediaType]}
            capture={CAPTURE_FACING[mediaType]}
            onChange={onFileChosen}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        )}

        {error && (
          <p role="alert" className="rounded-md bg-kameleon-red/15 px-3 py-2 text-sm text-kameleon-text">
            {error}
          </p>
        )}

        {step === "choose" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-kameleon-text-muted">
              Take a photo or record a short video with your phone.
            </p>
            <Button brand="kameleon" size="lg" fullWidth onClick={() => pick("image")}>
              Take a photo
            </Button>
            <Button brand="kameleon" variant="secondary" size="lg" fullWidth onClick={() => pick("video")}>
              Record a video
            </Button>
            <p className="text-xs text-kameleon-text-muted">
              Videos can be up to {MAX_VIDEO_DURATION_SECONDS} seconds.
            </p>
          </div>
        )}

        {step === "permission" && mediaType && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-kameleon-text">
              Your phone will ask for camera access. Nothing is sent anywhere until you review it
              and choose to submit.
            </p>
            <p className="text-xs text-kameleon-text-muted">
              {mediaType === "image"
                ? `Photos up to ${formatBytes(maxBytesFor("image"))}.`
                : `Videos up to ${MAX_VIDEO_DURATION_SECONDS} seconds and ${formatBytes(maxBytesFor("video"))}.`}
            </p>
            <Button brand="kameleon" size="lg" fullWidth onClick={openCamera}>
              Open camera
            </Button>
            <Button brand="kameleon" variant="ghost" size="sm" onClick={() => setStep("choose")}>
              Back
            </Button>
            <p className="text-xs text-kameleon-text-muted">
              If the camera doesn&rsquo;t open, your browser may not support it. You can still
              choose a file from your device.
            </p>
          </div>
        )}

        {step === "preview" && previewUrl && mediaType && (
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-kameleon-copper/30">
              {mediaType === "image" ? (
                // Local object URL only — this never leaves the device in 4B.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Your captured photo" className="max-h-80 w-full object-contain" />
              ) : (
                <video src={previewUrl} controls playsInline className="max-h-80 w-full" />
              )}
            </div>
            <Button brand="kameleon" size="lg" fullWidth onClick={() => setStep("caption")}>
              Use this
            </Button>
            <Button brand="kameleon" variant="secondary" fullWidth onClick={retake}>
              Retake
            </Button>
          </div>
        )}

        {step === "caption" && (
          <div className="flex flex-col gap-3">
            <label htmlFor="testimonial-caption" className="text-sm font-medium text-kameleon-text">
              Add a caption <span className="text-kameleon-text-muted">(optional)</span>
            </label>
            <textarea
              id="testimonial-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              maxLength={MAX_CAPTION_LENGTH * 2}
              className="rounded-md border border-kameleon-copper/40 bg-kameleon-surface px-3 py-2 text-sm text-kameleon-text"
            />
            <p className={captionTooLong ? "text-xs text-kameleon-red" : "text-xs text-kameleon-text-muted"}>
              {trimmedCaption.length} / {MAX_CAPTION_LENGTH}
            </p>
            <Button
              brand="kameleon"
              size="lg"
              fullWidth
              disabled={captionTooLong}
              onClick={() => setStep("consent")}
            >
              Continue
            </Button>
            <Button brand="kameleon" variant="ghost" size="sm" onClick={() => setStep("preview")}>
              Back
            </Button>
          </div>
        )}

        {step === "consent" && (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-kameleon-text">Before you submit</legend>

              <ConsentBox
                id="consent-adult"
                checked={consent.submitterAdult}
                onChange={(v) => setConsent((c) => ({ ...c, submitterAdult: v }))}
                label="I confirm that I am 18 or older."
              />
              <ConsentBox
                id="consent-no-minors"
                checked={consent.noMinors}
                onChange={(v) => setConsent((c) => ({ ...c, noMinors: v }))}
                label="I confirm that no minors appear."
              />
              <ConsentBox
                id="consent-subjects"
                checked={consent.subjectsConsented}
                onChange={(v) => setConsent((c) => ({ ...c, subjectsConsented: v }))}
                label="I confirm that every person shown consented."
              />
              <ConsentBox
                id="consent-gallery"
                checked={consent.galleryDisplay}
                onChange={(v) => setConsent((c) => ({ ...c, galleryDisplay: v }))}
                label="I consent to displaying this submission in the Kameleon experience Gallery if approved."
              />
            </fieldset>

            <div className="flex flex-col gap-1.5 text-xs text-kameleon-text-muted">
              <p>Every submission is reviewed before it can appear. Submitting does not guarantee it will be published.</p>
              <p>If it is not approved, it is kept privately for 30 days and then deleted.</p>
              <p>This consent covers Gallery display in the Kameleon experience only.</p>
              <p>
                This evaluation is for adults. We do not verify anyone&rsquo;s age — the
                confirmation above is yours to make.
              </p>
              {/* No marketing, advertising or social-media reuse consent appears
                  here, and none may be added without a separate approved scope. */}
            </div>

            {/* The documents being agreed to must be READABLE at the moment
                of agreeing. They open in a new tab so a half-completed capture
                is not lost to a navigation, and they sit outside the gated
                experience so they stay reachable afterwards too. */}
            <p className="text-xs text-kameleon-text-muted">
              By submitting you agree to the{" "}
              <a
                href={TERMS_ROUTE}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Terms of Participation
              </a>{" "}
              and the{" "}
              <a
                href={PRIVACY_ROUTE}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Privacy Notice
              </a>
              .
            </p>

            <Button
              brand="kameleon"
              size="lg"
              fullWidth
              disabled={!consentComplete || busy}
              loading={busy}
              onClick={submit}
            >
              Submit for review
            </Button>
            <Button brand="kameleon" variant="ghost" size="sm" onClick={() => setStep("caption")}>
              Back
            </Button>
          </div>
        )}

        {step === "uploading" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-kameleon-text">Sending your story…</p>
            <p className="text-xs text-kameleon-text-muted">
              This can take a moment on a phone connection. Please keep this screen open.
            </p>
          </div>
        )}

        {step === "submitted" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-kameleon-text">Thank you — your story is in.</p>
            {/* Deliberately does NOT say published. The submission still has to
                finish processing at the provider and then be reviewed, and
                promising more than that would be untrue. The Gallery link below
                is offered anyway: seeing that it is not there yet is a truthful
                answer to "where did it go?". */}
            <p className="text-xs text-kameleon-text-muted">
              It needs to finish processing and be reviewed before it can appear in the
              Gallery. Nothing else is needed from you.
            </p>

            {/* Three ways on, and none of them happens on its own. Submitting
                used to drop the visitor straight into the Journey, which took
                the decision away from them at the one moment they were most
                likely to want the Gallery instead. */}
            <Button brand="kameleon" size="lg" fullWidth onClick={onContinueToJourney}>
              Continue to Journey
            </Button>
            <LinkButton
              brand="kameleon"
              variant="secondary"
              size="lg"
              fullWidth
              href={GALLERY_ROUTE}
            >
              View Stakeholder Gallery
            </LinkButton>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-kameleon-text-muted underline underline-offset-4"
            >
              Return to experience choices
            </button>
          </div>
        )}

        {step === "blocked" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-kameleon-text">
              {error ?? "Sharing your story isn't switched on yet."}
            </p>
            <p className="text-xs text-kameleon-text-muted">
              Nothing was sent and nothing was saved. Your photo or video stayed on your phone.
            </p>
            <Button brand="kameleon" size="lg" fullWidth onClick={onCancel}>
              Back to choices
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentBox({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-kameleon-copper"
      />
      <label htmlFor={id} className="text-sm text-kameleon-text">
        {label}
      </label>
    </div>
  );
}
