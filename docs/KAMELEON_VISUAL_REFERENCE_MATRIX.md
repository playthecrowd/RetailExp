# Kameleon Visual Reference Matrix

Authoritative visual source-of-truth mapping for the Kameleon mobile
experience. Built from direct inspection of the 11 approved screenshots in
`docs/design-reference/`. This file is updated every time the implementation
is compared against the approved references (see Phase 3 correction record in
`docs/RETAILEXP_PHASE_TRACKER.md`).

Visual priority order for every implementation decision:
1. Approved numbered screenshot
2. Explicit functional corrections on record
3. Existing Kameleon design tokens
4. Reasonable responsive adaptation

No approved screenshot is used as a literal image asset in the app. All
imagery is recreated in code (CSS/SVG/Canvas) since no licensed photography or
AI-generated imagery is available (see Phase 0/3 records — no paid/AI
generation service may be used).

---

## 01 — Tap to Begin
**File:** `01-tap-to-begin.png`
**Application state:** Kameleon Mobile State #1 — Tap to Begin
**State-machine state:** `tap-to-begin`
**Main layout:** Single full-bleed vertical composition, content vertically centered with generous top/bottom breathing room, everything center-aligned.
**Header:** None — no progress indicator on this screen.
**Background treatment:** Near-black leather/reptile-textured background; blue directional light glow on the left edge, red/copper directional light glow on the right edge, both radiating inward and fading to black at center-top and bottom.
**Primary imagery:** Centered premium bottle product shot — dark glass, textured reptile-skin label wrap that itself blends blue (left) into red (right), copper foil cap ring, small Kameleon emblem (stylized armadillo/pangolin line-art) above the wordmark, "KAMELEON" wordmark in bold copper metallic letters, "RED BLEND · MACODOCNES" in small copper caps beneath the label.
**Typography hierarchy:** 1) Kameleon emblem (icon) 2) "KAMELEON" — large, bold, wide letter-spacing, copper gradient metallic fill 3) "EVERY POUR IS A TRANSFORMATION." — small, thin, wide-tracked, muted copper/tan, all caps 4) "FOUR CITIES. FOUR LIVES. ONE MOMENT. ONE CONNECTION." — small, muted white/tan, centered, two-line 5) Button label — bold caps.
**Exact visible copy:**
- "KAMELEON"
- "EVERY POUR IS A TRANSFORMATION."
- "FOUR CITIES. FOUR LIVES."
- "ONE MOMENT. ONE CONNECTION."
- "TAP TO BEGIN YOUR JOURNEY"
- "Bottle connected"
**Buttons and controls:** One large pill/rect button, thin copper 1px outline (not filled), transparent/near-black interior, bold copper caps label, full-width with side margins. Below it, a small NFC "radio wave" glyph + "Bottle connected" caption, centered, low-emphasis.
**Progress indicator:** None.
**Colors:** Background `#0a0908`-class near-black. Copper metallic gradient (`#c08552`→`#e3b583` range) for wordmark/button text. Blue accent glow ~`#2e5c8a`. Red accent glow ~`#b23a3a`.
**Borders:** Button has a thin (~1px) copper outline, not filled.
**Shadows:** Soft ambient bottle contact shadow beneath the product; large soft glow "shadows" (colored light blooms) rather than hard drop shadows.
**Gradients:** Two large radial/directional color blooms (blue left, red right) bleeding into the black background; metallic copper gradient on wordmark and label typography.
**Red-light usage:** Right-side ambient glow behind/around the bottle; red tint on the right half of the bottle label texture.
**Blue-light usage:** Left-side ambient glow behind/around the bottle; blue tint on the left half of the bottle label texture.
**Copper treatment:** Wordmark, emblem line art, tagline text, button outline and label, NFC icon — all copper/metallic tone, never solid flat orange.
**Mobile behavior:** Single column, no horizontal elements; button is full-width with margin; content never needs to scroll on a normal phone viewport.
**Animation expectations:** Restrained — plausible subtle glow pulse or bottle micro-parallax; nothing described as essential motion. A static composition is acceptable per "restrained animation" brand guidance.
**Accessibility adaptation:** Button must remain a real `<button>`, min 44px touch target, focus-visible ring; copper-on-black contrast must be verified (checked in Phase 1, passes AA).
**Current implementation match:** Partial. Wordmark, tagline, and button text/behavior are correct. No bottle imagery, no directional red/blue glow, no NFC/"Bottle connected" indicator, no emblem icon.
**Differences found:** Missing all primary imagery (bottle, red/blue directional lighting, emblem icon, NFC indicator). Current button is filled copper, not outlined.
**Required corrections:** Add an SVG/CSS-composed bottle silhouette with copper/red/blue gradient treatment; add left-blue/right-red radial glow layers; add emblem line-art icon; add outlined button variant; add "Bottle connected" affordance (labeled honestly as a mock/demo indicator, not a real NFC read).
**Verification status:** CORRECTED — see Phase 3 correction pass (rebuilt `TapToBegin.tsx` with SVG bottle + glow layers + emblem + outline button + mock "Bottle connected" indicator).

---

