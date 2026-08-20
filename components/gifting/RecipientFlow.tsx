"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  DEMO_MESSAGE_CODE,
  DEMO_PACKAGE_CODE,
  SENDER_NAME,
  media,
  useGifting,
} from "@/lib/gifting/simulation/store";
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
import { VideoStage } from "./VideoStage";
import { Body, Button, Checkbox, CodeChip, Field } from "./ui";

/**
 * The recipient journey, as full-screen panels.
 *
 * THE ORDER IS THE PRODUCT
 *   Codes, then the personalised reveal, THEN the optional eligibility gate,
 *   then the brand film. The reveal comes before the gate because the gift is
 *   why the visitor is here and a compliance question is not a welcome.
 *
 * ONE VIEWPORT PER DECISION
 *   Visitor capture is four short steps rather than one tall form, because a
 *   phone shows four fields comfortably and cannot show nine. Going back keeps
 *   everything already typed.
 */

const TOTAL = 6;

export function RecipientFlow({ onExit }: { onExit: () => void }) {
  const { recipientStep } = useGifting();
  return (
    <StageProvider stepKey={recipientStep} theme="receive">
      <Step onExit={onExit} />
    </StageProvider>
  );
}

function Step({ onExit }: { onExit: () => void }) {
  const { recipientStep, dispatch } = useGifting();
  switch (recipientStep) {
    case "welcome":
      return <Welcome onExit={onExit} />;
    case "package-code":
    case "message-code":
      return <CodeEntry onExit={onExit} />;
    case "reveal":
      return <Reveal onExit={onExit} />;
    case "gate":
      return <Gate onExit={onExit} />;
    case "declined":
      return <Declined onExit={onExit} />;
    case "intro":
      return <Intro onExit={onExit} />;
    case "capture":
      return <Capture onExit={onExit} />;
    case "experience":
      return <GiftReady onExit={onExit} />;
    default:
      dispatch({ type: "RECIPIENT_STEP", step: "welcome" });
      return null;
  }
}

function Backdrop({ src, alt, dim = 0.55 }: { src: string; alt: string; dim?: number }) {
  return (
    <>
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" priority />
      {/* Charcoal copy sits over every one of these, so the wash is not
          decoration — it is what keeps the text legible over a bright still. */}
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

function Welcome({ onExit }: { onExit: () => void }) {
  const { dispatch, showToast } = useGifting();
  return (
    <Stage media={<Backdrop src={media.heroProduct.poster} alt={media.heroProduct.alt} dim={0.5} />}>
      <LiveRegion />
      <Guidance
        title="Someone sent you something"
        instruction="You'll need the two codes from your package."
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
              Your codes
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "var(--gift-accent)" }}
            >
              Sample
            </span>
          </div>
          <div className="grid gap-2">
            <CodeChip
              label="Package Code"
              code={DEMO_PACKAGE_CODE}
              onCopy={() => {
                void navigator.clipboard?.writeText(DEMO_PACKAGE_CODE);
                showToast("Package Code copied");
              }}
            />
            <CodeChip
              label="Gift Message Code"
              code={DEMO_MESSAGE_CODE}
              onCopy={() => {
                void navigator.clipboard?.writeText(DEMO_MESSAGE_CODE);
                showToast("Gift Message Code copied");
              }}
            />
          </div>
        </div>
      </StageContent>

      <ActionDock>
        <Button onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "package-code" })}>
          Begin
        </Button>
      </ActionDock>
    </Stage>
  );
}

/** Both codes on ONE screen, so a mismatch shows both of the things being
 *  compared. */
