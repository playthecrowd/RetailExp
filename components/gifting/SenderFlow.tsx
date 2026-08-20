"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { media, useGifting } from "@/lib/gifting/simulation/store";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import { AI_STAGE_LABELS, type AiJobStage } from "@/lib/gifting/simulation/types";
import {
  ActionDock,
  Guidance,
  LiveRegion,
  Pager,
  PagerIndicator,
  RecallDot,
  Stage,
  StageContent,
  StageProvider,
  useStage,
} from "./shell";
import { VideoStage } from "./VideoStage";
import { GiftingKeyboardProvider } from "./keyboard/context";
import { KeyboardField } from "./keyboard/KeyboardField";
import { LONG_TEXT_MAX } from "./keyboard/model";
import { Body, Button, Card, Checkbox, CodeChip } from "./ui";

/**
 * Creating or regifting, as full-screen panels.
 *
 * Every required action lives in ActionDock, which has no visibility state, so
 * no step can lose its way forward to an instruction timer.
 */

/** Regifting is one step shorter: the package is the one already in the
 *  visitor's hand, so there is nothing to look up. */
const STEPS_NEW = 8;
const STEPS_REGIFT = 7;

export function SenderFlow({ onExit }: { onExit: () => void }) {
  const { senderStep, draft } = useGifting();
  return (
    <StageProvider stepKey={senderStep} theme={draft.isRegift ? "regift" : "create"}>
      <GiftingKeyboardProvider>
        <Step onExit={onExit} />
      </GiftingKeyboardProvider>
    </StageProvider>
  );
}

function Step({ onExit }: { onExit: () => void }) {
  const { senderStep } = useGifting();
  switch (senderStep) {
    case "record":
      return <Record onExit={onExit} />;
    case "uploading":
      return <Uploading onExit={onExit} />;
    case "preview":
      return <Preview onExit={onExit} />;
    case "choose-kind":
      return <ChooseKind onExit={onExit} />;
    case "choose-template":
      return <ChooseTemplate onExit={onExit} />;
    case "consent":
      return <Consent onExit={onExit} />;
    case "recipient":
      return <Recipient onExit={onExit} />;
    case "message-code":
      return <MessageCodeIssued onExit={onExit} />;
    case "package-code":
      return <PackageCodeEntry onExit={onExit} />;
    case "confirm-product":
      return <ConfirmProduct onExit={onExit} />;
    case "processing":
      return <Processing onExit={onExit} />;
    case "result":
      return <Result onExit={onExit} />;
    case "card":
      return <AccessCard onExit={onExit} />;
    default:
      return <Intro onExit={onExit} />;
  }
}

function Backdrop({ src, alt, dim = 0.6 }: { src: string; alt: string; dim?: number }) {
  return (
    <>
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" priority />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(250,249,246,${dim + 0.2}), rgba(250,249,246,${dim}), rgba(250,249,246,${dim + 0.3}))`,
        }}
      />
    </>
  );
}

const glass = "rounded-2xl border border-white/70 bg-[rgba(250,249,246,0.9)] backdrop-blur-xl";

function Intro({ onExit }: { onExit: () => void }) {
  const { dispatch, draft } = useGifting();
  const regifting = draft.isRegift;
  return (
    <Stage media={<Backdrop src={draft.product.image} alt={draft.product.alt} dim={0.55} />}>
      <LiveRegion />
      <Guidance
        // The product is named, not described. Someone regifting already knows
        // what they are holding; the screen's job is to confirm we do too.
        title={regifting ? `You're Regifting ${draft.product.name}` : "Make it personal"}
        instruction={
          regifting
            ? "Same item, new message. We'll keep the package it came in."
            : "Record a short message. We'll pair it with a package."
        }
        onExit={onExit}
      />
      <RecallDot />
      <StageContent>
        <div className={`${glass} overflow-hidden`}>
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={draft.product.image}
              alt={draft.product.alt}
              fill
              sizes="(max-width:480px) 100vw, 380px"
              className="object-contain p-4"
            />
          </div>
          <div className="px-5 pb-5 text-center">
            <p className="text-[15px] text-gift-ink">{draft.product.name}</p>
            <Body className="mt-1 text-[12px]">
              {regifting
                ? "Record a new message for whoever gets it next."
                : "You'll record a message, choose how it looks, add a recipient, and get a card to hand over."}
            </Body>
          </div>
        </div>
      </StageContent>
      <ActionDock>
        <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "record" })}>
          Record a message
        </Button>
      </ActionDock>
    </Stage>
  );
}

