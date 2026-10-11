# Tutorial Pro screenshot self-review (2026-10-11)

Viewports: 390×844 and 360×780. Files in this folder.

## 390 — chapter 1 goal (`390-ch01-goal.png`)

- Cheap / wonky: thirteen tiny progress dots are hard to read at a glance; the hand still looks busy under the dim.
- Strong: hex-shaped cream glow sits on the tree home; chunky pointer is obvious; glass window copy is short and clear.
- Fix made: chapter menu no longer mounts inside the hidden menu screen (it was invisible); it now overlays `document.body` with glass styling.

## 390 — chapter 2 draw (`390-ch02-draw.png`)

- Cheap / wonky: Draw / Grow / Throw icons are plain text, not the welcome-card icons yet.
- Strong: pill spotlight on the deck, pointer beside it, why line under the instruction.
- Fix made: one target only (deck), not every pile.

## 390 — chapter menu (`390-chapter-menu.png`)

- Cheap / wonky: full-screen list is long on a phone; scrolling is required.
- Strong: all 13 titles, check on completed “Your goal”, Close button.
- Fix made: visible dialog styling and body mount (see above).

## 360 — chapters 2 / 3 / 7

- Cheap / wonky: on 360 the glass window uses more vertical space; buttons wrap.
- Strong: instruction stays readable; spotlight still finds the control.
- Fix made: width capped at `min(420px, 100vw - 24px)` as specified.

## Still rough (for feedback)

1. Does the pointer feel obvious enough next to busy hands?
2. Are thirteen progress dots clear, or should we show “3 / 13” instead?
3. Is the chapter list fine as a full-screen sheet, or should it live inside the small glass window?
