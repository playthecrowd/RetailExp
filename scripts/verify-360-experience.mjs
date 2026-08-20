/**
 * The optional 360° lounge, asserted.
 *
 * WHAT THIS PROTECTS
 *   The 360° view is an AID to a pathway decision. Every requirement below
 *   exists because the opposite would be a real failure a visitor would feel:
 *   a control that appears where there is no asset, an exit route that behaves
 *   differently from the other exit routes, or — the one that actually
 *   happened during development — a viewer that wrote its own playhead back
 *   into the chapter's progress and moved the journey while the visitor was
 *   only looking around.
 *
 * WHY STRUCTURAL
 *   These are facts about wiring: which component owns the control, what is
 *   passed to it, and what is NOT passed back. There is no reducer to drive
 *   here — the overlay deliberately touches no journey state, and "touches no
 *   state" is proved by the absence of a call, which is a fact about the
 *   source rather than about a transition.
 *
 * Run: node scripts/verify-360-experience.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

/** Comments describe intent; only code can be evidence of behaviour. */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith("//"))
    .join(String.fromCharCode(10));

const viewer = stripComments(read("components/kameleon/Video360Viewer.tsx"));
const drawer = stripComments(read("components/kameleon/DecisionDrawer.tsx"));
const player = stripComments(read("components/kameleon/JourneyPlayer.tsx"));
const chrome = stripComments(read("components/kameleon/MockVideoPlayer.tsx"));

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