function Record({ onExit }: { onExit: () => void }) {
  const { dispatch, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const { setPinned, announce } = useStage();
  const [permission, setPermission] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => setPinned(permission === "denied"), [permission, setPinned]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  return (
    <Stage
      media={
        <>
          <Image
            src={media.giftReveal.poster}
            alt="Camera preview"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35" />
        </>
      }
    >
      <LiveRegion />
      <Guidance
        title="Record your message"
        instruction="Keep it short — sixty seconds is plenty."
        step={1}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />

      {recording && (
        <div
          className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-4 py-2 backdrop-blur-sm"
          style={{ top: "calc(env(safe-area-inset-top) + 5.2rem)" }}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e0736a]" />
          <span className="font-mono text-[13px] text-white">
            0:{String(seconds).padStart(2, "0")}
          </span>
        </div>
      )}

      <ActionDock
        error={permission === "denied" ? "Camera access is off for this site." : null}
        note={permission === "idle" ? "We'll ask for camera and microphone access." : undefined}
      >
        {permission === "idle" && (
          <>
            <Button
              onClick={() => {
                setPermission("asking");
                announce("Requesting camera access");
                setTimeout(() => {
                  setPermission("granted");
                  announce("Camera ready");
                }, 900);
              }}
            >
              Allow Camera &amp; Microphone
            </Button>
            <Button variant="ghost" onClick={() => setPermission("denied")}>
              Not now
            </Button>
          </>
        )}

        {permission === "asking" && (
          <div className="flex min-h-14 items-center justify-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-gift-border border-t-gift-ink" />
            <Body className="text-[12px]">Waiting for permission…</Body>
          </div>
        )}

        {permission === "denied" && (
          <>
            <Button variant="secondary" onClick={() => setPermission("idle")}>
              Try Again
            </Button>
            <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "uploading" })}>
              Use a Prepared Message
            </Button>
          </>
        )}

        {permission === "granted" &&
          (!recording ? (
            <>
              <Button onClick={() => setRecording(true)}>Start Recording</Button>
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: "SENDER_STEP", step: "uploading" })}
              >
                Upload a video instead
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setRecording(false);
                dispatch({ type: "SENDER_STEP", step: "uploading" });
              }}
            >
              Stop &amp; Use This Take
            </Button>
          ))}
      </ActionDock>
    </Stage>
  );
}

