"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
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
import { requestUploadDestinationAction } from "@/app/experience/kameleon/testimonial-actions";

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
 * PHASE 4B STOPS BEFORE UPLOADING. Cloudflare is not integrated, so the submit
 * step calls a server action that truthfully reports the upload is unavailable.
 * Nothing is sent, no provider identifier is invented and no submission is
 * fabricated. The preview shown here is a local object URL that never leaves
 * the device.
 */

type Step = "choose" | "permission" | "preview" | "caption" | "consent" | "blocked";

interface Consent {
  noMinors: boolean;
  subjectsConsented: boolean;
  galleryDisplay: boolean;
}

const EMPTY_CONSENT: Consent = {
  noMinors: false,
  subjectsConsented: false,
  galleryDisplay: false,
};

/**
 * NOTE ON THE MISSING onSubmitted PROP.
 *
 * There is deliberately no way for this component to report success, because
 * in Phase 4B there is no success to report: nothing is uploaded and no
 * provider has confirmed anything. An earlier draft declared an onSubmitted
 * prop and never called it — the right behaviour, but only because a
 * destructure happened to omit it, which one tidy-up would have restored.
 *
 * Removing it from the contract makes advancing the journey an explicit act
 * that Phase 4C has to add, not something a refactor can reinstate by
 * accident.
 */
export function TestimonialCapture({ onCancel }: { onCancel: () => void }) {
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
  const consentComplete = consent.noMinors && consent.subjectsConsented && consent.galleryDisplay;

  async function submit() {
    if (!consentComplete || !file || busy) return;
    setBusy(true);
    setError(null);

    // Phase 4B: this reports unavailability rather than uploading. It is a
    // real server call, so the feature gate and the anonymous-visitor check
    // are both genuinely exercised.
    const result = await requestUploadDestinationAction();
    setBusy(false);

    if (result.status === "error") {
      setError(result.message);
      setStep("blocked");
      return;
    }
    // No success branch exists yet, and inventing one would mean fabricating a
    // submission. Phase 4C adds it.
    setStep("blocked");
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
              {/* No marketing, advertising or social-media reuse consent appears
                  here, and none may be added without a separate approved scope. */}
            </div>

            <p className="rounded-md bg-kameleon-red/15 px-3 py-2 text-xs text-kameleon-text">
              Terms and Privacy documents are not available yet, so submissions cannot be accepted.
              This is a launch blocker, not an error on your part.
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