## 02 — Commercial Video
**File:** `02-commercial-video.png`
**Application state:** Kameleon Mobile State #2 — Commercial Video
**State-machine state:** `commercial`
**Main layout:** Full-bleed vertical video frame; top wordmark; 2×2 grid of character portraits filling the frame; center circular pause control; title block below the grid; bottom transport bar; gated CTA beneath the frame; step caption beneath that.
**Header:** "KAMELEON" wordmark centered at the very top, small caps, copper.
**Background treatment:** Four individual portrait/character photos tiled 2×2 (each person on a rainy nighttime city balcony), very dark/moody grade.
**Primary imagery:** Four different people (one per city) each on their phone against a nighttime skyline, labeled by city under each portrait.
**Typography hierarchy:** 1) "KAMELEON" wordmark (top) 2) City labels (small caps, under each portrait) 3) "THE PERFECT POUR" — large serif/display copper headline 4) "Four cities. Four lives. One moment." — small muted subhead 5) transport timestamps 6) CTA button label 7) step caption (smallest, muted).
**Exact visible copy:**
- "KAMELEON"
- "ATLANTA" / "CHICAGO" / "NEW YORK" / "LOS ANGELES"
- "THE PERFECT POUR"
- "Four cities. Four lives. One moment."
- "00:18 / 00:30"
- "CONTINUE TO AR" (with lock glyph)
- "Commercial • Step 1 of 4"
**Buttons and controls:** Center circular pause glyph over the video. Bottom transport row: elapsed/duration readout (left), inline scrub bar, captions toggle, sound toggle, fullscreen toggle (right-aligned icon trio). Below the frame: full-width outlined CTA button with trailing lock icon when incomplete. Below that: small muted step caption.
**Progress indicator:** A copper-filled horizontal scrub/progress bar inline in the transport row (not a separate stepper on this screen — the stepper appears on screens 03/04 only).
**Colors:** Near-black frame, warm amber/copper transport text, copper progress fill, muted tan captions.
**Borders:** CTA button has a thin copper/bronze outline (not solid fill) with rounded corners.
**Shadows:** Vignette darkening at frame edges; no hard drop shadows.
**Gradients:** Subtle vignette gradient darkening toward the frame edges; copper gradient on the progress bar fill.
**Red-light usage:** None prominent on this screen (rainy blue-toned city backdrops).
**Blue-light usage:** Cool blue-toned rainy city backdrops behind each portrait.
**Copper treatment:** Wordmark, headline, transport time text, progress bar, CTA outline/label.
**Mobile behavior:** Full-bleed 9:16 video frame; transport row and CTA stack vertically beneath; step caption last.
**Animation expectations:** Real video playback (simulated here); progress bar animates continuously while playing.
**Accessibility adaptation:** Captions toggle must be a real control; CTA must be genuinely disabled (not just styled) until the completion condition is met; timestamps must use `aria-live` caution (avoid spamming updates to AT).
**Current implementation match:** Good structurally (gate behavior, transport controls, step caption all present and functionally correct, verified in Phase 3 browser testing). Visual gap: no 2×2 character-portrait imagery, CTA button is filled copper not outlined, no "Commercial · Step 1 of 4" typographic treatment matching reference weight.
**Differences found:** Missing primary imagery entirely (portraits/cityscape); button fill vs. outline mismatch; progress-bar color previously red, reference uses copper.
**Required corrections:** Compose a 2×2 CSS/SVG "portrait" grid using abstract silhouette figures + skyline silhouettes (no real photography available) in place of blank gradient; switch progress bar to copper; switch CTA to outlined style to match brand button language used on 01/03.
**Verification status:** CORRECTED — see Phase 3 correction pass (added SVG silhouette 2×2 grid, copper transport styling, outlined CTA).

---

## 03 — WebAR Camera Permission
**File:** `03-webar-camera-permission.png`
**Application state:** Kameleon Mobile State #3 — WebAR Camera Permission
**State-machine state:** `ar-permission`
**Main layout:** Top stepper; centered circular "viewfinder" photo with copper corner brackets; headline; body copy; 3-icon feature row; large filled CTA; secondary link; privacy note.
**Header:** Stepper: "Commercial ✓ • AR Intro (current) • Journey" — checkmark on completed, copper/bold on current, muted on upcoming, thin progress rule under the current item.
**Background treatment:** Black leather/reptile texture, matches screen 01.
**Primary imagery:** Large circular "viewfinder" frame containing a photographic scene (bottle on a table with a blurred nighttime city + a candle) — this is meant to represent "what the camera will see," with copper corner-bracket viewfinder marks (like a camera AF reticle) at 8 points around the circle.
**Typography hierarchy:** 1) Stepper labels (smallest) 2) "BRING THE BOTTLE TO LIFE" — large 2-line copper display headline 3) body copy (muted white, 2 lines) 4) 3 feature captions (tiny, under icons) 5) CTA label (bold caps) 6) "Continue without AR" (copper underline link) 7) privacy note (smallest, muted, with lock glyph).
**Exact visible copy:**
- "Commercial · AR Intro · Journey" (stepper)
- "BRING THE BOTTLE TO LIFE"
- "Point your camera at the Kameleon label to enter the experience."
- "Camera access" / "No app required" / "Nothing is recorded"
- "ALLOW CAMERA & BEGIN AR"
- "Continue without AR"
- "Your privacy matters. Camera is used only for this experience and never recorded."
**Buttons and controls:** One large solid copper CTA button (rounded, brushed-metal texture), one text link below it, 3 icon+label feature chips above.
**Progress indicator:** Horizontal 3-step stepper at the very top (Commercial / AR Intro / Journey).
**Colors:** Copper solid fill on primary CTA (unlike screen 02's outline — confirms outline vs. fill is intentionally different per screen/emphasis); copper outline circles for the 3 feature icons.
**Borders:** Copper circular viewfinder ring with bracket corner marks; thin copper circles around the 3 feature icons.
**Shadows:** Soft ambient shadow under the CTA button (brushed-metal bevel look).
**Gradients:** Subtle copper gradient/sheen on the CTA button (brushed metal); vignette on the leather background.
**Red-light usage:** Faint red rim-light on the bottle inside the viewfinder circle.
**Blue-light usage:** Faint blue rim-light / cool city bokeh inside the viewfinder circle.
**Copper treatment:** Headline, viewfinder ring + corner brackets, feature icon outlines, CTA fill, link text, privacy icon.
**Mobile behavior:** Single column, circular image scales down, all text remains centered and legible at narrow widths.
**Animation expectations:** Corner brackets could pulse subtly to suggest "targeting"; not required to be animated.
**Accessibility adaptation:** Must not request the real camera permission until the button is pressed (explicit functional requirement); feature icons need text labels (already textual, good); link must be a real focusable control.
**Current implementation match:** Good — Phase 3 already got the stepper, headline, 3-feature row, CTA, link, and privacy note right, verified in browser. Visual gap: no viewfinder circular image with corner brackets (currently a plain camera icon in a circle).
**Differences found:** Missing the circular viewfinder scene + corner bracket reticle marks; camera icon alone is a weak substitute.
**Required corrections:** Replace the plain circle+camera-icon with a composed circular "viewfinder" — SVG corner brackets around a CSS-gradient circular scene (bottle silhouette + soft red/blue rim light) standing in for the camera preview.
**Verification status:** CORRECTED — see Phase 3 correction pass (added SVG corner-bracket viewfinder with bottle silhouette + rim lighting).

---

## 04 — Live AR Introduction
**File:** `04-live-ar-introduction.png`
**Application state:** Kameleon Mobile State #7 — Live AR Introduction (Phase 3 = simulated/prototype version of this state; real camera compositing is Phase 5/6)
**State-machine state:** `ar-introduction`
**Main layout:** Full-bleed "camera scene" background; top HUD text; center bottle with 4 orbiting environment portals arranged in a diamond (top-left/top-right/bottom-left/bottom-right); bottom control row (4 icons) + primary CTA.
**Header/HUD:** "KAMELEON" (top, copper caps) then "AR INTRO • 02:18" (timer-style HUD readout) then "MOVE AROUND THE BOTTLE" (instruction, all caps, wide tracking).
**Background treatment:** Blurred nighttime rooftop-lounge interior behind the bottle (warm interior lighting, city view through windows) — this stands in for "what the live camera sees."
**Primary imagery:** Center bottle (same product shot as screen 01) wrapped in swirling red particle/energy trails; 4 circular "portal" rings orbiting the bottle, each containing a miniature city skyline photo and labeled ATLANTA / CHICAGO / NEW YORK / LOS ANGELES, each ring lit with a warm copper/red glow.
**Typography hierarchy:** 1) "KAMELEON" 2) "AR INTRO • 02:18" (monospace-ish HUD readout) 3) "MOVE AROUND THE BOTTLE" 4) 4 city ring labels 5) 4 control icon captions 6) "ENTER THE JOURNEY" CTA.
**Exact visible copy:**
- "KAMELEON"
- "AR INTRO · 02:18"
- "MOVE AROUND THE BOTTLE"
- "ATLANTA" / "CHICAGO" / "NEW YORK" / "LOS ANGELES"
- "SOUND" / "CAPTIONS" / "RESET" / "HELP"
- "ENTER THE JOURNEY"
**Buttons and controls:** 4 circular icon buttons in a row (Sound, Captions, Reset, Help), each icon-over-label; one large pill CTA with a curved copper accent stroke along its trailing edge ("Enter the Journey").
**Progress indicator:** None separate — the "AR INTRO • 02:18" HUD readout functions as an implicit in-scene timer, not a stepper.
**Colors:** Warm interior background; red-dominant particle/portal glow; copper ring labels and controls.
**Borders:** Thin copper/red glowing ring borders around each portal.
**Shadows:** None hard; ambient glow blooms instead.
**Gradients:** Radial red glow bleeding from the bottle outward through the particle trails; soft warm-to-dark vignette on the background photo.
**Red-light usage:** Dominant — the wine-particle trails and portal ring glows are primarily red/warm copper.
**Blue-light usage:** Minor — faint cool highlights in the background city-through-window glass, subtle blue accents in a couple of window reflections. Red clearly dominates this screen (unlike screen 01 which is balanced red/blue).
**Copper treatment:** HUD text, "MOVE AROUND THE BOTTLE" label, ring labels, control captions, CTA accent stroke.
**Mobile behavior:** The 4 portals must reposition/scale to stay within a narrower viewport without overlapping the bottle or each other; controls row must not wrap awkwardly.
**Animation expectations:** Explicitly animated — particle trails swirling around the bottle, portals gently pulsing/orbiting. This is the single most animation-heavy screen in the whole flow, and per the correction request must not be static/blank/text-only.
**Accessibility adaptation:** `prefers-reduced-motion` must meaningfully calm the particle animation (not just globally disable via the blanket CSS rule already in place — the effect should degrade gracefully to a static glow); all controls need accessible labels (already using icon+text, good); this screen must clean up any animation frame loop / interval on unmount.
**Current implementation match:** Weak — Phase 3 shipped this as 4 plain outlined circles with text labels and no bottle, no particles, no camera-scene background, no HUD styling. This is the correction request's strongest complaint ("does not display the expected graphics") and is the top visual priority to fix.
**Differences found:** No bottle centerpiece, no particle animation, no camera-scene backdrop, no ring imagery (just outlined text circles), no HUD-style header treatment, "Exit AR" control shown but not in the approved control set for this screen (approved set is Sound/Captions/Reset/Help + Enter the Journey — Exit AR is an app-level affordance, not shown here).
**Required corrections:** Full rebuild — Canvas or CSS-driven particle-trail animation around an SVG bottle centerpiece, 4 photographic-style portal rings (CSS-composed skyline gradients since no real photography is available), HUD-style header, proper control row styling, animation cleanup on unmount, reduced-motion fallback to a calm static glow.
**Verification status:** CORRECTED — see Phase 3 correction pass (`ArIntroduction.tsx` rebuilt with Canvas particle system + SVG bottle + composed portal rings + HUD header; cleans up its animation frame loop on unmount and via visibility-change; degrades to a static composition under `prefers-reduced-motion`).

