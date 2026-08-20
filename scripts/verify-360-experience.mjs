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
console.log("\n--- the end of the clip is not the end of the visit ---");
// ---------------------------------------------------------------------------
{
  // The inversion of the previous behaviour, and the reason this block is
  // explicit: `ended` used to call exit(), so a visitor who was still looking
  // around was thrown back to the popup mid-look.
  const endedHandler = viewer.slice(
    viewer.indexOf("const onEnded ="),
    viewer.indexOf('video.addEventListener("loadedmetadata"'),
  );
  check(endedHandler.length > 0, "there is an ended handler to inspect");
  check(!/exit\(\)/.test(endedHandler), "reaching the end does NOT exit the viewer");
  check(/setFinished\(true\)/.test(endedHandler), "reaching the end marks the clip finished");

  // Nothing unmounts the sphere or drops the look direction on finish, so the
  // final frame stays explorable. Proved by absence: `finished` must not gate
  // the renderer or the drag listeners.
  const sceneEffect = viewer.slice(
    viewer.indexOf("const renderer = new THREE.WebGLRenderer"),
    viewer.indexOf("}, [webglSupported, attempt]);"),
  );
  check(!/finished/.test(sceneEffect), "the sphere keeps rendering after the clip ends");
  const dragStart = viewer.indexOf("const down = (event: PointerEvent)");
  const dragEffect = viewer.slice(dragStart, viewer.indexOf("}, []);", dragStart));
  check(!/finished/.test(dragEffect), "drag and touch keep working after the clip ends");

  check(/data-testid="primary-replay"/.test(viewer), "a Replay control appears when finished");
  const replayFn = viewer.slice(
    viewer.indexOf("const replay = useCallback"),
    viewer.indexOf("const toggleMute = useCallback"),
  );
  check(/video\.currentTime = 0;/.test(replayFn), "Replay rewinds to the start");
  check(/setFinished\(false\)/.test(replayFn), "Replay clears the finished state");
  check(/video\.play\(\)/.test(replayFn), "Replay starts playback again");
  check(!/exit\(/.test(replayFn), "Replay does not close the overlay");
  // The ring is a pure function of currentTime, so rewinding resynchronises it
  // without Replay having to touch the timer at all.
  check(
    !/ringRef/.test(replayFn) && !/setRemaining/.test(replayFn),
    "Replay resets the timer implicitly, by moving the playhead it is derived from",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the countdown ---");
// ---------------------------------------------------------------------------
{
  check(/data-testid="countdown"/.test(viewer), "there is a countdown element");
  check(/role="timer"/.test(viewer), "it is exposed as a timer");
  check(/seconds remaining/.test(viewer), "it carries a spoken label, not just a ring");
  check(/function formatClock/.test(viewer), "the remaining time is rendered as m:ss");
  check(
    /Math\.floor\(safe \/ 60\)/.test(viewer) && /padStart\(2, "0"\)/.test(viewer),
    "60 seconds reads as 1:00 and 9 seconds as 0:09",
  );
  const tickStart = viewer.indexOf("const tick = () => {");
  const timer = viewer.slice(tickStart, viewer.indexOf("}, [attempt]);", tickStart));
  check(timer.length > 0, "there is a countdown loop to inspect");
  // Derived from currentTime rather than from a wall clock, which is what
  // makes pause, seek and replay correct without any bookkeeping: a paused
  // video stops advancing currentTime, so the ring and the number stop too.
  check(
    /total - video\.currentTime/.test(timer),
    "the countdown is derived from the playhead, so pausing freezes it",
  );
  check(
    !/Date\.now\(\)/.test(timer) && !/setInterval/.test(timer),
    "the countdown does not run on a wall clock that would drift past a pause",
  );
  check(
    /ring\.style\.strokeDashoffset/.test(timer),
    "the ring is written straight to the DOM rather than through a render per frame",
  );
  check(
    /if \(whole !== lastWhole\)/.test(timer),
    "the readout re-renders once a second, not once a frame",
  );
  check(
    /finished \? "var\(--kameleon-teal-light\)" : "var\(--kameleon-copper\)"/.test(viewer),
    "the ring takes a teal completion accent over copper",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- control priority, attention, and the entry animation ---");
// ---------------------------------------------------------------------------
{
  const secondaryDef = viewer.slice(
    viewer.indexOf("const secondary ="),
    viewer.indexOf("const primary ="),
  );
  const primaryDef = viewer.slice(
    viewer.indexOf("const primary ="),
    viewer.indexOf("const enterClass"),
  );
  check(/min-h-14/.test(primaryDef), "the primary controls are the taller ones");
  check(/min-h-11/.test(secondaryDef), "the secondary controls keep a 44px touch target");
  check(
    /text-sm/.test(primaryDef) && /text-xs/.test(secondaryDef),
    "the primary controls carry the larger type",
  );
  check(
    /kameleon-red/.test(primaryDef) && /kameleon-teal/.test(primaryDef),
    "the primary controls quote the bottle label's red and teal",
  );
  const chromeDef = viewer.slice(viewer.indexOf("const chrome ="), viewer.indexOf("const secondary ="));
  check(
    /border-kameleon-copper/.test(chromeDef),
    "every control is bordered in copper",
  );
  check(
    /bg-black\/55/.test(chromeDef) && /backdrop-blur/.test(chromeDef),
    "every control sits on dark glass, so it stays readable over any part of the panorama",
  );
  check(
    /focus-visible:ring-kameleon-copper-light/.test(viewer),
    "focus is visible against both the skyline and the marble",
  );

  // Anchored on the stagger delays, not on the section comments: the reader
  // above strips comments, so a comment makes a useless landmark.
  const primaryRow = viewer.slice(
    viewer.indexOf("enterStyle(120)"),
    viewer.indexOf("enterStyle(320)"),
  );
  const secondaryRail = viewer.slice(viewer.indexOf("enterStyle(320)"));
  check(
    /data-testid="primary-device-motion"/.test(primaryRow),
    "Use Device Motion sits in the primary row",
  );
  check(
    /data-testid="primary-play"/.test(primaryRow) &&
      /data-testid="primary-replay"/.test(primaryRow),
    "Play and Replay share the primary slot",
  );
  check(
    /<DeviceMotionIcon[\s\S]{0,200}Use Device Motion/.test(primaryRow),
    "Use Device Motion is a labelled button with an icon, not an icon alone",
  );
  for (const label of ["Pause", "Mute", "Recenter"]) {
    check(
      secondaryRail.includes(label) && !primaryRow.includes(`>${label}`),
      `${label} is in the secondary rail, below the primary controls`,
    );
  }

  check(/kameleon-attention/.test(viewer), "the motion control has an attention state");
  check(
    /motionState === "idle" && phase === "ready"/.test(viewer),
    "it asks for attention only while the offer is still unanswered",
  );
  check(
    /reducedMotion\s*\?\s*"kameleon-attention-static"\s*:\s*"kameleon-attention"/.test(viewer),
    "reduced motion gets a static highlight instead of a pulse",
  );
  check(
    /setMotionState\("denied"\)/.test(viewer),
    "a refused permission is recorded, so the pulse stops and the copy changes",
  );
  check(/"Try Motion Again"/.test(viewer), "a refused permission still offers a retry");
  check(
    /motionState !== "unavailable"/.test(viewer),
    "a device without the orientation API is offered nothing to tap",
  );
  check(
    /requestPermission/.test(viewer) && /onClick=\{enableMotion\}/.test(viewer),
    "the iOS permission call happens inside the button's own gesture",
  );

  check(/const \[entered, setEntered\]/.test(viewer), "the controls animate in on open");
  check(
    /transition-\[opacity,transform\]/.test(viewer),
    "the entry animation moves opacity and transform only",
  );
  check(
    /transitionDelay: `\$\{delayMs\}ms`/.test(viewer),
    "the stagger is an inline delay, because a templated Tailwind class is never generated",
  );
  check(
    /const enterClass = reducedMotion\s*\?\s*""/.test(viewer),
    "reduced motion skips the entry animation entirely",
  );
  // It runs once per opening: the state that drives it starts false and is
  // only ever set true.
  check(
    /setEntered\(true\)/.test(viewer) && !/setEntered\(false\)/.test(viewer),
    "the entry animation runs once per opening and never replays",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- responsive placement ---");
// ---------------------------------------------------------------------------
{
  check(
    /env\(safe-area-inset-top\)/.test(viewer) && /env\(safe-area-inset-bottom\)/.test(viewer),
    "the rails respect the notch and the home indicator",
  );
  check(
    /env\(safe-area-inset-left\)/.test(viewer) && /env\(safe-area-inset-right\)/.test(viewer),
    "landscape safe areas are respected too",
  );
  check(/landscape:/.test(viewer), "landscape gets a more compact layout");
  // The timer and the exit share the top-right corner, stacked, which is the
  // brief's stated fallback for when they would otherwise collide.
  const topRail = viewer.slice(
    viewer.indexOf("absolute inset-x-0 top-0"),
    viewer.indexOf("absolute inset-x-0 bottom-0"),
  );
  check(
    /flex flex-col items-end/.test(topRail),
    "the timer and the exit stack in the top corner rather than overlapping",
  );
  check(
    topRail.indexOf('data-testid="countdown"') < topRail.indexOf("{exitLabel}"),
    "the timer takes the corner and the exit sits immediately below it",
  );
  check(/flex-wrap/.test(viewer), "the control rows wrap rather than running off a 320px screen");
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
  check(
    /const play = useCallback/.test(viewer) && /const pause = useCallback/.test(viewer),
    "Play/Pause",
  );
  check(/const toggleMute =/.test(viewer) && /aria-label=\{muted/.test(viewer), "Mute/Unmute");
  check(/useState\(true\)/.test(viewer.slice(viewer.indexOf("const [muted"))), "opens muted");
  check(/const recenter =/.test(viewer), "Recenter");
  check(/phase === "loading"/.test(viewer), "a loading state");
  check(/phase === "error"/.test(viewer), "an error state");
  check(
    /phase === "error"[\s\S]{0,900}Retry/.test(viewer),
    "the error state offers Retry",
  );
  // A rejected play() is autoplay policy or an AbortError, not a broken file.
  // Escalating it showed "could not be loaded" over a healthy 4K video the
  // moment a throttled tab declined to start it.
  const transport = viewer.slice(
    viewer.indexOf("const play = useCallback"),
    viewer.indexOf("const toggleMute = useCallback"),
  );
  check(
    !/setPhase\("error"\)/.test(transport),
    "a refused play() does not become the error screen",
  );
  check(
    /const onError = \(\) => setPhase\("error"\)/.test(viewer),
    "only the element's own error event means the media actually failed",
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
