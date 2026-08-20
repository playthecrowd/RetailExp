"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { DEMO_REGIFT_PACKAGE_CODE, media, useGifting } from "@/lib/gifting/simulation/store";
import { AI_STAGE_LABELS, type AiJobStage } from "@/lib/gifting/simulation/types";
import {
  ActionTray,
  GuidanceTray,
  HelpDot,
  LiveRegion,
  Pager,
  PagerCount,
  PagerDots,
  Stage,
  StageBody,
  StageProvider,
  useStage,
} from "./shell";
import { Body, Button, Card, Checkbox, CodeChip, Field, Pill } from "./ui";

/**
 * Creating or regifting, as full-screen panels.
 *
 * WHAT IS SIMULATED AND WHAT IS NOT
 *   The camera permission, the recording clock, the upload and the generation
 *   are simulated; the STATES are real. Every screen a visitor would meet is
 *   here in the order they would meet it.
 *
 * THE GENERATION IS LABELLED A SIMULATION ON THE SCREEN THAT SHOWS IT, its
 * stages are the genuine stages the real pipeline will report, and there is no
 * percentage — a progress bar nothing can substantiate is the one thing that
 * would make this dishonest.
 */

const STEPS = 8;

export function SenderFlow() {
  const { senderStep } = useGifting();
  return (
    <StageProvider stepKey={senderStep}>
      <Step />
    </StageProvider>
  );
}

function Step() {
  const { senderStep } = useGifting();
  switch (senderStep) {
    case "record":
      return <Record />;
    case "uploading":
      return <Uploading />;
    case "preview":
      return <Preview />;
    case "choose-kind":
      return <ChooseKind />;
    case "choose-template":
      return <ChooseTemplate />;
    case "consent":
      return <Consent />;
    case "recipient":
      return <Recipient />;
    case "message-code":
      return <MessageCodeIssued />;
    case "package-code":
      return <PackageCodeEntry />;
    case "confirm-product":
      return <ConfirmProduct />;
    case "processing":
      return <Processing />;
    case "card":
      return <AccessCard />;
    default:
      return <Intro />;
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

const glass = "rounded-2xl border border-white/60 bg-[rgba(250,249,246,0.88)] backdrop-blur-xl";

function Intro() {
  const { dispatch, draft } = useGifting();
  const { reveal } = useStage();
  return (
    <Stage media={<Backdrop src={media.heroProduct.poster} alt={media.heroProduct.alt} dim={0.5} />}>
      <LiveRegion />
      <GuidanceTray
        title={draft.isRegift ? "Pass it on, personally" : "Make it personal"}
        instruction="Record a short message. We'll pair it with a package."
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <StageBody>
        <div className={`${glass} p-5 text-center`}>
          <Body>
            You&apos;ll record a message, choose how it looks, add a recipient, and get a card to
            hand over.
          </Body>
        </div>
      </StageBody>
      <ActionTray>
        <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "record" })}>
          Record a message
        </Button>
      </ActionTray>
    </Stage>
  );
}

/** A guided camera: the frame is the screen, controls are pinned to the base. */
function Record() {
  const { dispatch } = useGifting();
  const { reveal, setPinned, announce } = useStage();
  const [permission, setPermission] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(
    () => setPinned(permission !== "granted" || recording),
    [permission, recording, setPinned],
  );

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
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />
        </>
      }
    >
      <LiveRegion />
      <GuidanceTray
        title="Record your message"
        instruction="Keep it short — sixty seconds is plenty."
        step={1}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <span
        className="absolute left-4 z-30"
        style={{ top: "calc(env(safe-area-inset-top) + 6.2rem)" }}
      >
        <Pill tone="accent">Simulated camera</Pill>
      </span>

      {recording && (
        <div
          className="absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-4 py-2 backdrop-blur-sm"
          style={{ top: "calc(env(safe-area-inset-top) + 9.6rem)" }}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e0736a]" />
          <span className="font-mono text-[13px] text-white">
            0:{String(seconds).padStart(2, "0")}
          </span>
        </div>
      )}

      <ActionTray forceVisible>
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
              Allow camera &amp; microphone
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
            <p className="px-1 pb-1 text-[12px] leading-snug text-gift-ink-soft">
              Camera access is off. You can allow it, or continue with a prepared demo message.
            </p>
            <Button variant="secondary" onClick={() => setPermission("idle")}>
              Try again
            </Button>
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: "SENDER_STEP", step: "uploading" })}
            >
              Use the demo message
            </Button>
          </>
        )}

        {permission === "granted" &&
          (!recording ? (
            <>
              <Button onClick={() => setRecording(true)}>Start recording</Button>
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
              Stop &amp; use this take
            </Button>
          ))}
      </ActionTray>
    </Stage>
  );
}

