"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  backspace as applyBackspace,
  clear as applyClear,
  insert as applyInsert,
  moveCaret as applyMoveCaret,
  replaceAll,
  setCaret as applySetCaret,
  type Editing,
  type KeyboardMode,
} from "./model";

/**
 * Which field is being edited, and what the keys do to it.
 *
 * WHY A CUSTOM KEYBOARD EXISTS AT ALL
 *   The system keyboard on Android takes as much of the screen as it likes,
 *   resizes the viewport underneath it, and cannot be styled by a page. In a
 *   full-screen experience that is not a nuisance, it is a different product:
 *   headings slide under the status bar, the fixed actions move, and what the
 *   visitor sees stops resembling what was approved. So inside this one route
 *   tree the page provides its own keyboard, of a known height, inside its own
 *   stage.
 *
 * HOW THE SYSTEM KEYBOARD IS KEPT SHUT
 *   The field stays a real, focusable `<input>` — it is just `readOnly` while
 *   touch is the primary pointer. readOnly is the one attribute both iOS and
 *   Android honour by not raising a keyboard, and unlike `disabled` it keeps
 *   the field focusable, labelled and readable by assistive technology.
 *   Physical keys are routed back in by hand, and a visitor who wants the
 *   system keyboard can ask for it — nothing here globally suppresses typing.
 *
 * DESKTOP IS UNTOUCHED
 *   With a fine pointer the field is an ordinary input: no readOnly, no custom
 *   keys, no interception.
 *
 * WHAT IS STATE AND WHAT IS A REF
 *   Only the ACTIVE field's display data is state, because only it is
 *   rendered. The registry of every field on screen is a ref, read exclusively
 *   inside callbacks — it exists to answer "what comes after this one", which
 *   is a question asked on a keypress, never during a render.
 */

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/** True where the primary pointer is a finger. A touchscreen laptop reports a
 *  fine pointer, so it keeps its hardware keyboard — which is right. */
