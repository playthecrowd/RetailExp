import { CODE_ALPHABET, CODE_MAX_LENGTH, formatCode } from "@/lib/gifting/simulation/code-alphabet";

/**
 * Editing, as arithmetic on a string and two indices.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 *   An on-screen keyboard is mostly caret bookkeeping, and caret bookkeeping is
 *   exactly the kind of code that looks right and is off by one. None of what
 *   follows touches React, the DOM or a browser, so each rule can be checked
 *   by reading it — and the same functions serve the on-screen keys, physical
 *   keys and paste, which is what keeps those three from drifting apart.
 *
 * SELECTION IS A RANGE, ALWAYS
 *   `start === end` is a caret; `start < end` is a selection. Insert replaces
 *   whatever the range covers, so "replace the selection" and "type at the
 *   caret" are one operation rather than two code paths that must agree.
 */

export type KeyboardMode = "code" | "text" | "email" | "phone";

export interface Editing {
  value: string;
  /** Caret when equal, selection when not. Always start <= end. */
  start: number;
  end: number;
}

/** Per-mode rules: what may be typed, how it is re-written after each change,
 *  and how long it may get. */
interface ModeRules {
  /** Applied after every change, so formatting is never a separate step that
   *  can be skipped. */
  format: (value: string) => string;
  /** Characters this mode accepts from a physical keyboard. On-screen keys are
   *  already limited by the layout. */
  accepts: (char: string) => boolean;
  maxLength: number;
}

const NAME_PUNCTUATION = "'’- ";

export const MODE_RULES: Record<KeyboardMode, ModeRules> = {
  code: {
    format: formatCode,
    accepts: (c) => CODE_ALPHABET.includes(c.toUpperCase()),
    maxLength: CODE_MAX_LENGTH,
  },
  text: {
    // Deliberately identity.
    //
    // Auto-capitalisation belongs to the SHIFT KEY, not to a reformat of the
    // whole value. Re-running a capitalise-every-word rule over the string on
    // every keystroke would fight the visitor: "van der Berg" becomes "Van Der
    // Berg" no matter how carefully they typed it. The keyboard raises shift
    // at the start of a name and after a separator (see `shiftAfter`), which
    // capitalises what is being typed and never touches what already is.
    format: (v) => v,
    accepts: (c) => /^[a-zA-Z]$/.test(c) || NAME_PUNCTUATION.includes(c),
    maxLength: 80,
  },
  email: {
    // Never capitalised: the local part of an address is case-sensitive, and
    // "Ines@" is a different mailbox from "ines@" as far as the spec is
    // concerned.
    format: (v) => v.replace(/\s+/g, "").toLowerCase(),
    accepts: (c) => /^[a-zA-Z0-9@._+-]$/.test(c),
    maxLength: 120,
  },
  phone: {
    // A leading + is kept because international numbers need it; every other
    // non-digit is dropped rather than argued with.
    format: (v) => {
      const plus = v.trimStart().startsWith("+");
      const digits = v.replace(/\D/g, "");
      return (plus ? "+" : "") + digits;
    },
    accepts: (c) => /^[0-9+]$/.test(c),
    maxLength: 20,
  },
};

/** A message the visitor writes — free text, so the only rule is a length. */
export const LONG_TEXT_MAX = 240;

function clampRange(value: string, start: number, end: number): Editing {
  const lo = Math.max(0, Math.min(start, value.length));
  const hi = Math.max(0, Math.min(end, value.length));
  return { value, start: Math.min(lo, hi), end: Math.max(lo, hi) };
}

/**
 * Insert text over the current range.
 *
 * Formatting runs afterwards and can change the string's length — a code gains
 * a hyphen, an email loses a space — so the caret is not simply advanced by
 * the inserted length. It is placed by counting how many SIGNIFICANT
 * characters precede it and finding that position in the formatted string,
 * which is the only way it stays where the visitor thinks it is.
 */
export function insert(state: Editing, text: string, mode: KeyboardMode, maxLength?: number): Editing {
  const rules = MODE_RULES[mode];
  const limit = maxLength ?? rules.maxLength;
  const { value, start, end } = clampRange(state.value, state.start, state.end);

  const next = value.slice(0, start) + text + value.slice(end);
  const formatted = rules.format(next).slice(0, limit);

  // How many characters that survive formatting sit before the caret.
  const beforeCaret = rules.format(value.slice(0, start) + text);
  const significant = countSignificant(beforeCaret, mode);
  const caret = positionOf(formatted, significant, mode);
  return { value: formatted, start: caret, end: caret };
}

/** Delete the selection, or the character before the caret. */
export function backspace(state: Editing, mode: KeyboardMode): Editing {
  const rules = MODE_RULES[mode];
  const { value, start, end } = clampRange(state.value, state.start, state.end);
  if (value.length === 0) return { value, start: 0, end: 0 };

  let from = start;
  if (start === end) {
    if (start === 0) return { value, start: 0, end: 0 };
    from = start - 1;
    // Step over a separator the formatter inserted: deleting "KQ7MW-|" should
    // remove the W, not the hyphen the visitor never typed.
    if (mode === "code" && value[from] === "-") from = Math.max(0, from - 1);
  }
  const next = value.slice(0, from) + value.slice(end);
  const formatted = rules.format(next);
  const significant = countSignificant(rules.format(value.slice(0, from)), mode);
  const caret = positionOf(formatted, significant, mode);
  return { value: formatted, start: caret, end: caret };
}

export function clear(): Editing {
  return { value: "", start: 0, end: 0 };
}

export function moveCaret(state: Editing, delta: number): Editing {
  const collapsed = state.start === state.end ? state.start + delta : delta < 0 ? state.start : state.end;
  const caret = Math.max(0, Math.min(collapsed, state.value.length));
  return { value: state.value, start: caret, end: caret };
}

export function setCaret(state: Editing, index: number): Editing {
  const caret = Math.max(0, Math.min(index, state.value.length));
  return { value: state.value, start: caret, end: caret };
}

export function selectAll(state: Editing): Editing {
  return { value: state.value, start: 0, end: state.value.length };
}

/** Set a whole value at once — paste, or a field re-opened for editing. */
export function replaceAll(value: string, mode: KeyboardMode, maxLength?: number): Editing {
  const rules = MODE_RULES[mode];
  const formatted = rules.format(value).slice(0, maxLength ?? rules.maxLength);
  return { value: formatted, start: formatted.length, end: formatted.length };
}

/** Characters that carry meaning, as opposed to separators the formatter adds.
 *  Only codes have those today. */
function countSignificant(text: string, mode: KeyboardMode): number {
  return mode === "code" ? text.replace(/-/g, "").length : text.length;
}

function positionOf(formatted: string, significant: number, mode: KeyboardMode): number {
  if (mode !== "code") return Math.min(significant, formatted.length);
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] !== "-") {
      seen += 1;
      if (seen === significant) return i + 1;
    }
  }
  return significant === 0 ? 0 : formatted.length;
}

/**
 * Whether the next letter typed should be a capital: at the very start of a
 * name, and after a separator. Used by the keyboard to set its shift key, so
 * capitalisation happens as characters ARRIVE rather than by rewriting the
 * ones already there.
 */
export function shiftAfter(value: string, mode: KeyboardMode): boolean {
  if (mode !== "text") return false;
  if (value.length === 0) return true;
  return NAME_PUNCTUATION.includes(value[value.length - 1]);
}

/** Whether a physical keypress belongs to this field at all. */
export function acceptsCharacter(mode: KeyboardMode, char: string): boolean {
  return MODE_RULES[mode].accepts(char);
}
