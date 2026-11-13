# Blast, Planet sign-in and hardware polish

Baseline: published `f4ba65f5`, with the recent Blitz/presence fixes and performance pass intact.
Branch: `fix/blast-input-planet-login`.

## Changes

- The complete SIGN IN TO GROW message is a native button on a selected empty Planet tile,
  including when a guest has insufficient Seeds or cannot grow there yet. It opens the existing
  account window without changing the selected tile. The no-identity wallet prompt and the
  endgame Planet offer the same real action. No second authentication flow or automatic purchase.
- Tap two different Bombs to select the legal Blast recipe. Both lift together; tapping a held
  Bomb puts the recipe down. The next legal target tap places it under the existing rules.
- Drag the cockpit's displayed recipe, or one from its recipe drawer, onto the board. Blast
  targets one tile and uses the existing affected-area preview. Bloom uses its existing paint
  resolution. Drop legality is re-read from the actual legal actions; stale recipes cannot spend cards.
- A single hand Bomb drag remains a single Bomb. An explicitly selected pair produces Blast.
- The cockpit now displays the selected combination, rather than always the longest recipe.
- Escape cancels a drag without spending cards or also opening the pause menu. Missed drops
  and interrupted gestures keep the existing cancellation and cleanup path.
- Profiles show the display name without an account tag. Identity IDs, public lookup and other
  account uses remain unchanged. The profile label is NAME and its name-fit test is stricter.
- Remove the duplicate presence text in active Blitz. The existing accessible lightning indicator
  continues to communicate opponent availability. Ordinary match presence is preserved.
- Empty duel tiles lose their contour. Gold frames, rock material edges and legal target cues stay.
  Replay/export empty ground follows the same treatment.
- Planet ranking and achievement actions have at least 44px targets with their existing styling.
- The turn rim gains a static smoked-metal bezel, a dark gasket, a recessed lamp channel and four
  shallow side etch marks. It uses the existing projected outline, amber light and immediate turn
  publication. No particles, timer, permanent animation loop, additional blur or dependency.

## Verification

Focused unit checks cover pair selection, stale/missed targets, one-Bomb versus two-Bomb costs,
profile facts and the existing turn/rule contracts. Browser suites added to CI on Chromium and
WebKit: `blast-input`, `blast-input-ios`, `planet-login`, `planet-login-ios`.

`blast-input` drives real touch and mouse gestures at 390x844 and 1440x900. It checks the exact
resulting board, lifted recipe cards, selection toggling, outside drops, Escape cleanup and empty
cell contours. `planet-login` opens the real account sheet on both sizes and retains selection.
The existing two-client online journey now also verifies that Blitz hides the duplicate label
while keeping the lightning control visible.

During development the touch test caught the cockpit key's old `touch-action: manipulation`
which let the browser cancel a drag as scrolling. Only the recipe drag surfaces now opt out of
that browser gesture. Elsewhere scrolling and browser gestures are preserved.

Screenshots stay outside Git. Physical iPhone/Android testing is not available in this environment.
Local Chromium checks and CI WebKit checks must be reported separately from real-device testing.
No engine, server, database migration or authoritative gameplay rule is changed by this pass.

Release: use the existing CI-gated /test/ workflow. Live promotion remains a separate owner action.

## Local evidence before release CI

- Focused checks: 104 passing tests across input, drag, profile, turn-rim and replay-art suites;
  strict typechecks passed. New phone/desktop gesture and login browser suites passed.
- Production futa05 build and asset isolation passed (113 files).
- The older full profile audit has two existing failures on BOTH the untouched published
  `f4ba65f5` and this candidate: its tab-order list omits the current menu Sound key, and its
  uniform-glass check measures a 9.32/255 brightness spread on baseline versus 9.55/255 here
  against its 8/255 limit. Neither assertion is relaxed. New tag removal, full-name fitting,
  profile opening/closing and accessibility checks pass within that audit.
- Local WebKit launch was attempted and failed because the WebKit executable is absent.
  The new iOS suites are required in CI; that does not constitute physical-device testing.
- Full local check and broader release gates are still pending at this commit's creation.

The first full local run passed 4,781 tests and exposed one old source-contract assertion that
still expected the short sign-in key. It now pins the full visible prompt instead, preserving
its restriction that other tile actions remain icons. The complete suite is rerun after this fix.

The endgame browser fixture now finishes a legal surround win, matching the current approved
finish policy (losses show the final board, wins with enough Seeds show the Planet). It records
an already-seen install invitation so that unrelated overlay cannot steal the tested tile tap.
No outcome is mocked and no application rule or finish-window policy is changed.

Future card-skin ownership decisions are recorded separately in `CARD-SKIN-PERSPECTIVE.md`.

The first WebKit run caught the test adapter using Chromium's empty touch-end list. WebKit's
trusted input protocol requires the released point, as in the existing Territory iOS suite.
The adapter now follows that protocol and waits for the actual two-card spend before checking
the exact resulting board. No application behaviour or assertion is bypassed.