export function useTouchPresentation(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const query = window.matchMedia(COARSE_POINTER_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}

export interface FieldEntry {
  id: string;
  mode: KeyboardMode;
  label: string;
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
  error?: string;
  element: HTMLElement | null;
}

/** What the panel needs in order to draw itself. */
export interface ActiveField {
  id: string;
  mode: KeyboardMode;
  label: string;
  error?: string;
}

export type KeyPress =
  | { kind: "char"; value: string }
  | { kind: "backspace" }
  | { kind: "clear" }
  | { kind: "move"; delta: number }
  | { kind: "caret"; index: number }
  | { kind: "paste"; value: string }
  | { kind: "next" }
  | { kind: "done" };

/**
 * The API, split from the state ON PURPOSE.
 *
 * A field registers itself in an effect and unregisters in that effect's
 * cleanup. If those callbacks arrived on a context value that changes whenever
 * anything is typed, the effect would re-run on every keystroke — and its
 * cleanup would unregister the very field being edited, which cleared the
 * active field the instant it was set. Splitting the stable half out means the
 * registration effect depends only on things that genuinely never change, so
 * its cleanup runs when the field unmounts and at no other time.
 */
interface KeyboardApi {
  open: (id: string) => void;
  close: () => void;
  register: (entry: FieldEntry) => void;
  unregister: (id: string) => void;
  reportHeight: (height: number) => void;
  setMessage: (message: string | null) => void;
  useSystemKeyboard: () => void;
}

interface KeyboardState {
  active: ActiveField | null;
  editing: Editing;
  press: (key: KeyPress) => void;
  height: number;
  /** The field the visitor asked to type into with the system keyboard. */
  systemKeyboardFor: string | null;
  /** Recoverable trouble, shown in the panel — a refused clipboard, mostly. */
  message: string | null;
  hasNext: boolean;
}

const KeyboardApiContext = createContext<KeyboardApi | null>(null);
const KeyboardContext = createContext<KeyboardState | null>(null);

/** Null outside the gifting visitor flow, which is how every other screen in
 *  the application stays exactly as it was. */
export function useGiftingKeyboard(): (KeyboardState & KeyboardApi) | null {
  const state = useContext(KeyboardContext);
  const api = useContext(KeyboardApiContext);
  return state && api ? { ...state, ...api } : null;
}

/** Just the stable half — for effects that must not re-run when state moves. */
export function useGiftingKeyboardApi(): KeyboardApi | null {
  return useContext(KeyboardApiContext);
}

export function GiftingKeyboardProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, FieldEntry>());
  const [active, setActive] = useState<ActiveField | null>(null);
  const [editing, setEditingState] = useState<Editing>({ value: "", start: 0, end: 0 });
  /**
   * The authoritative editing state.
   *
   * Keys are pressed faster than React commits, especially on a busy phone. If
   * each press computed from the RENDERED value, two presses inside one commit
   * would both start from the same string and the first character would be
   * lost — which is exactly what a keyboard may never do. The ref is written
   * synchronously on every press, so the next press always sees the previous
   * one whether or not a render has happened in between.
   */
  const editingRef = useRef<Editing>({ value: "", start: 0, end: 0 });
  const setEditing = useCallback((next: Editing) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);
  const [height, setHeight] = useState(0);
  const [systemKeyboardFor, setSystemKeyboardFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  /** Document order, so Next follows the layout rather than a hand-kept list
   *  that can fall out of step with the form. */
  const orderedIds = useCallback(() => {
    const entries = [...registry.current.values()].filter((e) => e.element);
    entries.sort((a, b) => {
      if (!a.element || !b.element) return 0;
      const position = a.element.compareDocumentPosition(b.element);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return entries.map((e) => e.id);
  }, []);

  const followerOf = useCallback(
    (id: string) => {
      const ids = orderedIds();
      const index = ids.indexOf(id);
      return index >= 0 && index + 1 < ids.length ? ids[index + 1] : null;
    },
    [orderedIds],
  );

  const open = useCallback(
    (id: string) => {
      const entry = registry.current.get(id);
      if (!entry) return;
      setSystemKeyboardFor(null);
      setMessage(null);
      setActive({ id, mode: entry.mode, label: entry.label, error: entry.error });
      setEditing(replaceAll(entry.value, entry.mode, entry.maxLength));
      setHasNext(followerOf(id) !== null);
    },
    [followerOf, setEditing],
  );

  const close = useCallback(() => {
    setActive(null);
    setMessage(null);
  }, []);

  const register = useCallback((entry: FieldEntry) => {
    registry.current.set(entry.id, entry);
    // Keep the panel's label and error honest while it is the one on screen.
    setActive((current) =>
      current && current.id === entry.id && current.error !== entry.error
        ? { ...current, error: entry.error }
        : current,
    );
  }, []);

  const unregister = useCallback((id: string) => {
    registry.current.delete(id);
    setActive((current) => (current && current.id === id ? null : current));
  }, []);

  const press = useCallback(
    (key: KeyPress) => {
      if (!active) return;
      const entry = registry.current.get(active.id);
      if (!entry) return;

      // Read from the ref, never from the rendered value.
      const current = editingRef.current;
      const commit = (next: Editing) => {
        setEditing(next);
        // Typing is the recovery from a refused clipboard, so the message that
        // suggested it goes as soon as the suggestion is taken.
        setMessage(null);
        if (next.value !== entry.value) entry.onChange(next.value);
      };

      switch (key.kind) {
        case "char":
          commit(applyInsert(current, key.value, entry.mode, entry.maxLength));
          break;
        case "paste":
          commit(replaceAll(key.value, entry.mode, entry.maxLength));
          break;
        case "backspace":
          commit(applyBackspace(current, entry.mode));
          break;
        case "clear":
          commit(applyClear());
          break;
        case "move":
          setEditing(applyMoveCaret(current, key.delta));
          break;
        case "caret":
          setEditing(applySetCaret(current, key.index));
          break;
        case "next": {
          const target = followerOf(active.id);
          if (target) open(target);
          else close();
          break;
        }
        case "done":
          close();
          break;
      }
    },
    [active, setEditing, followerOf, open, close],
  );

  const useSystemKeyboard = useCallback(() => {
    // An explicit, per-field opt-out: the field drops readOnly and takes
    // focus, and the system keyboard comes up as it normally would. This is
    // the standard accessible alternative, and the way out for anyone the
    // custom keys do not serve.
    setActive((current) => {
      if (current) setSystemKeyboardFor(current.id);
      return null;
    });
  }, []);

  // Every member is a useCallback with stable dependencies, so this object is
  // created once and the registration effects never re-run because of it.
  const api = useMemo<KeyboardApi>(
    () => ({
      open,
      close,
      register,
      unregister,
      reportHeight: setHeight,
      setMessage,
      useSystemKeyboard,
    }),
    [open, close, register, unregister, useSystemKeyboard],
  );

  const value = useMemo<KeyboardState>(
    () => ({ active, editing, press, height, systemKeyboardFor, message, hasNext }),
    [active, editing, press, height, systemKeyboardFor, message, hasNext],
  );

  return (
    <KeyboardApiContext.Provider value={api}>
      <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
    </KeyboardApiContext.Provider>
  );
}