function CodeEntry({ onExit }: { onExit: () => void }) {
  const { dispatch, validateCodes, codeError, showToast } = useGifting();
  const { setPinned, announce } = useStage();
  const [pkg, setPkg] = useState("");
  const [msg, setMsg] = useState("");

  const ready = pkg.trim().length >= 4 && msg.trim().length >= 4;

  useEffect(() => setPinned(Boolean(codeError)), [codeError, setPinned]);

  const submit = () => {
    if (validateCodes(pkg, msg)) {
      dispatch({ type: "PACKAGE_CODE_OK", code: pkg });
      dispatch({ type: "RECIPIENT_STEP", step: "reveal" });
    } else {
      dispatch({ type: "CODE_ERROR", message: "no-match" });
      announce("That combination did not match. Please check both codes.");
    }
  };

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt={media.gateBackground.alt} dim={0.6} />}>
      <LiveRegion />
      <Guidance
        title="Open your gift"
        instruction="Enter both codes from your package."
        step={1}
        total={TOTAL}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className="grid gap-3">
          <div className={`${glass} p-4`}>
            <Field
              label="Package Code"
              value={pkg}
              onChange={(v) => {
                setPkg(v);
                if (codeError) dispatch({ type: "CLEAR_CODE_ERROR" });
              }}
              placeholder="XXXXX-XXXXX"
              autoCapitalize="characters"
            />
            <div className="mt-2 flex gap-2">
              <Mini onClick={() => setPkg(DEMO_PACKAGE_CODE)}>Use sample</Mini>
              <Mini onClick={() => showToast("Camera scanning is not part of this preview")}>
                Scan QR
              </Mini>
            </div>
          </div>

          <div className={`${glass} p-4`}>
            <Field
              label="Gift Message Code"
              value={msg}
              onChange={(v) => {
                setMsg(v);
                if (codeError) dispatch({ type: "CLEAR_CODE_ERROR" });
              }}
              placeholder="XXXXX-XXXXX"
              autoCapitalize="characters"
            />
            <div className="mt-2 flex gap-2">
              <Mini onClick={() => setMsg(DEMO_MESSAGE_CODE)}>Use sample</Mini>
              <Mini
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard?.readText();
                    if (text) setMsg(text.trim());
                  } catch {
                    showToast("Clipboard unavailable");
                  }
                }}
              >
                Paste
              </Mini>
            </div>
          </div>
        </div>
      </StageContent>

      <ActionDock
        error={
          codeError
            ? "That combination didn't match. Please check both codes on your package."
            : null
        }
      >
        <Button disabled={!ready} onClick={submit}>
          Open My Gift
        </Button>
      </ActionDock>
    </Stage>
  );
}

function Mini({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 flex-1 rounded-full border border-gift-border bg-white/70 px-3 text-[11px] text-gift-ink-soft transition-colors hover:border-gift-border-strong hover:text-gift-ink"
    >
      {children}
    </button>
  );
}

function Reveal({ onExit }: { onExit: () => void }) {
  const { dispatch, config } = useGifting();
  return (
    <VideoStage
      source={media.giftReveal}
      title={`A gift from ${SENDER_NAME}`}
      instruction="Your personal message is playing."
      step={2}
      total={TOTAL}
      continueLabel="Continue to Your Gift"
      onExit={onExit}
      onContinue={() =>
        dispatch({
          type: "RECIPIENT_STEP",
          step: config.gateKind === "disabled" ? (config.introEnabled ? "intro" : "capture") : "gate",
        })
      }
    />
  );
}

