"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CODE_ALPHABET } from "@/lib/gifting/simulation/code-alphabet";
import { useGiftingKeyboard } from "./context";
import { shiftAfter, type KeyboardMode } from "./model";

/**
 * The experience's own keyboard.
 *
 * WHAT IT IS FOR
 *   Keeping a full-screen presentation full-screen. A system keyboard resizes
 *   the viewport, takes an unknown share of it and cannot be styled; this one
 *   is a known height inside the stage, so the content well shrinks around it
 *   and the permanent actions stay exactly where they were.
 *
 * NOTHING IS EVER COVERED
 *   The field being edited is not left behind under the panel — it is redrawn
 *   at the top of the panel, with its own caret, above the keys. Whatever the
 *   layout does, the value being typed and the keys typing it are adjacent.
 *
 * KEY SIZE
 *   Every key is at least 44px tall, which is the target size that matters for
 *   a thumb. Width is shared out across the row: ten keys cannot each be 44px
 *   wide on a 390px screen, which is why no phone keyboard does that either.
 */

/** Rough share of the stage the panel should take. Clamped so a short phone
 *  gets a shorter keyboard rather than no content. */
const MIN_KEY_HEIGHT = 44;
const SHORT_KEY_HEIGHT = 40;
const SHORT_STAGE = 700;

type KeyDef =
  | { t: "char"; label: string; value?: string; grow?: number }
  | { t: "backspace"; grow?: number }
  | { t: "clear"; grow?: number }
  | { t: "paste"; grow?: number }
  | { t: "shift"; grow?: number }
  | { t: "space"; grow?: number }
  | { t: "next"; grow?: number };

const CODE_DIGITS = [...CODE_ALPHABET].filter((c) => /[0-9]/.test(c));
const CODE_LETTERS = [...CODE_ALPHABET].filter((c) => /[A-Z]/.test(c));

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function layoutFor(mode: KeyboardMode, shifted: boolean): KeyDef[][] {
  switch (mode) {
    case "code":
      // Drawn from the code alphabet itself, so the keyboard cannot offer a
      // character a code will never contain, or omit one it might.
      return [
        CODE_DIGITS.map((c) => ({ t: "char" as const, label: c })),
        ...chunk(CODE_LETTERS, 7).map((row) => row.map((c) => ({ t: "char" as const, label: c }))),
        [
          { t: "paste", grow: 2 },
          { t: "clear", grow: 2 },
          { t: "backspace", grow: 2 },
          { t: "next", grow: 3 },
        ],
      ];
    case "phone":
      return [
        ["1", "2", "3"].map((c) => ({ t: "char" as const, label: c })),
        ["4", "5", "6"].map((c) => ({ t: "char" as const, label: c })),
        ["7", "8", "9"].map((c) => ({ t: "char" as const, label: c })),
        [
          { t: "char", label: "+" },
          { t: "char", label: "0" },
          { t: "backspace" },
        ],
        [
          { t: "clear", grow: 1 },
          { t: "next", grow: 2 },
        ],
      ];
    case "email":
      return [
        [...QWERTY[0]].map((c) => ({ t: "char" as const, label: c })),
        [...QWERTY[1]].map((c) => ({ t: "char" as const, label: c })),
        [
          ...[...QWERTY[2]].map((c) => ({ t: "char" as const, label: c })),
          { t: "backspace" as const, grow: 1.6 },
        ],
        [
          { t: "char", label: "@" },
          { t: "char", label: "." },
          { t: "char", label: "_" },
          { t: "char", label: "-" },
          { t: "char", label: ".com", grow: 1.8 },
          { t: "next", grow: 2.2 },
        ],
      ];
    case "text":
    default:
      return [
        [...QWERTY[0]].map((c) => ({
          t: "char" as const,
          label: shifted ? c.toUpperCase() : c,
        })),
        [...QWERTY[1]].map((c) => ({
          t: "char" as const,
          label: shifted ? c.toUpperCase() : c,
        })),
        [
          { t: "shift" as const, grow: 1.6 },
          ...[...QWERTY[2]].map((c) => ({
            t: "char" as const,
            label: shifted ? c.toUpperCase() : c,
          })),
          { t: "backspace" as const, grow: 1.6 },
        ],
        [
          { t: "char", label: "'" },
          { t: "char", label: "-" },
          { t: "space", grow: 4 },
          { t: "next", grow: 2 },
        ],
      ];
  }
}

