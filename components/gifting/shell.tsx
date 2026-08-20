"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * The phone-first shell every visitor step lives in.
 *
 * ONE VIEWPORT, NEVER A PAGE
 *   A step occupies exactly the phone's viewport and the document itself never
 *   scrolls. That is a stronger promise than "it fits": it means an action can
 *   never be below the fold, because there is no fold. Anything that genuinely
 *   needs more room — a template carousel, a gallery — pans HORIZONTALLY
 *   inside the stage, which is a gesture people already expect on a phone and
 *   which cannot hide a Continue button.
 *
 * WHY 100dvh AND NOT 100vh
 *   On iOS Safari 100vh is the height the viewport has with the browser bars
 *   COLLAPSED, so a fixed bottom action sits under the toolbar until the
 *   visitor scrolls — which they cannot, because the page does not scroll.
 *   100dvh tracks the bar state and is the only correct unit here.
 *
 * THE TRAYS FLOAT
 *   Guidance and actions are overlays, not layout. They slide in when a step
 *   begins, fade once the visitor starts interacting, and come back on a tap.
 *   They never take permanent space, so the media underneath is always the
 *   full frame — and they never auto-hide while an error, a required consent
 *   or a required action is on screen, because disappearing guidance is only
 *   acceptable when it is genuinely optional.
 */

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * useSyncExternalStore rather than an effect, because a media query IS an
 * external store: it has a subscribe, a snapshot, and a server value. Reading
 * it into state from an effect would render once with the wrong answer and
 * then correct itself, which for an animation preference means the animation
 * someone asked not to see plays briefly anyway.
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
    // On the server nothing is known, and "animate" is the safe default
    // because the client corrects it before the first paint.
    () => false,
  );
}

// ---------------------------------------------------------------------------
// The on-screen keyboard
// ---------------------------------------------------------------------------

/**
 * How much of the viewport the keyboard is covering, in pixels.
 *
 * A fixed, full-height stage does not reflow when the keyboard opens — the
 * keyboard simply draws over the bottom of it, taking the action tray and
 * often the focused field with it. visualViewport is the only API that
 * reports this honestly; window.innerHeight does not change on iOS.
 *
 * Returns 0 whenever the keyboard is closed, so the layout returns exactly to
 * where it was rather than keeping a gap.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // The part of the layout viewport the visual viewport no longer covers.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Small values are browser-bar noise rather than a keyboard.
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

// ---------------------------------------------------------------------------
// Document scroll lock
// ---------------------------------------------------------------------------

/**
 * Stops the DOCUMENT scrolling while a visitor step is on screen.
 *
 * Scoped by a class rather than inline styles so it is visible in devtools and
 * trivially reversible, and undone on unmount so leaving the prototype — or
 * opening the dashboard, which scrolls normally — restores the page.
 */
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
// Tray visibility
// ---------------------------------------------------------------------------

interface TrayState {
  visible: boolean;
  reveal: () => void;
  noteInteraction: () => void;
  /** True while something on screen must not be auto-hidden. */
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  reducedMotion: boolean;
  announce: (message: string) => void;
  liveMessage: string;
  /** Measured height of the action tray, so the content well can reserve
   *  exactly the room it takes rather than a guess. A three-row tray was
   *  hiding the gallery's page dots behind a fixed 7.5rem estimate. */
  trayHeight: number;
  reportTrayHeight: (height: number) => void;
}

const TrayContext = createContext<TrayState | null>(null);

/** Long enough to read a short instruction without becoming furniture. */
const AUTO_HIDE_MS = 3600;