---

## 05 — Quick Account Gate
**File:** `05-quick-account-gate.png`
**Application state:** Kameleon Mobile State #10 — Quick Account
**State-machine state:** `quick-account`
**Main layout:** Full-bleed background photo; top stepper; centered emblem + headline + subhead; a dark glass form panel roughly centered/lower; sign-in link beneath the panel.
**Header:** Stepper: "Commercial ✓ • AR ✓ • Your Journey (current, with a red progress underline)".
**Background treatment:** Blurred rooftop dinner-table scene at night (wine glasses in foreground bokeh, city skyline behind) — the same "world" as screens 01/03/07.
**Primary imagery:** Kameleon emblem line-art (armadillo/pangolin icon) above the headline; two out-of-focus wine glasses flank the form panel left/right.
**Typography hierarchy:** 1) stepper 2) emblem icon 3) "SAVE YOUR PLACE IN THE STORY" — large copper display headline, 2 lines 4) subhead (muted, 2 lines) 5) field labels 6) button label 7) divider "or" 8) OAuth button labels 9) legal microcopy 10) sign-in link.
**Exact visible copy:**
- "Commercial · AR · Your Journey"
- "SAVE YOUR PLACE IN THE STORY"
- "Create a quick account to choose your path, save progress, and return anytime."
- "Email address"
- "Create password"
- "I'm 21 or older"
- "CONTINUE THE EXPERIENCE"
- "or"
- "Continue with Apple" / "Continue with Google"
- "By continuing, you agree to our Terms of Service and acknowledge our Privacy Policy."
- "Already have an account? Sign in"
**Buttons and controls:** Solid copper CTA (rounded rect); two outlined dark OAuth buttons with brand glyphs; a small eye-icon password-reveal toggle inside the password field; a checkbox.
**Progress indicator:** Same 3-step stepper pattern as screen 03, now on step 3 with an added thin red accent underline beneath the current label (a detail not present on screen 03 — screen 03's current step doesn't show a colored underline, screen 05's does).
**Colors:** Dark glass panel background (semi-opaque near-black over the photo), copper field labels/borders, copper CTA fill, light gray legal text, copper link color.
**Borders:** Thin copper 1px borders on both input fields; the form panel itself has a soft copper-tinted rounded border.
**Shadows:** Soft panel drop shadow separating it from the background photo.
**Gradients:** Panel background is a translucent dark gradient (darker at the bottom) over the photo, so the photo is only faintly visible through it — mostly opaque.
**Red-light usage:** Small red accent underline beneath "Your Journey" in the stepper (the only red on this screen).
**Blue-light usage:** None prominent (background photo is warm-toned here, unlike screens 01/09).
**Copper treatment:** Emblem, headline, field borders/labels, CTA, link text.
**Mobile behavior:** Panel is full-width with side margins; OAuth buttons stack full-width beneath the divider.
**Animation expectations:** None required; static form.
**Accessibility adaptation:** Real labels already present (`<label htmlFor>`); disabled OAuth buttons need a discoverable reason, not just a native `title` tooltip (add visible/aria-describedby text, since `title` alone is not reliably accessible).
**Current implementation match:** Good structurally — Phase 3 already has the emblem, headline, subhead, fields, checkbox, CTA, disabled OAuth buttons with explanation text, and mock-auth disclosure, verified in browser. Visual gap: no background photo/panel treatment (flat solid background instead of dark-glass-over-photo), no red accent underline on the current stepper item, no "Sign in" link.
**Required corrections:** Add a composed background scene (skyline + soft bokeh glow dots via CSS/SVG) behind a translucent dark form panel; add the red underline accent to the current stepper step (screen-05-specific, not universal); add a "Sign in" link (non-functional in mock phase, clearly labeled).
**Verification status:** CORRECTED — see Phase 3 correction pass.

---

## 06 — Choose First Path
**File:** `06-choose-first-path.png`
**Application state:** Kameleon Mobile State #11 — Choose First Path
**State-machine state:** `choose-path`
**Main layout:** Top bar (wordmark left, "Journey · Chapter 1" right) with a thin red progress rule beneath it; large headline block; 4 stacked wide cards (image left ~55%, text right ~45%); bottom tab bar.
**Header:** "KAMELEON" (left) / "Journey · Chapter 1" (right), thin full-width rule with a short red highlighted segment centered under the header.
**Background treatment:** Solid near-black leather texture behind the card list (cards themselves carry the imagery).
**Primary imagery:** Each of the 4 cards has a distinct cinematic interior/exterior photo: library/lounge (Private Pour), rooftop party string-lights (Social Shift), painter's studio/loft (Create), sunset skyline terrace (Arrive). Each card also has a colored accent bar on its far-left edge (red for some, blue for others) and a copper circular line-icon (decanter+glass / two clinking glasses / paintbrush / firework-burst) at the top of the text column.
**Typography hierarchy:** 1) header wordmark + breadcrumb 2) "WHERE WILL THE NIGHT TAKE YOU?" large copper display headline 3) subhead (muted) 4) card title (copper, bold, caps) 5) card description (muted white, 2-3 words per line style, e.g. "Reflection. Reset. Breathe.") 6) duration caption (small, with clock glyph) 7) bottom tab labels.
**Exact visible copy:**
- "KAMELEON" / "Journey · Chapter 1"
- "WHERE WILL THE NIGHT TAKE YOU?"
- "Choose a world. Your decision shapes what happens next."
- "PRIVATE POUR" / "Reflection. Reset. Breathe." / "4 min"
- "SOCIAL SHIFT" / "Connect. Share. Belong." / "4 min"
- "CREATE" / "Imagine. Inspire. Build." / "4 min"
- "ARRIVE" / "Celebrate. Elevate. Arrive." / "4 min"
- "JOURNEY" / "PATHS" / "PROFILE" (bottom tabs)
**Buttons and controls:** Each card is a large tappable row ending in a copper circular arrow-forward glyph. Bottom tab bar with 3 icon+label destinations, first one ("Journey") highlighted red/active.
**Progress indicator:** Thin horizontal rule under the header with a short bold red segment centered — a minimalist single-chapter progress mark, not a full stepper.
**Colors:** Card bodies near-black; left accent bar alternates red/blue per card (Private Pour = red accent, Social Shift = blue accent, Create = red accent, Arrive = blue accent — alternating, not tied to actual content meaning); copper text and icon strokes throughout.
**Borders:** Each card has a thin copper-toned rounded border; a colored (red/blue) vertical accent strip on the card's leading edge.
**Shadows:** Minimal; cards are visually separated mainly by spacing and border, not heavy shadow.
**Gradients:** Photo-to-black gradient fade at the right edge of each card's image half, blending into the text column.
**Red-light usage:** Accent strip on alternating cards; active bottom-tab icon/label.
**Blue-light usage:** Accent strip on the other alternating cards.
**Copper treatment:** Headline, card titles, icons, duration captions, arrow glyphs.
**Mobile behavior:** Cards stack full-width vertically (already the natural mobile layout); at very narrow widths the image portion should not disappear — it must remain visible above/beside the text, never cropped to zero width.
**Animation expectations:** None required beyond standard hover/press feedback.
**Accessibility adaptation:** Whole card must be one focusable/activatable control (already true — button element); duration and 360° info should be in the accessible name or adjacent text, not conveyed by icon color alone.
**Current implementation match:** Weak on imagery — Phase 3 cards are plain text rows with no image, no accent bar, no icon glyph, matching the correction request's complaint #3 exactly ("no visual artwork"). Structure (title/description/duration/arrow) and behavior are correct.
**Differences found:** No card imagery, no colored accent strip, no per-pathway icon glyph, no bottom tab bar, no red progress rule under the header.
**Required corrections:** Add a CSS/SVG "scene" per card (distinct gradient + simple silhouette motif per pathway: bookshelf lines for Private Pour, string-light dots for Social Shift, easel silhouette for Create, sunset skyline for Arrive), alternating red/blue accent strip, per-pathway copper icon glyph (reuse/extend existing icon set), add the thin red progress rule, and add the bottom tab bar (Journey/Paths/Profile — Journey active) as real (if partially inert in mock phase) navigation.
**Verification status:** CORRECTED — see Phase 3 correction pass.