const MODE_TITLE: Record<KeyboardMode, string> = {
  code: "Code keys",
  text: "Letter keys",
  email: "Email keys",
  phone: "Number keys",
};

export function GiftingKeyboard() {
  const keyboard = useGiftingKeyboard();
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * Shift is DERIVED, with an override.
   *
   * Keeping it as its own state meant every path that changes the value had to
   * remember to recompute it — and backspacing a name back to empty left the
   * shift key down, so the next letter was lower case. Deriving it from the
   * value means there is nothing to forget: the only stored thing is the
   * visitor's deliberate override, and typing a character returns it to
   * automatic.
   */
  const [shiftOverride, setShiftOverride] = useState<boolean | null>(null);
  const [stageHeight, setStageHeight] = useState(0);

  const active = keyboard?.active ?? null;
  const reportHeight = keyboard?.reportHeight;

  // The stage's own height decides how tall the keys may be, so a short phone
  // gets a shorter keyboard rather than a squeezed content well.
  useEffect(() => {
    const el = panelRef.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setStageHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [active]);

  // Report the panel's real height so the stage can reserve exactly it.
  useEffect(() => {
    const el = panelRef.current;
    if (!reportHeight) return;
    if (!el) {
      reportHeight(0);
      return;
    }
    if (typeof ResizeObserver === "undefined") return;
    const measure = () => reportHeight(Math.round(el.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      reportHeight(0);
    };
  }, [reportHeight, active]);

  // Moving to another field drops any override with it.
  const [lastFieldId, setLastFieldId] = useState<string | null>(null);
  if (active && active.id !== lastFieldId) {
    setLastFieldId(active.id);
    setShiftOverride(null);
  }

  const press = keyboard?.press;
  const onPaste = useCallback(async () => {
    if (!keyboard) return;
    try {
      const text = await navigator.clipboard?.readText();
      if (!text) {
        keyboard.setMessage("There's nothing to paste.");
        return;
      }
      keyboard.press({ kind: "paste", value: text });
      keyboard.setMessage(null);
    } catch {
      // Permission refused, or no clipboard at all. Say so and leave every
      // other way of entering the code exactly where it was.
      keyboard.setMessage("Clipboard unavailable — type the code instead.");
    }
  }, [keyboard]);

  if (!keyboard || !active || !press) return null;

  const keyHeight = stageHeight > 0 && stageHeight < SHORT_STAGE ? SHORT_KEY_HEIGHT : MIN_KEY_HEIGHT;
  const { value, start, end } = keyboard.editing;
  const shifted = shiftOverride ?? shiftAfter(value, active.mode);
  const rows = layoutFor(active.mode, shifted);

  const handle = (key: KeyDef) => {
    switch (key.t) {
      case "char":
        press({ kind: "char", value: key.value ?? key.label });
        // Back to automatic: the next letter's case follows the value.
        setShiftOverride(null);
        break;
      case "space":
        press({ kind: "char", value: " " });
        setShiftOverride(null);
        break;
      case "backspace":
        press({ kind: "backspace" });
        setShiftOverride(null);
        break;
      case "clear":
        press({ kind: "clear" });
        setShiftOverride(null);
        break;
      case "shift":
        setShiftOverride(!shifted);
        break;
      case "paste":
        void onPaste();
        break;
      case "next":
        press(keyboard.hasNext ? { kind: "next" } : { kind: "done" });
        break;
    }
  };

  return (
    <div
      ref={panelRef}
      id="gift-keyboard-panel"
      role="group"
      aria-label={`${active.label} keyboard`}
      className="gift-keyboard absolute inset-x-0 bottom-0 z-[70] px-2 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      {/* The field, redrawn where it cannot be covered. */}
      <div className="mx-auto mb-2 flex max-w-[30rem] items-center gap-2 rounded-xl border border-white/70 bg-[rgba(255,253,248,0.96)] px-3 py-2 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gift-ink-faint">
            {active.label}
          </p>
          <EditingValue value={value} start={start} end={end} onCaret={(i) => press({ kind: "caret", index: i })} />
          {(keyboard.message ?? active.error) && (
            <p
              className={cn(
                "mt-0.5 text-[11px]",
                keyboard.message ? "text-gift-ink-soft" : "text-gift-danger",
              )}
            >
              {keyboard.message ?? active.error}
            </p>
          )}
        </div>
        {/* A visible Paste, because a readOnly field cannot offer the
            long-press one — and a pasted code is how most people will enter
            theirs. */}
        {(active.mode === "code" || active.mode === "email") && (
          <button
            type="button"
            onClick={() => void onPaste()}
            className="min-h-11 shrink-0 rounded-full border border-gift-border px-3 text-[10px] uppercase tracking-[0.14em] text-gift-ink-soft"
          >
            Paste
          </button>
        )}
        <button
          type="button"
          onClick={keyboard.useSystemKeyboard}
          aria-label="Use the system keyboard instead"
          title="Use the system keyboard instead"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gift-border text-[15px] text-gift-ink-faint"
        >
          ⌨
        </button>
        <button
          type="button"
          onClick={() => press({ kind: "done" })}
          aria-label="Close keyboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gift-border text-[15px] text-gift-ink-soft"
        >
          ×
        </button>
      </div>

      <div className="mx-auto grid max-w-[30rem] gap-1.5" aria-label={MODE_TITLE[active.mode]}>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1.5">
            {row.map((key, keyIndex) => (
              <Key
                key={`${rowIndex}-${keyIndex}`}
                def={key}
                height={keyHeight}
                shifted={shifted}
                isLast={!keyboard.hasNext}
                onPress={() => handle(key)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The value with a caret drawn into it. Characters are individually tappable
 *  so the caret can be put where the visitor points, which a readOnly input
 *  will not do for us on every platform. */
function EditingValue({
  value,
  start,
  end,
  onCaret,
}: {
  value: string;
  start: number;
  end: number;
  onCaret: (index: number) => void;
}) {
  const hasSelection = start !== end;
  return (
    <p className="flex min-h-[1.6rem] flex-wrap items-center font-mono text-[16px] leading-tight text-gift-ink">
      {value.length === 0 && <Caret />}
      {[...value].map((char, index) => (
        <span key={index} className="flex items-center">
          {index === start && !hasSelection && <Caret />}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => onCaret(index + 1)}
            className={cn(
              "whitespace-pre",
              hasSelection && index >= start && index < end && "bg-gift-champagne/30",
            )}
          >
            {char === " " ? " " : char}
          </button>
          {index === value.length - 1 && start >= value.length && !hasSelection && <Caret />}
        </span>
      ))}
    </p>
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="gift-caret inline-block h-[1.1em] w-px align-middle"
      style={{ background: "var(--gift-accent)" }}
    />
  );
}

const KEY_LABEL: Record<string, string> = {
  backspace: "Backspace",
  clear: "Clear",
  paste: "Paste",
  shift: "Shift",
  space: "Space",
};

function Key({
  def,
  height,
  shifted,
  isLast,
  onPress,
}: {
  def: KeyDef;
  height: number;
  shifted: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const accent = def.t === "next";
  const label =
    def.t === "char"
      ? def.label
      : def.t === "next"
        ? isLast
          ? "Done"
          : "Next"
        : KEY_LABEL[def.t];
  const glyph = def.t === "backspace" ? "⌫" : def.t === "shift" ? "⇧" : label;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      aria-pressed={def.t === "shift" ? shifted : undefined}
      style={{ minHeight: height, flexGrow: def.grow ?? 1, flexBasis: 0 }}
      className={cn(
        "gift-key flex items-center justify-center rounded-lg text-[15px] transition-[transform,background-color] duration-100",
        accent && "gift-key-accent text-[13px] font-medium",
        def.t === "backspace" && "gift-key-backspace text-[17px]",
        (def.t === "clear" || def.t === "paste" || def.t === "shift") &&
          "gift-key-utility text-[12px] uppercase tracking-[0.1em]",
        def.t === "shift" && shifted && "gift-key-utility-on",
      )}
    >
      {glyph}
    </button>
  );
}