/** The bottle fills as the upload progresses — the product is the indicator. */
function BottleProgress({ percent }: { percent: number }) {
  return (
    <div className="mx-auto w-44">
      {/* Two copies of the SAME image in the SAME box: a ghost, and a solid one
          clipped from the top, so the fill rises from the base and registers
          exactly at every height. */}
      <div className="relative aspect-[3/4] w-full">
        <Image
          src={media.heroProduct.poster}
          alt=""
          fill
          sizes="176px"
          className="object-contain opacity-20"
        />
        <div
          className="absolute inset-0 transition-[clip-path] duration-300 ease-out"
          style={{ clipPath: `inset(${100 - percent}% 0 0 0)` }}
        >
          <Image
            src={media.heroProduct.poster}
            alt=""
            fill
            sizes="176px"
            className="object-contain"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="h-0.5 w-28 overflow-hidden rounded-full bg-gift-border">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%`, background: "var(--gift-accent)" }}
          />
        </div>
        <span className="font-mono text-[12px] tabular-nums text-gift-ink-soft">{percent}%</span>
      </div>
    </div>
  );
}

function Uploading({ onExit }: { onExit: () => void }) {
  const { dispatch, uploadPercent, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const { announce } = useStage();

  useEffect(() => {
    if (uploadPercent >= 100) {
      announce("Upload complete");
      const done = setTimeout(() => dispatch({ type: "SENDER_STEP", step: "preview" }), 600);
      return () => clearTimeout(done);
    }
    const tick = setTimeout(
      () => dispatch({ type: "UPLOAD", percent: Math.min(100, uploadPercent + 7) }),
      160,
    );
    return () => clearTimeout(tick);
  }, [uploadPercent, dispatch, announce]);

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt="" dim={0.72} />}>
      <LiveRegion />
      <Guidance
        title="Saving your message"
        instruction="Keep this screen open until it finishes."
        step={1}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />
      <StageContent>
        <BottleProgress percent={uploadPercent} />
      </StageContent>
    </Stage>
  );
}

function Preview({ onExit }: { onExit: () => void }) {
  const { dispatch, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  return (
    <Stage
      media={
        <>
          <Image
            src={media.giftReveal.poster}
            alt="Your recorded message"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35" />
        </>
      }
    >
      <LiveRegion />
      <Guidance
        title="Happy with this?"
        instruction="Use it, or record another take."
        step={2}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />
      <ActionDock>
        <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "choose-kind" })}>
          Use This
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            dispatch({ type: "UPLOAD", percent: 0 });
            dispatch({ type: "SENDER_STEP", step: "record" });
          }}
        >
          Retake
        </Button>
      </ActionDock>
    </Stage>
  );
}

function ChooseKind({ onExit }: { onExit: () => void }) {
  const { dispatch, config, credits, activeTemplates, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const [choice, setChoice] = useState<"standard" | "ai" | null>(null);
  const cheapest = activeTemplates.reduce((min, t) => Math.min(min, t.creditPrice), Infinity);
  const aiAvailable =
    config.aiGiftingEnabled && activeTemplates.length > 0 && credits.available >= cheapest;

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.66} />}>
      <LiveRegion />
      <Guidance
        title="How should it look?"
        instruction="Pick a style, then continue."
        step={3}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className="grid gap-3">
          {config.standardGiftingEnabled && (
            <SelectableCard
              selected={choice === "standard"}
              onClick={() => setChoice("standard")}
              title="Standard Video Gift"
              body="Your message exactly as you recorded it."
            />
          )}
          {config.aiGiftingEnabled && (
            <SelectableCard
              selected={choice === "ai"}
              onClick={aiAvailable ? () => setChoice("ai") : undefined}
              title="Styled Scene Gift"
              body="Your message placed into a curated scene. Your original voice is kept."
              disabledNote={
                aiAvailable
                  ? undefined
                  : activeTemplates.length === 0
                    ? "No scenes are available right now."
                    : "Not enough credits for a scene right now."
              }
            />
          )}
        </div>
      </StageContent>

      <ActionDock note={`Available credits: ${credits.available}`}>
        <Button
          disabled={!choice}
          onClick={() => {
            if (choice === "standard") {
              dispatch({ type: "DRAFT", patch: { kind: "standard" } });
              dispatch({ type: "SENDER_STEP", step: "recipient" });
            } else {
              dispatch({ type: "DRAFT", patch: { kind: "ai" } });
              dispatch({ type: "SENDER_STEP", step: "choose-template" });
            }
          }}
        >
          Continue
        </Button>
      </ActionDock>
    </Stage>
  );
}

function SelectableCard({
  selected,
  onClick,
  title,
  body,
  disabledNote,
}: {
  selected: boolean;
  onClick?: () => void;
  title: string;
  body: string;
  disabledNote?: string;
}) {
  return (
    <Card
      onClick={onClick}
      className={`${glass} min-h-14 p-4 ${onClick ? "" : "opacity-55"}`}
      style={
        selected
          ? { borderColor: "var(--gift-accent)", boxShadow: "0 0 0 1px var(--gift-accent)" }
          : undefined
      }
    >
      <p className="text-[15px] text-gift-ink">{title}</p>
      <Body className="mt-1 text-[12px]">{body}</Body>
      {disabledNote && <p className="mt-2 text-[11px] text-gift-danger">{disabledNote}</p>}
    </Card>
  );
}

function ChooseTemplate({ onExit }: { onExit: () => void }) {
  const { dispatch, activeTemplates, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const { announce } = useStage();
  const [index, setIndex] = useState(0);
  const active = activeTemplates[index];

  useEffect(() => {
    if (active) announce(`${active.title}, ${active.creditPrice} credits`);
  }, [active, announce]);

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt="" dim={0.7} />}>
      <LiveRegion />
      <Guidance
        title="Choose a setting"
        instruction="Swipe to compare."
        step={4}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <Pager onIndexChange={setIndex}>
          {activeTemplates.map((t, i) => (
            <div
              key={t.id}
              className={`${glass} overflow-hidden transition-transform duration-300 ${
                i === index ? "scale-100" : "scale-[0.965]"
              }`}
              style={i === index ? { borderColor: "var(--gift-accent)" } : undefined}
            >
              <div className="relative aspect-[3/2] w-full">
                <Image
                  src={t.thumbnail}
                  alt={t.title}
                  fill
                  sizes="(max-width:480px) 100vw, 420px"
                  className="object-cover"
                />
              </div>
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] text-gift-ink">{t.title}</p>
                  <span className="shrink-0 text-[11px] text-gift-ink-faint">
                    {t.creditPrice} credits
                  </span>
                </div>
                <Body className="mt-1 line-clamp-2 text-[12px]">{t.description}</Body>
              </div>
            </div>
          ))}
        </Pager>
        <div className="mt-4">
          <PagerIndicator index={index} count={activeTemplates.length} />
        </div>
      </StageContent>

      <ActionDock>
        <Button
          disabled={!active}
          onClick={() => {
            dispatch({ type: "DRAFT", patch: { templateId: active?.id ?? null } });
            dispatch({ type: "SENDER_STEP", step: "consent" });
          }}
        >
          Select
        </Button>
      </ActionDock>
    </Stage>
  );
}

function Consent({ onExit }: { onExit: () => void }) {
  const { dispatch, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const { setPinned } = useStage();
  useEffect(() => setPinned(true), [setPinned]);
  const ready = draft.likenessConsent && draft.audioConsent;

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.74} />}>
      <LiveRegion />
      <Guidance
        title="Before we build your scene"
        instruction="Both permissions are required."
        step={5}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          <Checkbox
            checked={draft.likenessConsent}
            onChange={(v) => dispatch({ type: "DRAFT", patch: { likenessConsent: v } })}
          >
            I agree to my likeness from this recording being placed into the scene I selected.
          </Checkbox>
          <div className="my-2 h-px bg-gift-border" />
          <Checkbox
            checked={draft.audioConsent}
            onChange={(v) => dispatch({ type: "DRAFT", patch: { audioConsent: v } })}
          >
            I understand my original recorded audio is kept as the voice in this gift.
          </Checkbox>
          <p className="mt-3 rounded-xl border border-gift-blue-soft bg-gift-blue/5 p-3 text-[12px] leading-snug text-gift-ink-soft">
            <span className="font-medium text-gift-ink">Your voice stays yours.</span> This
            experience never clones or replaces your recorded audio.
          </p>
        </div>
      </StageContent>

      <ActionDock>
        <Button
          disabled={!ready}
          onClick={() => dispatch({ type: "SENDER_STEP", step: "recipient" })}
        >
          Continue
        </Button>
      </ActionDock>
    </Stage>
  );
}

type RecipStage = "who" | "contact" | "note";
const RECIP_ORDER: RecipStage[] = ["who", "contact", "note"];

function Recipient({ onExit }: { onExit: () => void }) {
  const { dispatch, draft, issueMessageCode } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const [stage, setStage] = useState<RecipStage>("who");
  const index = RECIP_ORDER.indexOf(stage);

  const canAdvance =
    stage === "who"
      ? draft.recipientName.trim().length > 1
      : stage === "contact"
        ? draft.recipientContact.trim().length > 3
        : true;

  const titles: Record<RecipStage, [string, string]> = {
    who: ["Who is it for?", "Their name goes on the card."],
    contact: ["How do we reach them?", "Email or mobile."],
    note: ["Add a note", "Optional — printed on the gift card."],
  };

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt="" dim={0.72} />}>
      <LiveRegion />
      <Guidance
        title={titles[stage][0]}
        instruction={titles[stage][1]}
        step={6}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          {stage === "who" && (
            <KeyboardField
              label="Recipient name"
              mode="text"
              value={draft.recipientName}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientName: v } })}
              required
            />
          )}
          {stage === "contact" && (
            <KeyboardField
              label="Email or mobile"
              mode="email"
              inputMode="email"
              value={draft.recipientContact}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientContact: v } })}
              required
            />
          )}
          {stage === "note" && (
            <KeyboardField
              label="A short note"
              mode="text"
              value={draft.note}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { note: v } })}
              hint="Optional"
              maxLength={LONG_TEXT_MAX}
            />
          )}
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {RECIP_ORDER.map((s, i) => (
              <span
                key={s}
                className="h-0.5 flex-1 rounded-full"
                style={{ background: i <= index ? "var(--gift-accent)" : "var(--gift-border)" }}
              />
            ))}
          </div>
        </div>
      </StageContent>

      <ActionDock>
        <Button
          disabled={!canAdvance}
          onClick={() => {
            if (stage === "note") {
              dispatch({ type: "DRAFT", patch: { messageCode: issueMessageCode() } });
              dispatch({ type: "SENDER_STEP", step: "message-code" });
            } else {
              setStage(RECIP_ORDER[index + 1]);
            }
          }}
        >
          Continue
        </Button>
        {index > 0 && (
          <Button variant="ghost" onClick={() => setStage(RECIP_ORDER[index - 1])}>
            Back
          </Button>
        )}
      </ActionDock>
    </Stage>
  );
}

function MessageCodeIssued({ onExit }: { onExit: () => void }) {
  const { dispatch, draft, showToast } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  return (
    <Stage media={<Backdrop src={media.heroProduct.poster} alt={media.heroProduct.alt} dim={0.68} />}>
      <LiveRegion />
      <Guidance
        title="Your message has a code"
        instruction="It has to be paired with a package to open."
        step={7}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />
      <StageContent>
        <div className={`${glass} p-4`}>
          <CodeChip
            label="Gift Message Code"
            code={draft.messageCode ?? ""}
            onCopy={() => {
              void navigator.clipboard?.writeText(draft.messageCode ?? "");
              showToast("Gift Message Code copied");
            }}
          />
        </div>
      </StageContent>
      <ActionDock>
        <Button
          onClick={() =>
            // Regifting reuses the package the item is already in, so there is
            // nothing to look up and nothing to ask for.
            dispatch({
              type: "SENDER_STEP",
              step: draft.isRegift ? "confirm-product" : "package-code",
            })
          }
        >
          Continue
        </Button>
      </ActionDock>
    </Stage>
  );
}

function PackageCodeEntry({ onExit }: { onExit: () => void }) {
  const { dispatch, showToast, draft } = useGifting();
  const steps = draft.isRegift ? STEPS_REGIFT : STEPS_NEW;
  const [value, setValue] = useState("");
  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.7} />}>
      <LiveRegion />
      <Guidance
        title="Which package is this for?"
        instruction="Scan the QR code, or type the code beside it."
        step={8}
        total={steps}
        onExit={onExit}
      />
      <RecallDot />
      <StageContent>
        <div className={`${glass} p-4`}>
          <KeyboardField
            label="Package Code"
            mode="code"
            value={value}
            onChange={setValue}
            placeholder="XXXXX-XXXXX"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValue(draft.product.packageCode);
                showToast("Sample package code filled");
              }}
              className="min-h-11 flex-1 rounded-full border border-gift-border bg-white/70 px-3 text-[11px] text-gift-ink-soft"
            >
              Use sample
            </button>
            <button
              type="button"
              onClick={() => showToast("Camera scanning is not part of this preview")}
              className="min-h-11 flex-1 rounded-full border border-gift-border bg-white/70 px-3 text-[11px] text-gift-ink-soft"
            >
              Scan QR
            </button>
          </div>
        </div>
      </StageContent>
      <ActionDock>
        <Button
          disabled={value.trim().length < 4}
          onClick={() => {
            dispatch({ type: "DRAFT", patch: { packageCode: value.toUpperCase() } });
            dispatch({ type: "SENDER_STEP", step: "confirm-product" });
          }}
        >
          Continue
        </Button>
      </ActionDock>
    </Stage>
  );
}

/**
 * Pairing, as three things that either happened or did not.
 *
 * WHERE THE PERCENTAGE COMES FROM
 *   It is `done.length / 3`, and `done` is the list of bindings that have
 *   actually been written. There is no progress animation with its own clock,
 *   because a bar that fills on a timer is a picture of work rather than a
 *   report of it — and the moment it disagrees with the truth it is worse than
 *   nothing. Each step flips one flag; the number follows.
 *
 * WHY THE STYLE IS NOT LISTED
 *   The chosen scene is still carried in the draft and still governs what gets
 *   generated. It is simply not one of the three things being confirmed here:
 *   this screen is about the package, the message and the person, and a fourth
 *   row that is not part of the pairing dilutes the check.
 */

type PairingStep = "package" | "message" | "recipient";
const PAIRING_STEPS: { id: PairingStep; label: string; describe: (v: string) => string }[] = [
  { id: "package", label: "Package / Product", describe: (v) => v },
  { id: "message", label: "New Message", describe: (v) => v },
  { id: "recipient", label: "Recipient", describe: (v) => v },
];

function ConfirmProduct({ onExit }: { onExit: () => void }) {
  const { dispatch, draft, activeTemplates, credits, showToast } = useGifting();
  const { reducedMotion, announce } = useStage();
  const template = activeTemplates.find((t) => t.id === draft.templateId);
  const regifting = draft.isRegift;
  const packageCode = draft.packageCode ?? draft.product.packageCode;

  const [done, setDone] = useState<PairingStep[]>([]);
  const [pairing, setPairing] = useState(false);
  const percent = Math.round((done.length / PAIRING_STEPS.length) * 100);
  const ready = done.length === PAIRING_STEPS.length;

  /** The gift as it will appear in My Gifts the moment it is paired. */
  const newGift = useCallback(
    (): GalleryItem => ({
      id: draft.kind === "ai" ? "job-live" : `gift-${packageCode}-${draft.messageCode ?? "new"}`,
      kind: draft.kind,
      direction: "created",
      title: `For ${draft.recipientName || "your recipient"}`,
      subtitle: draft.product.name,
      media: draft.kind === "ai" ? media.aiGift : media.standardGift,
      stage: draft.kind === "ai" ? "preparing" : undefined,
      templateTitle: template?.title,
      createdLabel: "Just now",
      packageCode,
      messageCode: draft.messageCode ?? undefined,
      product: draft.product,
      senderName: "You",
      recipientName: draft.recipientName || undefined,
      message: draft.note || "A gift chosen for you.",
      // It exists, it is addressed, and it has not been handed over yet.
      assignment: "ready_to_send",
    }),
    [draft, packageCode, template?.title],
  );

  // Each binding is written, then marked. They are sequenced rather than done
  // at once so the visitor can see which one is which — the delay separates
  // real steps, it does not stand in for them.
  const pair = () => {
    if (pairing || ready) return;
    setPairing(true);

    const advance = (step: PairingStep, work: () => void, after: number) =>
      window.setTimeout(() => {
        work();
        setDone((current) => (current.includes(step) ? current : [...current, step]));
      }, after);

    const timers = [
      advance("package", () => dispatch({ type: "BIND", messageCode: draft.messageCode ?? "", packageCode }), 450),
      advance("message", () => {}, 1150),
      advance(
        "recipient",
        () => {
          const item = newGift();
          if (draft.sourceGiftId) dispatch({ type: "COMPLETE_REGIFT", item });
          else dispatch({ type: "ADD_GALLERY", item });
          if (draft.kind === "ai" && template) {
            // Reserve as the real ledger will: credits leave `available` when
            // the work is accepted, not when it finishes.
            dispatch({ type: "RESERVE_CREDITS", amount: template.creditPrice });
          }
          showToast("Gift paired with package");
        },
        1900,
      ),
    ];
    return () => timers.forEach(window.clearTimeout);
  };

  useEffect(() => {
    if (ready) announce("Gift ready. View My Gift is available.");
  }, [ready, announce]);

  const values: Record<PairingStep, string> = {
    package: `${draft.product.name} · ${packageCode}`,
    message: draft.messageCode ?? "—",
    recipient: draft.recipientName || "—",
  };

  return (
    <Stage media={<Backdrop src={draft.product.image} alt={draft.product.alt} dim={0.62} />}>
      <LiveRegion />
      <Guidance
        title={regifting ? "Confirm the item" : "Is this the right product?"}
        instruction={
          regifting
            ? "The package stays the same. Only the message changes."
            : "Check the pairing before you confirm."
        }
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
              Pairing
            </span>
            <span className="font-mono text-[13px] tabular-nums text-gift-ink">{percent}%</span>
          </div>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-gift-border">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%`, background: "var(--gift-accent)" }}
            />
          </div>

          <ul className="mt-3 grid gap-2">
            {PAIRING_STEPS.map((step) => {
              const complete = done.includes(step.id);
              return (
                <li key={step.id} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] transition-colors duration-300"
                    style={
                      complete
                        ? { background: "var(--gift-success)", color: "white" }
                        : { border: "1px solid var(--gift-border-strong)", color: "transparent" }
                    }
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-[13px] ${complete ? "text-gift-ink" : "text-gift-ink-faint"}`}
                    >
                      {step.label}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-gift-ink-faint">
                      {step.describe(values[step.id])}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div
            className={cn(
              "mt-3 flex items-center justify-center gap-2 rounded-xl border border-gift-border bg-white/50 py-2.5 transition-colors duration-500",
              ready && "gift-ready-lit",
              ready && !reducedMotion && "gift-anim-confirm",
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ready ? "var(--gift-accent)" : "var(--gift-border-strong)" }}
            />
            <span
              className={`text-[11px] uppercase tracking-[0.22em] ${ready ? "text-gift-ink" : "text-gift-ink-faint"}`}
            >
              Gift Ready
            </span>
          </div>

          {regifting && (
            <p className="mt-3 rounded-xl border border-gift-border bg-white/60 p-3 text-[11px] leading-snug text-gift-ink-soft">
              This is the same physical package, so it keeps its code. The person you give it to
              gets the new message code above.
            </p>
          )}
        </div>
      </StageContent>

      <ActionDock note={ready ? undefined : `Available credits: ${credits.available}`}>
        {ready ? (
          <Button
            // Emphasis either way: it pulses, or it is ringed and still.
            className={cn(
              "gift-anim-rise",
              reducedMotion ? "gift-ready-highlight" : "gift-anim-pulse",
            )}
            onClick={() => {
              if (draft.kind === "ai" && template) {
                dispatch({ type: "SENDER_STEP", step: "processing" });
              } else {
                dispatch({ type: "SENDER_STEP", step: "card" });
              }
            }}
          >
            View My Gift
          </Button>
        ) : (
          <>
            <Button disabled={pairing} onClick={pair}>
              {pairing ? "Pairing…" : "Confirm & Pair"}
            </Button>
            {!regifting && !pairing && (
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: "SENDER_STEP", step: "package-code" })}
              >
                Choose a different package
              </Button>
            )}
          </>
        )}
      </ActionDock>
    </Stage>
  );
}

const STAGE_ORDER: AiJobStage[] = [
  "preparing",
  "building_scene",
  "preserving_audio",
  "finalizing",
  "ready",
];

function Processing({ onExit }: { onExit: () => void }) {
  const { dispatch, aiStage, draft, activeTemplates } = useGifting();
  const { setPinned, announce } = useStage();
  const template = activeTemplates.find((t) => t.id === draft.templateId);
  const stage = aiStage ?? "preparing";
  const index = STAGE_ORDER.indexOf(stage);
  const startedRef = useRef(false);

  useEffect(() => setPinned(true), [setPinned]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // The gallery entry already exists — it was created the moment the gift
    // was paired, so leaving this screen is safe. All that starts here is the
    // work itself.
    dispatch({ type: "AI_STAGE", stage: "preparing" });
  }, [dispatch]);

  useEffect(() => {
    if (stage === "ready") return;
    const next = STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
    const id = setTimeout(() => {
      dispatch({ type: "AI_STAGE", stage: next });
      announce(AI_STAGE_LABELS[next]);
      if (next === "ready") {
        dispatch({ type: "PROMOTE_AI_ITEM", id: "job-live" });
        if (template) dispatch({ type: "CHARGE_CREDITS", amount: template.creditPrice });
      }
    }, 2000);
    return () => clearTimeout(id);
  }, [stage, index, dispatch, template, announce]);

  return (
    <Stage media={<Backdrop src={media.aiGift.poster} alt={media.aiGift.alt} dim={0.72} />}>
      <LiveRegion />
      <Guidance
        title={stage === "ready" ? "Your gift is ready" : "Building your gift"}
        instruction="You can leave — we'll finish in the background."
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          <ol className="grid gap-1.5">
            {STAGE_ORDER.map((s, i) => {
              const done = i < index;
              const active = i === index;
              return (
                <li key={s} className="flex items-center gap-3 py-1">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                    style={
                      done
                        ? { background: "var(--gift-success)", color: "white" }
                        : active
                          ? { border: "1px solid var(--gift-accent)", color: "var(--gift-accent)" }
                          : { border: "1px solid var(--gift-border)", color: "var(--gift-ink-faint)" }
                    }
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-[13px] ${active ? "text-gift-ink" : done ? "text-gift-ink-soft" : "text-gift-ink-faint"}`}
                  >
                    {AI_STAGE_LABELS[s]}
                  </span>
                  {active && s !== "ready" && (
                    <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-gift-border border-t-gift-ink" />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </StageContent>

      <ActionDock>
        {stage === "ready" ? (
          <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "result" })}>
            View My Gift
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
            Leave and check later
          </Button>
        )}
      </ActionDock>
    </Stage>
  );
}

