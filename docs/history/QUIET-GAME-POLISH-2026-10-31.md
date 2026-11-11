# Quiet game polish — 31 October 2026

Owner brief: tighten the ten agreed areas, keep the screen sparse, add two tiny playful touches,
then publish. Built in the isolated `polish/quiet-game-feel` worktree from deployed `e5c834d6`.

| Area | Result |
|---|---|
| Turn handoff | Existing YOUR TURN display gets the cockpit's single 500ms opacity pulse. Removed the screen-wide edge overlay. Tutorial/replay gates and reduced motion stay intact. |
| Disabled controls | Opponent-turn context control names the actual reason through its existing accessible label/title. No persistent new caption. |
| Consistent key feedback | Shared native press owns compression. Legacy CSS fallback no longer multiplies its scale. IME composition does not trigger a visual key press. Existing focus and hit areas remain. |
| Own Territory | Existing mine edges have more static weight; existing ivory perimeter stays. Spoken tile labels reuse the same ownership/name/level helper as the selection bar. No extra geometry. |
| Camera memory | Deliberate Territory views survive leaving/returning and reload. Versioned, validated optional storage; live aspect and bounds still govern restoration. Writes happen at lifecycle boundaries, not per pointer event. |
| Asynchronous sorting | Actual moves lead unseen history; earlier authoritative deadlines lead later ones, with activity order as the tie-breaker. No timer/deadline rule changes. |
| Keyboard-facing sheets | Account and Territory challenge sheets share visual-viewport sizing and safe-area padding, with contained scrolling on short screens. The board's app-height system is separate. |
| Connection feedback | The existing single status lane distinguishes Offline and Reconnecting. Successful sync quietly restores its ordinary content; no new banner or recovery toast. |
| Interrupted progress | Preserve the existing save-on-commit design. Verify exact-state reload, old-save migrations and online draft persistence through the existing suites; no second save system. |
| Email activation | Game/server implementation stays gated. Owner confirmed SMTP is absent. Added a ready-to-paste code template and exact operator checklist in EMAIL-ACCOUNTS.md; real delivery requires external Supabase setup. |

Two playful details use existing marks, never new controls or text:

- The quick-phrase speech glyph gives a tiny 150ms hinge/nod when its picker opens.
- A picked Territory colour chip gives a tiny 150ms compression/settle, then rests.

Both are finite, interruptible/suppressed under reduced motion, and add no background loops,
network subscriptions, dependencies or game-state mutations. Future controls must reuse the native
press, shared motion durations and shared sheet sizing; see VISUAL-CONVENTIONS.md.

Verification results and the release commit are recorded in the final handoff after checks finish.

## Completed local verification

- TypeScript and 90 focused unit checks passed. Dependencies match the existing lockfile; no
  package or lockfile changes. Hosted CI uses a fresh `npm ci`.
- Email account browser: 25 checks, including keyboard viewport, recovery, cancellation and
  old-server compatibility. Supabase delivery is simulated, not a production mail test.
- Two-authenticated-client match chat: 87 checks, including finite glyph motion, one native
  key depth, cancelled drag, IME, reduced motion, reconnection and phone/desktop screenshots.
- Territory challenge browser: 164 checks, including the shared keyboard-facing sheet at three
  narrow phone sizes. Gesture suite: 19 checks, with actual Chromium touch input.
- 4× CPU smoothness probe: pan/pinch p95 33ms, within the unchanged 34ms budget; tap response 23ms.
  Idle sampling reported zero layout/recalc/script work per second. An unchanged map refresh kept
  its DOM. Final removal of redundant button-only transforms adds no map work.
- Critical browser: 883 cockpit, 3,479 pile-layout and 225 gameplay checks passed, including exact
  state restoration after reload. Existing old-save migration and online draft tests remain intact.
- Both production builds and asset isolation passed: futa04 100 files; futa05 101 files.
- Actual phone Territory/account and desktop chat screenshots were inspected.

The full `npm run check`, final Territory press regression, installed-app viewport check and hosted
CI/deployment outcomes are confirmed in the release handoff. Do not infer deployment from a push.
Physical iPhone testing and real production email delivery remain unverified. No server deployment,
SMTP secret, enable flag or migration was changed by this batch.

Final browser milestone: Territory menu 69 checks passed, including the last native-key cleanup,
exact camera restoration on return/reload and both playful details' finite/reduced-motion policy.
Installed-app viewport, Safari isolation, resize and desktop composition passed. The feature branch
is committed at this green browser/typecheck milestone; production promotion waits for both the
remaining local full-suite run and exact-commit hosted CI. The deployment workflow retains its gate.
