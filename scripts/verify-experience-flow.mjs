/**
 * The controlling stakeholder flow, asserted.
 *
 * The state machine half EXERCISES the real reducer — it is a pure function,
 * so the transitions below are driven rather than pattern-matched out of the
 * source. That distinction matters: a text assertion proves a line exists, and
 * this proves the machine behaves.
 *
 * The placement half is structural, because "the testimonial choice sits
 * between COMPLETE_ACCOUNT and ar-permission" is a fact about ordering that no
 * single transition demonstrates.
 *
 * Run: node scripts/verify-experience-flow.mjs
 */

import { readFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// Registered BEFORE the dynamic import below, because the reducer's own
// relative imports carry no extension. See ts-extension-resolver.mjs.
register("./ts-extension-resolver.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = (relative) => pathToFileURL(join(root, relative)).href;
const read = (relative) => readFileSync(join(root, relative), "utf8");

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith("//"))
    .join(String.fromCharCode(10));

const { createInitialSessionState, kameleonReducer } = await import(
  mod("lib/kameleon/reducer.ts")
);

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

/** Applies a sequence of actions from the initial state. */
function run(...actions) {
  return actions.reduce(
    (state, action) => kameleonReducer(state, typeof action === "string" ? { type: action } : action),
    createInitialSessionState(),
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- entry: commercial, account, then the choice ---");
// ---------------------------------------------------------------------------
{
  const begun = run("BEGIN");
  check(begun.screen === "commercial", "BEGIN opens the commercial");

  const accounted = run("BEGIN", "COMMERCIAL_COMPLETE", "CONTINUE_TO_ACCOUNT", "COMPLETE_ACCOUNT");
  check(
    accounted.screen === "experience-choice",
    "COMPLETE_ACCOUNT lands on the experience choice, NOT on ar-permission",
  );
  check(accounted.authed === true, "completing the account marks the session authed");
}

// ---------------------------------------------------------------------------
console.log("\n--- the two branches ---");
// ---------------------------------------------------------------------------
{
  const base = ["BEGIN", "COMMERCIAL_COMPLETE", "CONTINUE_TO_ACCOUNT", "COMPLETE_ACCOUNT"];

  check(run(...base, "CHOOSE_AR").screen === "ar-permission", "CHOOSE_AR opens the AR path");
  check(
    run(...base, "CHOOSE_TESTIMONIAL").screen === "testimonial-capture",
    "CHOOSE_TESTIMONIAL opens testimonial capture",
  );
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "CANCEL_TESTIMONIAL").screen === "experience-choice",
    "CANCEL_TESTIMONIAL returns to the choice, so AR is still reachable afterwards",
  );
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "CANCEL_TESTIMONIAL", "CHOOSE_AR").screen ===
      "ar-permission",
    "AR is genuinely still reachable after cancelling a testimonial",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- a testimonial is not AR completion ---");
// ---------------------------------------------------------------------------
{
  const base = ["BEGIN", "COMMERCIAL_COMPLETE", "CONTINUE_TO_ACCOUNT", "COMPLETE_ACCOUNT"];
  const submitted = run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED");

  check(
    submitted.testimonialSubmitted === true,
    "TESTIMONIAL_SUBMITTED records that a story was shared",
  );
  check(
    submitted.arCompleted !== true,
    "TESTIMONIAL_SUBMITTED does NOT mark AR complete - sharing a story is not an AR reward",
  );
  check(
    submitted.screen !== "ar-permission" && submitted.screen !== "experience-choice",
    "continuing after a submission moves past the opening gate",
  );

  const arDone = run(...base, "CHOOSE_AR", "ENTER_JOURNEY");
  check(arDone.arCompleted === true, "the AR path still marks AR complete");
  check(
    arDone.screen === submitted.screen,
    "both routes satisfy the opening gate and arrive at the same next screen",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- reload does not send a submitter back to AR ---");
// ---------------------------------------------------------------------------
{
  // A REAL progress object, not null. The action type declares
  // `progress: ViewerProgress` and loadProgress() normalizes malformed storage
  // to safe defaults, so null is not a state production can produce - an
  // earlier version of this test passed null and crashed the reducer, which
  // would have been reported as a product defect rather than a bad fixture.
  const hydrated = kameleonReducer(createInitialSessionState(), {
    type: "HYDRATE",
    openingGate: {
      commercialCompleted: true,
      authed: true,
      arAvailable: true,
      arCompleted: false,
      testimonialSubmitted: true,
    },
    progress: createInitialSessionState().progress,
  });
  check(
    hydrated.screen !== "experience-choice" && hydrated.screen !== "ar-permission",
    "a visitor who shared a story is not returned to the opening gate on reload",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- placement, structurally ---");
// ---------------------------------------------------------------------------
{
  const types = stripComments(read("lib/kameleon/types.ts"));
  const page = stripComments(read("app/experience/kameleon/(gated)/page.tsx"));
  const capture = stripComments(read("components/kameleon/testimonials/TestimonialCapture.tsx"));

  check(
    types.indexOf('"experience-choice"') < types.indexOf('"ar-permission"'),
    "experience-choice is declared BEFORE ar-permission in the screen union",
  );

  // The reward must belong to the AR path alone. Checked by proximity to the
  // AR callback rather than by mere absence, so moving the call somewhere else
  // in the file does not quietly pass.
  const rewardCalls = page.match(/unlockKameleonReward\([^)]*\)/g) ?? [];
  check(rewardCalls.length > 0, "the AR path still awards a reward");
  // BLOCK-ACCURATE, not proximity-based. An earlier version looked 600
  // characters past <TestimonialCapture> and matched the reward call inside
  // the NEXT case - a false failure that reads exactly like a real leak, and
  // in the opposite situation would have read exactly like a real pass.
  const testimonialCase = /case "testimonial-capture":[\s\S]*?(?=\n {6}case ")/.exec(page);
  const arCase = /case "ar-permission":[\s\S]*?(?=\n {6}case ")/.exec(page);
  check(testimonialCase !== null, "the testimonial case block was located");
  check(arCase !== null, "the AR case block was located");
  check(
    testimonialCase !== null && !/unlockKameleonReward/.test(testimonialCase[0]),
    "no reward is unlocked anywhere in the testimonial branch",
  );
  check(
    arCase !== null && /unlockKameleonReward\("ruby_portal"\)/.test(arCase[0]),
    "the AR branch still awards ruby_portal, so the check above is not passing by absence",
  );

  check(
    /onContinueToJourney=\{\(\) => dispatch\(\{ type: "TESTIMONIAL_SUBMITTED" \}\)\}/.test(page),
    "TESTIMONIAL_SUBMITTED is dispatched from the success screen's own button",
  );
  check(
    !/onSubmitted|TESTIMONIAL_SUBMITTED/.test(
      capture.slice(0, capture.indexOf('step === "submitted"')),
    ),
    "the capture component never advances the journey on its own before the success screen",
  );

  // The three ways on, in the order the brief fixes.
  const successBlock = /step === "submitted"[\s\S]*?step === "blocked"/.exec(capture);
  check(successBlock !== null, "the success screen block was located");
  if (successBlock) {
    const block = successBlock[0];
    check(
      block.includes("Continue to Journey"),
      "the success screen offers Continue to Journey",
    );
    check(
      block.includes("View Stakeholder Gallery"),
      "the success screen offers View Stakeholder Gallery",
    );
    check(
      block.includes("Return to experience choices"),
      "the success screen offers a way back to the experience choices",
    );
    check(
      block.indexOf("Continue to Journey") < block.indexOf("View Stakeholder Gallery") &&
        block.indexOf("View Stakeholder Gallery") < block.indexOf("Return to experience choices"),
      "they appear in the order the flow fixes: Journey, Gallery, back",
    );
    check(
      /onClick=\{onContinueToJourney\}/.test(block),
      "only the explicit button advances the journey",
    );
    check(
      !/published|is live|now in the Gallery/i.test(block),
      "the success screen never claims the submission is published",
    );
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
