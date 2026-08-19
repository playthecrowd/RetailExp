"use client";

import { Button } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";

/**
 * The new fork between the AR experience and sharing a testimonial.
 *
 * Sits BEFORE the AR screen, so `KameleonCameraKitExperience` and every
 * callback, reward and fallback inside it are untouched. Choosing AR here is
 * the only route into that screen and behaves exactly as the flow did before
 * this screen existed.
 *
 * `justSubmittedTestimonial` shows a one-time banner after a submission. It
 * lives in session state and is cleared by either choice, so it never survives
 * a reload or a second visit to this screen — it is a message about what just
 * happened, not a fact about the session.
 *
 * `captureAvailable` is resolved on the SERVER from the feature gate and
 * passed in. When it is false the option is visibly unavailable with honest
 * copy rather than hidden — a visitor who was told about it should see that it
 * is coming, not silently lose it. Hiding is never the control regardless:
 * every server action rejects while the gate is closed.
 */
export function ExperienceChoice({
  captureAvailable,
  justSubmittedTestimonial = false,
  onChooseAr,
  onChooseTestimonial,
}: {
  captureAvailable: boolean;
  justSubmittedTestimonial?: boolean;
  onChooseAr: () => void;
  onChooseTestimonial: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center">
        <KameleonEmblem className="h-14 w-14" />

        {justSubmittedTestimonial && (
          <p
            role="status"
            className="w-full max-w-xs rounded-lg border border-kameleon-copper/40 bg-kameleon-copper/10 px-3 py-2 text-xs text-kameleon-text"
          >
            Your testimonial was submitted. Continue your experience below.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Choose your next step
          </h1>
          <p className="max-w-xs text-sm text-kameleon-text-muted">
            Step into the augmented reality experience, or share your own Kameleon story.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-4">
          {/* The recommended next action, and marked as such. The testimonial
              option stays available and unchanged - a visitor may submit
              another - but after a submission the obvious thing to do next is
              the part of the experience they have not seen. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-kameleon-copper-light">
              Recommended next
            </span>
            <Button brand="kameleon" size="lg" fullWidth onClick={onChooseAr}>
              AR Experience
            </Button>
            <p className="text-xs text-kameleon-text-muted">
              Place the Kameleon portal in your space.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              brand="kameleon"
              variant="secondary"
              size="lg"
              fullWidth
              onClick={onChooseTestimonial}
              disabled={!captureAvailable}
              aria-describedby={!captureAvailable ? "capture-unavailable" : undefined}
            >
              {justSubmittedTestimonial ? "Share Another Story" : "Share Your Kameleon Story"}
            </Button>
            {captureAvailable ? (
              <p className="text-xs text-kameleon-text-muted">
                Record a short video or take a photo with your phone.
              </p>
            ) : (
              <p id="capture-unavailable" className="text-xs text-kameleon-text-muted">
                Coming soon. Sharing your story isn&rsquo;t switched on yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
