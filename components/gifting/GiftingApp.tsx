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
import {
  ActionTray,
  GuidanceTray,
  Stage,
  StageBody,
  StageProvider,
  useLockedDocument,
} from "./shell";
import { Button, CodeChip, Screen, Toast } from "./ui";

/**
 * The prototype shell.
 *
 * WHY ONE CLIENT SHELL RATHER THAN FIVE ROUTES
 *   The scenarios share one configuration and one gallery — a dashboard toggle
 *   has to change the recipient flow, and a gift created in the sender flow has
 *   to appear in the gallery. All of that lives in React state, so moving
 *   between scenarios is a state change, not a navigation. The three public
 *   routes are genuine entry points that set the opening scenario.
 *
 * THE LOCK IS SCOPED TO THE VISITOR
 *   Visitor steps are fixed, full-viewport panels and the document must not
 *   scroll behind them. The DASHBOARD is a dense admin surface with sixteen
 *   sections and scrolls normally, so the lock is applied per scenario rather
 *   than to the whole prototype.
 */
export function GiftingApp({ initial }: { initial: Scenario }) {
  const { scenario, dispatch, toast } = useGifting();
  const applied = useRef(false);

  useEffect(() => {
    // Once. Re-applying every render would trap the visitor on the entry
    // scenario the moment they tried to leave it.
    if (applied.current) return;
    applied.current = true;
    if (initial !== "launcher") dispatch({ type: "SCENARIO", scenario: initial });
  }, [initial, dispatch]);

  const isVisitorStep = scenario !== "dashboard";
  useLockedDocument(isVisitorStep);

  if (scenario === "dashboard") {
    return (
      <Screen>
        <GiftingDashboard onExit={() => dispatch({ type: "SCENARIO", scenario: "launcher" })} />
        <Toast message={toast} />
      </Screen>
    );
  }

  return (
    <>
      {scenario === "launcher" && <Launcher />}
      {scenario === "receive" && <RecipientFlow />}
      {(scenario === "create" || scenario === "regift") && <SenderFlow />}
      {scenario === "gallery" && <Gallery />}
      <Toast message={toast} />
      {scenario !== "launcher" && <LauncherTab />}
    </>
  );
}

/** A discreet way back to the scenario list from inside a flow. Positioned
 *  clear of the guidance tray so it never overlaps the step title. */
function LauncherTab() {
  const { dispatch } = useGifting();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "RESET_FLOW" });
        dispatch({ type: "SCENARIO", scenario: "launcher" });
      }}
      className="fixed left-4 z-50 min-h-11 rounded-full border border-white/70 bg-[rgba(250,249,246,0.8)] px-3 text-[10px] uppercase tracking-[0.16em] text-gift-ink-faint backdrop-blur-xl transition-colors hover:text-gift-ink"
      style={{ top: "calc(env(safe-area-inset-top) + 0.9rem)" }}
    >
      Scenarios
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
    <StageProvider stepKey="launcher" pinned>
      <Stage>
        <GuidanceTray
          title="Gifting Demo Client 1"
          instruction="A clickable walkthrough. Local fixtures only — no database, no provider."
        />

        <StageBody>
          <div className="grid gap-2">
            <ScenarioButton title="Receive a Gift" body="Codes, reveal, gate, intro, sign-up, gallery." onClick={() => go("receive")} />
            <ScenarioButton title="Create a Gift" body="Record, upload, type, recipient, bind, card." onClick={() => go("create", false)} />
            <ScenarioButton title="Regift a Product" body="The same flow, from a gift you received." onClick={() => go("regift", true)} />
            <ScenarioButton title="View Personal Gallery" body="Received, created, processing, complete." onClick={() => go("gallery")} />
            <ScenarioButton title="Preview Client Dashboard" body="Sixteen sections, working controls." onClick={() => go("dashboard")} />

            <div className="mt-1 rounded-2xl border border-white/60 bg-[rgba(250,249,246,0.86)] p-3 backdrop-blur-xl">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
                Eligibility gate
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ["disabled", "None"],
                    ["age_18", "18+"],
                    ["age_21", "21+"],
                    ["acknowledgement", "Custom"],
                  ] as [GateKind, string][]
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => dispatch({ type: "GATE_KIND", kind })}
                    className={`min-h-11 rounded-xl border text-[11px] transition-colors ${
                      config.gateKind === kind
                        ? "border-gift-champagne bg-gift-champagne/10 text-gift-ink"
                        : "border-gift-border bg-white/60 text-gift-ink-soft"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-gift-border-strong bg-[rgba(250,249,246,0.86)] p-3 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
                  Demo Access
                </span>
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
            </div>
          </div>
        </StageBody>

        <ActionTray forceVisible>
          <Button variant="ghost" onClick={() => go("receive")}>
            Start the recipient walkthrough
          </Button>
        </ActionTray>
      </Stage>
    </StageProvider>
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
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-white/60 bg-[rgba(250,249,246,0.86)] px-4 py-2.5 text-left backdrop-blur-xl transition-colors hover:border-gift-border-strong"
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