// ---------------------------------------------------------------------------
console.log("\n--- the entry control lives on the decision popup ---");
// ---------------------------------------------------------------------------
{
  check(
    drawer.includes("Explore in 360°"),
    'the decision drawer carries a control labelled "Explore in 360°"',
  );
  check(
    /video360Src && onOpen360 &&/.test(drawer),
    "the drawer renders it only when a real 360 source AND a handler are present",
  );
  check(
    /video360Src=\{node\.video360Source \|\| undefined\}/.test(player) &&
      /<DecisionDrawer[\s\S]*?video360Src=/.test(player),
    "the Journey passes the chapter's 360 source to the drawer",
  );
  check(
    !chrome.includes("360"),
    "the standard video chrome no longer carries a duplicate 360 control",
  );

  // Order is the whole point of "additive": the two pathway choices must still
  // be the first thing in the drawer's body, and the 360 control must sit
  // after them rather than between or above them.
  const choicesAt = drawer.indexOf("completedNode.choices.map");
  const exploreAt = drawer.indexOf("Explore in 360°");
  const utilityAt = drawer.indexOf("grid grid-cols-3");
  check(choicesAt > -1 && exploreAt > choicesAt, "the pathway choices still come first");
  check(
    utilityAt > exploreAt,
    "the 360 control is additive between the choices and the existing utility row",
  );
  check(
    /onSelectChoice\(choice\.id\)/.test(drawer),
    "the existing choice buttons still call onSelectChoice unchanged",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- opening 360 does not advance the journey ---");
// ---------------------------------------------------------------------------
{
  const overlay = player.slice(
    player.indexOf("viewing360 && node.video360Source"),
    player.indexOf("!node.isTerminal &&"),
  );
  check(overlay.length > 0, "the overlay is rendered inside the player, not as a route");
  check(
    /onExit=\{\(\) => setViewing360\(false\)\}/.test(overlay),
    "exiting 360 only closes the overlay",
  );
  // The regression this exists for: the overlay used to feed the 360 clip's
  // playhead into the chapter's progress.
  check(
    !overlay.includes("handleProgress"),
    "exiting 360 does NOT write the 360 clip's playhead into chapter progress",
  );
  check(
    !overlay.includes("onProgressUpdate") && !overlay.includes("executeTransition"),
    "the overlay neither persists progress nor selects a pathway",
  );
  check(
    !/startTime=/.test(overlay),
    "the lounge opens at its own beginning, not at the chapter's position",
  );
  // The drawer is a sibling that stays mounted while the overlay is open, so
  // the popup and its choices are still there underneath.
  check(
    player.indexOf("<DecisionDrawer") > player.indexOf("viewing360 &&"),
    "the decision drawer stays mounted behind the overlay",
  );
  check(
    /exitLabel="Return to Choices"/.test(overlay),
    'the overlay names its exit "Return to Choices"',
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- every way out is the same way out ---");
// ---------------------------------------------------------------------------
{
  check(/const exit = useCallback/.test(viewer), "there is a single exit path");
  check(
    /if \(exitedRef\.current\) return;/.test(viewer),
    "exit is idempotent, so Back cannot be counted twice",
  );
  check(/"Escape"/.test(viewer), "Escape exits");
  check(/addEventListener\("ended", onEnded\)/.test(viewer), "natural completion is handled");
  check(/const onEnded = \(\) => exit\(\)/.test(viewer), "natural completion exits");
  check(
    /window\.history\.pushState\(\{ kameleon360: true \}/.test(viewer),
    "the overlay pushes a history entry so Back has something to close",
  );
  check(
    /addEventListener\("popstate"/.test(viewer),
    "browser Back closes the overlay instead of leaving the Journey",
  );
  check(
    /if \(window\.history\.state\?\.kameleon360\) window\.history\.back\(\);/.test(
      viewer.slice(viewer.indexOf("const exit = useCallback")),
    ),
    "closing by control unwinds the pushed entry, so Back is not left inert",
  );
  // StrictMode runs mount -> cleanup -> mount. Pushing unconditionally, or
  // popping in the cleanup, made that sequence close the overlay as it opened.
  check(
    /if \(!window\.history\.state\?\.kameleon360\) \{/.test(viewer),
    "the history entry is pushed once, so a re-invoked effect cannot stack a second",
  );
  const historyEffect = viewer.slice(viewer.indexOf('addEventListener("popstate"'));
  check(
    /return \(\) => window\.removeEventListener\("popstate", onPop\);/.test(historyEffect),
    "the popstate cleanup only removes its listener and never navigates",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the viewer's required controls and states ---");
// ---------------------------------------------------------------------------
{
  check(/geometry\.scale\(-1, 1, 1\)/.test(viewer), "the sphere's normals are inverted");
  // The brief requires the bottle to be the first thing the visitor sees.
  // SphereGeometry puts the texture's middle on the X axis and the camera
  // opens down -Z, so without this quarter turn the lounge opens 90 degrees
  // away from its own hero - which it did, in production.
  check(
    /sphere\.rotation\.y = -Math\.PI \/ 2;/.test(viewer),
    "the video's forward is rotated onto the visitor's initial heading",
  );
  check(/pointerdown/.test(viewer) && /pointermove/.test(viewer), "drag and touch navigation");
  check(/playsInline/.test(viewer), "inline playback on iOS");
  check(
    /"webkit-playsinline": "true"/.test(viewer),
    "the legacy webkit-playsinline attribute is emitted too",
  );
  check(/const togglePlay =/.test(viewer) && /aria-label=\{playing/.test(viewer), "Play/Pause");
  check(/const toggleMute =/.test(viewer) && /aria-label=\{muted/.test(viewer), "Mute/Unmute");
  check(/useState\(true\)/.test(viewer.slice(viewer.indexOf("const [muted"))), "opens muted");
  check(/const recenter =/.test(viewer), "Recenter");
  check(/phase === "loading"/.test(viewer), "a loading state");
  check(/phase === "error"/.test(viewer), "an error state");
  check(
    /phase === "error"[\s\S]{0,900}Retry/.test(viewer),
    "the error state offers Retry",
  );
  check(
    /phase === "error"[\s\S]{0,900}\{exitLabel\}/.test(viewer),
    "the error state offers the return control",
  );
  check(
    /requestPermission/.test(viewer) && /enableMotion/.test(viewer),
    "device orientation is opt-in behind the iOS permission call",
  );
  check(
    /prefers-reduced-motion: reduce/.test(viewer),
    "prefers-reduced-motion is honoured",
  );
  check(
    /if \(reducedMotion\) return;/.test(viewer),
    "under reduced motion the clip does not start itself",
  );
  check(/webglSupported/.test(viewer) && /cannot show the 360/.test(viewer), "WebGL fallback");
  check(
    /geometry\.dispose\(\)/.test(viewer) &&
      /texture\.dispose\(\)/.test(viewer) &&
      /material\.dispose\(\)/.test(viewer) &&
      /renderer\.forceContextLoss\(\)/.test(viewer),
    "the WebGL resources are all disposed on close",
  );
  check(
    /video\.removeAttribute\("src"\)/.test(viewer),
    "the video download is dropped on close rather than left running",
  );
  // ...and the effect restores it, because the cleanup above runs between
  // StrictMode's two mounts and React will not re-set an unchanged attribute.
  check(
    /if \(video\.getAttribute\("src"\) !== src\) \{/.test(viewer),
    "the source is restored on re-entry, so a re-invoked effect cannot leave it empty",
  );
  const listeners = viewer.match(/addEventListener\(/g) ?? [];
  const removals = viewer.match(/removeEventListener\(/g) ?? [];
  check(
    removals.length >= listeners.length,
    `every event listener is removed (${listeners.length} added, ${removals.length} removed)`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- it still refuses to fake 360 ---");
// ---------------------------------------------------------------------------
{
  check(
    /viewing360 && node\.video360Source &&/.test(player),
    "the overlay renders only when a genuine 360 source exists",
  );
  check(
    !/video360Source \|\| node\.videoSource/.test(player),
    "the standard 16:9 video is never substituted as a 360 source",
  );
}

console.log(
  `\n${failures.length === 0 ? "OK" : "FAILED"} — ${passed} passed, ${failures.length} failed`,
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
