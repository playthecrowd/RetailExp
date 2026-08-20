"use client";

import { useState } from "react";
import {
  DEMO_MESSAGE_CODE,
  DEMO_PACKAGE_CODE,
  SENDER_NAME,
  media,
  useGifting,
} from "@/lib/gifting/simulation/store";
import {
  Body,
  Button,
  Card,
  Checkbox,
  CodeChip,
  Eyebrow,
  Field,
  Frame,
  Rule,
  Still,
  Steps,
  Title,
  VideoPanel,
} from "./ui";

/**
 * The recipient journey.
 *
 * THE ORDER IS THE PRODUCT
 *   Codes, then the personalised reveal, THEN the optional eligibility gate,
 *   then the generic brand intro. The reveal comes before the gate because the
 *   gift is the reason the visitor is here and a compliance question is not a
 *   welcome; the reveal and the intro are separate screens because one is from
 *   a person and the other is from a company, and merging them would make the
 *   personal message feel like an advert.
 */

const TOTAL_STEPS = 6;

export function RecipientFlow() {
  const { recipientStep, dispatch } = useGifting();

  switch (recipientStep) {
    case "welcome":
      return <Welcome />;
    case "package-code":
      return <PackageCode />;
    case "message-code":
      return <MessageCode />;
    case "reveal":
      return <Reveal />;
    case "gate":
      return <Gate />;
    case "declined":
      return <Declined />;
    case "intro":
      return <Intro />;
    case "capture":
      return <Capture />;
    case "experience":
      return <GiftExperience />;
    default:
      dispatch({ type: "RECIPIENT_STEP", step: "welcome" });
      return null;
  }
}

function Welcome() {
  const { dispatch, showToast } = useGifting();
  return (
    <Frame className="pt-8">
      <Rule className="mb-8" />
      <Eyebrow>Gifting Demo Client 1</Eyebrow>
      <Title className="mt-2">Someone sent you<br />something.</Title>
      <Body className="mt-3">
        Enter the two codes from your package to open your personal gift.
      </Body>

      <div className="mt-6">
        <Still src={media.heroProduct.poster} alt={media.heroProduct.alt} ratio="aspect-[4/3]" priority />
      </div>

      <Button className="mt-6" onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "package-code" })}>
        Begin
      </Button>

      {/* Demo Access. Printed rather than hidden because this prototype has no
          database behind it — these unlock fixture data and nothing else. */}
      <div className="mt-8 rounded-2xl border border-gift-border bg-gift-surface-sunk p-4">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>Demo Access</Eyebrow>
          <span className="text-[10px] uppercase tracking-[0.14em] text-gift-champagne">
            Preview only
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
        <p className="mt-3 text-[11px] leading-snug text-gift-ink-faint">
          Try mixing one of these with any other code to see the failure state.
        </p>
      </div>
    </Frame>
  );
}

function CodeEntry({
  step,
  eyebrow,
  title,
  body,
  placeholder,
  onSubmit,
  prefill,
}: {
  step: number;
  eyebrow: string;
  title: string;
  body: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  prefill: string;
}) {
  const { codeError, dispatch } = useGifting();
  const [value, setValue] = useState("");

  return (
    <Frame className="pt-8">
      <Steps current={step} total={TOTAL_STEPS} />
      <Eyebrow>{eyebrow}</Eyebrow>
      <Title className="mt-2">{title}</Title>
      <Body className="mt-3">{body}</Body>

      <div className="mt-6">
        <Field
          label="Enter code"
          value={value}
          onChange={(v) => {
            setValue(v);
            if (codeError) dispatch({ type: "CLEAR_CODE_ERROR" });
          }}
          placeholder={placeholder}
          autoCapitalize="characters"
        />
      </div>

      {codeError && (
        // One message for every failure. Never which code was wrong, never
        // whether it exists — telling them apart is an oracle for guessing the
        // other half.
        <div
          role="alert"
          className="mt-4 rounded-xl border border-gift-danger/30 bg-gift-danger/5 p-4"
        >
          <p className="text-[13px] font-medium text-gift-danger">
            That combination didn&apos;t match
          </p>
          <p className="mt-1 text-[12px] leading-snug text-gift-ink-soft">
            Please check both codes on your package and try again.
          </p>
        </div>
      )}

      <Button className="mt-6" disabled={value.trim().length < 4} onClick={() => onSubmit(value)}>
        Continue
      </Button>
      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => {
          setValue(prefill);
          dispatch({ type: "CLEAR_CODE_ERROR" });
        }}
      >
        Use the demo code
      </Button>
    </Frame>
  );
}

