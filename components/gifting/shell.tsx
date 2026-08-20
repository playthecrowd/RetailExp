"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * The phone shell, as THREE INDEPENDENT LAYERS.
 *
 * THE MISTAKE THIS REPLACES
 *   The previous version had one visibility state shared by guidance and
 *   actions, with a `forceVisible` escape hatch. Any screen that forgot the
 *   escape hatch — the welcome screen's Begin, the create screen's Record —
 *   had its ONLY way forward fade out after three seconds. That is not a
 *   tuning problem, it is a layering problem, so the layers are now separate
 *   by construction:
 *
 *     Guidance     — title, instructions, Exit, progress. May hide.
 *     ActionDock   — the required next step. Has NO visibility state at all.
 *     StageContent — the media, form or card, sized to what is left.
 *
 *   ActionDock does not read guidance state and cannot be told to hide. There
 *   is no prop for it. A required action that can be hidden is a bug waiting
 *   for a slow reader.
 *
 * POINTER EVENTS FOLLOW VISIBILITY
 *   A tray at opacity 0 is invisible, not absent. The old one kept
 *   `pointer-events: auto` while faded, so it silently swallowed taps aimed at
 *   whatever was underneath. Hidden layers are now `pointer-events: none`
 *   throughout, and only the dock is permanently interactive.
 *
 * ONE VIEWPORT, NEVER A PAGE
 *   100dvh, not 100vh: on iOS 100vh is the height with the browser bars
 *   COLLAPSED, so a fixed bottom action hides under the toolbar. The document
 *   does not scroll; only a gallery deck pans, and only sideways.
 */

// ---------------------------------------------------------------------------
// Preferences and viewport
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * useSyncExternalStore, because a media query IS an external store. Reading it
 * into state from an effect renders once with the wrong answer, which for an
 * animation preference means briefly playing the animation someone asked not
 * to see.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () =>
      typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * How much of the viewport the on-screen keyboard is covering.
 *
 * A fixed, full-height stage does not reflow when the keyboard opens; the
 * keyboard just draws over the bottom of it. visualViewport is the only API
 * that reports this honestly — window.innerHeight does not change on iOS.
 * Returns 0 when closed, so the layout lands exactly where it started.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 120 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** Stops the DOCUMENT scrolling. Removed on unmount, so the dashboard and
 *  every other route keep scrolling normally. */
export function useLockedDocument(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { documentElement, body } = document;
    documentElement.classList.add("gift-locked");
    body.classList.add("gift-locked");
    return () => {
      documentElement.classList.remove("gift-locked");
      body.classList.remove("gift-locked");
    };
  }, [active]);
}

// ---------------------------------------------------------------------------
// Stage state — GUIDANCE ONLY
// ---------------------------------------------------------------------------

export type ScenarioTheme = "receive" | "create" | "regift" | "gallery" | "dashboard";

interface StageState {
  /** Guidance visibility. The dock deliberately does not consult this. */
  guidanceVisible: boolean;
  showGuidance: () => void;
  hideGuidance: () => void;
  /** Something required is on screen; guidance stops auto-hiding. */
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  reducedMotion: boolean;
  announce: (message: string) => void;
  liveMessage: string;
  /** Measured dock height, so content reserves exactly its footprint. */
  dockHeight: number;
  reportDockHeight: (height: number) => void;
  /** Measured guidance height, for the same reason at the top. */
  guidanceHeight: number;
  reportGuidanceHeight: (height: number) => void;
  theme: ScenarioTheme;
}

const StageContext = createContext<StageState | null>(null);

/** Long enough to read a short instruction without becoming furniture. */
const AUTO_HIDE_MS = 3600;

