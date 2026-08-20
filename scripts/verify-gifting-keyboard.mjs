/**
 * The gifting keyboard, driven rather than described.
 *
 * WHY EXECUTE IT
 *   An on-screen keyboard is caret arithmetic, and caret arithmetic is the
 *   kind of code that reads correctly and is off by one. Pattern-matching the
 *   source would prove the functions exist; running them proves what they do.
 *   The structural half below covers the claims that are about the SHAPE of
 *   the integration — which fields use it, which screens do not, and that
 *   nothing global was switched off to make it work.
 *
 * Run: node scripts/verify-gifting-keyboard.mjs
 */

import { readFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");
const mod = (relative) => pathToFileURL(join(root, relative)).href;

// The model imports through the `@/` alias, which Node does not know.
register("./ts-extension-resolver.mjs", import.meta.url);

const {
  insert,
  backspace,
  clear,
  moveCaret,
  setCaret,
  selectAll,
  replaceAll,
  acceptsCharacter,
  shiftAfter,
} =
  await import(mod("components/gifting/keyboard/model.ts"));
const { CODE_ALPHABET, formatCode } = await import(
  mod("lib/gifting/simulation/code-alphabet.ts")
);

let passed = 0;
const failures = [];
function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

const empty = { value: "", start: 0, end: 0 };
/** Type a string one character at a time, as a thumb would. */
function type(text, mode, from = empty) {
  return [...text].reduce((state, char) => insert(state, char, mode), from);
}

// ---------------------------------------------------------------------------
console.log("\n--- gift codes ---");
// ---------------------------------------------------------------------------
{
  const typed = type("KQ7MW3TDHF", "code");
  check(typed.value === "KQ7MW-3TDHF", `ten characters group themselves (${typed.value})`);
  check(
    typed.start === typed.value.length,
    `the caret ends after the last character (${typed.start} of ${typed.value.length})`,
  );

  const overflow = insert(typed, "Z", "code");
  check(overflow.value === "KQ7MW-3TDHF", "an eleventh character is refused, not appended");

  // The hyphen is ours, not the visitor's: backspace must take a character.
  const atBoundary = type("KQ7MW3", "code");
  check(atBoundary.value === "KQ7MW-3", `a sixth character opens the second group (${atBoundary.value})`);
  const back = backspace(atBoundary, "code");
  check(back.value === "KQ7MW", `backspace removes the character, not the separator (${back.value})`);
  const backAgain = backspace(back, "code");
  check(backAgain.value === "KQ7M", `and the next one after that (${backAgain.value})`);

  // Insertion happens at the caret, not at the end.
  const mid = setCaret(typed, 2);
  const inserted = insert(mid, "9", "code");
  check(
    inserted.value === "KQ97M-W3TDH",
    `insertion lands at the caret and the groups re-flow (${inserted.value})`,
  );
  check(inserted.start === 3, `the caret follows the inserted character (${inserted.start})`);

  // A selection is replaced wholesale.
  const all = selectAll(typed);
  const replaced = insert(all, "A", "code");
  check(replaced.value === "A", `typing over a selection replaces it (${replaced.value})`);
  check(backspace(all, "code").value === "", "backspace over a selection clears it");

  // Paste tolerates however the code was copied.
  check(
    replaceAll("kq7mw 3tdhf", "code").value === "KQ7MW-3TDHF",
    "a pasted code is uppercased, stripped and regrouped",
  );
  check(
    replaceAll("KQ7MW-3TDHF-EXTRA", "code").value === "KQ7MW-3TDHF",
    "a pasted code longer than the format is truncated to it",
  );

  // The keyboard's keys are drawn from this alphabet, so it must exclude the
  // characters people confuse when reading a code aloud.
  for (const ambiguous of ["0", "O", "1", "I", "L", "5", "S", "8", "B"]) {
    check(!CODE_ALPHABET.includes(ambiguous), `the code alphabet excludes "${ambiguous}"`);
  }
  check(
    !acceptsCharacter("code", "0") && acceptsCharacter("code", "7"),
    "a physical keypress is held to the same alphabet as the on-screen keys",
  );
  check(formatCode("").length === 0, "an empty code formats to nothing rather than a stray hyphen");
}

// ---------------------------------------------------------------------------
console.log("\n--- names ---");
// ---------------------------------------------------------------------------
{
  // What the keys actually send: the panel consults shiftAfter before each
  // character, so this walks a name the way a thumb would.
  const typeName = (text) =>
    [...text].reduce((state, char) => {
      const shifted = shiftAfter(state.value, "text");
      return insert(state, shifted ? char.toUpperCase() : char.toLowerCase(), "text");
    }, empty);
  check(typeName("ines").value === "Ines", "a name is capitalised as it is typed");
  check(typeName("o'brien").value === "O'Brien", "an apostrophe starts a new capital");
  check(typeName("anne-marie").value === "Anne-Marie", "so does a hyphen");
  check(typeName("mary jane").value === "Mary Jane", "and so does a space");
  // Capitalising only where a word begins is what leaves the rest alone.
  // The keyboard capitalises by raising shift, so a value that already exists
  // is never re-cased. This is what keeps "van der Berg" as it was typed.
  check(
    replaceAll("van der Berg", "text").value === "van der Berg",
    "an existing value is never re-cased when the field is reopened",
  );
  check(
    shiftAfter("", "text") && shiftAfter("Anne-", "text") && shiftAfter("Mary ", "text"),
    "shift is raised at the start of a name and after a separator",
  );
  check(
    !shiftAfter("An", "text") && !shiftAfter("Anne", "text"),
    "and lowered inside a word",
  );
  check(!shiftAfter("", "email") && !shiftAfter("", "code"), "no other mode auto-capitalises");
  check(acceptsCharacter("text", "'") && acceptsCharacter("text", "-"), "apostrophe and hyphen are accepted");
  check(!acceptsCharacter("text", "@"), "an address character is not");
}

// ---------------------------------------------------------------------------
console.log("\n--- email ---");
// ---------------------------------------------------------------------------
{
  const typed = type("Ines@Example.COM", "email");
  check(typed.value === "ines@example.com", `an address is never capitalised (${typed.value})`);
  check(replaceAll("  ines@example.com ", "email").value === "ines@example.com", "spaces are removed");
  check(
    acceptsCharacter("email", "@") && acceptsCharacter("email", ".") && acceptsCharacter("email", "_"),
    "@ . and _ are accepted",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- phone ---");
// ---------------------------------------------------------------------------
{
  check(type("+447700900123", "phone").value === "+447700900123", "an international prefix survives");
  check(replaceAll("+44 7700 900123", "phone").value === "+447700900123", "spacing is stripped");
  check(replaceAll("(020) 7946 0018", "phone").value === "02079460018", "so is punctuation");
  check(type("447700", "phone").value === "447700", "a number without a prefix stays without one");
  check(!acceptsCharacter("phone", "a"), "letters are refused");
}

// ---------------------------------------------------------------------------
console.log("\n--- the caret cannot be lost ---");
// ---------------------------------------------------------------------------
{
  const typed = type("KQ7MW3TDHF", "code");
  check(moveCaret(typed, 5).start === typed.value.length, "the caret cannot run past the end");
  check(moveCaret(setCaret(typed, 0), -5).start === 0, "nor before the beginning");
  check(setCaret(typed, 999).start === typed.value.length, "a tap beyond the value clamps to it");
  check(clear().value === "" && clear().start === 0, "clear leaves an empty value and a caret at zero");
  check(backspace(empty, "code").value === "", "backspace on an empty field is harmless");
}

// ---------------------------------------------------------------------------
console.log("\n--- it is wired to the right fields, and only inside gifting ---");
// ---------------------------------------------------------------------------
{
  const recipient = read("components/gifting/RecipientFlow.tsx");
  const sender = read("components/gifting/SenderFlow.tsx");

  const expected = [
    [recipient, 'label="Package Code"', 'mode="code"'],
    [recipient, 'label="Gift Message Code"', 'mode="code"'],
    [recipient, 'label="First name"', 'mode="text"'],
    [recipient, 'label="Last name"', 'mode="text"'],
    [recipient, 'label="Email"', 'mode="email"'],
    [recipient, 'label="Mobile"', 'mode="phone"'],
    [sender, 'label="Recipient name"', 'mode="text"'],
    [sender, 'label="Email or mobile"', 'mode="email"'],
    [sender, 'label="A short note"', 'mode="text"'],
    [sender, 'label="Package Code"', 'mode="code"'],
  ];
  for (const [source, label, mode] of expected) {
    // A label can appear more than once on a screen — "Package Code" is also
    // the caption on the sample-code chip — so every occurrence is considered
    // and one of them has to be the field.
    let found = false;
    let at = source.indexOf(label);
    while (at >= 0) {
      const window = source.slice(Math.max(0, at - 220), at + 220);
      if (window.includes("KeyboardField") && window.includes(mode)) found = true;
      at = source.indexOf(label, at + 1);
    }
    check(found, `${label} uses the gifting keyboard in ${mode}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- nothing global was switched off ---");
// ---------------------------------------------------------------------------
{
  const field = read("components/gifting/keyboard/KeyboardField.tsx");
  const context = read("components/gifting/keyboard/context.tsx");
  const ui = read("components/gifting/ui.tsx");

  check(
    /readOnly=\{usesCustomKeyboard\}/.test(field),
    "readOnly is conditional on touch presentation, never unconditional",
  );
  check(
    /Boolean\(keyboard\) && touch/.test(field),
    "the custom keyboard needs BOTH a provider and a coarse pointer",
  );
  check(
    !/disabled/.test(field),
    "the field is never disabled — that would take it out of the focus order",
  );
  check(
    /pointer: coarse/.test(context),
    "touch presentation is decided by the pointer, not by sniffing a user agent",
  );
  check(
    /useSystemKeyboard/.test(context) && /useSystemKeyboard/.test(read("components/gifting/keyboard/GiftingKeyboard.tsx")),
    "there is an explicit way back to the system keyboard",
  );
  // The shared primitive keeps working for everything that is not a gifting
  // field: readOnly is an optional prop, defaulting to undefined.
  check(
    /readOnly\?: boolean;/.test(ui),
    "the shared Field's readOnly is optional, so every other input is unchanged",
  );

  const keyboard = read("components/gifting/keyboard/GiftingKeyboard.tsx");
  check(/aria-label=\{label\}/.test(keyboard), "every key carries an accessible label");
  check(/aria-label="Close keyboard"/.test(keyboard), "there is an explicit close control");
  check(
    /minHeight: height/.test(keyboard) && /MIN_KEY_HEIGHT = 44/.test(keyboard),
    "keys are at least 44px tall",
  );
  check(
    /navigator\.clipboard\?\.readText/.test(keyboard) && /catch/.test(keyboard),
    "paste asks the clipboard only when pressed, and survives a refusal",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- it cannot appear on a screen that has no field ---");
// ---------------------------------------------------------------------------
{
  const keyboard = read("components/gifting/keyboard/GiftingKeyboard.tsx");
  check(
    /if \(!keyboard \|\| !active \|\| !press\) return null;/.test(keyboard),
    "the panel renders nothing unless a field is being edited",
  );
  // Video, gallery, gate and consent screens hold no KeyboardField, so there is
  // nothing on them that can make `active` non-null.
  for (const file of [
    "components/gifting/VideoStage.tsx",
    "components/gifting/Gallery.tsx",
    "components/gifting/GiftReveal.tsx",
  ]) {
    check(!read(file).includes("KeyboardField"), `no editable field on ${file.split("/").pop()}`);
  }
  const recipient = read("components/gifting/RecipientFlow.tsx");
  const gate = recipient.slice(recipient.indexOf("function Gate("), recipient.indexOf("function Declined("));
  check(!gate.includes("KeyboardField"), "the eligibility gate has no editable field");
}

console.log(`\n${failures.length === 0 ? "OK" : "FAILED"} — ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
