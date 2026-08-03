# Kameleon Production Visual Asset Pack

These are clean media assets. Text, buttons, controls, gradients, progress indicators, and accessibility labels must be implemented in application code.

## Full-screen backgrounds

| File | Use |
|---|---|
| `fullscreen/private-pour-fullscreen.png` | Private Pour pathway preview and placeholder player poster/background |
| `fullscreen/social-shift-fullscreen.png` | Social Shift pathway preview and placeholder player poster/background |
| `fullscreen/create-fullscreen.png` | Create pathway preview and placeholder player poster/background |
| `fullscreen/arrive-fullscreen.png` | Arrive pathway preview and placeholder player poster/background |
| `fullscreen/journey-completion-fullscreen.png` | Fixed Journey Completion background |

Full-screen masters are 941 × 1672 portrait PNGs. Render with `object-fit: cover` or `background-size: cover`, preserve the focal area, and add a code-based dark gradient for readable UI.

## Pathway-card thumbnails

The four files under `pathway-thumbnails/` are 1200 × 675 (16:9). Use them in the four “Where Will the Night Take You?” pathway cards.

## Decision thumbnails

The four files under `decision-thumbnails/` are 900 × 600 (3:2). Use them as destination previews inside the animated video-choice drawer.

Recommended first Private Pour decision mapping:

- **Follow the Energy** → `decision-thumbnails/social-shift-choice-3x2.png`
- **Follow the View** → `decision-thumbnails/arrive-choice-3x2.png`

For later branches, use the thumbnail for the destination environment rather than the source video.

## Required UI behavior

- Commercial completion must reveal a bottom-fixed **Access AR Experience** action without requiring manual scrolling.
- The pathway view needs a working back button.
- Pathway cards must use the 16:9 thumbnails and match the approved reference composition.
- Pathway previews and placeholder players must use their full-screen background.
- Video decisions must use the destination thumbnails and animate upward over the still-visible player.
- Journey Completion must use the fixed completion background.
- No page-level horizontal scrolling is permitted.