---

## 07 — Selected Path Preview
**File:** `07-selected-path-preview.png`
**Application state:** Kameleon Mobile State #12 — Selected Path Preview
**State-machine state:** `selected-path-preview`
**Main layout:** Full-bleed cinematic background photo (top ~65% of screen) fading into a solid dark panel at the bottom (~35%) that holds text + CTA.
**Header:** Back arrow (top-left), "KAMELEON" centered, "Chapter 1 of 4" centered beneath it — small, muted.
**Background treatment:** Full-bleed photo of a moody library/lounge at night with a city view through the window (the "Private Pour" environment), fading via a bottom gradient into solid near-black where the text panel sits.
**Primary imagery:** The environment photo itself (bottle + wine glass on a table in the foreground of the lounge scene) plus a copper circular line-icon (decanter + glass) positioned at the seam between photo and text panel.
**Typography hierarchy:** 1) header wordmark/breadcrumb 2) icon 3) "PRIVATE POUR" — large copper display title 4) description (muted, 2 lines) 5) meta line "360° EXPERIENCE • 4 MIN • HEADPHONES RECOMMENDED" (small caps, red bullet separators) 6) CTA label 7) "Choose another path" link 8) autosave caption.
**Exact visible copy:**
- "KAMELEON" / "Chapter 1 of 4"
- "PRIVATE POUR"
- "A space for clarity. Reflection. Reset. Breathe."
- "360° EXPERIENCE • 4 MIN • HEADPHONES RECOMMENDED"
- "Step away from the noise and discover what becomes visible in stillness."
- "BEGIN PRIVATE POUR"
- "Choose another path"
- "Autosaved 2m ago"
**Buttons and controls:** Back arrow icon button (top-left, no label); one solid copper CTA (rounded, brushed texture matching screen 03's button); one text link beneath it; small checkmark + caption at the very bottom.
**Progress indicator:** "Chapter 1 of 4" plain text, not a graphical stepper on this screen.
**Colors:** Copper title/CTA, small red bullet dots in the meta line, muted white body text, dark panel with soft gradient into the photo above.
**Borders:** None prominent besides the button's rounded shape.
**Shadows:** Soft shadow where the photo meets the panel (gradient does most of the separation work).
**Gradients:** Photo fades to solid black via a vertical gradient roughly in the lower third.
**Red-light usage:** Small red bullet separators in the meta line only.
**Blue-light usage:** Ambient cool tones in the background photo's city-window view.
**Copper treatment:** Icon, title, CTA, link.
**Mobile behavior:** Photo area and panel both scale naturally in a single column; back arrow stays reachable near the top-left safe area.
**Animation expectations:** None required.
**Accessibility adaptation:** Back arrow needs an accessible label (already implemented); autosave status text should not require sight-only checkmark to be understood (it already has adjacent text, good).
**Current implementation match:** Good structurally, verified working in browser (chapter number, title, description, meta line, CTA, choose-another-path, saved indicator all present and correctly data-driven). Visual gap: no background photo/environment scene, generic centered layout instead of the photo-panel split composition, initial letter instead of a proper icon glyph.
**Differences found:** Missing environment imagery entirely; layout is center-stacked rather than photo-top/panel-bottom; icon is a bare initial letter, not a line-art glyph.
**Required corrections:** Add a per-pathway composed background scene (reusing the same motif system as screen 06's cards, enlarged) in the top portion with a gradient fade into a solid panel; swap the initial-letter icon for a proper matching line-art glyph; adjust vertical composition to match the photo/panel split.
**Verification status:** CORRECTED — see Phase 3 correction pass.

---

## 08 — 360° Video Player
**File:** `08-360-video-player.png`
**Application state:** Kameleon Mobile State #13 — 360-Degree Video Player
**State-machine state:** `video-player` (continuous — see Phase 3 correction: this screen and screen 09 are now one persistently-mounted component)
**Main layout:** Full-bleed environment video frame; top overlay bar (back arrow, title/breadcrumb, 360° badge); center play/pause circle; inline caption card; bottom transport (scrub bar, 4 control icons); "move to look around" hint; exit link.
**Header:** Back arrow (left) · "PRIVATE POUR / Chapter 1 • Scene 2" (center, two lines) · "360°" badge in a circle (right).
**Background treatment:** Full-bleed environment photo/video (same lounge scene as screen 07, now populated — bottle, wine glass, leather chair, city window).
**Primary imagery:** The environment scene itself; a thin curved "360 pan" guide line arcing across the top of the frame suggesting swipe range; center circular pause glyph.
**Typography hierarchy:** 1) breadcrumb header 2) "360°" badge 3) inline italic caption line 4) transport timestamps 5) "MOVE YOUR PHONE OR DRAG TO LOOK AROUND" 6) "Exit experience" link.
**Exact visible copy:**
- "PRIVATE POUR" / "Chapter 1 • Scene 2"
- "360°"
- "Sometimes clarity begins when the noise finally stops." (italic inline caption)
- "02:14 / 04:08"
- "1080p"
- "MOVE YOUR PHONE OR DRAG TO LOOK AROUND"
- "Exit experience"
**Buttons and controls:** Center circle pause glyph; bottom row: sound icon, captions icon (CC box), quality label ("1080p"), fullscreen icon, a 360°/orbit icon (5 icons total, more than screen 02's 3); curved directional arrows flanking the "move to look around" hint text.
**Progress indicator:** Copper/red scrub bar inline in the transport row (filled portion copper-red, remainder gray).
**Colors:** Copper/red progress fill, white timestamp text, muted white hint text, translucent dark caption card background.
**Borders:** Thin white/copper ring around the "360°" badge; caption card has a very faint border/translucent fill.
**Shadows:** Vignette darkening toward frame edges.
**Gradients:** Frame vignette; scrub bar has a subtle copper-to-red gradient fill.
**Red-light usage:** Progress bar fill color leans red/copper blend.
**Blue-light usage:** Cool city-window light visible in the background scene itself (environment-dependent, not a UI chrome color here).
**Copper treatment:** Header text, 360° badge ring, quality label, scrub bar.
**Mobile behavior:** All overlay chrome sits on safe-area-respecting margins over the full-bleed frame; hint text must not overlap the transport row.
**Animation expectations:** Curved pan-guide arrows may pulse gently; otherwise standard video playback motion only.
**Accessibility adaptation:** All icon-only controls need labels (already true in `MockVideoPlayer`); the "move to look around" instruction should also be available to users who can't perform the gesture (not blocking any required action — it's flavor guidance, not gating, which is correct).
**Current implementation match:** Good structurally and functionally (verified extensively in browser: loading/ready/error/replay/seek/mute/captions/fullscreen/360° badge/hint text all present and correct). Visual gap: background is a flat gradient placeholder (honestly labeled), not a composed environment scene; only 4 controls instead of 5 (no explicit quality/orbit indicator).
**Required corrections:** Layer a composed environment-scene background (same motif system as screens 06/07) behind the existing (already-correct) transport chrome; this is primarily a background-art addition, not a control-logic change.
**Verification status:** CORRECTED (background art) — see Phase 3 correction pass. Real 360 touch/orientation panning remains Phase 4 scope per the original master plan and is unchanged by this correction.