function PackageCode() {
  const { dispatch } = useGifting();
  return (
    <CodeEntry
      step={1}
      eyebrow="Step one"
      title="Your Package Code"
      body="This is printed on the card inside your package, or reached by scanning its QR code."
      placeholder="XXXXX-XXXXX"
      prefill={DEMO_PACKAGE_CODE}
      onSubmit={(value) => {
        // The package code alone never confirms anything. It is held, and the
        // pair is judged together on the next screen.
        dispatch({ type: "PACKAGE_CODE_OK", code: value });
        dispatch({ type: "RECIPIENT_STEP", step: "message-code" });
      }}
    />
  );
}

function MessageCode() {
  const { dispatch, validateCodes, packageCodeEntered } = useGifting();
  return (
    <CodeEntry
      step={2}
      eyebrow="Step two"
      title="Your Gift Message Code"
      body="This unlocks the personal message recorded for you. Both codes must belong to the same gift."
      placeholder="XXXXX-XXXXX"
      prefill={DEMO_MESSAGE_CODE}
      onSubmit={(value) => {
        if (validateCodes(packageCodeEntered, value)) {
          dispatch({ type: "RECIPIENT_STEP", step: "reveal" });
        } else {
          dispatch({ type: "CODE_ERROR", message: "no-match" });
        }
      }}
    />
  );
}

function Reveal() {
  const { dispatch, config } = useGifting();
  return (
    <Frame className="pt-8">
      <Steps current={3} total={TOTAL_STEPS} />
      <div className="text-center">
        <Eyebrow>Your gift</Eyebrow>
        <Title className="mt-2">
          You Received a Gift
          <br />
          From {SENDER_NAME}
        </Title>
      </div>

      <div className="mt-6">
        <VideoPanel source={media.giftReveal} autoPlay />
      </div>

      <Button
        className="mt-6"
        onClick={() =>
          dispatch({
            type: "RECIPIENT_STEP",
            // The gate is optional and configurable, so the flow asks the
            // configuration where to go rather than assuming a gate exists.
            step: config.gateKind === "disabled" ? (config.introEnabled ? "intro" : "capture") : "gate",
          })
        }
      >
        Continue
      </Button>
    </Frame>
  );
}

function Gate() {
  const { config, dispatch } = useGifting();
  return (
    <div className="relative min-h-dvh">
      <div className="absolute inset-0">
        <Still
          src={media.gateBackground.poster}
          alt={media.gateBackground.alt}
          ratio="h-full"
          className="h-full rounded-none"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/80 to-white/95" />
      </div>

      <Frame className="relative flex min-h-dvh flex-col justify-center pt-8">
        <Rule className="mb-8" />
        <Title className="text-center">{config.gateHeading}</Title>
        <Body className="mt-3 text-center">{config.gateBody}</Body>

        <div className="mt-8 grid gap-2">
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
            variant="secondary"
            onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "declined" })}
          >
            {config.gateDeclineLabel}
          </Button>
        </div>

        <p className="mt-6 text-center text-[11px] leading-snug text-gift-ink-faint">
          Please enjoy and share responsibly.
        </p>
      </Frame>
    </div>
  );
}

function Declined() {
  const { dispatch } = useGifting();
  return (
    <Frame className="flex min-h-dvh flex-col justify-center pt-8">
      <Rule className="mb-8" />
      <Title className="text-center">Thanks for stopping by</Title>
      <Body className="mt-3 text-center">
        This experience isn&apos;t available to continue right now. Your gift will still be here.
      </Body>
      <Button
        variant="secondary"
        className="mt-8"
        onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "gate" })}
      >
        Back
      </Button>
    </Frame>
  );
}

