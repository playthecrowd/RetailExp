"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useGifting } from "@/lib/gifting/simulation/store";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import {
  ActionDock,
  Guidance,
  LiveRegion,
  RecallDot,
  Stage,
  StageContent,
  StageProvider,
  useStage,
} from "./shell";
import { Button } from "./ui";

/**
 * One gift, opened.
 *
 * WHAT THIS REPLACES
 *   Pressing View Gift used to play a video. But a gift is not a video — the
 *   video is how someone explains why they chose the thing, and the thing is
 *   what actually arrives. So this screen leads with the product: the box the
 *   visitor was given opens, the item they were sent rises out of it, and only
 *   then does the sender speak. Everything shown belongs to the card that was
 *   tapped; there is no generic reveal.
 *
 * WHY THE SEQUENCE IS CSS
 *   Nine elements, animated on opacity and transform only — the two properties
 *   a phone compositor handles without touching layout. Each beat carries its
 *   own delay, so the browser owns the schedule; a chain of timers drifts on a
 *   busy phone and you end up with the product already up while the box is
 *   still opening.
 *
 * REDUCED MOTION IS NOT A DEGRADED VERSION
 *   It is the same information delivered still: the closed box crossfades to
 *   the product. Nobody who asks for less motion is told less about their gift.
 */

/** How long the full sequence runs, matched to the last keyframe delay in
 *  globals.css. Kept as one number so the two cannot drift apart quietly. */
const SEQUENCE_MS = 6800;
/** Long enough that the product is genuinely looked at rather than glimpsed
 *  on the way past. Reduced motion means less movement, not less gift. */
const REDUCED_MS = 2400;

type Phase = "reveal" | "message" | "complete";

export function GiftReveal({ giftId, onExit }: { giftId: string; onExit: () => void }) {
  const { gallery } = useGifting();
  const gift = gallery.find((g) => g.id === giftId);
  const [phase, setPhase] = useState<Phase>("reveal");

  if (!gift) {
    return (
      <StageProvider stepKey="missing" theme="gallery">
        <Stage>
          <Guidance title="That gift isn't here" instruction="It may have been passed on." onExit={onExit} />
          <RecallDot />
          <ActionDock>
            <Button onClick={onExit}>Back to My Gifts</Button>
          </ActionDock>
        </Stage>
      </StageProvider>
    );
  }

  return (
    <StageProvider stepKey={`${gift.id}-${phase}`} theme="receive" pinned={phase === "complete"}>
      <RevealStage gift={gift} phase={phase} setPhase={setPhase} onExit={onExit} />
    </StageProvider>
  );
}

