"use client";

import { useState } from "react";
import { useGifting } from "@/lib/gifting/simulation/store";
import type { GateKind } from "@/lib/gifting/simulation/types";
import { GiftingDashboard } from "./Dashboard";
import { Gallery } from "./Gallery";
import { GiftReveal } from "./GiftReveal";
import { RecipientFlow } from "./RecipientFlow";
import { SenderFlow } from "./SenderFlow";
import {
  ActionDock,
  Stage,
  StageContent,
  StageProvider,
  useLockedDocument,
  type ScenarioTheme,
} from "./shell";
import { Button, Screen, Toast } from "./ui";

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
 * THE WAY OUT IS PART OF EACH FLOW, NOT A FLOATING TAB
 *   There used to be a fixed "Scenarios" chip pinned over every screen. It
 *   collided with step titles, sat outside the safe area on a notched phone,
 *   and duplicated a control the flows needed anyway. Each flow now receives
 *   `onExit` and renders it as the Exit chip inside its own header, which is
 *   measured, safe-area aware, and always in the same place.
 *
 * THE LOCK IS SCOPED TO THE VISITOR
 *   Visitor steps are fixed, full-viewport panels and the document must not
 *   scroll behind them. The DASHBOARD is a dense admin surface with sixteen
 *   sections and scrolls normally, so the lock is applied per scenario rather
 *   than to the whole prototype.
 */
export function GiftingApp() {
  // The opening scenario comes from the route, seeded into the store when it
  // is created — so the first paint is already the right screen and the
  // server's markup matches it.
  const { scenario: current, dispatch, toast, openGiftId } = useGifting();

  const isVisitorStep = current !== "dashboard";
  useLockedDocument(isVisitorStep);

  const exit = () => {
    dispatch({ type: "RESET_FLOW" });
    dispatch({ type: "SCENARIO", scenario: "launcher" });
  };

  if (current === "dashboard") {
    return (
      <Screen>
        <GiftingDashboard onExit={exit} />
        <Toast message={toast} />
      </Screen>
    );
  }

  return (
    <>
      {current === "launcher" && <Launcher />}
      {current === "receive" && <RecipientFlow onExit={exit} />}
      {(current === "create" || current === "regift") && <SenderFlow onExit={exit} />}
      {current === "gallery" && <Gallery onExit={exit} />}
      {/* Back from an opened gift goes to the gallery, not out of the flow —
          the visitor came from a card and expects to land on it again. */}
      {current === "reveal" && openGiftId && (
        <GiftReveal giftId={openGiftId} onExit={() => dispatch({ type: "CLOSE_GIFT" })} />
      )}
      <Toast message={toast} />
    </>
  );
}

interface Choice {
  /** Doubles as the theme name, so each choice previews its own accent. */
  id: ScenarioTheme;
  title: string;
  body: string;
  action: string;
  go: (dispatch: ReturnType<typeof useGifting>["dispatch"]) => void;
}

const CHOICES: Choice[] = [
  {
    id: "receive",
    title: "Receive a Gift",
    body: "Enter two codes, open the gift, and watch the welcome.",
    action: "Start Recipient Experience",
    go: (d) => d({ type: "SCENARIO", scenario: "receive" }),
  },
  {
    id: "create",
    title: "Create a Gift",
    body: "Record a message, choose a look, and pair it with a package.",
    action: "Create a Gift",
    go: (d) => {
      d({ type: "START_CREATE", isRegift: false });
      d({ type: "SCENARIO", scenario: "create" });
    },
  },
  {
    id: "regift",
    title: "Pass a Gift On",
    body: "The same flow, starting from a gift you were given.",
    action: "Regift a Product",
    go: (d) => {
      d({ type: "START_CREATE", isRegift: true });
      d({ type: "SCENARIO", scenario: "regift" });
    },
  },
  {
    id: "gallery",
    title: "My Gifts",
    body: "Everything received and created, private to you.",
    action: "View My Gifts",
    go: (d) => d({ type: "SCENARIO", scenario: "gallery" }),
  },
  {
    id: "dashboard",
    title: "Experience Dashboard",
    body: "Settings, scenes, credits and activity for this experience.",
    action: "View Experience Dashboard",
    go: (d) => d({ type: "SCENARIO", scenario: "dashboard" }),
  },
];

/**
 * The start screen: choose, then act.
 *
 * Five cards that each navigated on tap meant five competing primary actions
 * and no way to reconsider. Selecting is now separate from starting: the cards
 * are a choice, and the one button at the bottom — which never moves and never
 * fades — is the action, relabelled to say exactly what it will do.
 */
function Launcher() {
  const { dispatch, config } = useGifting();
  const [selected, setSelected] = useState<string>(CHOICES[0].id);
  const choice = CHOICES.find((c) => c.id === selected) ?? CHOICES[0];

  return (
    // The accent previews where you are about to go: selecting "Pass a Gift
    // On" tints the screen the same teal that flow uses.
    <StageProvider stepKey="launcher" theme={choice.id as ScenarioTheme} pinned>
      <Stage>
        <StageContent fill className="justify-start">
          {/* Compact, inside the safe content area — not a fixed header. */}
          <div className="w-full max-w-[26rem] shrink-0 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-gift-ink-faint">
              Gifting Demo Client 1
            </p>
            <h1 className="mt-1 text-[20px] font-light text-gift-ink">Choose a starting point</h1>
          </div>

          {/* Scrolls only if a short phone genuinely needs it; the document
              itself stays locked either way. */}
          <div className="w-full max-w-[26rem] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className="grid gap-2"
              role="radiogroup"
              aria-label="Starting point"
            >
              {CHOICES.map((c) => (
                <ChoiceCard
                  key={c.id}
                  title={c.title}
                  body={c.body}
                  selected={selected === c.id}
                  onSelect={() => setSelected(c.id)}
                />
              ))}
            </div>

            <div className="mt-3 rounded-2xl border border-white/60 bg-[rgba(250,249,246,0.86)] p-3 backdrop-blur-xl">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gift-ink-faint">
                Eligibility check
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
                    aria-pressed={config.gateKind === kind}
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
          </div>
        </StageContent>

        {/* One button. Its label is the only thing that changes. */}
        <ActionDock>
          <Button
            onClick={() => {
              dispatch({ type: "RESET_FLOW" });
              choice.go(dispatch);
            }}
          >
            {choice.action}
          </Button>
        </ActionDock>
      </Stage>
    </StageProvider>
  );
}

function ChoiceCard({
  title,
  body,
  selected,
  onSelect,
}: {
  title: string;
  body: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border bg-[rgba(250,249,246,0.86)] px-4 py-2.5 text-left backdrop-blur-xl transition-all ${
        selected
          ? "border-transparent bg-[rgba(250,249,246,0.96)] shadow-sm"
          : "border-white/60 opacity-80"
      }`}
      style={
        selected
          ? { boxShadow: "0 0 0 1.5px var(--gift-accent), 0 6px 18px rgba(0,0,0,0.06)" }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] text-white"
        style={
          selected
            ? { background: "var(--gift-accent)", borderColor: "var(--gift-accent)" }
            : { borderColor: "var(--gift-border-strong)" }
        }
      >
        {selected ? "✓" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] text-gift-ink">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-gift-ink-faint">{body}</span>
      </span>
    </button>
  );
}
