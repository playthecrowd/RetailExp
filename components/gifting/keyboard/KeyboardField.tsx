"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { Field } from "../ui";
import { useGiftingKeyboard, useGiftingKeyboardApi, useTouchPresentation } from "./context";
import { acceptsCharacter, type KeyboardMode } from "./model";

/**
 * A form field that raises the experience's own keyboard instead of the
 * system one — on touch, and only inside this flow.
 *
 * IT IS STILL AN INPUT
 *   Not a div dressed as a field. It keeps its label association, its value,
 *   its validation message, its place in the focus order and its
 *   `aria-invalid`, so a screen reader, a physical keyboard and a password
 *   manager all still find something they understand. The only difference on
 *   touch is `readOnly`, which stops the system keyboard without taking any
 *   of that away.
 *
 * PHYSICAL KEYS STILL TYPE
 *   readOnly also stops a hardware keyboard, so keydown is handled directly
 *   and routed through the same editing model the on-screen keys use. Someone
 *   with a Bluetooth keyboard on a tablet types normally.
 *
 * ON DESKTOP IT IS ORDINARY
 *   Fine pointer, or no keyboard provider at all: this renders the plain
 *   Field with no interception whatsoever.
 */
export function KeyboardField({
  label,
  value,
  onChange,
  mode,
  placeholder,
  hint,
  error,
  required,
  maxLength,
  autoComplete,
  inputMode,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode: KeyboardMode;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  type?: string;
}) {
  const keyboard = useGiftingKeyboard();
  // The registration effects use the stable half of the context. On the
  // changing half, their cleanup would fire on every keystroke and unregister
  // the field currently being typed into.
  const api = useGiftingKeyboardApi();
  const touch = useTouchPresentation();
  const generatedId = useId();
  const id = `gk-${generatedId}`;
  const wrapRef = useRef<HTMLDivElement>(null);

  const usesCustomKeyboard = Boolean(keyboard) && touch && keyboard?.systemKeyboardFor !== id;
  const isActive = keyboard?.active?.id === id;

  // Keep the registry current: the panel reads the label, mode, live value and
  // validation state from here, and Next reads the element to find what comes
  // after it.
  useEffect(() => {
    if (!api) return;
    api.register({
      id,
      mode,
      label,
      value,
      maxLength,
      onChange,
      error,
      element: wrapRef.current,
    });
  }, [api, id, mode, label, value, maxLength, onChange, error]);

  useEffect(() => {
    if (!api) return;
    return () => api.unregister(id);
  }, [api, id]);

  // The system keyboard was explicitly asked for: give the field focus so it
  // actually appears, once.
  const focusedForSystem = useRef(false);
  useEffect(() => {
    if (keyboard?.systemKeyboardFor !== id) {
      focusedForSystem.current = false;
      return;
    }
    if (focusedForSystem.current) return;
    focusedForSystem.current = true;
    wrapRef.current?.querySelector("input")?.focus();
  }, [keyboard?.systemKeyboardFor, id]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!keyboard || !usesCustomKeyboard) return;
      const { key } = event;

      if (key === "Tab") return; // focus order belongs to the browser
      if (!isActive && key.length === 1) keyboard.open(id);

      if (key === "Backspace") {
        event.preventDefault();
        keyboard.press({ kind: "backspace" });
      } else if (key === "Enter") {
        event.preventDefault();
        keyboard.press({ kind: "next" });
      } else if (key === "Escape") {
        event.preventDefault();
        keyboard.press({ kind: "done" });
      } else if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        keyboard.press({ kind: "move", delta: key === "ArrowLeft" ? -1 : 1 });
      } else if (key.length === 1 && acceptsCharacter(mode, key)) {
        event.preventDefault();
        keyboard.press({ kind: "char", value: key });
      }
    },
    [keyboard, usesCustomKeyboard, isActive, id, mode],
  );

  return (
    <div ref={wrapRef} className={cn(isActive && "gift-field-active rounded-xl")}>
      <Field
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        hint={hint}
        error={error}
        required={required}
        type={type}
        autoComplete={autoComplete}
        // `none` is the polite request; readOnly is what actually stops the
        // system keyboard on both platforms.
        inputMode={usesCustomKeyboard ? undefined : inputMode}
        readOnly={usesCustomKeyboard}
        maxLength={maxLength}
        onFocus={usesCustomKeyboard ? () => keyboard?.open(id) : undefined}
        onPointerDown={usesCustomKeyboard ? () => keyboard?.open(id) : undefined}
        onKeyDown={onKeyDown}
        describedBy={isActive ? "gift-keyboard-panel" : undefined}
      />
    </div>
  );
}
