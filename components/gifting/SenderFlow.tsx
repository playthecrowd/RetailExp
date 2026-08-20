"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DEMO_REGIFT_PACKAGE_CODE, media, useGifting } from "@/lib/gifting/simulation/store";
import { AI_STAGE_LABELS, type AiJobStage } from "@/lib/gifting/simulation/types";
import {
  Body,
  Button,
  Card,
  Checkbox,
  CodeChip,
  Eyebrow,
  Field,
  Frame,
  Pill,
  Rule,
  Still,
  Steps,
  Title,
  VideoPanel,
} from "./ui";

/**
 * Creating or regifting a gift.
 *
 * WHAT IS SIMULATED AND WHAT IS NOT
 *   The camera permission, the recording clock, the upload and the generation
 *   are simulated; the STATES are real. Every screen a visitor would meet is
 *   here in the order they would meet it, so the flow can be judged before any
 *   of it is wired to a device or a provider.
 *
 * THE GENERATION IS LABELLED AS A SIMULATION, ON EVERY SCREEN THAT SHOWS IT.
 *   The stage names are the genuine stages the real pipeline will report, and
 *   there is no percentage anywhere, because a progress bar nothing can
 *   substantiate is the one thing that would make this demo dishonest.
 */

const STEPS = 8;

export function SenderFlow() {
  const { senderStep } = useGifting();
  switch (senderStep) {
    case "intro":
      return <Intro />;
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

function Intro() {
  const { dispatch, draft } = useGifting();
  return (
    <Frame className="pt-8">
      <Rule className="mb-8" />
      <Eyebrow>{draft.isRegift ? "Regift this product" : "Create a gift"}</Eyebrow>
      <Title className="mt-2">
        {draft.isRegift ? "Pass it on, personally." : "Make it personal."}
      </Title>
      <Body className="mt-3">
        Record a short message. We&apos;ll pair it with a package and give you a card to hand over.
      </Body>

      <div className="mt-6">
        <Still src={media.heroProduct.poster} alt={media.heroProduct.alt} ratio="aspect-[4/3]" priority />
      </div>

      <Button className="mt-6" onClick={() => dispatch({ type: "SENDER_STEP", step: "record" })}>
        Record a message
      </Button>
    </Frame>
  );
}

function Record() {
  const { dispatch } = useGifting();
  const [permission, setPermission] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  return (
    <Frame className="pt-8">
      <Steps current={1} total={STEPS} />
      <Eyebrow>Your message</Eyebrow>
      <Title className="mt-2">Record</Title>
      <Body className="mt-3">Keep it short — sixty seconds is plenty.</Body>

      <div className="relative mt-6">
        <VideoPanel source={media.giftReveal} />
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#d05a52]" />
            <span className="font-mono text-[12px] text-white">
              0:{String(seconds).padStart(2, "0")}
            </span>
          </div>
        )}
        <span className="absolute right-3 top-3">
          <Pill tone="accent">Simulated camera</Pill>
        </span>
      </div>

      {permission === "idle" && (
        <>
          <Body className="mt-5 text-center text-[12px]">
            We&apos;ll ask for camera and microphone access.
          </Body>
          <Button
            className="mt-3"
            onClick={() => {
              setPermission("asking");
              setTimeout(() => setPermission("granted"), 900);
            }}
          >
            Allow camera &amp; microphone
          </Button>
          <Button variant="ghost" className="mt-2" onClick={() => setPermission("denied")}>
            Not now
          </Button>
        </>
      )}

      {permission === "asking" && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gift-border border-t-gift-ink" />
          <Body className="text-[12px]">Waiting for permission…</Body>
        </div>
      )}

      {permission === "denied" && (
        <Card className="mt-5 p-4">
          <p className="text-[13px] font-medium text-gift-ink">Camera access is off</p>
          <Body className="mt-1 text-[12px]">
            You can still continue with a prepared demo message, or allow access and record.
          </Body>
          <div className="mt-3 grid gap-2">
            <Button variant="secondary" onClick={() => setPermission("idle")}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => dispatch({ type: "SENDER_STEP", step: "uploading" })}>
              Use the demo message
            </Button>
          </div>
        </Card>
      )}

      {permission === "granted" && (
        <div className="mt-5 grid gap-2">
          {!recording ? (
            <Button onClick={() => setRecording(true)}>Start recording</Button>
          ) : (
            <Button
              onClick={() => {
                setRecording(false);
                dispatch({ type: "SENDER_STEP", step: "uploading" });
              }}
            >
              Stop &amp; use this take
            </Button>
          )}
          <Button variant="ghost" onClick={() => dispatch({ type: "SENDER_STEP", step: "uploading" })}>
            Upload a video instead
          </Button>
        </div>
      )}
    </Frame>
  );
}