/** The bottle fills as the upload progresses — the product is the indicator. */
function BottleProgress({ percent }: { percent: number }) {
  return (
    <div className="mx-auto w-48">
      {/* Two copies of the SAME image in the SAME box: the ghost at low opacity,
          the solid one clipped from the top so the fill rises from the base and
          registers exactly at every height. */}
      <div className="relative aspect-[3/4] w-full">
        <Image
          src={media.heroProduct.poster}
          alt=""
          fill
          sizes="192px"
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
            sizes="192px"
            className="object-contain"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="h-0.5 w-28 overflow-hidden rounded-full bg-gift-border">
          <div
            className="h-full rounded-full bg-gift-champagne transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="font-mono text-[12px] tabular-nums text-gift-ink-soft">{percent}%</span>
      </div>
    </div>
  );
}

function Uploading() {
  const { dispatch, uploadPercent } = useGifting();
  const { reveal, announce } = useStage();

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
      <GuidanceTray
        title="Saving your message"
        instruction="Keep this screen open until the upload finishes."
        step={1}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <StageBody>
        <BottleProgress percent={uploadPercent} />
      </StageBody>
    </Stage>
  );
}

function Preview() {
  const { dispatch } = useGifting();
  const { reveal } = useStage();
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        </>
      }
    >
      <LiveRegion />
      <GuidanceTray
        title="Happy with this?"
        instruction="Use it, or record another take."
        step={2}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <ActionTray forceVisible spring>
        <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "choose-kind" })}>
          Use This
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            dispatch({ type: "UPLOAD", percent: 0 });
            dispatch({ type: "SENDER_STEP", step: "record" });
          }}
        >
          Retake
        </Button>
      </ActionTray>
    </Stage>
  );
}

function ChooseKind() {
  const { dispatch, config, credits, activeTemplates } = useGifting();
  const { reveal } = useStage();
  const cheapest = activeTemplates.reduce((min, t) => Math.min(min, t.creditPrice), Infinity);
  const aiAvailable =
    config.aiGiftingEnabled && activeTemplates.length > 0 && credits.available >= cheapest;

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.66} />}>
      <LiveRegion />
      <GuidanceTray
        title="How should it look?"
        instruction="Standard always works. Scenes need credits."
        step={3}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <div className="grid gap-3">
          {config.standardGiftingEnabled && (
            <Card
              onClick={() => {
                dispatch({ type: "DRAFT", patch: { kind: "standard" } });
                dispatch({ type: "SENDER_STEP", step: "recipient" });
              }}
              className={`${glass} min-h-14 p-4`}
            >
              <p className="text-[15px] text-gift-ink">Standard Video Gift</p>
              <Body className="mt-1 text-[12px]">Your message exactly as you recorded it.</Body>
            </Card>
          )}
          {config.aiGiftingEnabled && (
            <Card
              onClick={
                aiAvailable
                  ? () => {
                      dispatch({ type: "DRAFT", patch: { kind: "ai" } });
                      dispatch({ type: "SENDER_STEP", step: "choose-template" });
                    }
                  : undefined
              }
              className={`${glass} min-h-14 p-4 ${aiAvailable ? "" : "opacity-55"}`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[15px] text-gift-ink">AI-Generated Video Gift</p>
                <Pill tone="accent">Simulation</Pill>
              </div>
              <Body className="mt-1 text-[12px]">
                Your message placed into a styled scene. Your original audio is kept.
              </Body>
              {!aiAvailable && (
                <p className="mt-2 text-[11px] text-gift-danger">
                  {activeTemplates.length === 0
                    ? "No scene templates are active."
                    : "Not enough credits for a scene right now."}
                </p>
              )}
            </Card>
          )}
          <p className="text-center text-[11px] text-gift-ink-faint">
            Available credits: {credits.available}
          </p>
        </div>
      </StageBody>
    </Stage>
  );
}