---

## 09 — End-of-Video Choice
**File:** `09-end-video-decision.png`
**Application state:** Kameleon Mobile State #14 — End-of-Video Decision
**State-machine state:** No longer a separate state — **overlay inside** `video-player` (this is the Phase 3 correction itself; see failure #4).
**Main layout:** Same full-bleed environment frame as screen 08, now dimmed/darkened, with a checkmark + status line centered above, a large headline, and 2 side-by-side choice cards below, plus a 2-up utility row at the very bottom.
**Header:** Checkmark icon + "PRIVATE POUR COMPLETE" + "1 of 4" (small, centered, replacing the transport chrome from screen 08 while the overlay is active).
**Background treatment:** The same environment frame as screen 08, now behind a dark translucent scrim (final frame still visible, dimmed) — explicitly required by the correction ("Final frame remains visible... dark translucent overlay appears over the video").
**Primary imagery:** Two photographic choice cards: left card shows a doorway opening onto a lit party scene (warm/red-lit), right card shows a balcony/skyline view (cool/blue-lit) — each with a forward-arrow chip in its top-right corner.
**Typography hierarchy:** 1) status line 2) "WHAT DO YOU FOLLOW NEXT?" large copper headline 3) "Your choice changes the story." subhead 4) card title (bold copper caps) 5) card description (muted) 6) destination tag chip (colored, small caps) 7) "Your choice will be saved." micro-copy under each card 8) bottom utility labels.
**Exact visible copy:**
- "PRIVATE POUR COMPLETE" / "1 of 4"
- "WHAT DO YOU FOLLOW NEXT?"
- "Your choice changes the story."
- "FOLLOW THE ENERGY" / "Step through the door and join the gathering." / "SOCIAL SHIFT" tag / "Your choice will be saved."
- "FOLLOW THE VIEW" / "Move toward the skyline and a moment of clarity." / "ARRIVE" tag / "Your choice will be saved."
- "Replay scene" / "View your path"
**Buttons and controls:** Two large tappable cinematic cards, each with a circular forward-arrow chip top-right and a colored destination-tag pill; two secondary utility buttons at the bottom in a 2-up row.
**Progress indicator:** "1 of 4" plain-text chapter counter, matching screen 07's pattern.
**Colors:** Left card has a red-tinted border/tag (matches "left choice = restrained red lighting" from the correction spec); right card has a blue-tinted border/tag ("right choice = restrained blue lighting").
**Borders:** Each card has a colored (red or blue) 1–2px rounded border matching its tag color.
**Shadows:** Cards sit on the dimmed video with a soft separating shadow/scrim.
**Gradients:** Each card photo fades to black at its bottom edge where the title/description sit; the whole scene behind the overlay is scrim-darkened.
**Red-light usage:** Left choice card border/tag/lighting.
**Blue-light usage:** Right choice card border/tag/lighting.
**Copper treatment:** Headline, card titles, checkmark icon, status text.
**Mobile behavior:** Two cards stack full-width vertically on narrow viewports (already effectively single-column in the reference at this aspect ratio); utility row stays 2-up.
**Animation expectations:** Overlay should fade/slide in over the dimmed final frame rather than hard-cutting to a new page — this is the essence of correction #4.
**Accessibility adaptation:** When the overlay is open, focus must move into it and controls behind it (transport chrome) should not be reachable by keyboard/AT until it closes (basic modal-overlay focus discipline) — implemented via a dialog-like role and focus management.
**Current implementation match:** Content-correct but structurally wrong per the new requirement — Phase 3 built this as a full separate page/screen (`EndOfVideoDecision.tsx`) reached by navigating away from the player, rather than an overlay on top of it. This is exactly review failure #4.
**Differences found:** Full navigation away from the player instead of an in-place overlay; no dimmed-video-behind-overlay treatment; no red/left vs. blue/right choice-card color coding; no card imagery.
**Required corrections:** Convert into a `ChoiceOverlay` sub-component rendered conditionally inside the continuous player (`JourneyPlayer`), positioned absolutely over the paused final frame with a scrim; add red/blue color coding by card position (left/right); add composed card imagery (same CSS/SVG motif system).
**Verification status:** CORRECTED — see Phase 3 correction pass (`components/kameleon/ChoiceOverlay.tsx`, rendered inside `JourneyPlayer.tsx`, never navigates to a separate screen).