/** The bottle fills as the upload progresses — the product IS the progress
 *  indicator, which is the treatment the platform already uses and the one
 *  thing on this screen that should not be a generic bar. */
function BottleProgress({ percent }: { percent: number }) {
  return (
    <div className="mx-auto w-44">
      {/* Two copies of the SAME image in the SAME box. The ghost sits at low
          opacity; the solid one is clipped from the top, so the fill rises
          from the base of the bottle and registers perfectly at every height.
          An earlier version resized the filled copy instead, which slid it out
          of alignment with the ghost as the percentage climbed. */}
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
      <div className="mt-3 flex items-center justify-center gap-3">
        <div className="h-0.5 w-24 overflow-hidden rounded-full bg-gift-border">
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

  useEffect(() => {
    // A simulated upload, but an honest one: it counts to a hundred and then
    // moves on, rather than sitting at 99 waiting for something imaginary.
    if (uploadPercent >= 100) {
      const done = setTimeout(() => dispatch({ type: "SENDER_STEP", step: "preview" }), 600);
      return () => clearTimeout(done);
    }
    const tick = setTimeout(
      () => dispatch({ type: "UPLOAD", percent: Math.min(100, uploadPercent + 7) }),
      160,
    );
    return () => clearTimeout(tick);
  }, [uploadPercent, dispatch]);

  return (
    <Frame className="flex min-h-dvh flex-col justify-center pt-8">
      <Eyebrow>Uploading</Eyebrow>
      <Title className="mt-2">Saving your message</Title>
      <div className="mt-8">
        <BottleProgress percent={uploadPercent} />
      </div>
      <Body className="mt-6 text-center text-[12px]">
        Keep this screen open until the upload finishes.
      </Body>
    </Frame>
  );
}

function Preview() {
  const { dispatch } = useGifting();
  return (
    <Frame className="pt-8">
      <Steps current={2} total={STEPS} />
      <Eyebrow>Preview</Eyebrow>
      <Title className="mt-2">Happy with this?</Title>

      <div className="mt-6">
        <VideoPanel source={media.giftReveal} />
      </div>

      <div className="mt-6 grid gap-2">
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
      </div>
    </Frame>
  );
}

function ChooseKind() {
  const { dispatch, config, credits, activeTemplates } = useGifting();
  const cheapest = activeTemplates.reduce((min, t) => Math.min(min, t.creditPrice), Infinity);
  const canAffordAi = credits.available >= cheapest;
  // AI is offered only when it is genuinely available: enabled, with an active
  // template, and with credits to cover it. Standard gifting never depends on
  // any of that.
  const aiAvailable = config.aiGiftingEnabled && activeTemplates.length > 0 && canAffordAi;

  return (
    <Frame className="pt-8">
      <Steps current={3} total={STEPS} />
      <Eyebrow>Gift type</Eyebrow>
      <Title className="mt-2">How should it look?</Title>

      <div className="mt-6 grid gap-3">
        {config.standardGiftingEnabled && (
          <Card
            onClick={() => {
              dispatch({ type: "DRAFT", patch: { kind: "standard" } });
              dispatch({ type: "SENDER_STEP", step: "recipient" });
            }}
            className="overflow-hidden"
          >
            <Still src={media.standardGift.thumb ?? media.standardGift.poster} alt={media.standardGift.alt} ratio="aspect-[16/9]" className="rounded-none" />
            <div className="p-4">
              <p className="text-[15px] text-gift-ink">Standard Video Gift</p>
              <Body className="mt-1 text-[12px]">
                Your message exactly as you recorded it. Always available.
              </Body>
            </div>
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
            className={cnOpacity(aiAvailable)}
          >
            <Still src={media.aiGift.thumb ?? media.aiGift.poster} alt={media.aiGift.alt} ratio="aspect-[16/9]" className="rounded-none" />
            <div className="p-4">
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
            </div>
          </Card>
        )}
      </div>

      <p className="mt-5 text-center text-[11px] text-gift-ink-faint">
        Available credits: {credits.available}
      </p>
    </Frame>
  );
}

function cnOpacity(enabled: boolean) {
  return enabled ? "overflow-hidden" : "overflow-hidden opacity-55";
}

function ChooseTemplate() {
  const { dispatch, activeTemplates, draft } = useGifting();
  return (
    <Frame className="pt-8">
      <Steps current={4} total={STEPS} />
      <Eyebrow>Scene</Eyebrow>
      <Title className="mt-2">Choose a setting</Title>
      <Body className="mt-3">
        Three curated scenes. You can&apos;t write your own prompt — every scene is controlled.
      </Body>

      <div className="mt-6 grid gap-3">
        {activeTemplates.map((template) => (
          <Card
            key={template.id}
            selected={draft.templateId === template.id}
            onClick={() => dispatch({ type: "DRAFT", patch: { templateId: template.id } })}
            className="overflow-hidden"
          >
            <Still src={template.thumbnail} alt={template.title} ratio="aspect-[3/2]" className="rounded-none" />
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] text-gift-ink">{template.title}</p>
                <span className="shrink-0 text-[11px] text-gift-ink-faint">
                  {template.creditPrice} credits
                </span>
              </div>
              <Body className="mt-1 text-[12px]">{template.description}</Body>
            </div>
          </Card>
        ))}
      </div>

      <Button
        className="mt-6"
        disabled={!draft.templateId}
        onClick={() => dispatch({ type: "SENDER_STEP", step: "consent" })}
      >
        Continue
      </Button>
    </Frame>
  );
}