function RevealStage({
  gift,
  phase,
  setPhase,
  onExit,
}: {
  gift: GalleryItem;
  phase: Phase;
  setPhase: (p: Phase) => void;
  onExit: () => void;
}) {
  const { dispatch, config, showToast } = useGifting();
  const { reducedMotion, announce } = useStage();
  const [muted, setMuted] = useState(true);
  const [crossfaded, setCrossfaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fromSomeoneElse = gift.direction === "received";
  const canRegift = fromSomeoneElse && config.regiftingEnabled && gift.assignment !== "regifted";

  // The sequence ends on its own. Skipping just gets there sooner.
  useEffect(() => {
    if (phase !== "reveal") return;
    const id = setTimeout(() => setPhase("message"), reducedMotion ? REDUCED_MS : SEQUENCE_MS);
    return () => clearTimeout(id);
  }, [phase, reducedMotion, setPhase]);

  // The reduced-motion reveal: a closed box, then the product. Both states are
  // real — showing the product straight away would not be a crossfade, it
  // would just be skipping the gift.
  useEffect(() => {
    if (!reducedMotion || phase !== "reveal") return;
    const id = setTimeout(() => setCrossfaded(true), 450);
    return () => clearTimeout(id);
  }, [reducedMotion, phase]);

  useEffect(() => {
    if (phase === "message") announce(`${gift.product.name}. A message from ${gift.senderName}.`);
  }, [phase, gift, announce]);

  const toggleSound = useCallback(() => {
    setMuted((wasMuted) => {
      const nowMuted = !wasMuted;
      const video = videoRef.current;
      if (video) video.muted = nowMuted;
      if (!nowMuted) chime();
      return nowMuted;
    });
  }, []);

  return (
    <Stage className="gift-reveal-stage">
      <LiveRegion />
      <Guidance
        title={
          phase === "reveal"
            ? fromSomeoneElse
              ? "Something was sent to you"
              : "The gift you made"
            : phase === "message"
              ? fromSomeoneElse
                ? `From ${gift.senderName}`
                : `For ${gift.recipientName ?? "your recipient"}`
              : gift.product.name
        }
        instruction={
          phase === "reveal"
            ? "Sit back — this only takes a moment."
            : phase === "message"
              ? fromSomeoneElse
                ? "Their message, in their own voice."
                : "This is what they'll see."
              : fromSomeoneElse
                ? "Yours to keep, or to pass on."
                : "Ready whenever you are."
        }
        onExit={onExit}
        exitLabel="Back"
      />
      <RecallDot />

      <StageContent fill>
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          {/* The captions the sequence lands on. They sit above the box so a
              short phone never has to choose between them and the product. */}
          {phase === "reveal" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 text-center">
              <p
                className={cn(
                  "text-[19px] font-light tracking-tight text-gift-ink",
                  !reducedMotion && "gift-anim-caption",
                )}
              >
                {fromSomeoneElse
                  ? "A Gift Chosen for You"
                  : `A Gift Chosen for ${gift.recipientName ?? "Them"}`}
              </p>
              <p
                className={cn(
                  "mt-1 text-[12px] uppercase tracking-[0.24em] text-gift-ink-faint",
                  !reducedMotion && "gift-anim-sender",
                )}
              >
                From {gift.senderName}
              </p>
            </div>
          )}

          {/* The scene keeps its own frame while opening; afterwards it is a
              flexible row that yields space to the message below it. */}
          {phase === "reveal" ? (
            <GiftBoxScene
              gift={gift}
              phase={phase}
              reducedMotion={reducedMotion}
              crossfaded={crossfaded}
            />
          ) : (
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              <GiftBoxScene
                gift={gift}
                phase={phase}
                reducedMotion={reducedMotion}
                crossfaded={crossfaded}
              />
            </div>
          )}

          {phase === "message" && (
            <div className="mt-4 max-h-full w-full max-w-[22rem] shrink-0 overflow-y-auto overscroll-contain rounded-2xl border border-white/70 bg-[rgba(255,253,248,0.92)] shadow-sm backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="relative aspect-video w-full bg-black/5">
                <Image
                  src={gift.media.thumb ?? gift.media.poster}
                  alt={gift.media.alt}
                  fill
                  sizes="(max-width:480px) 100vw, 360px"
                  className="object-cover"
                />
                {gift.media.video && (
                  <video
                    ref={videoRef}
                    src={gift.media.video}
                    playsInline
                    {...{ "webkit-playsinline": "true" }}
                    muted={muted}
                    controls
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="px-4 py-3 text-[13px] leading-snug text-gift-ink">
                &ldquo;{gift.message}&rdquo;
              </p>
            </div>
          )}

          {phase === "complete" && (
            <CompletedDetails gift={gift} muted={muted} videoRef={videoRef} />
          )}
        </div>
      </StageContent>

      {/* Permanent throughout. The way on and the way back never fade. */}
      <ActionDock>
        {phase === "reveal" && (
          <>
            <Button variant="secondary" onClick={() => setPhase("message")}>
              Skip
            </Button>
            <SoundChip muted={muted} onToggle={toggleSound} />
          </>
        )}

        {phase === "message" && (
          <>
            <Button onClick={() => setPhase("complete")}>Continue</Button>
            <SoundChip muted={muted} onToggle={toggleSound} />
          </>
        )}

        {phase === "complete" && (
          <>
            {canRegift ? (
              <Button onClick={() => dispatch({ type: "REGIFT_FROM", item: gift })}>
                Regift This Item
              </Button>
            ) : (
              <Button onClick={() => showToast("Saved to My Gifts")}>Keep This Gift</Button>
            )}
            <Button variant="secondary" onClick={onExit}>
              Return to My Gifts
            </Button>
          </>
        )}
      </ActionDock>
    </Stage>
  );
}

function SoundChip({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      className="mx-auto min-h-11 rounded-full border border-gift-border bg-white/70 px-5 text-[11px] uppercase tracking-[0.16em] text-gift-ink-soft"
    >
      {muted ? "Sound On" : "Sound Off"}
    </button>
  );
}

/**
 * The box, the light, and the product — one stack, so the item genuinely comes
 * out of the packaging rather than appearing beside it.
 */
function GiftBoxScene({
  gift,
  phase,
  reducedMotion,
  crossfaded,
}: {
  gift: GalleryItem;
  phase: Phase;
  reducedMotion: boolean;
  /** Reduced motion only: the halfway point of the closed-box-to-product
   *  crossfade. Ignored when the full sequence is playing. */
  crossfaded: boolean;
}) {
  const revealing = phase === "reveal";
  // Plain opacity, not a keyframe, so the crossfade cannot fall out of step
  // with the media query that decides which reveal a visitor gets.
  const productHidden = reducedMotion && revealing && !crossfaded;
  const boxHidden = reducedMotion && revealing && crossfaded;
  // Once the sequence is over the product simply IS there. Leaving the entry
  // animation attached would restart it every time React re-rendered.
  const opened = !revealing;

  return (
    <div
      className={cn(
        "relative",
        // While opening, the scene is the screen and takes a fixed portrait
        // frame. Afterwards the box is gone and the message needs the room, so
        // the plate is sized from the height that is actually left — a width
        // cap would still overflow a short phone.
        revealing
          ? "aspect-[4/5] w-full max-w-[18.5rem] shrink-0"
          : "aspect-[5/4] h-full max-h-[11.5rem] min-h-0 w-auto",
        revealing && !reducedMotion && "gift-anim-scene",
      )}
    >
      <div className="gift-reveal-floor absolute inset-x-0 bottom-[2%] h-24" aria-hidden="true" />

      {/* The product, as a plate that lifts out of the box. The stills are
          scene photography rather than cut-outs, so `cover` inside a framed
          card reads as the item; `contain` letterboxes it into a stripe and
          the whole reveal goes flat. Its lower edge finishes BEHIND the box
          front, which is what sells the rise. */}
      <div
        className={cn(
          "absolute inset-x-[3%] top-0",
          revealing ? "h-[72%]" : "h-full",
          revealing && !reducedMotion && "gift-anim-product",
          reducedMotion && "transition-opacity duration-500",
          productHidden && "opacity-0",
        )}
      >
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-2xl border border-white/70 shadow-[0_22px_40px_-18px_rgba(63,60,55,0.45)]",
            !reducedMotion && "gift-anim-turn",
          )}
        >
          <Image
            src={gift.product.image}
            alt={gift.product.alt}
            fill
            sizes="(max-width:480px) 82vw, 300px"
            className="object-cover"
            priority
          />
          {/* A single soft highlight across the plate, so it reads as a lit
              object rather than a pasted photograph. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-transparent"
          />
        </div>
      </div>

      {/* Light from inside the open box. */}
      {revealing && !reducedMotion && (
        <div
          aria-hidden="true"
          className="gift-inner-light gift-anim-glow absolute inset-x-[12%] bottom-[30%] h-36 origin-bottom"
        />
      )}

      {/* Light streaks and particles: restrained, and only while opening. */}
      {revealing && !reducedMotion && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {[18, 38, 58, 78].map((left, i) => (
            <span
              key={`streak-${left}`}
              className="gift-anim-streak absolute bottom-[34%] w-px bg-gradient-to-t from-transparent via-[rgba(240,227,194,0.9)] to-transparent"
              style={{ left: `${left}%`, height: "6.5rem", animationDelay: `${2900 + i * 120}ms` }}
            />
          ))}
          {PARTICLES.map((p, i) => (
            <span
              key={`particle-${i}`}
              className="gift-anim-particle absolute bottom-[36%] h-1 w-1 rounded-full bg-[rgba(214,190,132,0.95)]"
              style={
                {
                  left: `${p.left}%`,
                  animationDelay: `${3000 + p.delay}ms`,
                  "--gift-drift": `${p.drift}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* The box itself. It goes once opened, because an empty box next to the
          product is just clutter. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-[7%] bottom-[6%] h-[32%] transition-opacity duration-500",
          (opened || boxHidden) && "pointer-events-none opacity-0",
        )}
      >
        <div
          className={cn(
            "relative h-full w-full",
            revealing && !reducedMotion && "gift-anim-box",
          )}
        >
          {/* Lid, lifting away. */}
          <div
            className={cn(
              "gift-box-lid absolute -top-[14%] -left-[4%] h-[26%] w-[108%] rounded-[10px]",
              revealing && !reducedMotion && "gift-anim-lid",
            )}
          >
            <span className="gift-box-edge absolute inset-x-2 bottom-1 h-px" />
          </div>

          {/* Body. */}
          <div className="gift-box-body absolute inset-0 rounded-[10px]">
            <span className="gift-box-edge absolute inset-x-3 top-2 h-px" />
          </div>

          {/* Ribbon, loosening then lifting. */}
          <div
            className={cn(
              "gift-ribbon absolute inset-x-0 top-[38%] h-[9%] origin-center",
              revealing && !reducedMotion && "gift-anim-ribbon-h",
            )}
          />
          <div
            className={cn(
              "gift-ribbon absolute inset-y-0 left-[44%] w-[11%] origin-center",
              revealing && !reducedMotion && "gift-anim-ribbon-v",
            )}
          />
        </div>
      </div>
    </div>
  );
}

/** Fixed positions rather than random ones: the same reveal every time is what
 *  makes it feel designed instead of generated. */
const PARTICLES = [
  { left: 24, delay: 0, drift: -14 },
  { left: 36, delay: 180, drift: 10 },
  { left: 48, delay: 90, drift: -6 },
  { left: 58, delay: 300, drift: 16 },
  { left: 68, delay: 210, drift: -12 },
  { left: 44, delay: 420, drift: 22 },
  { left: 30, delay: 500, drift: 8 },
];

function CompletedDetails({
  gift,
  muted,
  videoRef,
}: {
  gift: GalleryItem;
  muted: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="mt-4 max-h-full w-full max-w-[22rem] shrink-0 overflow-y-auto overscroll-contain rounded-2xl border border-white/70 bg-[rgba(255,253,248,0.92)] p-4 shadow-sm backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <p className="text-[10px] uppercase tracking-[0.24em] text-gift-ink-faint">
        {gift.direction === "received"
          ? `From ${gift.senderName}`
          : `For ${gift.recipientName ?? "your recipient"}`}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-gift-ink">&ldquo;{gift.message}&rdquo;</p>
      {gift.recipientNote && (
        <p className="mt-2 border-l border-gift-border pl-3 text-[12px] italic text-gift-ink-soft">
          {gift.recipientNote}
        </p>
      )}

      {playing && gift.media.video ? (
        <div className="mt-3 overflow-hidden rounded-xl">
          <video
            ref={videoRef}
            src={gift.media.video}
            playsInline
            {...{ "webkit-playsinline": "true" }}
            muted={muted}
            controls
            autoPlay
            className="aspect-video w-full object-cover"
          />
        </div>
      ) : (
        gift.media.video && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="mt-3 min-h-11 w-full rounded-full border border-gift-border bg-white/70 text-[12px] text-gift-ink-soft hover:border-gift-border-strong hover:text-gift-ink"
          >
            Play Their Message Again
          </button>
        )
      )}

      {gift.history && gift.history.length > 0 && (
        <p className="mt-3 text-[11px] text-gift-ink-faint">
          Previously given by {gift.history[gift.history.length - 1].senderName}.
        </p>
      )}
    </div>
  );
}

/**
 * One soft note when the box opens, and only if the visitor asked for sound.
 *
 * Synthesised rather than shipped as a file: it is two sine tones and an
 * envelope, and an asset would cost a request and a download for something the
 * browser can already make.
 */
function chime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    gain.connect(ctx.destination);
    for (const [freq, delay] of [
      [784, 0],
      [1174.7, 0.12],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + delay);
      osc.stop(now + 1.8);
    }
    setTimeout(() => void ctx.close(), 2200);
  } catch {
    // Sound is a nicety. A blocked or unavailable audio context is not a
    // reason for anything on screen to behave differently.
  }
}