function Gate({ onExit }: { onExit: () => void }) {
  const { config, dispatch } = useGifting();
  const { setPinned } = useStage();
  useEffect(() => setPinned(true), [setPinned]);

  return (
    <Stage media={<Backdrop src={media.gateBackground.poster} alt={media.gateBackground.alt} dim={0.68} />}>
      <LiveRegion />
      <Guidance title={config.gateHeading} step={3} total={TOTAL} onExit={onExit} />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-5 text-center`}>
          <Body>{config.gateBody}</Body>
          <p className="mt-3 text-[11px] text-gift-ink-faint">
            Please enjoy and share responsibly.
          </p>
        </div>
      </StageContent>

      <ActionDock>
        <Button
          onClick={() =>
            dispatch({
              type: "RECIPIENT_STEP",
              step: config.introEnabled ? "intro" : "capture",
            })
          }
        >
          {config.gateConfirmLabel}
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "declined" })}
        >
          {config.gateDeclineLabel}
        </Button>
      </ActionDock>
    </Stage>
  );
}

function Declined({ onExit }: { onExit: () => void }) {
  const { dispatch } = useGifting();
  return (
    <Stage media={<Backdrop src={media.heroProduct.poster} alt={media.heroProduct.alt} dim={0.7} />}>
      <Guidance title="Thanks for stopping by" onExit={onExit} />
      <RecallDot />
      <StageContent>
        <div className={`${glass} p-5 text-center`}>
          <Body>
            This experience isn&apos;t available to continue right now. Your gift will still be
            here.
          </Body>
        </div>
      </StageContent>
      <ActionDock>
        <Button onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "gate" })}>Back</Button>
      </ActionDock>
    </Stage>
  );
}

function Intro({ onExit }: { onExit: () => void }) {
  const { dispatch, config } = useGifting();
  const posters: Record<string, string> = {
    retail: "/demo/gifting/stills/poster-brand-intro.png",
    studio: "/demo/gifting/stills/hero-product.png",
    gift: "/demo/gifting/stills/poster-gift-reveal.png",
  };
  return (
    <VideoStage
      source={{ ...media.brandIntro, poster: posters[config.introPosterId] ?? posters.retail }}
      title="A thoughtful gift deserves a personal story"
      instruction="A short note from the brand."
      step={4}
      total={TOTAL}
      continueLabel="Continue"
      onExit={onExit}
      onContinue={() => dispatch({ type: "RECIPIENT_STEP", step: "capture" })}
    />
  );
}

type CaptureStage = "name" | "contact" | "extras" | "permissions";
const CAPTURE_ORDER: CaptureStage[] = ["name", "contact", "extras", "permissions"];

function Capture({ onExit }: { onExit: () => void }) {
  const { dispatch, config } = useGifting();
  const { setPinned, announce } = useStage();
  const [stage, setStage] = useState<CaptureStage>("name");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    terms: false,
    privacy: false,
    marketing: false,
  });

  const index = CAPTURE_ORDER.indexOf(stage);
  useEffect(() => setPinned(stage === "permissions"), [stage, setPinned]);

  const canAdvance =
    stage === "name"
      ? form.firstName.trim().length > 0 && form.lastName.trim().length > 0
      : stage === "contact"
        ? form.email.includes("@")
        : stage === "extras"
          ? !config.phoneRequired || form.phone.trim().length > 5
          : form.terms && form.privacy;

  const next = () => {
    if (stage === "permissions") {
      dispatch({
        type: "CAPTURE",
        visitor: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          marketingConsent: form.marketing,
        },
      });
      dispatch({ type: "RECIPIENT_STEP", step: "experience" });
      return;
    }
    setStage(CAPTURE_ORDER[index + 1]);
    announce("Next question");
  };

  const titles: Record<CaptureStage, [string, string]> = {
    name: ["What's your name?", "So we can label your gift."],
    contact: ["Where can we reach you?", "We'll keep your gift at this address."],
    extras: ["Anything else?", config.phoneRequired ? "A mobile number is required." : "Optional."],
    permissions: ["Just the essentials", "Terms and Privacy are required."],
  };

  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.72} />}>
      <LiveRegion />
      <Guidance
        title={titles[stage][0]}
        instruction={titles[stage][1]}
        step={5}
        total={TOTAL}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          {stage === "name" && (
            <div className="grid gap-3">
              <Field
                label="First name"
                value={form.firstName}
                onChange={(v) => setForm({ ...form, firstName: v })}
                required
              />
              <Field
                label="Last name"
                value={form.lastName}
                onChange={(v) => setForm({ ...form, lastName: v })}
                required
              />
            </div>
          )}
          {stage === "contact" && (
            <Field
              label="Email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              required
            />
          )}
          {stage === "extras" && (
            <Field
              label="Mobile"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              required={config.phoneRequired}
              hint={config.phoneRequired ? undefined : "Optional"}
            />
          )}
          {stage === "permissions" && (
            <div className="grid gap-1">
              <Checkbox checked={form.terms} onChange={(v) => setForm({ ...form, terms: v })}>
                I agree to the <span className="underline">Terms of Use</span>.
              </Checkbox>
              <Checkbox checked={form.privacy} onChange={(v) => setForm({ ...form, privacy: v })}>
                I have read the <span className="underline">Privacy Notice</span>.
              </Checkbox>
              {config.marketingConsentEnabled && (
                <Checkbox
                  checked={form.marketing}
                  onChange={(v) => setForm({ ...form, marketing: v })}
                >
                  Send me occasional updates.{" "}
                  <span className="text-gift-ink-faint">(Optional)</span>
                </Checkbox>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {CAPTURE_ORDER.map((s, i) => (
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
        <Button disabled={!canAdvance} onClick={next}>
          {stage === "permissions" ? "View My Gift" : "Continue"}
        </Button>
        {index > 0 && (
          <Button variant="ghost" onClick={() => setStage(CAPTURE_ORDER[index - 1])}>
            Back
          </Button>
        )}
      </ActionDock>
    </Stage>
  );
}

function GiftReady({ onExit }: { onExit: () => void }) {
  const { dispatch, config, visitor } = useGifting();
  return (
    <Stage media={<Backdrop src={media.product.poster} alt={media.product.alt} dim={0.45} />}>
      <LiveRegion />
      <Guidance
        title={visitor ? `Your gift, ${visitor.firstName}` : "Your gift is ready"}
        instruction={`${SENDER_NAME} sent you this personally.`}
        step={6}
        total={TOTAL}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-4`}>
          <span className="text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
            In your package
          </span>
          <p className="mt-1.5 text-[16px] text-gift-ink">Signature Gift Package</p>
          <Body className="mt-1 text-[12px]">
            A plain white luxury bottle in neutral presentation packaging.
          </Body>
        </div>
      </StageContent>

      <ActionDock>
        <Button onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
          View My Gifts
        </Button>
        {config.regiftingEnabled && (
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: "START_CREATE", isRegift: true });
              dispatch({ type: "SCENARIO", scenario: "regift" });
            }}
          >
            Regift This Product
          </Button>
        )}
      </ActionDock>
    </Stage>
  );
}