function Consent() {
  const { dispatch, draft } = useGifting();
  const ready = draft.likenessConsent && draft.audioConsent;
  return (
    <Frame className="pt-8">
      <Steps current={5} total={STEPS} />
      <Eyebrow>Permissions</Eyebrow>
      <Title className="mt-2">Before we build your scene</Title>

      <Card className="mt-6 p-4">
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
      </Card>

      <Card className="mt-3 border-gift-blue-soft bg-gift-blue/5 p-4">
        <p className="text-[12px] leading-snug text-gift-ink-soft">
          <span className="font-medium text-gift-ink">Your voice stays yours.</span> This experience
          never clones or replaces your recorded audio. It is preserved and re-attached to the
          finished scene.
        </p>
      </Card>

      <Button
        className="mt-6"
        disabled={!ready}
        onClick={() => dispatch({ type: "SENDER_STEP", step: "recipient" })}
      >
        Continue
      </Button>
    </Frame>
  );
}

function Recipient() {
  const { dispatch, draft, issueMessageCode } = useGifting();
  const ready = draft.recipientName.trim().length > 1 && draft.recipientContact.trim().length > 3;

  return (
    <Frame className="pt-8">
      <Steps current={6} total={STEPS} />
      <Eyebrow>Who is it for?</Eyebrow>
      <Title className="mt-2">Add your recipient</Title>

      <div className="mt-6 grid gap-3">
        <Field
          label="Recipient name"
          value={draft.recipientName}
          onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientName: v } })}
          required
        />
        <Field
          label="Email or mobile"
          value={draft.recipientContact}
          onChange={(v) => dispatch({ type: "DRAFT", patch: { recipientContact: v } })}
          required
        />
        <Field
          label="A short note"
          value={draft.note}
          onChange={(v) => dispatch({ type: "DRAFT", patch: { note: v } })}
          hint="Optional — printed on the gift card."
        />
      </div>

      <Button
        className="mt-6"
        disabled={!ready}
        onClick={() => {
          dispatch({ type: "DRAFT", patch: { messageCode: issueMessageCode() } });
          dispatch({ type: "SENDER_STEP", step: "message-code" });
        }}
      >
        Create gift message code
      </Button>
    </Frame>
  );
}