---

## 10 — Story Path Map
**File:** `10-story-path-map.png`
**Application state:** Kameleon Mobile State #16 — Saved Story-Path Map
**State-machine state:** `story-map`
**Main layout:** Header (back arrow, "KAMELEON", small user avatar) → large headline block → a true vertical node tree (single root, single child, then a two-branch split, then branches rejoining into shared lower nodes) → progress caption → legend row → 2 action buttons → bottom tab bar.
**Header:** Back arrow (left) · "KAMELEON" (center) · circular user avatar photo (right).
**Background treatment:** Solid near-black leather texture.
**Primary imagery:** Each tree node is a small wide card: left half a thumbnail photo (wine pour, decanter, party, sunset skyline, dinner table), right half the node title; nodes are connected by thin copper vertical/curved connector lines; a completion badge (checkmark / filled dot / lock) sits in the top-left corner of each card, overlapping the thumbnail.
**Typography hierarchy:** 1) header 2) "YOUR JOURNEY" large copper display headline 3) subhead 4) node titles (bold copper caps) 5) progress caption ("2 OF 5 CHAPTERS DISCOVERED") 6) legend labels (tiny) 7) button labels 8) bottom tab labels.
**Exact visible copy:**
- "KAMELEON"
- "YOUR JOURNEY"
- "Every choice reveals a different side of the night."
- "THE PERFECT POUR" (completed)
- "PRIVATE POUR" (completed)
- "SOCIAL SHIFT" (current, red-outlined) / "ARRIVE" (available, blue-outlined) — side by side
- "CREATE" (locked)
- "THE TABLE" (locked)
- "2 OF 5 CHAPTERS DISCOVERED"
- "Completed" / "Current" / "Available" / "Locked" (legend)
- "CONTINUE SOCIAL SHIFT"
- "EXPLORE ANOTHER PATH"
- "JOURNEY" / "PATHS" / "PROFILE"
**Buttons and controls:** Full-width red-outlined primary action button (dynamic label — "Continue {current chapter}"), full-width outlined secondary button ("Explore another path"), bottom tab bar (Paths active/highlighted here).
**Progress indicator:** The tree itself is the progress indicator, plus the "2 of 5 chapters discovered" caption and a thin progress rule beneath it (partially filled, copper).
**Colors:** Completed nodes: neutral copper border + checkmark. Current node: red border + filled red dot badge. Available node: blue border + hollow blue dot badge. Locked nodes: neutral/dim border + lock glyph, title dimmed.
**Borders:** Each node card has a colored rounded border per its status (this is the single most important visual signal on this screen).
**Shadows:** None prominent; separation via spacing and connector lines.
**Gradients:** Thumbnail photos fade slightly into the card's dark right half.
**Red-light usage:** Current-node border/badge; primary CTA button border.
**Blue-light usage:** Available-node border/badge.
**Copper treatment:** Headline, node titles, connector lines, completed-node accents, legend icon strokes.
**Mobile behavior:** Tree is a single vertical column (branch nodes sit side-by-side only at the one branch-point row, which still fits two half-width cards side by side at normal phone widths) — this is the exact "vertical tree with a controlled branch row" pattern the correction explicitly requires, not a flat list.
**Animation expectations:** None required; static map.
**Accessibility adaptation:** Provide an accessible ordered-text alternative to the visual tree (explicitly required by the correction request) in addition to the graphical version, for screen-reader users and very narrow viewports.
**Current implementation match:** Wrong structurally — Phase 3 shipped this as a flat vertical list of all 5 environments with no branch/merge visualization and no connector lines, which is exactly review failure #7.
**Differences found:** No tree/branch layout, no connector lines, no thumbnail imagery per node, no user avatar, no bottom tab bar, no progress rule.
**Required corrections:** Rebuild as a true tree renderer driven by the branching data model (root → children → grandchildren, rendering side-by-side siblings at branch rows and single-column otherwise) with SVG connector lines between parent/child cards, composed thumbnail art per node (same motif system), and an accessible ordered-list text alternative alongside the visual tree.
**Verification status:** CORRECTED — see Phase 3 correction pass (`StoryPathMap.tsx` rebuilt around `lib/kameleon/tree-layout.ts`, a generic tree-layout function driven by the new branching data model; includes an `<ol>` text-alternative).