/** Templates as a swipeable carousel rather than a vertical list. */
function ChooseTemplate() {
  const { dispatch, activeTemplates } = useGifting();
  const { reveal, announce } = useStage();
  const [index, setIndex] = useState(0);
  const active = activeTemplates[index];

  useEffect(() => {
    if (active) announce(`${active.title}, ${active.creditPrice} credits`);
  }, [active, announce]);

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt="" dim={0.7} />}>
      <LiveRegion />
      <GuidanceTray
        title="Choose a setting"
        instruction="Swipe to compare. Every scene is curated."
        step={4}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <Pager onIndexChange={setIndex}>
          {activeTemplates.map((t, i) => (
            <div
              key={t.id}
              className={`${glass} overflow-hidden transition-transform duration-300 ${
                i === index ? "scale-100" : "scale-[0.965]"
              }`}
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
        <div className="mt-4 grid gap-2">
          <PagerDots count={activeTemplates.length} index={index} />
          <PagerCount index={index} count={activeTemplates.length} />
        </div>
      </StageBody>

      <ActionTray forceVisible>
        <Button
          disabled={!active}
          onClick={() => {
            dispatch({ type: "DRAFT", patch: { templateId: active?.id ?? null } });
            dispatch({ type: "SENDER_STEP", step: "consent" });
          }}
        >
          Select {active ? active.title : "a scene"}
        </Button>
      </ActionTray>
    </Stage>
  );
}

function Consent() {
  const { dispatch, draft } = useGifting();
  const { reveal, setPinned } = useStage();
  useEffect(() => setPinned(true), [setPinned]);
  const ready = draft.likenessConsent && draft.audioConsent;

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.74} />}>
      <LiveRegion />
      <GuidanceTray
        title="Before we build your scene"
        instruction="Both permissions are required."
        step={5}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
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
      </StageBody>

      <ActionTray forceVisible>
        <Button
          disabled={!ready}
          onClick={() => dispatch({ type: "SENDER_STEP", step: "recipient" })}
        >
          Continue
        </Button>
      </ActionTray>
    </Stage>
  );
}

/** Recipient details, split the same way visitor capture is. */
type RecipStage = "who" | "contact" | "note";
const RECIP_ORDER: RecipStage[] = ["who", "contact", "note"];

function Recipient() {
  const { dispatch, draft, issueMessageCode } = useGifting();
  const { reveal } = useStage();
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
      <GuidanceTray
        title={titles[stage][0]}
        instruction={titles[stage][1]}
        step={6}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <div className={`${glass} p-4`}>
          {stage === "who" && (
            <Field
              label="Recipient name"
              value={draft.recipientName}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientName: v } })}
              required
            />
          )}
          {stage === "contact" && (
            <Field
              label="Email or mobile"
              value={draft.recipientContact}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientContact: v } })}
              required
            />
          )}
          {stage === "note" && (
            <Field
              label="A short note"
              value={draft.note}
              onChange={(v) => dispatch({ type: "DRAFT", patch: { note: v } })}
              hint="Optional"
            />
          )}
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {RECIP_ORDER.map((s, i) => (
              <span
                key={s}
                className={`h-0.5 flex-1 rounded-full ${i <= index ? "bg-gift-champagne" : "bg-gift-border"}`}
              />
            ))}
          </div>
        </div>
      </StageBody>

      <ActionTray forceVisible>
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
          {stage === "note" ? "Create gift message code" : "Continue"}
        </Button>
        {index > 0 && (
          <Button variant="ghost" onClick={() => setStage(RECIP_ORDER[index - 1])}>
            Back
          </Button>
        )}
      </ActionTray>
    </Stage>
  );
}