function MessageCodeIssued() {
  const { dispatch, draft, showToast } = useGifting();
  return (
    <Frame className="pt-8">
      <Steps current={7} total={STEPS} />
      <Eyebrow>Gift Message Code</Eyebrow>
      <Title className="mt-2">Your message has a code</Title>
      <Body className="mt-3">
        This unlocks your message. On its own it opens nothing — it has to be paired with the
        package it belongs to.
      </Body>

      <div className="mt-6">
        <CodeChip
          label="Gift Message Code"
          code={draft.messageCode ?? ""}
          onCopy={() => {
            void navigator.clipboard?.writeText(draft.messageCode ?? "");
            showToast("Gift Message Code copied");
          }}
        />
      </div>

      <Button className="mt-6" onClick={() => dispatch({ type: "SENDER_STEP", step: "package-code" })}>
        Scan the package
      </Button>
    </Frame>
  );
}

function PackageCodeEntry() {
  const { dispatch, showToast } = useGifting();
  const [value, setValue] = useState("");
  return (
    <Frame className="pt-8">
      <Steps current={8} total={STEPS} />
      <Eyebrow>Physical package</Eyebrow>
      <Title className="mt-2">Which package is this for?</Title>
      <Body className="mt-3">
        Scan the QR code on the package, or type the code printed beside it.
      </Body>

      <div className="mt-6">
        <Field
          label="Package Code"
          value={value}
          onChange={setValue}
          placeholder="XXXXX-XXXXX"
          autoCapitalize="characters"
        />
      </div>

      <Button
        className="mt-6"
        disabled={value.trim().length < 4}
        onClick={() => {
          dispatch({ type: "DRAFT", patch: { packageCode: value.toUpperCase() } });
          dispatch({ type: "SENDER_STEP", step: "confirm-product" });
        }}
      >
        Continue
      </Button>
      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => {
          setValue(DEMO_REGIFT_PACKAGE_CODE);
          showToast("Demo package code filled");
        }}
      >
        Use the available demo package
      </Button>
    </Frame>
  );
}