/**
 * The finished scene, shown properly before anything else.
 *
 * Dropping the visitor straight into a gallery card meant they never actually
 * watched the thing they just made. This screen exists so the result is seen.
 */
function Result({ onExit }: { onExit: () => void }) {
  const { dispatch, showToast } = useGifting();
  return (
    <VideoStage
      source={media.aiGift}
      title="Your Gift Is Ready"
      instruction="Here's how it turned out."
      onExit={onExit}
      autoPlay={false}
      watchingNote="Watch it through, then keep it."
      finalActions={
        <>
          <Button
            className="gift-anim-rise"
            onClick={() => {
              showToast("Saved to My Gifts");
              dispatch({ type: "SENDER_STEP", step: "card" });
            }}
          >
            Keep This Gift
          </Button>
          <Button
            variant="ghost"
            onClick={() => dispatch({ type: "SENDER_STEP", step: "choose-template" })}
          >
            Try Another Style
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: "START_CREATE", isRegift: false });
              dispatch({ type: "SENDER_STEP", step: "record" });
            }}
          >
            Create Another
          </Button>
        </>
      }
    />
  );
}

function AccessCard({ onExit }: { onExit: () => void }) {
  const { dispatch, lastIssued, draft, showToast } = useGifting();
  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.68} />}>
      <LiveRegion />
      <Guidance
        title="Your gift access card"
        instruction="Print it or send it. Both codes are needed."
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} overflow-hidden p-5`}>
          <p className="text-center text-[10px] uppercase tracking-[0.24em] text-gift-ink-faint">
            A gift for
          </p>
          <p className="mt-1 text-center text-[22px] font-light text-gift-ink">
            {lastIssued?.recipientName ?? draft.recipientName ?? "—"}
          </p>
          {draft.note && (
            <p className="mt-2 text-center text-[12px] italic leading-snug text-gift-ink-soft">
              “{draft.note}”
            </p>
          )}
          <div className="mt-4 grid gap-2">
            <CodeChip label="Package Code" code={lastIssued?.packageCode ?? "—"} />
            <CodeChip label="Gift Message Code" code={lastIssued?.messageCode ?? "—"} />
          </div>
        </div>
      </StageContent>

      <ActionDock>
        <Button onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
          View My Gifts
        </Button>
        <Button variant="ghost" onClick={() => showToast("Sharing is not part of this preview")}>
          Share
        </Button>
      </ActionDock>
    </Stage>
  );
}
