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
  // Continuing returns to the CHOICE, not into the journey. It used to go
  // straight to postOpeningScreen, which dropped the visitor into the journey
  // at the exact moment they most needed to see the submission had landed, and
  // left them with no obvious way to reach AR or submit a second story.
  check(
    submitted.screen === "experience-choice",
    "continuing after a submission returns to the experience choice",
  );
  check(
    submitted.justSubmittedTestimonial === true,
    "the one-time banner flag is set for that return",
  );
  check(
    submitted.progress === createInitialSessionState().progress ||
      JSON.stringify(submitted.progress) === JSON.stringify(createInitialSessionState().progress),
    "journey progress is untouched by a submission",
  );

  // Both choices clear the banner - that is what makes it one-time.
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED", "CHOOSE_AR")
      .justSubmittedTestimonial === false,
    "choosing AR clears the one-time banner",
  );
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED", "CHOOSE_TESTIMONIAL")
      .justSubmittedTestimonial === false,
    "choosing to submit another story clears it too",
  );

  // Both options remain reachable from the returned choice screen.
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED", "CHOOSE_AR").screen ===
      "ar-permission",
    "AR is reachable from the screen a submission returns to",
  );
  check(
    run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED", "CHOOSE_TESTIMONIAL").screen ===
      "testimonial-capture",
    "a second testimonial is reachable too",
  );

  const arDone = run(...base, "CHOOSE_AR", "ENTER_JOURNEY");
  check(arDone.arCompleted === true, "the AR path still marks AR complete");
  check(
    arDone.arCompleted === true && submitted.arCompleted !== true,
    "the two routes remain distinguishable: only AR marks AR complete",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- Continue to Journey: the explicit skip ---");
//
// AR and capture are OPTIONAL. Until this action existed a visitor who wanted
// neither had no way forward at all, because the opening gate is satisfied only
// by AR completion or a submission.
// ---------------------------------------------------------------------------
{
  const base = ["BEGIN", "COMMERCIAL_COMPLETE", "CONTINUE_TO_ACCOUNT", "COMPLETE_ACCOUNT"];
  const skipped = run(...base, "CONTINUE_TO_JOURNEY");

  check(
    skipped.screen === "choose-path",
    "Continue to Journey reaches the existing start of pathway selection",
  );
  check(
    skipped.arCompleted !== true,
    "it does NOT mark AR complete - the visitor declined AR, they did not finish it",
  );
  check(
    skipped.testimonialSubmitted !== true,
    "it does NOT record a testimonial that was never made",
  );
  check(
    JSON.stringify(skipped.progress) ===
      JSON.stringify(createInitialSessionState().progress),
    "journey progress is untouched, so an existing journey resumes as it would have",
  );
  check(
    skipped.justSubmittedTestimonial === false,
    "it clears the one-time submission flag",
  );

  // The same action after a submission, which is where it is the primary
  // recommendation.
  const afterSubmit = run(...base, "CHOOSE_TESTIMONIAL", "TESTIMONIAL_SUBMITTED", "CONTINUE_TO_JOURNEY");
  check(
    afterSubmit.screen === "choose-path",
    "it reaches pathway selection from the post-submission screen too",
  );
  check(
    afterSubmit.justSubmittedTestimonial === false,
    "and clears the flag there as well",
  );
  check(
    afterSubmit.arCompleted !== true,
    "still without marking AR complete",
  );

  // It reuses the established rule rather than hard-coding a destination:
  // a visitor with saved progress lands where the journey rules put them.
  check(
    run(...base, "CHOOSE_AR", "ENTER_JOURNEY").screen === skipped.screen,
    "it lands on the same screen the AR route lands on, because both use the same rule",
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
    /onContinueExperience=\{\(\) => dispatch\(\{ type: "TESTIMONIAL_SUBMITTED" \}\)\}/.test(page),
    "TESTIMONIAL_SUBMITTED is dispatched from the success screen's own button",
  );
  check(
    (page.match(/TESTIMONIAL_SUBMITTED/g) || []).length === 1,
    "there is exactly one dispatch site, so submitting cannot advance by itself",
  );
  check(
    /justSubmittedTestimonial=\{state\.justSubmittedTestimonial\}/.test(page),
    "the choice screen receives the one-time banner flag",
  );
  check(
    !/onSubmitted|TESTIMONIAL_SUBMITTED|onContinueExperience\(\)/.test(
      capture.slice(0, capture.indexOf('step === "submitted"')),
    ),
    "the capture component never leaves the subflow on its own before the success screen",
  );
  // One submit path serves both media types, so the success state cannot
  // differ between a photo and a video.
  check(
    (capture.match(/setStep\("submitted"\)/g) || []).length === 1,
    "photo and video reach the SAME success state through one shared path",
  );

  // The three ways on, in the order the brief fixes.
  const successBlock = /step === "submitted"[\s\S]*?step === "blocked"/.exec(capture);
  check(successBlock !== null, "the success screen block was located");
  if (successBlock) {
    const block = successBlock[0];
    check(
      block.includes("Thank you — your testimonial was submitted for review."),
      "the success screen states plainly that the submission landed",
    );
    check(
      block.includes("Continue Experience"),
      "the primary action is Continue Experience",
    );
    check(
      block.includes("View Stakeholder Gallery"),
      "the Gallery remains reachable as a secondary action",
    );
    check(
      block.indexOf("Continue Experience") < block.indexOf("View Stakeholder Gallery"),
      "Continue Experience is offered first",
    );
    check(
      /onClick=\{onContinueExperience\}/.test(block),
      "only the explicit button leaves the success screen",
    );
    // Cancel would be the wrong word for the only way out of a SUCCESS, and
    // being the only visible action there is exactly what stranded people.
    check(
      !/onCancel/.test(block),
      "Cancel is not offered after a successful submission",
    );
    check(
      !/setTimeout|router\.push|redirect\(/.test(block),
      "nothing redirects on its own - the visitor sees the result first",
    );
    check(
      !/published|is live|now in the Gallery/i.test(block),
      "the success screen never claims the submission is published",
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- the video upload experience ---");
//
// The risk in a progress UI is not that it looks wrong, it is that it claims
// something the code did not measure. These check the honesty properties.
// ---------------------------------------------------------------------------
{
  const cap = stripComments(read("components/kameleon/testimonials/TestimonialCapture.tsx"));
  const bottle = stripComments(read("components/kameleon/testimonials/BottleFillProgress.tsx"));
  const uploader = stripComments(read("components/kameleon/testimonials/upload-with-progress.ts"));

  // --- the destination and finalization path are unchanged ----------------
  check(
    /uploadWithProgress\(\s*destination\.data\.uploadUrl,\s*destination\.data\.fileFieldName,\s*file,/.test(
      cap.replace(/\s+/g, " ").replace(/ /g, " "),
    ) ||
      /uploadWithProgress\([\s\S]{0,120}?destination\.data\.uploadUrl[\s\S]{0,80}?destination\.data\.fileFieldName/.test(
        cap,
      ),
    "video uploads to the SAME one-time destination and field name as before",
  );
  check(
    /const response = await fetch\(destination\.data\.uploadUrl, \{ method: "POST", body \}\)/.test(cap),
    "the photo path still uses the untouched fetch upload",
  );
  check(
    (cap.match(/requestUploadDestinationAction\(/g) || []).length === 1,
    "there is still exactly ONE place a destination is requested",
  );
  check(
    (cap.match(/finalizeTestimonialUploadAction\(/g) || []).length === 1,
    "finalization is still a single shared call for both media types",
  );
  check(
    !/uploadUrl/.test(uploader) || /url: string/.test(uploader),
    "the uploader receives the URL as a parameter and never stores it",
  );
  check(
    !/localStorage|sessionStorage/.test(uploader),
    "the one-time upload URL is never persisted by the uploader",
  );

  // --- a failure can never reach 100% or the success panel -----------------
  check(
    (cap.match(/setUploadPhase\("complete"\)/g) || []).length === 1,
    "there is exactly one place the phase can become complete",
  );
  check(
    cap.indexOf('finalizeTestimonialUploadAction(') < cap.indexOf('setUploadPhase("complete")'),
    "complete is set only AFTER finalization, not after the transfer",
  );
  {
    // Anchored to the failure BRANCHES, not to a slice of the file. The slice
    // form began matching the legitimate `setUploadPercent(100)` that holds
    // the bottle full during finalizing - a correct line failing a check that
    // was aimed at something else entirely.
    const branches = cap.split(/setStep\("blocked"\);/).slice(0, -1);
    check(branches.length >= 4, "the failure branches exist");
    for (const branch of branches) {
      const tail = branch.slice(-320);
      check(
        !/setUploadPhase\("complete"\)/.test(tail),
        "no failure branch sets the completed phase",
      );
    }
    check(
      cap.indexOf('setUploadPercent(100);\r\n      setUploadPhase("finalizing")') > -1 ||
        /setUploadPercent\(100\);\s*setUploadPhase\("finalizing"\)/.test(cap.replace(/\s+/g, " ")),
      "the 100% reading before finalizing is the acknowledged-upload hold, not a failure path",
    );
  }
  check(
    /finalized\.data\?\.state === "failed"[\s\S]{0,220}?setStep\("blocked"\)/.test(cap),
    "a refused finalization is treated as a failure, not as a slow success",
  );

  // --- the number is never invented ---------------------------------------
  // The number is shown in every phase that HAS one. Only `preparing` - two
  // server round trips with nothing to measure - shows dots. The first version
  // withheld the number whenever lengthComputable was false, which is what
  // left the visitor watching dots through an entire upload.
  check(
    /const showNumber = phase !== "preparing";/.test(bottle),
    "the percentage is shown in every phase except preparing",
  );
  check(
    /event\.lengthComputable && event\.total > 0 \? event\.total : file\.size/.test(uploader),
    "the fallback denominator is the FILE'S OWN SIZE - a real byte count, not a guess",
  );
  check(
    /event\.loaded \/ total/.test(uploader),
    "the percentage comes from transferred bytes over a byte total",
  );
  check(
    /Math\.min\(MAX_IN_FLIGHT_PERCENT/.test(uploader) &&
      /MAX_IN_FLIGHT_PERCENT = 99/.test(uploader),
    "in-flight progress is clamped below 100 until the server acknowledges the upload",
  );
  check(
    /if \(ok\) onProgress\(100\)/.test(uploader),
    "only an acknowledged 2xx promotes the transfer to 100",
  );
  check(
    !/Math\.random|setInterval/.test(bottle) && !/Math\.random|setInterval/.test(uploader),
    "nothing simulates progress on a timer",
  );

  // --- accessibility and motion -------------------------------------------
  check(
    /role="progressbar"/.test(bottle) &&
      /aria-valuemin=\{0\}/.test(bottle) &&
      /aria-valuemax=\{100\}/.test(bottle),
    "the progress element carries the required progressbar semantics",
  );
  check(
    /showNumber \? \{ "aria-valuenow": level \}/.test(bottle),
    "aria-valuenow is present exactly when a number is shown",
  );
  check(
    !/phase === "uploading"[\s\S]{0,80}?•••/.test(bottle) &&
      /showNumber \? \([\s\S]{0,400}?\{level\}%/.test(bottle),
    "the uploading phase cannot render the dots-only state",
  );
  check(
    /aria-live="polite"/.test(bottle) &&
      (bottle.match(/aria-live=/g) || []).length === 1,
    "one polite live region, so phase changes announce without repetition",
  );
  check(
    /@media \(prefers-reduced-motion: reduce\)/.test(bottle),
    "prefers-reduced-motion is respected",
  );
  for (const [phase, message] of [
    ["uploading", "Uploading your video…"],
    ["finalizing", "Preparing your testimonial…"],
    ["complete", "Submission complete"],
  ]) {
    check(bottle.includes(message), `the ${phase} phase message is exactly as specified`);
  }

  // --- two layers, and the height IS the percentage ------------------------
  check(
    /const liquidHeight = \(level \/ 100\) \* LIQUID_SPAN;/.test(bottle) &&
      /const liquidY = LIQUID_BOTTOM - liquidHeight;/.test(bottle),
    "the liquid height is computed directly from the percentage",
  );
  check(
    /height=\{liquidHeight\}/.test(bottle) && /y=\{liquidY\}/.test(bottle),
    "that computed height is bound straight to the SVG rect",
  );
  check(
    /url\(#kameleon-base\)/.test(bottle) && /url\(#kameleon-progress\)/.test(bottle),
    "there are TWO distinct fills: a base treatment and a progress liquid",
  );
  check(
    bottle.indexOf("kameleon-base-drift") < bottle.indexOf('className="kameleon-liquid"'),
    "the base layer is painted beneath the progress layer",
  );
  check(
    /rounded-full bg-black\/45/.test(bottle),
    "the readout sits on a contrasting disc, so it stays legible over any liquid colour",
  );
  for (const [phase, message] of [["preparing", "Preparing your upload…"]]) {
    check(bottle.includes(message), `the ${phase} phase message is exactly as specified`);
  }

  // --- video only ----------------------------------------------------------
  check(
    /mediaType === "video" \? \(/.test(cap) && /BottleFillProgress/.test(cap),
    "the bottle renders for video only",
  );
  check(
    /setUploadPhase\("finalizing"\)/.test(cap.slice(cap.indexOf('if (mediaType === "video")'))),
    "the finalizing phase begins when the bytes are gone, not when the server answers",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the media-choice screen and the recorded-video preview ---");
// ---------------------------------------------------------------------------
{
  const cap = stripComments(read("components/kameleon/testimonials/TestimonialCapture.tsx"));
  const thumb = stripComments(read("components/kameleon/testimonials/video-thumbnail.ts"));
  const chooseBlock = /step === "choose"[\s\S]*?step === "permission"/.exec(cap)?.[0] ?? "";

  // --- three actions -------------------------------------------------------
  check(chooseBlock.includes("Take a Photo"), "the choice screen offers Take a Photo");
  check(chooseBlock.includes("Record a Video"), "the choice screen offers Record a Video");
  check(chooseBlock.includes("View Gallery"), "the choice screen offers View Gallery");
  check(
    /href=\{GALLERY_ROUTE\}/.test(chooseBlock),
    "View Gallery uses the shared gated route constant, not a literal path",
  );
  check(
    /Approved stories/.test(chooseBlock),
    "the Gallery action carries supporting copy about approved stories",
  );
  // A LINK, not a read. Mirroring gallery data here would duplicate the
  // publication predicate that must live in exactly one place.
  check(
    !/loadGallery|testimonial_gallery_items|signGalleryDelivery/.test(cap),
    "the capture screen never queries or duplicates Gallery data",
  );

  // --- the recorded-video preview -----------------------------------------
  const previewBlock = /step === "preview"[\s\S]*?step === "caption"/.exec(cap)?.[0] ?? "";
  check(previewBlock.length > 0, "the preview block was located");
  check(
    /extractVideoThumbnail\(nextUrl\)/.test(cap),
    "a local preview frame is extracted from the recorded object URL",
  );
  check(
    /chosen\.type\.startsWith\("video\/"\)/.test(cap),
    "extraction runs for video only - the photo preview is untouched",
  );
  check(
    /src=\{previewUrl\} alt="Your captured photo"/.test(previewBlock.replace(/\s+/g, " ")) ||
      /alt="Your captured photo"/.test(previewBlock),
    "the photo preview still renders the object URL directly",
  );
  check(
    /playingPreview \?/.test(previewBlock),
    "the video element mounts only once the visitor asks to play",
  );
  check(
    /aria-label="Play your recording"/.test(previewBlock),
    "the thumbnail is an accessible play control",
  );
  check(
    /Preview recording/.test(previewBlock) && /Preparing preview…/.test(previewBlock),
    "a failed or pending extraction renders a real surface, never an empty rectangle",
  );
  check(
    previewBlock.includes("Use this") && previewBlock.includes("Retake"),
    "Use this and Retake are both still offered",
  );

  // --- nothing is uploaded or persisted -----------------------------------
  check(
    !/fetch\(|XMLHttpRequest|FormData/.test(thumb),
    "thumbnail extraction performs no network request",
  );
  check(
    !/localStorage|sessionStorage|indexedDB/.test(thumb),
    "the thumbnail is never persisted",
  );
  check(
    /canvas\.toDataURL/.test(thumb) && !/createObjectURL/.test(thumb),
    "the frame is a data URL, so there is no extra object URL to leak",
  );
  check(
    /video\.onseeked/.test(thumb) && /currentTime = target/.test(thumb),
    "the frame is taken AFTER a seek, not from frame zero which is often black",
  );

  // --- retake cleans up ----------------------------------------------------
  {
    const retakeBlock = /function retake\(\)[\s\S]*?\n  \}/.exec(cap)?.[0] ?? "";
    check(retakeBlock.length > 0, "the retake function was located");
    check(
      /URL\.revokeObjectURL\(previewUrl\)/.test(retakeBlock),
      "retake revokes the previous object URL",
    );
    check(
      /setVideoThumb\(null\)/.test(retakeBlock) && /setPlayingPreview\(false\)/.test(retakeBlock),
      "retake discards the previous frame and playback state",
    );
  }
  check(
    /setVideoThumb\(null\);[\s\S]{0,200}?extractVideoThumbnail/.test(cap),
    "a new recording clears the old frame before the new one arrives",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the returned choice screen ---");
// ---------------------------------------------------------------------------
{
  const choice = stripComments(read("components/kameleon/screens/ExperienceChoice.tsx"));

  // The passive banner became a confirmation PANEL with its own actions.
  check(
    choice.includes("Your story was submitted. What would you like to do next?"),
    "the post-submission panel carries the required copy",
  );
  check(
    /justSubmittedTestimonial \?/.test(choice),
    "the panel renders only after a submission",
  );

  // --- all three actions exist in BOTH states ------------------------------
  for (const label of ["Enter AR Experience", "Continue to Journey"]) {
    check(choice.includes(label), `the choice screen offers ${label}`);
  }
  check(
    /Share Your Story/.test(choice) && /Share Another Story/.test(choice),
    "the testimonial action is offered in both states, relabelled after a submission",
  );
  check(
    /\{arAction\}/.test(choice) &&
      /\{testimonialAction\}/.test(choice) &&
      /\{journeyAction\}/.test(choice),
    "no action is removed in either state",
  );

  // --- the recommendation flips, and the ORDER is what carries it ----------
  {
    // Anchored to the rendered tokens, not to a ternary regex: the screen has
    // TWO ternaries on this flag - the confirmation panel and the action order
    // - and a non-greedy match found the panel, which says nothing about
    // which action leads.
    //
    // The submitted branch renders first in the file, the first-visit branch
    // second, so first/last positions read the two orders unambiguously.
    const firstJourney = choice.indexOf("{journeyAction}");
    const firstAr = choice.indexOf("{arAction}");
    const lastAr = choice.lastIndexOf("{arAction}");
    const lastJourney = choice.lastIndexOf("{journeyAction}");
    check(
      firstJourney > -1 && firstAr > -1 && firstJourney < firstAr,
      "after a submission the Journey is offered FIRST, ahead of AR",
    );
    check(
      lastAr > -1 && lastJourney > -1 && lastAr < lastJourney,
      "on a first visit AR leads and the Journey is the explicit skip",
    );
    check(
      firstJourney !== lastJourney && firstAr !== lastAr,
      "both actions really are rendered in both branches",
    );
  }
  check(
    /\{justSubmittedTestimonial && recommendedLabel\}[\s\S]{0,220}?onClick=\{onContinueToJourney\}/.test(
      choice,
    ),
    "Continue to Journey carries the recommendation after a submission",
  );
  check(
    /\{!justSubmittedTestimonial && recommendedLabel\}[\s\S]{0,320}?onClick=\{onChooseAr\}/.test(
      choice,
    ),
    "AR carries it on a first visit, and never both at once",
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