---

## 11 — Journey Completion
**File:** `11-journey-completion.png`
**Application state:** Kameleon Mobile State #17 — Journey Completion
**State-machine state:** `journey-complete`
**Main layout:** Full-bleed rooftop celebration photo (top ~55%) fading to solid black (bottom ~45%) holding emblem, headline, stats, breadcrumb, and 3 action buttons.
**Header:** None (no back arrow/stepper — this is a terminal state).
**Background treatment:** Full-bleed photo of 4 people toasting wine glasses on a rooftop with a combined city skyline behind them, fading via bottom gradient into solid black; small warm particle/sparkle dots scattered over the dark lower area.
**Primary imagery:** The celebration photo; Kameleon emblem + wordmark centered above the headline.
**Typography hierarchy:** 1) emblem + "KAMELEON" 2) "YOUR WORLDS HAVE MERGED" — large 2-line copper display headline 3) subhead (muted, 2 lines) 4) "JOURNEY COMPLETE" pill badge 5) stats row ("4 CHAPTERS • 3 CHOICES • 1 UNIQUE PATH" with large colored numerals) 6) breadcrumb chip row 7) button labels 8) saved-confirmation caption.
**Exact visible copy:**
- "KAMELEON"
- "YOUR WORLDS HAVE MERGED"
- "Four cities. Four lives. One connection—shaped by every choice you made."
- "JOURNEY COMPLETE"
- "4 CHAPTERS • 3 CHOICES • 1 UNIQUE PATH"
- "Private Pour → Social Shift → Create → The Table"
- "EXPLORE A DIFFERENT PATH"
- "REPLAY YOUR JOURNEY"
- "SHARE THE EXPERIENCE"
- "Your progress has been saved."
**Buttons and controls:** Primary button uses a red→blue horizontal gradient fill (the only button in the whole app to blend both accent colors) with the emblem icon inline; two secondary outlined buttons side-by-side beneath it; a text-only share link/button below that.
**Progress indicator:** None (terminal state) — stats row substitutes.
**Colors:** Large stat numerals in copper/red; pill badge outlined copper; gradient primary button (red-left → blue-right).
**Borders:** Pill badge outline; breadcrumb chip outline; secondary button outlines.
**Shadows:** Soft shadow separating the dark panel from the photo.
**Gradients:** Photo-to-black bottom fade; red→blue primary-button fill; scattered sparkle-dot texture over the dark area.
**Red-light usage:** Left half of the primary button gradient; stat numeral color.
**Blue-light usage:** Right half of the primary button gradient.
**Copper treatment:** Headline, emblem, badge, breadcrumb text, secondary button labels.
**Mobile behavior:** Single column; stats row wraps gracefully; breadcrumb chip scrolls or wraps rather than overflowing.
**Animation expectations:** None required; sparkle dots could be a static texture.
**Accessibility adaptation:** The red→blue gradient button needs sufficient contrast for its label text at both ends of the gradient (verify, don't assume).
**Current implementation match:** Good structurally and functionally (verified in browser: stats, breadcrumb, replay/explore/share all working correctly, share uses the real Web Share API). Visual gap: no background photo, no emblem icon, primary button is flat copper rather than the red→blue gradient treatment, no sparkle texture.
**Differences found:** Missing celebration-scene imagery, missing emblem icon, missing signature red→blue gradient CTA, missing sparkle texture.
**Required corrections:** Add a composed celebration-scene background (skyline silhouette + toast-glass motif, CSS/SVG), add the emblem icon component (shared with screens 01/05), switch the primary CTA to the red→blue gradient treatment (verify contrast), add a subtle static sparkle-dot texture over the dark area.
**Verification status:** CORRECTED — see Phase 3 correction pass.

---

## Second review round corrections (2026-08-03)

See `docs/KAMELEON_WALKTHROUGH_REVIEW.md` for the full record. Summary of
what changed in the entries above as a result:

- **§04 (AR introduction):** the intermediate "Ground Scanning" / "Portal
  Placement" screens described in the first-round matrix are **removed**.
  `ar-permission` now leads directly into `ar-introduction`. Confirmed with
  the user that screen 04 depicts one continuous simulated-AR visual (bottle
  + particles + rings), not a placement interstitial.
- **§08/§09 (player + decision):** superseded by a *timed* reveal. The video
  plays to natural completion; a subtle cue appears 10s before the end, a
  bottom handle at 7s, and the full decision drawer rises (over the
  still-playing video, not after a hard stop) at 5s. See
  `components/kameleon/DecisionDrawer.tsx` and
  `lib/kameleon/decision-timing.ts`. Early selections are held until the
  video's natural end (`transitionMode: "atVideoEnd"`, configurable per
  node) rather than cutting playback short.
- **§10 (story path map):** rebuilt from a row/columns layout (which
  produced the rejected horizontal scrollbar) to a recursive, vertically-
  indented tree — see `components/kameleon/screens/StoryPathMap.tsx` and
  `lib/kameleon/tree-layout.ts`. Verified overflow-free at 320–430px widths
  (see Phase 3 correction record in `docs/RETAILEXP_PHASE_TRACKER.md`).
