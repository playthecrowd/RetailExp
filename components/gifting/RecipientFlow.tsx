"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  DEMO_MESSAGE_CODE,
  DEMO_PACKAGE_CODE,
  media,
  useGifting,
} from "@/lib/gifting/simulation/store";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import { GiftReveal } from "./GiftReveal";
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
 * The recipient journey.
 *
 * TWO NAMED FILMS, IN THIS ORDER
 *   Personal Gift Message — the person who sent it, speaking. Then the
 *   Signature Product Experience — the film about the thing they sent. The
 *   person comes first because that is what the visitor is here for, and the
 *   product film lands better once they know who it is from.
 *
 * THE GATE COMES AFTER THE MESSAGE
 *   A compliance question is not a welcome. The message is why the visitor
 *   opened this, so they see it first and the eligibility check sits between
 *   the message and the product.
 *
 * ONE FORM, NOT FOUR SCREENS
 *   Capture used to be four sequential questions. Four screens to collect four
 *   fields is three chances to abandon, and a phone shows all of them at once
 *   perfectly well. It is one panel now, and the only thing that moves is that
 *   panel when the keyboard opens.
 */

const TOTAL = 5;

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
      return <PersonalGiftMessage onExit={onExit} />;
    case "gate":
      return <Gate onExit={onExit} />;
    case "declined":
      return <Declined onExit={onExit} />;
    case "capture":
      return <Capture onExit={onExit} />;
    case "experience":
      return <SignatureProductExperience onExit={onExit} />;
    default:
      dispatch({ type: "RECIPIENT_STEP", step: "welcome" });
      return null;
  }
}

/** The gift the entered codes resolved to, with the sample gift as a fallback
 *  so no screen can ever be handed nothing. */
