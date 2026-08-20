"use client";

import { useEffect, useRef } from "react";
import {
  DEMO_MESSAGE_CODE,
  DEMO_PACKAGE_CODE,
  useGifting,
  type Scenario,
} from "@/lib/gifting/simulation/store";
import type { GateKind } from "@/lib/gifting/simulation/types";
import { GiftingDashboard } from "./Dashboard";
import { Gallery } from "./Gallery";
import { RecipientFlow } from "./RecipientFlow";
import { SenderFlow } from "./SenderFlow";
import { Body, Card, CodeChip, Eyebrow, Frame, Rule, Screen, Title, Toast } from "./ui";

/**
 * The prototype shell.
 *
 * WHY ONE CLIENT SHELL RATHER THAN FIVE ROUTES
 *   The scenarios share one configuration and one gallery — a dashboard toggle
 *   has to change the recipient flow, and a gift created in the sender flow has
 *   to appear in the gallery. All of that lives in React state, so moving
 *   between scenarios is a state change, not a navigation. The three public
 *   routes are genuine entry points that set the opening scenario; after that
 *   the prototype stays put and keeps everything.
 */
export function GiftingApp({ initial }: { initial: Scenario }) {
  const { scenario, dispatch, toast } = useGifting();
  const applied = useRef(false);

  useEffect(() => {
    // Once. Re-applying on every render would trap the visitor on the entry
    // scenario the moment they tried to leave it.
    if (applied.current) return;
    applied.current = true;
    if (initial !== "launcher") dispatch({ type: "SCENARIO", scenario: initial });
  }, [initial, dispatch]);

  return (
    <Screen>
      {scenario === "launcher" && <Launcher />}
      {scenario === "receive" && <RecipientFlow />}
      {(scenario === "create" || scenario === "regift") && <SenderFlow />}
      {scenario === "gallery" && <Gallery />}
      {scenario === "dashboard" && (
        <GiftingDashboard onExit={() => dispatch({ type: "SCENARIO", scenario: "launcher" })} />
      )}
      <Toast message={toast} />
      {scenario !== "launcher" && scenario !== "dashboard" && <LauncherTab />}
    </Screen>
  );
}

/** A discreet way back to the scenario list from anywhere in a flow. Small and
 *  low-contrast on purpose: it is a prototype affordance, not part of the
 *  product being reviewed. */
function LauncherTab() {
  const { dispatch } = useGifting();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "RESET_FLOW" });
        dispatch({ type: "SCENARIO", scenario: "launcher" });
      }}
      className="fixed left-1/2 top-2 z-40 -translate-x-1/2 rounded-full border border-gift-border bg-gift-surface/90 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gift-ink-faint backdrop-blur transition-colors hover:text-gift-ink"
      style={{ marginTop: "env(safe-area-inset-top)" }}
    >
      Demo scenarios
    </button>
  );
}

function Launcher() {
  const { dispatch, config, showToast } = useGifting();

  const go = (scenario: Scenario, isRegift?: boolean) => {
    dispatch({ type: "RESET_FLOW" });
    if (scenario === "create" || scenario === "regift") {
      dispatch({ type: "START_CREATE", isRegift: Boolean(isRegift) });
    }
    dispatch({ type: "SCENARIO", scenario });
  };

  return (
    <Frame className="pt-8">
      <Rule className="mb-8" />
      <Eyebrow>Gifting Demo Client 1 · Prototype</Eyebrow>
      <Title className="mt-2">Simulation</Title>
      <Body className="mt-3">
        A clickable walkthrough of the gifting experience. Local fixtures only — no database, no
        provider, no credits spent.
      </Body>

      <div className="mt-6 grid gap-2">
        <ScenarioButton
          title="Receive a Gift"
          body="Codes, reveal, gate, intro, sign-up, gift, gallery."
          onClick={() => go("receive")}
        />
        <ScenarioButton
          title="Create a Gift"
          body="Record, upload, choose type, recipient, bind, card."
          onClick={() => go("create", false)}
        />
        <ScenarioButton
          title="Regift a Product"
          body="The same creation flow, starting from a gift you received."
          onClick={() => go("regift", true)}
        />
        <ScenarioButton
          title="View Personal Gallery"
          body="Received, created, processing and completed gifts."
          onClick={() => go("gallery")}
        />
        <ScenarioButton
          title="Preview Client Dashboard"
          body="Sixteen sections, with working configuration controls."
          onClick={() => go("dashboard")}
        />
      </div>

      {/* The gate control, so a reviewer can switch variants without opening
          the dashboard. It writes to the same configuration the dashboard
          writes to — there is only one setting. */}
      <Card className="mt-6 p-4">
        <Eyebrow>Eligibility gate</Eyebrow>
        <Body className="mt-1 text-[12px]">
          Shown after the personalised reveal. Simulates future dashboard configuration.
        </Body>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["disabled", "No gate"],
              ["age_18", "18+"],
              ["age_21", "21+"],
              ["acknowledgement", "Custom"],
            ] as [GateKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => dispatch({ type: "GATE_KIND", kind })}
              className={`min-h-11 rounded-xl border px-3 text-[12px] transition-colors ${
                config.gateKind === kind
                  ? "border-gift-champagne bg-gift-champagne/10 text-gift-ink"
                  : "border-gift-border bg-gift-surface text-gift-ink-soft hover:border-gift-border-strong"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4 border-dashed p-4">
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
      </Card>

      <p className="mt-6 text-center text-[11px] leading-snug text-gift-ink-faint">
        Prototype scenario selector. Not the production entry flow.
      </p>
    </Frame>
  );
}

function ScenarioButton({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-gift-border bg-gift-surface px-4 py-3 text-left transition-colors hover:border-gift-border-strong"
    >
      <span className="min-w-0">
        <span className="block text-[14px] text-gift-ink">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-gift-ink-faint">{body}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-gift-ink-faint">
        →
      </span>
    </button>
  );
}