- **Sound design added** across screens 01, 02, 04, 06, 07, and the player/
  drawer — not part of the original 11-screen visual matrix, but tracked
  here since it's part of the same interaction language. See
  `lib/kameleon/sound.ts`.

## Third review round corrections (2026-08-03) — asset integration and navigation

See `docs/KAMELEON_ASSET_MANIFEST.md` for the full asset inventory. Summary
of what changed in the entries above as a result:

- **Real photography replaces the code-composed motif system for screens
  06–11.** The "No approved screenshot is used as a literal image asset"
  statement at the top of this file described the first two rounds only —
  5 real production photos (one per environment: Private Pour, Social Shift,
  Create, Arrive, The Table) were supplied and are now the primary imagery
  on the pathway-selection cards (§06), the selected-path hero (§07), the
  player background (§08/09), the decision-drawer choice thumbnails (§09),
  the story-map node thumbnails (§10), and the journey-completion background
  (§11) — via `components/kameleon/art/EnvironmentArt.tsx`, which now
  renders the real photo (`next/image`, `fill`, per-motif focal point) when
  one exists for a motif and only falls back to the CSS/SVG composition
  described in each entry above when it doesn't. Dedicated 16:9 card and 3:2
  decision-thumbnail crops were requested but not delivered (flagged in the
  asset manifest, not fabricated) — those spots crop the same full-screen
  photo via `object-position` instead.
- **Image-sizing bug found and fixed during this round's own verification:**
  `EnvironmentArt`'s wrapper `<div>` hardcoded a `relative` position class
  that collided with callers passing `className="absolute inset-0"` (e.g.
  §07's hero). Since `lib/cn.ts` does no Tailwind class-conflict resolution,
  `relative` silently won regardless of call-site intent, so the image sized
  itself off its own natural aspect ratio instead of its parent container —
  on §07 specifically this pushed the title/description/CTA content
  entirely off-screen below an oversized image. Fixed by moving `relative`
  to an inner wrapper the caller never touches, and switching the `<Image>`
  from explicit `width`/`height` to `fill` so it always sizes to that
  wrapper regardless of the container shape (`h-64` hero, `aspect-[16/9]`
  cards, `h-10` map thumbnails, `aspect-[3/2]` decision cards, full-bleed
  backgrounds). Re-verified visually across every usage site and at all 6
  required viewport widths (320/360/375/390/414/430px) with zero horizontal
  overflow.
- **"Access AR Experience" bottom-fixed tray** added to the commercial
  screen (§02): a `fixed inset-x-0 bottom-0` action tray that stays hidden
  (`translate-y-8 opacity-0`, `pointer-events-none`) until the commercial
  reaches completion, then slides/fades in, auto-focuses itself, and
  announces availability via an `aria-live="polite"` region — see
  `components/kameleon/screens/CommercialVideo.tsx`.
- **Visible-text "← Back to Pathways" navigation** replaces icon-only back
  buttons on §07 (`SelectedPathPreview`) and §10 (`StoryPathMap`), and on
  §08/09 (`JourneyPlayer`) whenever the viewer hasn't made a choice yet
  (icon-only "back to map" remains once a choice exists, since at that point
  there's an intermediate map state to return to rather than the pathway
  list). All back controls are real `<button>`s with a 44px-minimum touch
  target.
- **Anchor-based section navigation** added to §10 (`StoryPathMap`): a
  "Your Path / Continue" nav row jumps to `#journey-your-path` /
  `#journey-actions` via `scrollIntoView`, respecting
  `prefers-reduced-motion` (falls back to an instant jump instead of
  smooth-scrolling).

## Fourth review round (2026-08-03) — dedicated thumbnail sets

The third round's interim CSS-crop-of-the-full-screen-photo approach for
§06 (pathway cards) and §09 (decision thumbnails) is superseded: dedicated
16:9 (`pathway-thumbnails/`) and 3:2 (`decision-thumbnails/`) crops for all
4 photographed environments arrived and are now used directly wherever they
exist, via `EnvironmentArt`'s new `thumbnailKind` prop — see
`docs/KAMELEON_ASSET_MANIFEST.md` for the full mapping and verification
record. Screens that use the full-screen photo directly (§07, §08/09
background, §10, §11) are unchanged.

## Fifth review round (2026-08-03) — full-bleed pathway intro + compact selection cards

**§07 (Selected Pathway Preview):** the third/fourth-round `h-64` hero-photo
banner (photo confined to a 256px strip, large empty black area below) is
superseded — the photo is now `absolute inset-0` behind the *entire* screen,
with all copy layered over a two-part gradient (vertical black vignette +
subtle warm-red tint) instead of sitting on a separate opaque panel. This is
much closer to the approved reference's actual full-bleed photo-to-panel
composition than either prior round achieved.

**§06 (Choose First Path):** cards are now compact horizontal rectangles
(thumbnail left, info right, left-edge accent) instead of tall stacked
image-on-top cards, so all 4 pathways fit on one screen without scrolling at
every tested viewport. This happens to align more closely with the
originally-approved reference's own left-edge accent-strip detail (noted in
this file's §06 entry from the first review round) than the interim
top-border-accent version shipped in between.

A CSS-grid pitfall worth recording: the first attempt at the compact-card
grid used `grid-rows-[repeat(4,minmax(90px,122px))]`, which overflowed the
viewport by 204px at 320×568 — a `minmax()` floor without a `1fr` component
does not shrink below its minimum no matter how little space is actually
available. Switched to `grid-rows-4` (`minmax(0,1fr)`, no floor) with a
`max-h-32` cap + `self-center` on each card instead, which shrinks safely on
short viewports and caps/centers gracefully on tall ones. See
`docs/RETAILEXP_PHASE_TRACKER.md`'s fifth-round record for the full
verification results.

## Shared elements referenced across multiple screens

- **Kameleon emblem** (stylized armadillo/pangolin line-art icon): appears on screens 01, 05, 11. Now a single shared `<KameleonEmblem />` SVG component.
- **Progress stepper** ("Commercial • AR Intro • Journey"): appears on screens 03, 05 (with an added red current-step underline on 05 specifically — not universal, encoded as a prop).
- **Brushed-copper solid CTA button**: screens 03, 05, 07, 11 (primary action).
- **Thin-copper outlined CTA button**: screens 01, 02 (gated/secondary emphasis).
- **Composed "environment scene" motif** (skyline/interior silhouette + gradient, no real photography): screens 02 (portrait grid), 06 (card thumbnails), 07 (hero background), 08/09 (player background), 10 (node thumbnails), 11 (celebration background). Implemented as one shared, parameterized `EnvironmentArt` component so the same visual language repeats consistently rather than being re-invented per screen.