function Intro() {
  const { dispatch } = useGifting();
  const { config } = useGifting();
  const poster = useIntroPoster(config.introPosterId);

  return (
    <Frame className="pt-8">
      <Steps current={4} total={TOTAL_STEPS} />
      <Eyebrow>A note from the brand</Eyebrow>
      <Title className="mt-2">A thoughtful gift deserves a personal story.</Title>
      <Body className="mt-3">
        Record a message, personalize the experience and create something made especially for them.
      </Body>

      <div className="mt-6">
        <VideoPanel source={{ ...media.brandIntro, poster }} />
      </div>

      <Button className="mt-6" onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "capture" })}>
        Continue
      </Button>
      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => dispatch({ type: "RECIPIENT_STEP", step: "capture" })}
      >
        Skip
      </Button>
    </Frame>
  );
}

/** Resolves the poster the dashboard has selected, so the toggle there has a
 *  visible effect here. */
function useIntroPoster(id: string): string {
  const options: Record<string, string> = {
    retail: "/demo/gifting/stills/poster-brand-intro.png",
    studio: "/demo/gifting/stills/hero-product.png",
    gift: "/demo/gifting/stills/poster-gift-reveal.png",
  };
  return options[id] ?? options.retail;
}

function Capture() {
  const { dispatch, config } = useGifting();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    terms: false,
    privacy: false,
    marketing: false,
  });

  const ready =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.includes("@") &&
    form.terms &&
    form.privacy &&
    (!config.phoneRequired || form.phone.trim().length > 5);

  return (
    <Frame className="pt-8">
      <Steps current={5} total={TOTAL_STEPS} />
      <Eyebrow>Quick sign-up</Eyebrow>
      <Title className="mt-2">Save your gift</Title>
      <Body className="mt-3">
        We&apos;ll keep this gift in your private gallery so you can return to it any time.
      </Body>

      <div className="mt-6 grid gap-3">
        <Field label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
        <Field label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
        <Field
          label="Email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          required
        />
        <Field
          label="Mobile"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          required={config.phoneRequired}
          hint={config.phoneRequired ? undefined : "Optional"}
        />
      </div>

      <div className="mt-4 grid gap-1">
        <Checkbox checked={form.terms} onChange={(v) => setForm({ ...form, terms: v })}>
          I agree to the <span className="underline">Terms of Use</span>.
        </Checkbox>
        <Checkbox checked={form.privacy} onChange={(v) => setForm({ ...form, privacy: v })}>
          I have read the <span className="underline">Privacy Notice</span>.
        </Checkbox>
        {config.marketingConsentEnabled && (
          <Checkbox checked={form.marketing} onChange={(v) => setForm({ ...form, marketing: v })}>
            Send me occasional updates. <span className="text-gift-ink-faint">(Optional)</span>
          </Checkbox>
        )}
      </div>

      <Button
        className="mt-6"
        disabled={!ready}
        onClick={() => {
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
        }}
      >
        Continue to My Gift
      </Button>
    </Frame>
  );
}

function GiftExperience() {
  const { dispatch, config, visitor } = useGifting();
  return (
    <Frame className="pt-8">
      <Steps current={6} total={TOTAL_STEPS} />
      <Eyebrow>{visitor ? `Welcome, ${visitor.firstName}` : "Your gift"}</Eyebrow>
      <Title className="mt-2">Your gift is ready</Title>
      <Body className="mt-3">
        {SENDER_NAME} sent you this personally. It&apos;s saved to your private gallery.
      </Body>

      <div className="mt-6">
        <Still src={media.product.poster} alt={media.product.alt} ratio="aspect-[3/2]" />
      </div>

      <Card className="mt-4 p-4">
        <Eyebrow>In your package</Eyebrow>
        <p className="mt-1.5 text-[15px] text-gift-ink">Signature Gift Package</p>
        <Body className="mt-1 text-[12px]">
          A plain white luxury bottle in neutral presentation packaging.
        </Body>
      </Card>

      <div className="mt-6 grid gap-2">
        <Button onClick={() => dispatch({ type: "SCENARIO", scenario: "gallery" })}>
          View my private gallery
        </Button>
        {config.regiftingEnabled && (
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: "START_CREATE", isRegift: true });
              dispatch({ type: "SCENARIO", scenario: "regift" });
            }}
          >
            Regift This Product
          </Button>
        )}
      </div>
    </Frame>
  );
}