function ConfirmProduct() {
  const { dispatch, draft, activeTemplates, credits, showToast } = useGifting();
  const template = activeTemplates.find((t) => t.id === draft.templateId);

  return (
    <Frame className="pt-8">
      <Eyebrow>Confirm</Eyebrow>
      <Title className="mt-2">Is this the right product?</Title>

      <div className="mt-6">
        <Still src={media.product.poster} alt={media.product.alt} ratio="aspect-[3/2]" />
      </div>

      <Card className="mt-4 p-4">
        <Row label="Product" value="Signature Gift Package" />
        <Row label="Package Code" value={draft.packageCode ?? "—"} mono />
        <Row label="Message Code" value={draft.messageCode ?? "—"} mono />
        <Row label="Recipient" value={draft.recipientName || "—"} />
        <Row
          label="Gift type"
          value={draft.kind === "ai" ? `Scene · ${template?.title ?? ""}` : "Standard video"}
        />
      </Card>

      <Button
        className="mt-6"
        onClick={() => {
          dispatch({
            type: "BIND",
            messageCode: draft.messageCode ?? "",
            packageCode: draft.packageCode ?? "",
          });
          if (draft.kind === "ai" && template) {
            // Reserve before submitting, exactly as the real ledger will: the
            // credits leave `available` the moment the job is accepted, not
            // when it finishes.
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
        className="mt-2"
        onClick={() => dispatch({ type: "SENDER_STEP", step: "package-code" })}
      >
        Choose a different package
      </Button>
      <p className="mt-4 text-center text-[11px] text-gift-ink-faint">
        Available credits: {credits.available}
      </p>
    </Frame>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-gift-ink-faint">{label}</span>
      <span className={`text-right text-[13px] text-gift-ink ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
      </span>
    </div>
  );
}

const STAGE_ORDER: AiJobStage[] = ["preparing", "building_scene", "preserving_audio", "finalizing", "ready"];

function Processing() {
  const { dispatch, aiStage, draft, activeTemplates, showToast } = useGifting();
  const template = activeTemplates.find((t) => t.id === draft.templateId);
  const stage = aiStage ?? "preparing";
  const index = STAGE_ORDER.indexOf(stage);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      dispatch({ type: "AI_STAGE", stage: "preparing" });
      // The job is added to the gallery immediately and in a processing state,
      // so leaving this screen is safe: the visitor can walk away and find it
      // finished, which is the behaviour the real durable job will have.
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
    }
  }, [dispatch, draft.recipientName, template?.title]);

  useEffect(() => {
    if (stage === "ready") return;
    const next = STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
    const id = setTimeout(() => {
      dispatch({ type: "AI_STAGE", stage: next });
      if (next === "ready") {
        dispatch({ type: "PROMOTE_AI_ITEM", id: "job-live" });
        if (template) dispatch({ type: "CHARGE_CREDITS", amount: template.creditPrice });
      }
    }, 2200);
    return () => clearTimeout(id);
  }, [stage, index, dispatch, template]);

  return (
    <Frame className="pt-8">
      <div className="flex items-center justify-between">
        <Eyebrow>Building your gift</Eyebrow>
        <Pill tone="accent">Simulation</Pill>
      </div>
      <Title className="mt-2">
        {stage === "ready" ? "Your gift is ready" : "This takes a moment"}
      </Title>
      <Body className="mt-3">
        You can leave this screen. We&apos;ll finish in the background and it will appear in your
        gallery.
      </Body>

      <div className="mt-6">
        <Still src={media.aiGift.thumb ?? media.aiGift.poster} alt={media.aiGift.alt} ratio="aspect-[3/2]" />
      </div>

      <ol className="mt-6 grid gap-2">
        {STAGE_ORDER.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li
              key={s}
              className="flex items-center gap-3 rounded-xl border border-gift-border bg-gift-surface px-4 py-3"
            >
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

      <div className="mt-6 grid gap-2">
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
          <Button variant="secondary" onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
            Leave and check later
          </Button>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] leading-snug text-gift-ink-faint">
        Simulated generation. No provider is contacted and no real credits are spent.
      </p>
    </Frame>
  );
}

function AccessCard() {
  const { dispatch, lastIssued, draft, showToast } = useGifting();
  return (
    <Frame className="pt-8">
      <Eyebrow>Ready to give</Eyebrow>
      <Title className="mt-2">Your gift access card</Title>
      <Body className="mt-3">
        Print this or send it digitally. Both codes are needed to open the gift.
      </Body>

      {/* The card itself: a designed artefact, not a receipt. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-gift-border bg-gift-surface">
        <div className="relative aspect-[3/2]">
          <Image
            src={media.product.poster}
            alt={media.product.alt}
            fill
            sizes="(max-width: 480px) 100vw, 480px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/30 to-transparent" />
        </div>
        <div className="p-5">
          <Rule className="mb-4" />
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-gift-ink-faint">
            A gift for
          </p>
          <p className="mt-1 text-center text-[20px] font-light text-gift-ink">
            {lastIssued?.recipientName ?? draft.recipientName ?? "—"}
          </p>
          {draft.note && (
            <p className="mt-3 text-center text-[12px] italic leading-snug text-gift-ink-soft">
              “{draft.note}”
            </p>
          )}
          <div className="mt-5 grid gap-2">
            <CodeChip label="Package Code" code={lastIssued?.packageCode ?? "—"} />
            <CodeChip label="Gift Message Code" code={lastIssued?.messageCode ?? "—"} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-2">
        <Button onClick={() => showToast("Share sheet simulated")}>Share</Button>
        <Button variant="secondary" onClick={() => showToast("Download simulated")}>
          Download card
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
          Go to my gallery
        </Button>
      </div>
    </Frame>
  );
}