export function StageProvider({
  children,
  stepKey,
  pinned = false,
}: {
  children: ReactNode;
  /** Changing this is what "a new step began" means: trays return. */
  stepKey: string;
  /** Errors, required consent and required actions pin the trays open. */
  pinned?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const [localPinned, setLocalPinned] = useState(pinned);
  const [liveMessage, setLiveMessage] = useState("");
  const [trayHeight, setTrayHeight] = useState(0);

  const effectivePinned = pinned || localPinned;

  // Adjusting state because a prop changed, done DURING RENDER rather than in
  // an effect. React documents this pattern for exactly this case, and it
  // matters here: an effect would paint one frame of the previous step's
  // hidden tray before restoring it, which reads as a flicker on every step.
  const [lastStep, setLastStep] = useState(stepKey);
  if (lastStep !== stepKey) {
    setLastStep(stepKey);
    setVisible(true);
    setInteracted(false);
  }

  // Pinning must re-open immediately: an error appearing while the tray is
  // mid-fade must not fade away with it.
  const [lastPinned, setLastPinned] = useState(effectivePinned);
  if (lastPinned !== effectivePinned) {
    setLastPinned(effectivePinned);
    if (effectivePinned) setVisible(true);
  }

  // The only place the tray hides. setState happens inside the timeout, not in
  // the effect body, so nothing cascades.
  useEffect(() => {
    if (effectivePinned || !visible) return;
    const id = setTimeout(() => setVisible(false), interacted ? 500 : AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [effectivePinned, visible, interacted, stepKey]);

  const reveal = useCallback(() => {
    setInteracted(false);
    setVisible(true);
  }, []);

  // Interacting means the visitor has read enough, so guidance steps aside
  // sooner — but only when nothing on screen is required.
  const noteInteraction = useCallback(() => setInteracted(true), []);

  const announce = useCallback((message: string) => setLiveMessage(message), []);

  const value = useMemo<TrayState>(
    () => ({
      visible,
      reveal,
      noteInteraction,
      pinned: effectivePinned,
      setPinned: setLocalPinned,
      reducedMotion,
      announce,
      liveMessage,
      trayHeight,
      reportTrayHeight: setTrayHeight,
    }),
    [
      visible,
      reveal,
      noteInteraction,
      effectivePinned,
      reducedMotion,
      announce,
      liveMessage,
      trayHeight,
    ],
  );

  return <TrayContext.Provider value={value}>{children}</TrayContext.Provider>;
}

export function useStage(): TrayState {
  const ctx = useContext(TrayContext);
  if (!ctx) throw new Error("useStage must be used inside StageProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

export function Stage({
  children,
  media,
  className,
}: {
  children: ReactNode;
  /** Full-bleed background, painted first so a step never starts on blank. */
  media?: ReactNode;
  className?: string;
}) {
  const { reveal } = useStage();
  return (
    <div
      className={cn(
        // Fixed and dvh-sized: the step IS the viewport, and nothing below it
        // exists to scroll to.
        "fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gift-bg text-gift-ink",
        className,
      )}
    >
      {media && <div className="absolute inset-0">{media}</div>}
      {/* Tap anywhere that is not a control to bring the trays back. */}
      <button
        type="button"
        aria-label="Show instructions"
        onClick={reveal}
        className="absolute inset-0 z-0 h-full w-full cursor-default focus:outline-none"
        tabIndex={-1}
      />
      {children}
    </div>
  );
}

/** The centred content well, inside the safe area, that never scrolls. */
export function StageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const inset = useKeyboardInset();
  const { trayHeight } = useStage();
  return (
    <div
      className={cn(
        "relative z-10 flex h-full w-full flex-col items-center justify-center px-5",
        className,
      )}
      style={{
        // Room for the trays, plus the keyboard when it is up. The transition
        // makes the shift feel like the layout moving rather than jumping.
        paddingTop: "calc(env(safe-area-inset-top) + 5.5rem)",
        // The tray's real height plus a gap, falling back to a sane estimate
        // before the first measurement lands.
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${Math.max(trayHeight + 24, 112)}px + ${inset}px)`,
        transition: "padding-bottom 200ms ease-out",
      }}
    >
      {/* A safety net, not a scrolling page.
          On a tall phone nothing here moves. On a short one — a small device,
          or a tall device with the browser bars expanded — the WELL pans
          internally rather than clipping, because the stage is
          overflow-hidden and clipped content is unreachable content.
          The trays are siblings of this element, so the primary action stays
          fixed no matter what happens in here, and overscroll-contain stops
          the gesture leaking to a document that must not move. */}
      <div className="max-h-full w-full max-w-[26rem] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trays
// ---------------------------------------------------------------------------

export function GuidanceTray({
  title,
  instruction,
  step,
  total,
  onHelp,
}: {
  title: string;
  instruction?: string;
  step?: number;
  total?: number;
  onHelp?: () => void;
}) {
  const { visible, reducedMotion } = useStage();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus moves to the new step's heading so a screen reader and a keyboard
  // both land in the right place. preventScroll matters: without it the
  // browser tries to scroll a document that cannot scroll, and on iOS that
  // shifts the fixed stage.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-30 px-4",
        reducedMotion
          ? "transition-opacity duration-150"
          : "transition-[opacity,transform] duration-300 ease-out",
        visible
          ? "translate-y-0 opacity-100"
          : reducedMotion
            ? "opacity-0"
            : "-translate-y-3 opacity-0",
      )}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="pointer-events-auto mx-auto max-w-[26rem] rounded-2xl border border-white/70 bg-[rgba(250,249,246,0.93)] px-4 py-3 shadow-[0_8px_28px_-14px_rgba(46,48,51,0.35)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
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
          {onHelp && (
            <button
              type="button"
              onClick={onHelp}
              aria-label="Help"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gift-border text-[13px] text-gift-ink-soft"
            >
              ?
            </button>
          )}
        </div>
        {typeof step === "number" && typeof total === "number" && (
          <div className="mt-2.5 flex items-center gap-1.5" aria-label={`Step ${step} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i < step ? "bg-gift-champagne" : "bg-gift-border",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActionTray({
  children,
  error,
  /** A spring only on the first reveal — replaying a video must not make the
   *  Continue button bounce again every time. */
  spring = false,
  forceVisible = false,
}: {
  children: ReactNode;
  error?: string | null;
  spring?: boolean;
  forceVisible?: boolean;
}) {
  const { visible, reducedMotion, reportTrayHeight } = useStage();
  const inset = useKeyboardInset();
  const shown = forceVisible || visible || Boolean(error);
  const boxRef = useRef<HTMLDivElement>(null);

  // ResizeObserver rather than a one-off measurement: the tray changes height
  // when an error appears, when a confirmation replaces the actions, and when
  // the copy wraps at a narrow width.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      reportTrayHeight(Math.round(entry.contentRect.height)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reportTrayHeight]);
  // No "has it sprung yet" latch: a tray that is forceVisible never hides, so
  // it never gets a second entrance to animate. Replaying a video therefore
  // cannot make Continue bounce again, because Continue never left.

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4",
        reducedMotion
          ? "transition-opacity duration-150"
          : "transition-[opacity,transform] duration-[320ms]",
        !reducedMotion && spring
          ? "[transition-timing-function:cubic-bezier(0.22,1.4,0.36,1)]"
          : "ease-out",
        shown ? "translate-y-0 opacity-100" : reducedMotion ? "opacity-0" : "translate-y-6 opacity-0",
      )}
      style={{
        paddingBottom: `calc(env(safe-area-inset-bottom) + 0.9rem + ${inset}px)`,
      }}
    >
      <div
        ref={boxRef}
        className="pointer-events-auto mx-auto max-w-[26rem] rounded-2xl border border-white/70 bg-[rgba(250,249,246,0.94)] p-3 shadow-[0_-10px_30px_-16px_rgba(46,48,51,0.4)] backdrop-blur-xl"
      >
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-gift-danger/30 bg-gift-danger/5 px-3 py-2 text-[12px] leading-snug text-gift-danger"
          >
            {error}
          </p>
        )}
        <div className="grid gap-2">{children}</div>
      </div>
    </div>
  );
}

/** The small persistent affordance that recalls hidden trays. */
export function HelpDot({ onClick }: { onClick: () => void }) {
  const { visible } = useStage();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Show instructions and controls"
      className={cn(
        "absolute right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.8)] text-[13px] text-gift-ink shadow-sm backdrop-blur-xl transition-opacity duration-300",
        visible ? "opacity-0" : "opacity-100",
      )}
      style={{ top: "calc(env(safe-area-inset-top) + 0.9rem)" }}
    >
      ⌃
    </button>
  );
}

/** One polite live region per stage, for newly available actions and status. */
export function LiveRegion() {
  const { liveMessage } = useStage();
  return (
    <p aria-live="polite" className="sr-only">
      {liveMessage}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Horizontal card pager
// ---------------------------------------------------------------------------

/**
 * A swipeable row of full-width cards.
 *
 * Scroll-snap rather than a JS carousel: it is one line of CSS, it gives real
 * momentum and rubber-banding on both platforms for free, and it stays
 * keyboard- and screen-reader-navigable because the cards are simply in the
 * document. Horizontal panning is the one kind of scrolling this shell allows,
 * because it cannot hide a fixed action.
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
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const index = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        onIndexChange(index);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Belt and braces for the end of a momentum swipe. iOS can settle a
    // snap-scroll without delivering a final scroll event, which would leave
    // the dots and the Select label naming the previous card. These are real
    // input events, so they arrive regardless.
    el.addEventListener("pointerup", onScroll, { passive: true });
    el.addEventListener("touchend", onScroll, { passive: true });
    el.addEventListener("scrollend", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerup", onScroll);
      el.removeEventListener("touchend", onScroll);
      el.removeEventListener("scrollend", onScroll);
    };
  }, [onIndexChange]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children.map((child, i) => (
        <div key={i} className="w-full shrink-0 snap-center">
          {child}
        </div>
      ))}
    </div>
  );
}

export function PagerDots({ count, index }: { count: number; index: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            i === index ? "w-5 bg-gift-ink" : "w-1.5 bg-gift-border-strong",
          )}
        />
      ))}
    </div>
  );
}

/** "2 of 4", for anyone who cannot see the dots. */
export function PagerCount({ index, count }: { index: number; count: number }) {
  return (
    <p className="text-center text-[11px] tabular-nums text-gift-ink-faint">
      {Math.min(index + 1, count)} of {count}
    </p>
  );
}

export function useAnnouncedId() {
  return useId();
}