export function StageProvider({
  children,
  stepKey,
  pinned = false,
  theme = "receive",
}: {
  children: ReactNode;
  stepKey: string;
  pinned?: boolean;
  theme?: ScenarioTheme;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [guidanceVisible, setGuidanceVisible] = useState(true);
  const [localPinned, setLocalPinned] = useState(pinned);
  const [liveMessage, setLiveMessage] = useState("");
  const [dockHeight, setDockHeight] = useState(0);
  const [guidanceHeight, setGuidanceHeight] = useState(0);

  const effectivePinned = pinned || localPinned;

  // Adjusting state because a prop changed, done during render — the pattern
  // React documents for this. An effect would paint one frame of the previous
  // step's hidden guidance before restoring it, which reads as a flicker.
  const [lastStep, setLastStep] = useState(stepKey);
  if (lastStep !== stepKey) {
    setLastStep(stepKey);
    setGuidanceVisible(true);
  }

  const [lastPinned, setLastPinned] = useState(effectivePinned);
  if (lastPinned !== effectivePinned) {
    setLastPinned(effectivePinned);
    if (effectivePinned) setGuidanceVisible(true);
  }

  // The only automatic hide. setState happens inside the timeout, never in the
  // effect body, so nothing cascades.
  useEffect(() => {
    if (effectivePinned || !guidanceVisible) return;
    const id = setTimeout(() => setGuidanceVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [effectivePinned, guidanceVisible, stepKey]);

  const showGuidance = useCallback(() => setGuidanceVisible(true), []);
  const hideGuidance = useCallback(() => setGuidanceVisible(false), []);
  const announce = useCallback((message: string) => setLiveMessage(message), []);

  const value = useMemo<StageState>(
    () => ({
      guidanceVisible,
      showGuidance,
      hideGuidance,
      pinned: effectivePinned,
      setPinned: setLocalPinned,
      reducedMotion,
      announce,
      liveMessage,
      dockHeight,
      reportDockHeight: setDockHeight,
      guidanceHeight,
      reportGuidanceHeight: setGuidanceHeight,
      theme,
    }),
    [
      guidanceVisible,
      showGuidance,
      hideGuidance,
      effectivePinned,
      reducedMotion,
      announce,
      liveMessage,
      dockHeight,
      guidanceHeight,
      theme,
    ],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage(): StageState {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage must be used inside StageProvider");
  return ctx;
}

/** Measures an element and reports its height, re-measuring when it reflows. */
function useMeasuredHeight(report: (height: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => report(Math.round(el.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [report]);
  return ref;
}

// ---------------------------------------------------------------------------
// Layer 0 — the stage
// ---------------------------------------------------------------------------

/** Extra breathing room above the safe inset. The notch, the Dynamic Island
 *  and the browser's own controls all sit right at that boundary, and a
 *  heading flush against it reads as clipped even when it technically is not. */
export const TOP_GUTTER = 12;

export function Stage({
  children,
  media,
  className,
}: {
  children: ReactNode;
  media?: ReactNode;
  className?: string;
}) {
  const { theme } = useStage();
  return (
    <div
      className={cn(
        `gift-theme-${theme}`,
        // overflow-hidden on the stage is what guarantees the DOCUMENT never
        // moves sideways when a deck pans inside it.
        "fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gift-bg text-gift-ink",
        className,
      )}
    >
      {media && <div className="absolute inset-0">{media}</div>}
      {/* The scenario's ambient wash — the quietest way to give each flow its
          own identity without restyling anything. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, var(--gift-ambient-a), transparent 70%), radial-gradient(100% 50% at 50% 100%, var(--gift-ambient-b), transparent 75%)",
        }}
      />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 1 — temporary guidance
// ---------------------------------------------------------------------------

export function Guidance({
  title,
  instruction,
  step,
  total,
  onExit,
  exitLabel = "Exit",
}: {
  title: string;
  instruction?: string;
  step?: number;
  total?: number;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const { guidanceVisible, hideGuidance, reducedMotion, reportGuidanceHeight } = useStage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const boxRef = useMeasuredHeight(reportGuidanceHeight);

  // Focus lands on the new step's heading so a screen reader and a keyboard
  // both start in the right place. preventScroll matters: the document cannot
  // scroll, and on iOS the attempt shifts the fixed stage.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <div
      // The whole layer stops receiving taps when hidden. An invisible tray
      // that still captures input is worse than a visible one.
      className={cn(
        "absolute inset-x-0 top-0 z-30 px-4",
        guidanceVisible ? "pointer-events-auto" : "pointer-events-none",
        reducedMotion
          ? "transition-opacity duration-150"
          : "transition-[opacity,transform] duration-300 ease-out",
        guidanceVisible
          ? "translate-y-0 opacity-100"
          : reducedMotion
            ? "opacity-0"
            : "-translate-y-3 opacity-0",
      )}
      style={{ paddingTop: `calc(env(safe-area-inset-top) + ${TOP_GUTTER}px)` }}
      aria-hidden={!guidanceVisible}
    >
      <div
        ref={boxRef}
        className="mx-auto max-w-[26rem] rounded-2xl border border-white/70 bg-[rgba(250,249,246,0.94)] px-4 py-3 shadow-[0_8px_28px_-14px_rgba(46,48,51,0.35)] backdrop-blur-xl"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-[15px] font-medium leading-tight text-gift-ink outline-none"
            >
              {title}
            </h1>
            {instruction && (
              <p className="mt-1 text-[12px] leading-snug text-gift-ink-soft">{instruction}</p>
            )}
          </div>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="flex h-11 shrink-0 items-center rounded-full border border-gift-border px-3 text-[11px] text-gift-ink-soft transition-colors hover:text-gift-ink"
            >
              {exitLabel}
            </button>
          )}

          {/* Immediate dismissal. Nobody should have to wait out a timer for
              instructions to move off their screen. */}
          <button
            type="button"
            onClick={hideGuidance}
            aria-label="Hide instructions"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] text-gift-ink-faint transition-colors hover:text-gift-ink"
          >
            ×
          </button>
        </div>

        {typeof step === "number" && typeof total === "number" && (
          <div className="mt-2.5 flex items-center gap-1.5" aria-label={`Step ${step} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="h-0.5 flex-1 rounded-full"
                style={{ background: i < step ? "var(--gift-accent)" : "var(--gift-border)" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The small circular control that brings guidance back. Sits in the top-left
 *  safe corner, away from the primary action and from anything the visitor is
 *  meant to be looking at. */
export function RecallDot() {
  const { guidanceVisible, showGuidance } = useStage();
  return (
    <button
      type="button"
      onClick={showGuidance}
      aria-label="Show instructions"
      className={cn(
        "absolute left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.85)] text-[13px] text-gift-ink shadow-sm backdrop-blur-xl transition-opacity duration-300",
        guidanceVisible ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100",
      )}
      style={{ top: `calc(env(safe-area-inset-top) + ${TOP_GUTTER}px)` }}
    >
      ⓘ
    </button>
  );
}

// ---------------------------------------------------------------------------
// Layer 2 — permanent actions
// ---------------------------------------------------------------------------

/**
 * The required next step.
 *
 * There is deliberately no `visible` prop and no access to guidance state.
 * Whatever is placed here stays on screen until the visitor acts on it.
 */
export function ActionDock({
  children,
  note,
  error,
}: {
  children: ReactNode;
  /** A short line above the action — never the action itself. */
  note?: string;
  error?: string | null;
}) {
  const { reportDockHeight, reducedMotion } = useStage();
  const inset = useKeyboardInset();
  const boxRef = useMeasuredHeight(reportDockHeight);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-4"
      style={{
        paddingBottom: `calc(env(safe-area-inset-bottom) + 0.9rem + ${inset}px)`,
        transition: reducedMotion ? undefined : "padding-bottom 200ms ease-out",
      }}
    >
      <div
        ref={boxRef}
        className="pointer-events-auto mx-auto max-w-[26rem] rounded-2xl border border-white/70 bg-[rgba(250,249,246,0.95)] p-3 shadow-[0_-10px_30px_-16px_rgba(46,48,51,0.4)] backdrop-blur-xl"
      >
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-gift-danger/30 bg-gift-danger/5 px-3 py-2 text-[12px] leading-snug text-gift-danger"
          >
            {error}
          </p>
        )}
        {note && !error && (
          <p className="mb-2 px-1 text-center text-[11px] leading-snug text-gift-ink-soft">{note}</p>
        )}
        <div className="grid gap-2">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 3 — content
// ---------------------------------------------------------------------------

/**
 * The content well.
 *
 * Its height is what remains after the safe insets, the guidance layer and the
 * dock — measured, not estimated, so a tall dock cannot sit on top of a page
 * indicator. Content taller than the well pans inside it rather than being
 * clipped, because the stage is overflow-hidden and clipped content is
 * unreachable content.
 */
export function StageContent({
  children,
  className,
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  /** Hand the whole space to the children instead of letting them size
   *  themselves and scroll. A gallery card is meant to fill the screen it was
   *  given; without this it collapses to the height of its own caption. */
  fill?: boolean;
}) {
  const inset = useKeyboardInset();
  const { dockHeight, guidanceHeight, guidanceVisible } = useStage();

  // Guidance only reserves room while it is showing; once it fades the media
  // gets the space back.
  const top = `calc(env(safe-area-inset-top) + ${TOP_GUTTER + 8}px + ${guidanceVisible ? guidanceHeight : 0}px)`;
  const bottom = `calc(env(safe-area-inset-bottom) + ${Math.max(dockHeight + 28, 96)}px + ${inset}px)`;

  return (
    <div
      className={cn(
        "relative z-10 flex h-full w-full flex-col items-center justify-center px-5",
        className,
      )}
      style={{ paddingTop: top, paddingBottom: bottom, transition: "padding 220ms ease-out" }}
    >
      <div
        className={cn(
          "w-full max-w-[26rem]",
          fill
            ? "flex h-full min-h-0 flex-col"
            : "max-h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One polite live region per stage. */
export function LiveRegion() {
  const { liveMessage } = useStage();
  return (
    <p aria-live="polite" className="sr-only">
      {liveMessage}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Horizontal deck
// ---------------------------------------------------------------------------

/**
 * A swipeable row of full-width cards.
 *
 * Scroll-snap rather than a JS carousel: real momentum on both platforms for
 * free, and the cards stay in the document so keyboard and screen-reader
 * navigation still work. This is the only scrolling in the visitor flow, it is
 * horizontal, and it is contained by the stage's overflow-hidden.
 */
export function Pager({
  children,
  onIndexChange,
  className,
}: {
  children: ReactNode[];
  onIndexChange?: (index: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onIndexChange) return;
    // Read the index straight from the scroll position rather than deferring
    // to an animation frame. A phone that backgrounds the tab mid-swipe never
    // runs the callback, and the visitor comes back to a card labelled as the
    // one before it. The work is a division and a comparison, and the guard
    // means a scroll that stays on one card causes no renders at all.
    let last = -1;
    const sync = () => {
      const index = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (index === last) return;
      last = index;
      onIndexChange(index);
    };
    el.addEventListener("scroll", sync, { passive: true });
    // iOS can settle a snap without a final scroll event, which would leave the
    // indicator naming the previous card. These are real input events.
    el.addEventListener("pointerup", sync, { passive: true });
    el.addEventListener("touchend", sync, { passive: true });
    el.addEventListener("scrollend", sync, { passive: true });
    return () => {
      el.removeEventListener("scroll", sync);
      el.removeEventListener("pointerup", sync);
      el.removeEventListener("touchend", sync);
      el.removeEventListener("scrollend", sync);
    };
  }, [onIndexChange]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full min-h-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children.map((child, i) => (
        // Exactly one well wide, with any gap INSIDE the card, so scrollLeft
        // divides cleanly by clientWidth and the index maths cannot drift.
        // h-full lets a card fill a flexed pager; it collapses to auto in an
        // unsized one, so the carousel usage is unaffected.
        <div key={i} className="h-full w-full shrink-0 snap-center">
          {child}
        </div>
      ))}
    </div>
  );
}

export function PagerIndicator({ index, count }: { index: number; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full transition-all duration-200"
            style={{
              width: i === index ? 20 : 6,
              background: i === index ? "var(--gift-accent)" : "var(--gift-border-strong)",
            }}
          />
        ))}
      </div>
      <p className="text-[11px] tabular-nums text-gift-ink-faint">
        {Math.min(index + 1, count)} of {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

/** Appears only when asked for, dismissible by the scrim or the handle. Keeps
 *  secondary and destructive actions off the main control row. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[26rem] rounded-t-3xl border border-white/70 bg-[rgba(250,249,246,0.98)] p-4 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-gift-border-strong"
          aria-hidden="true"
        />
        <p className="mb-3 text-center text-[13px] font-medium text-gift-ink">{title}</p>
        <div className="grid gap-2">{children}</div>
      </div>
    </div>
  );
}