function useOpenGift(): GalleryItem {
  const { gallery, openGiftId } = useGifting();
  return gallery.find((g) => g.id === openGiftId) ?? gallery[0];
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
  const { dispatch, validateCodes, resolveGift, codeError, showToast } = useGifting();
  const { setPinned, announce } = useStage();
  const [pkg, setPkg] = useState("");
  const [msg, setMsg] = useState("");

  const ready = pkg.trim().length >= 4 && msg.trim().length >= 4;

  useEffect(() => setPinned(Boolean(codeError)), [codeError, setPinned]);

  const submit = () => {
    if (validateCodes(pkg, msg)) {
      const gift = resolveGift(pkg, msg);
      dispatch({ type: "PACKAGE_CODE_OK", code: pkg });
      // Everything after this point belongs to one specific gift, so it is
      // named here rather than assumed later.
      if (gift) dispatch({ type: "OPEN_GIFT", id: gift.id, stay: true });
      dispatch({ type: "RECIPIENT_STEP", step: "reveal" });
    } else {
      dispatch({ type: "CODE_ERROR", message: "no-match" });
      announce("That combination did not match. Please check both codes.");
    }
  };

  return (
    <Stage
      media={<Backdrop src={media.gateBackground.poster} alt={media.gateBackground.alt} dim={0.6} />}
    >
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

/** Video Phase 1 — the Personal Gift Message. */
function PersonalGiftMessage({ onExit }: { onExit: () => void }) {
  const { dispatch, config } = useGifting();
  const gift = useOpenGift();
  return (
    <VideoStage
      source={gift.media}
      title={`A message from ${gift.senderName}`}
      instruction="Recorded for you."
      step={2}
      total={TOTAL}
      continueLabel="Continue to Your Gift"
      onExit={onExit}
      onContinue={() =>
        dispatch({
          type: "RECIPIENT_STEP",
          step: config.gateKind === "disabled" ? "capture" : "gate",
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
    <Stage
      media={
        <Backdrop src={media.gateBackground.poster} alt={media.gateBackground.alt} dim={0.68} />
      }
    >
      <LiveRegion />
      <Guidance title={config.gateHeading} step={3} total={TOTAL} onExit={onExit} />
      <RecallDot />

      <StageContent>
        <div className={`${glass} p-5 text-center`}>
          <Body>{config.gateBody}</Body>
          <p className="mt-3 text-[11px] text-gift-ink-faint">Please enjoy and share responsibly.</p>
        </div>
      </StageContent>

      <ActionDock>
        <Button onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "capture" })}>
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

/**
 * One form, one screen.
 *
 * The panel is the only thing allowed to move. The document stays locked, so
 * when the keyboard opens the dock lifts and the panel pans just enough to
 * keep the focused field and the action reachable — the page itself never
 * slides out from under the visitor.
 */
function Capture({ onExit }: { onExit: () => void }) {
  const { dispatch, config } = useGifting();
  const { setPinned, announce } = useStage();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    terms: false,
    marketing: false,
  });
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => setPinned(true), [setPinned]);

  const missing = {
    firstName: form.firstName.trim().length === 0,
    lastName: form.lastName.trim().length === 0,
    email: !form.email.includes("@") || form.email.trim().length < 5,
    phone: config.phoneRequired && form.phone.trim().length < 6,
    terms: !form.terms,
  };
  const complete = !Object.values(missing).some(Boolean);

  const submit = () => {
    if (!complete) {
      // Errors appear on the attempt, not while someone is still typing their
      // first name.
      setShowErrors(true);
      announce("Some details are still needed.");
      return;
    }
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
    if (config.signatureExperienceEnabled) {
      dispatch({ type: "RECIPIENT_STEP", step: "experience" });
    } else {
      dispatch({ type: "SCENARIO", scenario: "gallery" });
    }
  };

  return (
    <Stage
      media={<Backdrop src={media.gateBackground.poster} alt={media.gateBackground.alt} dim={0.7} />}
    >
      <LiveRegion />
      <Guidance
        title="Where should we send it?"
        instruction="A few details and your gift is yours."
        step={4}
        total={TOTAL}
        onExit={onExit}
      />
      <RecallDot />

      <StageContent fill>
        {/* Only this panel pans, and only when a short phone plus an open
            keyboard leaves it no room. */}
        <div
          className={`${glass} max-h-full min-h-0 overflow-y-auto overscroll-contain p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="First name"
              value={form.firstName}
              onChange={(v) => setForm({ ...form, firstName: v })}
              required
              autoComplete="given-name"
              error={showErrors && missing.firstName ? "Required" : undefined}
            />
            <Field
              label="Last name"
              value={form.lastName}
              onChange={(v) => setForm({ ...form, lastName: v })}
              required
              autoComplete="family-name"
              error={showErrors && missing.lastName ? "Required" : undefined}
            />
          </div>
          <div className="mt-2.5 grid gap-2.5">
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              required
              error={showErrors && missing.email ? "Enter a valid email" : undefined}
            />
            <Field
              label="Mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              required={config.phoneRequired}
              hint={config.phoneRequired ? undefined : "Optional"}
              error={showErrors && missing.phone ? "Required" : undefined}
            />
          </div>

          <div className="mt-3 border-t border-gift-border pt-2">
            <Checkbox checked={form.terms} onChange={(v) => setForm({ ...form, terms: v })}>
              I agree to the <span className="underline">Terms of Use</span> and have read the{" "}
              <span className="underline">Privacy Notice</span>.
            </Checkbox>
            {config.marketingConsentEnabled && (
              <Checkbox
                checked={form.marketing}
                onChange={(v) => setForm({ ...form, marketing: v })}
              >
                Send me occasional updates. <span className="text-gift-ink-faint">(Optional)</span>
              </Checkbox>
            )}
            {showErrors && missing.terms && (
              <p className="mt-1 text-[11px] text-gift-danger">
                Please accept the Terms and Privacy Notice to continue.
              </p>
            )}
          </div>
        </div>
      </StageContent>

      <ActionDock>
        <Button onClick={submit}>View My Gift</Button>
      </ActionDock>
    </Stage>
  );
}

/** Video Phase 2 — the Signature Product Experience, opened as a full-screen
 *  surprise for the item the visitor was actually sent. */
function SignatureProductExperience({ onExit }: { onExit: () => void }) {
  const { dispatch } = useGifting();
  const gift = useOpenGift();
  return (
    <GiftReveal
      giftId={gift.id}
      mode="signature"
      onExit={onExit}
      onRegift={() => dispatch({ type: "REGIFT_FROM", item: gift })}
      onViewGifts={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}
    />
  );
}
