"use client";

import { Button } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";

/**
 * The fork between AR, sharing a testimonial, and going straight to the
 * Journey.
 *
 * Sits BEFORE the AR screen, so `KameleonCameraKitExperience` and every
 * callback, reward and fallback inside it are untouched. Choosing AR here is
 * the only route into that screen and behaves exactly as the flow did before
 * this screen existed.
 *
 * AR AND CAPTURE ARE OPTIONAL, AND THE SCREEN NOW SAYS SO
 *   Until Continue to Journey existed, a visitor who wanted neither had no way
 *   forward at all: the opening gate is satisfied by AR completion or a
 *   submission, and this screen offered only those two. The skip changes no
 *   gate flag - it reuses the same screen transition every other route into
 *   the journey uses, and marks nothing complete.
 *
 * TWO STATES, ONE SCREEN
 *   First visit: three balanced choices with AR led.
 *   Just submitted: a distinct confirmation panel whose primary recommendation
 *   is the Journey, because the visitor has just done the optional thing and
 *   the obvious next step is the part they have not seen. AR and another story
 *   both stay available - none of the three is removed in either state.
 *
 * `justSubmittedTestimonial` is session-only and cleared by every action here,
 * so it never survives a reload or a second visit.
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
  onContinueToJourney,
}: {
  captureAvailable: boolean;
  justSubmittedTestimonial?: boolean;
  onChooseAr: () => void;
  onChooseTestimonial: () => void;
  onContinueToJourney: () => void;
}) {
  const recommendedLabel = (
    <span className="text-[10px] uppercase tracking-widest text-kameleon-copper-light">
      Recommended next
    </span>
  );

  const journeyAction = (
    <div className="flex flex-col gap-1.5">
      {justSubmittedTestimonial && recommendedLabel}
      <Button brand="kameleon" size="lg" fullWidth onClick={onContinueToJourney}>
        Continue to Journey
      </Button>
      <p className="text-xs text-kameleon-text-muted">
        Choose a pathway and watch your story unfold.
      </p>
    </div>
  );

  const arAction = (
    <div className="flex flex-col gap-1.5">
      {!justSubmittedTestimonial && recommendedLabel}
      <Button
        brand="kameleon"
        variant={justSubmittedTestimonial ? "secondary" : undefined}
        size="lg"
        fullWidth
        onClick={onChooseAr}
      >
        Enter AR Experience
      </Button>
      <p className="text-xs text-kameleon-text-muted">
        Place the Kameleon portal in your space.
      </p>
    </div>
  );

  const testimonialAction = (
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
        {justSubmittedTestimonial ? "Share Another Story" : "Share Your Story"}
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
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6 py-10 text-center">
        <KameleonEmblem className="h-14 w-14" />

        {justSubmittedTestimonial ? (
          // A panel, not a line of text: the visitor has just completed
          // something and the screen should look like it acknowledges that.
          <div className="flex w-full max-w-xs flex-col items-center gap-2 rounded-xl border border-kameleon-copper/40 bg-kameleon-copper/10 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-kameleon-copper/60">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M5 13l4 4L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-kameleon-copper-light"
                />
              </svg>
            </div>
            <p role="status" className="text-sm font-medium text-kameleon-text">
              Your story was submitted. What would you like to do next?
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
              Choose your next step
            </h1>
            <p className="max-w-xs text-sm text-kameleon-text-muted">
              Step into augmented reality, share your own Kameleon story, or go straight to
              the Journey — all three are open to you.
            </p>
          </div>
        )}

        {/* Order is the recommendation. After a submission the Journey leads;
            before one, AR does. Nothing is ever removed. */}
        <div className="flex w-full max-w-xs flex-col gap-4">
          {justSubmittedTestimonial ? (
            <>
              {journeyAction}
              {arAction}
              {testimonialAction}
            </>
          ) : (
            <>
              {arAction}
              {testimonialAction}
              {journeyAction}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