function MessageCodeIssued() {
  const { dispatch, draft, showToast } = useGifting();
  const { reveal } = useStage();
  return (
    <Stage media={<Backdrop src={media.heroProduct.poster} alt={media.heroProduct.alt} dim={0.68} />}>
      <LiveRegion />
      <GuidanceTray
        title="Your message has a code"
        instruction="On its own it opens nothing — it must be paired with a package."
        step={7}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <StageBody>
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
      </StageBody>
      <ActionTray forceVisible>
        <Button onClick={() => dispatch({ type: "SENDER_STEP", step: "package-code" })}>
          Scan the package
        </Button>
      </ActionTray>
    </Stage>
  );
}

function PackageCodeEntry() {
  const { dispatch, showToast } = useGifting();
  const { reveal } = useStage();
  const [value, setValue] = useState("");
  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.7} />}>
      <LiveRegion />
      <GuidanceTray
        title="Which package is this for?"
        instruction="Scan the QR code, or type the code beside it."
        step={8}
        total={STEPS}
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <StageBody>
        <div className={`${glass} p-4`}>
          <Field
            label="Package Code"
            value={value}
            onChange={setValue}
            placeholder="XXXXX-XXXXX"
            autoCapitalize="characters"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValue(DEMO_REGIFT_PACKAGE_CODE);
                showToast("Demo package code filled");
              }}
              className="min-h-11 flex-1 rounded-full border border-gift-border bg-white/70 px-3 text-[11px] text-gift-ink-soft"
            >
              Use demo package
            </button>
            <button
              type="button"
              onClick={() => showToast("Scanner simulated")}
              className="min-h-11 flex-1 rounded-full border border-gift-border bg-white/70 px-3 text-[11px] text-gift-ink-soft"
            >
              Scan QR
            </button>
          </div>
        </div>
      </StageBody>
      <ActionTray forceVisible>
        <Button
          disabled={value.trim().length < 4}
          onClick={() => {
            dispatch({ type: "DRAFT", patch: { packageCode: value.toUpperCase() } });
            dispatch({ type: "SENDER_STEP", step: "confirm-product" });
          }}
        >
          Continue
        </Button>
      </ActionTray>
    </Stage>
  );
}

function ConfirmProduct() {
  const { dispatch, draft, activeTemplates, credits, showToast } = useGifting();
  const { reveal } = useStage();
  const template = activeTemplates.find((t) => t.id === draft.templateId);

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.6} />}>
      <LiveRegion />
      <GuidanceTray
        title="Is this the right product?"
        instruction="Check the pairing before binding."
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />
      <StageBody>
        <div className={`${glass} p-4`}>
          <Row label="Product" value="Signature Gift Package" />
          <Row label="Package" value={draft.packageCode ?? "—"} mono />
          <Row label="Message" value={draft.messageCode ?? "—"} mono />
          <Row label="Recipient" value={draft.recipientName || "—"} />
          <Row
            label="Type"
            value={draft.kind === "ai" ? `Scene · ${template?.title ?? ""}` : "Standard video"}
          />
          <p className="mt-2 text-center text-[11px] text-gift-ink-faint">
            Available credits: {credits.available}
          </p>
        </div>
      </StageBody>
      <ActionTray forceVisible>
        <Button
          onClick={() => {
            dispatch({
              type: "BIND",
              messageCode: draft.messageCode ?? "",
              packageCode: draft.packageCode ?? "",
            });
            if (draft.kind === "ai" && template) {
              // Reserve before submitting, as the real ledger will: credits
              // leave `available` when the job is accepted, not when it ends.
              dispatch({ type: "RESERVE_CREDITS", amount: template.creditPrice });
              dispatch({ type: "SENDER_STEP", step: "processing" });
            } else {
              showToast("Gift bound to package");
              dispatch({ type: "SENDER_STEP", step: "card" });
            }
          }}
        >
          Bind this gift to the package
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "SENDER_STEP", step: "package-code" })}
        >
          Choose a different package
        </Button>
      </ActionTray>
    </Stage>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-gift-ink-faint">{label}</span>
      <span
        className={`text-right text-[13px] text-gift-ink ${mono ? "font-mono tracking-wider" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

const STAGE_ORDER: AiJobStage[] = [
  "preparing",
  "building_scene",
  "preserving_audio",
  "finalizing",
  "ready",
];

function Processing() {
  const { dispatch, aiStage, draft, activeTemplates, showToast } = useGifting();
  const { reveal, setPinned, announce } = useStage();
  const template = activeTemplates.find((t) => t.id === draft.templateId);
  const stage = aiStage ?? "preparing";
  const index = STAGE_ORDER.indexOf(stage);
  const startedRef = useRef(false);

  useEffect(() => setPinned(true), [setPinned]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    dispatch({ type: "AI_STAGE", stage: "preparing" });
    // Added to the gallery immediately and in a processing state, so leaving
    // is safe: the visitor can walk away and find it finished, which is how
    // the real durable job will behave.
    dispatch({
      type: "ADD_GALLERY",
      item: {
        id: "job-live",
        kind: "ai",
        direction: "created",
        title: `For ${draft.recipientName || "your recipient"}`,
        subtitle: "Scene generation in progress",
        media: media.aiGift,
        stage: "preparing",
        templateTitle: template?.title,
        createdLabel: "Just now",
      },
    });
  }, [dispatch, draft.recipientName, template?.title]);

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
    }, 2200);
    return () => clearTimeout(id);
  }, [stage, index, dispatch, template, announce]);

  return (
    <Stage media={<Backdrop src={media.aiGift.poster} alt={media.aiGift.alt} dim={0.72} />}>
      <LiveRegion />
      <GuidanceTray
        title={stage === "ready" ? "Your gift is ready" : "Building your gift"}
        instruction="You can leave — we'll finish in the background."
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <div className={`${glass} p-4`}>
          <div className="mb-3 flex justify-end">
            <Pill tone="accent">Simulation</Pill>
          </div>
          <ol className="grid gap-1.5">
            {STAGE_ORDER.map((s, i) => {
              const done = i < index;
              const active = i === index;
              return (
                <li key={s} className="flex items-center gap-3 py-1">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      done
                        ? "bg-gift-success text-white"
                        : active
                          ? "border border-gift-champagne text-gift-champagne"
                          : "border border-gift-border text-gift-ink-faint"
                    }`}
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
          <p className="mt-3 text-center text-[11px] leading-snug text-gift-ink-faint">
            Simulated generation. No provider is contacted and no real credits are spent.
          </p>
        </div>
      </StageBody>

      <ActionTray forceVisible spring={stage === "ready"}>
        {stage === "ready" ? (
          <Button
            onClick={() => {
              showToast("Gift bound to package");
              dispatch({ type: "SENDER_STEP", step: "card" });
            }}
          >
            See your gift card
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}
          >
            Leave and check later
          </Button>
        )}
      </ActionTray>
    </Stage>
  );
}

function AccessCard() {
  const { dispatch, lastIssued, draft, showToast } = useGifting();
  const { reveal } = useStage();
  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.68} />}>
      <LiveRegion />
      <GuidanceTray
        title="Your gift access card"
        instruction="Print it or send it. Both codes are needed."
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <div className={`${glass} overflow-hidden`}>
          <div className="p-5">
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
        </div>
      </StageBody>

      <ActionTray forceVisible>
        <Button onClick={() => showToast("Share sheet simulated")}>Share</Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
          Go to my gallery
        </Button>
      </ActionTray>
    </Stage>
  );
}
