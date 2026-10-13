# Offline vs online — a player-perspective differential audit

**Branch:** `futa0.5-online` · **Date:** 2026-10-13 · **Game:** FUTASAKU
**Offline measured:** local `CHANNEL=futa04` build of this branch (`be6dce7`, `web/dist-audit`, dirty `main.ts`/`index.html` from the concurrent selection worker).
**Online measured:** LIVE `https://severgrow.github.io/severgrow-01/futa0.5/` — `release.json` commit **`d7453e3`** (3 commits behind local HEAD; the live build still has the HUD deadline chip and the strip Resign, i.e. **before** the in-flight HUD trim below).
**Also spot-checked:** live `/futa0.4/` (`release.json` commit `304f891`) for the shipped offline menu.

The owner's instinct is right: the serious bugs so far have all been online/offline *divergences*. This audit drives both games with the same sequences and records what a player would see. It does **not** touch the selection/interaction fix that is being done concurrently (`web/src/online/driver.ts`, `duel-session.ts`, `duel-bridge.ts`, `duel-runtime.ts`, `duel-hud.ts`, `online-css.ts`, `web/src/main.ts`, `player/glass-surface.ts`, `online-*.ts`, `web/tests/*`).

---

## TOP 5 differences a player would notice first

1. **The score bar says a different word online.** Offline reads **You / Opponent**; online reads **Me / Opponent** (`#score-you-label` set to `Me` in `main.ts`). Same bar, different word — a small but constant "this is a different mode" tell. **Accidental-looking wording drift → owner's call (fix is one string).**
2. **End-of-game screen is much thinner online.** Offline: title + score + a full sentence reason + tile breakdown + stats + highlights and *Play again / Change difficulty / Share / See the board / Back to menu*. Online: title + score + a **terse** reason (`Surround.`, `Final score.`, `Resigned.`, `Time ran out.`) and **Back to matches / Menu / Share / See the board / Back to menu**, with the breakdown, stats and highlights **empty**. The online result sentence also loses perspective ("Surround." vs offline "You surrounded your opponent's home."). **Partly intentional (no rematch/no bot), partly accidental (lost information).**
3. **Online, the deadline can vanish mid-match.** The live build shows a countdown chip in the duel strip (`23h 59m`, amber at ≤2h, red at ≤15m) and the match list shows time-left + "Less than 2 hours left". The concurrent HUD trim removes the in-duel chip entirely ("the match list owns the deadline"). While you are *on the board*, a player could then be timed out without ever seeing the clock. **Owner's call — flag (see §5).**
4. **Online shows a difficulty that does not exist.** The shared turn pill renders **"Level 7 · 30 turns left"** online — `Level 7` is only the engine default, not a real online setting. Offline the same pill shows the level the player actually chose. **Accidental (offline UI leaking into online).**
5. **Leaving an online duel from the finish screen or the pause menu does not end it.** Offline "Main menu"/"New game" from the pause menu (and "Back to menu" from the finish screen) are fine because offline has no session. Online, `#gm-main` and `#go-menu` call `showScreen('menu')` **without** `leaveOnline()`, so the driver keeps polling and the online session stays active; starting an offline game after that would route through the online path. Other online exits (`#go-other`, `#go-rematch`) *do* tear down. **Accidental inconsistency in `main.ts` (owned by the other worker) → owner's call / (a).**

---

## How this was measured (and what was not)

- New harness: `web/e2e/offline-vs-online-audit.ts` (`--only=offline` / `--only=online`). It drives the local `futa04` build for offline and the live `/futa0.5/` + live Edge API with two browser contexts for online, at **390×844** and **1280×800**, and writes a JSON record of every probe (`AUDIT_OUT`). It also prints PASS/FAIL lines for the invariants that hold today.
- Everything it records is a real player action: taps/drags on the same DOM the player uses, read back from the live DOM (`#turn`, `#hint`, `#duel-hud`, `#go-*`, pause-menu buttons, the shared `__severgrow` test hook for selection/phase).
- **Not automated (manual steps in §"Could not test"):** a full live online turn (Draw → Grow → Throw) end-to-end, online drag vs tap, the online Skip control, offline game-over screens (no way to reach a finish quickly in the product build), and settings-by-settings comparison.

Verdict legend: **INTENTIONAL** (must differ; reason + citation), **ACCIDENTAL** (should match; fix if in a file I own, else recommend), **OWNER'S CALL** (cannot tell bug from choice; do not guess), **SAME** (checked, no difference), **UNRESOLVED** (could not verify).

---

## 1. Input & interaction

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 1.1 | Tap a card → selected; tap again → deselected. Selection lives in the shared `Session`. | Uses the **same** shared `Session`; `OnlineSession` explicitly does not own selection (`duel-session.ts` header). | Yes — this is the bug being fixed right now. | **Already being fixed (a).** Do not touch. |
| 1.2 | Drag or tap a card; drag to throw; tap a hex to place; Bloom paint-drag. | Same shared board/hand/drag layer feed `humanPlay` (online branch routes to `humanPlayOnline`). | If it differs, it is the same in-flight bug. | **Already being fixed (a).** |
| 1.3 | Sort (hands sort locally in the browser). | Same `#hand-sort` control; sorts the shared hand locally. | No (same code path). | **SAME** (control present both; my run did not prove a reorder — see UNRESOLVED). |
| 1.4 | Undo within the turn before the Throw. | Undo within the local draft; `canUndo` from the draft engine. | No (both show the same Undo slot). | **INTENTIONAL** (draft mirror of offline Undo) / **already being fixed (a)** for the stuck-selection symptom. |
| 1.5 | Confirm/Cancel (offline forecast bar, `Confirm moves` setting). | futa04 has no Confirm bar in either mode. | No. | **SAME** (futa04 removed the bar in both). |
| 1.6 | Keyboard shortcuts (D/T/U/arrows/Enter/Esc). | Shared key handler; `#board` is the same element. | No (shared). | **SAME** (not separately automated). |

## 2. Turn flow

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 2.1 | Draw commits instantly to the local engine (deck is local). | Draw commits instantly to the **server** (only the server knows the deck). Same single tap on `#deck`/`#discard`. | No (same taps, same immediate result). | **INTENTIONAL** — `docs/ONLINE-PLAN.md` §4.1. |
| 2.2 | Grow/Bloom/Strengthen/Bomb/Blast apply locally. | Same actions become a **local draft on a shadow state**; Undo works. | No. | **INTENTIONAL** — `ONLINE-PLAN.md` §4.2; `NETWORK-CONTRACT.md` (semantic actions). |
| 2.3 | Throw ends the turn; the bot moves. | Throw sends the whole draft as one atomic batch; the turn ends on the server. | No (one Throw either way). | **INTENTIONAL** — `ONLINE-PLAN.md` §4.3. |
| 2.4 | Undo after Throw: not possible (turn is committed). | Undo after Throw: not possible (draft cleared, batch committed). | No. | **SAME.** Is this intentional? Yes — the Throw is the commit boundary by design (`ONLINE-PLAN.md` §4.3); there is no server-side take-back. |
| 2.5 | Change your mind after Throw: no take-back; the opponent's move follows. | Same: no take-back. | No. | **SAME / INTENTIONAL** (turn-gated async design). |
| 2.6 | Auto-skip an empty Grow step → straight to the Throw (`autoAdvance`). | `autoAdvance` also runs online (`myTurn()` true, legal from the draft) and routes the EndAct/Throw through `humanPlayOnline`. | No. | **SAME** (shared). |
| 2.7 | Discard step then the turn passes. | Discard is part of the same atomic Throw batch. | No. | **INTENTIONAL** — `ONLINE-PLAN.md` §4.3. |

## 3. Information shown

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 3.1 | **Coach** panel on (advice, "Show me where"), driven by `settings.coach` (default on). | Coach is **force-off** (`currentAdvice()` returns null while a duel is active). | Yes, if they expect the coach. | **INTENTIONAL** — `ONLINE-PLAN.md` §5 seam audit: "coach off online". |
| 3.2 | Hints that need the hidden deck. | Hidden-deck hints off (`perspective.hiddenDeckHintsEnabled = false`). | Rarely. | **INTENTIONAL** (hidden information). |
| 3.3 | Deck count, throw-pile top + count. | Same counts (public). Verified: both `Deck 61`, throw pile top + count. | No. | **SAME.** |
| 3.4 | Turn pill: "Your turn / Opponent's turn · Level N · 30 turns left". | Same pill, but **Level 7** (engine default) even though online has no level. | Yes — meaningless difficulty. | **ACCIDENTAL** (offline info leaking online). Fix belongs in `main.ts` (other worker) → recommend. |
| 3.5 | Score-bar labels **You / Opponent**. | Score-bar labels **Me / Opponent**. | Yes. | **ACCIDENTAL** wording drift (`main.ts` hard-sets `Me`). Recommend one-string fix. |
| 3.6 | "What happened" history + "How to play" reference. | Adds **Match Intel** (two tabs: Match Intel + How to), opened by the lightbulb; "What happened" and "How to play" still present in the pause menu. | Yes (extra screen online). | **INTENTIONAL** (online-only match history); `strings.ts HELP`. |
| 3.7 | Who starts: engine decides and the game announces it. | Live: one-time lottery reveal **plus** a persistent "Opponent starts" chip in the strip. The in-flight trim removes the persistent chip, keeping the one-time reveal. | Yes, if the reveal is missed (e.g. joined by link, refresh). | **INTENTIONAL** to differ (`starter-reveal.ts`); the removal of the persistent chip is **already being done (a)** — see §10 risk. |
| 3.8 | No opponent identity. | Opponent's guest name + presence (Online/Away/Unknown). Live showed **Unknown** for both players. | Yes. | **INTENTIONAL** (opponent name/presence online-only). Presence reading "Unknown" is a realtime artefact (polling carries the match). |
| 3.9 | Never shows the opponent's hand. | Never shows the opponent's hand. | No. | **SAME** (verified by design: turn-gated `viewFor`). |
| 3.10 | Opponent tile cards, gold badges, weak-link pulse. | Same shared board presentation. | No. | **SAME** (control sets match, see §8). |

## 4. Animation & pacing

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 4.1 | The bot's moves are scheduled with per-move "think" beats (`planBotTurn` → beats). | The opponent's **whole finished turn** arrives as filtered `Event`s and replays through the **same** `AnimQueue` via `stepsFromEvents`. | Yes — online the turn appears all at once; offline it unfolds. | **INTENTIONAL** — turn-gated replay, `ONLINE-PLAN.md` §1 / §4; `PLAYTEST-0.5.md` Test 1. |
| 4.2 | Skip control (`#tool-skip`) during animations. | `skipCatchUp()` clears the buffered events; the same corner control is used when a replay is playing. | Yes, if it is missing. | **UNRESOLVED** — my online sample never caught the skip window; not automated. |
| 4.3 | No catch-up concept. | Returning after time away replays the missed turns at **2×**. | Yes. | **INTENTIONAL** — `ONLINE-REPORT.md` ("Catch-up replay runs at 2×"). |
| 4.4 | Sounds/haptics on the opponent's moves (shared sound bus). | Same sound bus; replay steps are the shared `Step` shape. | Only if it is missing. | **UNRESOLVED** — not automated. |
| 4.5 | No opponent to wait for; no stale races. | Double-tap Throw guarded by `submitting`; simultaneous submits guarded by `expectedRevision` → `STALE_REVISION`; `requestId` makes retries idempotent. | Only under a race. | **INTENTIONAL** (online-only hardening) — `NETWORK-CONTRACT.md` (idempotency/revisions). |

## 5. Timers

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 5.1 | No clock; a game can sit for days. | 24-hour deadline per turn; miss it and you lose (with one grace). | Yes — the whole point of async play. | **INTENTIONAL** — `ONLINE-PLAN.md` §1/§6 (P-12). |
| 5.2 | N/A | Deadline visible **today on live** as a strip chip (`23h 59m`, `deadlineTone` amber ≤2h / red ≤15m) **and** in the match list (`timeLeft`, "Less than 2 hours left", "Grace used"). | Yes. | **Where it is visible NOW: live duel strip + match list.** |
| 5.3 | N/A | The concurrent HUD trim **deletes the in-duel deadline chip** (`duel-hud.ts`, `index.html`), leaving only the match list ("the match list owns the deadline"). While you are on the board you then cannot see an imminent timeout. | Yes — a player can be timed out having never seen the clock. | **OWNER'S CALL + (a) other worker.** The `deadlineTone()` helper survives but is unused. Recommendation: keep *some* in-duel urgency once inside the last 2h (the helper already returns `amber`/`red`), or add a one-off warning at 2h/15m (P-18 already plans a11y announcements at 2h/15m/time-up) so the trim does not remove the last warning. |
| 5.4 | N/A | Grace: first miss warns ("Time ran out — one more chance"), second ends the match as `timeout`; the row shows "Grace used". | Yes. | **INTENTIONAL** — `PLAYTEST-0.5.md` Test 5; `strings.ts ONLINE.grace*`. |
| 5.5 | N/A | Countdown is a **duration** ("23h 58m"), never a clock time/date; announcements at 2h / 15m / time-up, not colour-only. | No (both true). | **INTENTIONAL** — P-18/P-19. |

## 6. Clocks / session

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 6.1 | Refresh mid-turn: the game restores from the saved action list (`severgrow.save.v7`). | Refresh: `client.saveSession` + resume replays only the gap; the mid-turn draft persists in `sessionStorage` (per match). | No (same turn comes back). | **INTENTIONAL** (offline save vs server session + local draft). Storage differs, the player outcome does not. |
| 6.2 | Tab backgrounded: local bot scheduling continues. | Backgrounded: the fast poll stops (`sync.setVisible(false)`), resumes on return. | Only as battery/network, not gameplay. | **INTENTIONAL** — P-11 (broadcast is a hint, polling is truth). |
| 6.3 | No connection concept. | Losing connection: a notice + continued polling; the match is safe on the server. | Yes. | **INTENTIONAL.** |
| 6.4 | Close the app mid-turn: nothing is lost beyond the save. | Close mid-turn: the match lives in the database; the draft in `sessionStorage`. Reopening after hours replays the missed turns at 2× (or shows the timeout). | Yes (async). | **INTENTIONAL** — `PLAYTEST-0.5.md` Test 2. |
| 6.5 | N/A | A second device gets a clean 409 and recovers by refetching. | Only on two-device play. | **INTENTIONAL** — P-20. |

## 7. End of game

Offline finish screen (from `main.ts renderGameOver` offline branch) vs online finish screen (verified live on resign).

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 7.1 | Title: win → `You beat Level N!`, else `You won` / `You lost` / `A draw`. | Title: `You won` / `You lost` / `Draw`. | Yes. | **INTENTIONAL** for the level headline; the `A draw` vs `Draw` wording is **ACCIDENTAL** drift. |
| 7.2 | Reason: a full sentence, perspective-aware ("You surrounded your opponent's home.", "The deck ran out. The higher score wins."). | Reason: terse, perspective-less (`Surround.`, `Final score.`, `Resigned.`, `Time ran out.`); `double_strangle` collapses to `Surround.`. | Yes. | **ACCIDENTAL information loss** for strangle/deck-end; **OWNER'S CALL** to change it (rule: never rename outcomes/reasons; and the online words are hard-coded, not in `src/strings.ts` — see §9). |
| 7.3 | Breakdown ("You: N tiles (M on gold) · Opponent: …"), stats line, highlights list. | Breakdown/stats/highlights render **empty**. | Yes. | **PARTLY ACCIDENTAL** — the online branch returns early and does not compute them. Recommendation: either compute from the display state or explicitly hide the empty lines (never leave blank furniture). |
| 7.4 | Buttons: Play again / Try again, Change difficulty, Share, (Replay the biggest cut), See the board, Back to menu. | Buttons: Back to matches, Menu, Share, See the board, Back to menu. | Yes. | **INTENTIONAL** for Play again/Change difficulty (no bot to rematch online). |
| 7.5 | No timeout/resign reasons exist offline. | Adds `timeout` and `resigned`. | Yes (online-only). | **INTENTIONAL.** |
| 7.6 | Share builds a card from the local state. | **Share is present online**; `go-share` reads `session.state.result` (the online display state) — may produce a card or silently do nothing. | Possibly. | **UNRESOLVED / OWNER'S CALL** — the button should either work online or be hidden. |

## 8. Menus & chrome

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 8.1 | Shipped `/futa0.4/` main menu: **New game**, Tutorial, Settings (no Play online). Branch `futa04` build: Play offline, Tutorial, Settings. | Main menu: **Play online**, Play offline, Tutorial, Settings. | Yes. | **INTENTIONAL** — menu split (`ONLINE-PLAN.md` §1). |
| 8.2 | Pause menu: What happened, Back to the game, New game, How to play, Settings, Main menu. **No Resign.** | Live: strip button `#duel-resign` ("Resign"). Branch (other worker): Resign moved into the pause menu as `#gm-resign`. | Yes (where it lives). | Pause-menu Resign is **already being done (a)**; offline having no Resign is **INTENTIONAL** (no opponent to resign against). |
| 8.3 | Main menu / New game from the pause menu behave normally (there is no session). | `#gm-main` → `showScreen('menu')` and `#gm-new` → levels **without `leaveOnline()`**; the online driver keeps running and `isOnlineDuel()` stays true. `#go-menu` ("Back to menu") has the same problem, unlike `#go-other`/`#go-rematch` which do tear down. | Yes — starting an offline game afterwards would run the online path. | **ACCIDENTAL** in `main.ts` (owned by the other worker) → **recommend** routing these through the same teardown as `#go-other`. |
| 8.4 | Top row: turn pill + scores. | Top row + a **duel strip** (opponent, presence, deadline). The turn pill still renders, so turn info is shown twice, and a Resign button sits at 390px. | Yes (extra chrome). | Deadline/presence strip is **INTENTIONAL**; the **duplicate turn pill** (and the `Level 7` in it) is **ACCIDENTAL**. |
| 8.5 | History sheet "What happened". | Same sheet (+ Match Intel). | No. | **SAME.** |

## 9. Settings

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 9.1 | `coach` toggles the coach panel. | The coach is disabled online regardless of the toggle. | Yes, if they turn the coach on. | **KNOWN INTENTIONAL** (coach off online) but the **toggle silently does nothing online** — worth a note/hint. |
| 9.2 | `Confirm moves` changes when offline asks to confirm. | futa04 has no Confirm bar (offline either), so the setting is inert in both product modes. | No. | **SAME** (not an online-vs-offline difference). |
| 9.3 | sound, music, vibration, speed, effects, reduceMotion, largeText, palette, materialDetail, topGlow, eyeCandy, handSort. | All flow through the shared renderer; nothing online-only blocks them. | Only if one silently fails. | **SAME by construction** (shared `render`) — **UNRESOLVED** per-setting (not automated). |
| 9.4 | `bloomHints` draws quiet brackets on **your own** combinable cards. | Same (`showBloomHints` is not gated by online; it only needs your hand). | No. | **SAME.** |

## 10. Edge / error states

| # | Offline | Online | Would a player notice? | Verdict |
| --- | --- | --- | --- | --- |
| 10.1 | An illegal tap is a no-op / a hint. | The draft refuses it; a rejected batch restores the cards with the message "That turn didn't go through. Your cards are back." (`driver.ts`). | Only on failure. | **INTENTIONAL** (server re-validates) — but the wording is **hard-coded outside `src/strings.ts`**. |
| 10.2 | No stale state. | Stale revision → refetch + notice. | Only on races. | **INTENTIONAL** — `NETWORK-CONTRACT.md`. |
| 10.3 | No resign/timeout. | Opponent resigns → "You won / Resigned."; opponent times out → "You won / Time ran out." | Yes (online-only). | **INTENTIONAL.** |
| 10.4 | No two-tab / double-submit races. | Double-tap Throw guarded; two tabs → 409 + refetch. | Only under abuse. | **INTENTIONAL.** |
| 10.5 | All player words live in `src/strings.ts`. | Online result words are **hard-coded**: `You won`/`You lost`/`Draw`/`Time ran out.`/`Resigned.`/`Surround.`/`Final score.` in `web/src/online/duel-session.ts` and `web/src/online/duel-bridge.ts`; `Back to matches`/`Menu`/`Online duel` in `main.ts`; `OnlineDriver` error strings in `driver.ts`. | Indirectly (inconsistent wording). | **ACCIDENTAL** (project rule: all player-facing words in `src/strings.ts`). Recommend moving them there when the other worker is out of `duel-session.ts`/`duel-bridge.ts`/`main.ts`. |

---

## What I changed

- **Added `docs/ONLINE-VS-OFFLINE.md`** (this file).
- **Added `web/e2e/offline-vs-online-audit.ts`** — a reproducible player-perspective harness (`--only=offline|online`, JSON out) that prints PASS/FAIL for the invariants that hold today (offline build has no Play online; online board offers the same controls as offline minus Resign; duel HUD visible; the two players see opposite results). It is **green now** and did not need any app change.
- **No `src/strings.ts` change and no new failing unit test.** Every *accidental* difference above lives in `web/src/main.ts` or `web/src/online/*` — files the other worker is editing right now — so a red test there would collide with their work. They are recorded below for the owner instead.
- **No redeploy.** Adding a doc plus an e2e harness changes no web code, so `/futa0.5/` was left alone.

## Already being fixed by the other worker (do not duplicate)

- Online selection/deselection, selection leaking across steps, opponent turn not replayed — the whole in-flight interaction fix (`driver.ts`, `duel-session.ts`, `duel-bridge.ts`, `duel-runtime.ts`, `duel-hud.ts`, `online-css.ts`, `main.ts`, `glass-surface.ts`, `online-*.ts`, `web/tests/*`).
- The **HUD trim**: deadline chip removed, persistent who-starts chip removed, Resign moved from the strip into the pause menu. The trim itself is owner-requested; the **timeout-visibility risk** is flagged in 5.3.

## Owner's decision needed (with the two options)

1. **Mid-match deadline (5.3).** Option A: keep a small in-duel urgency indicator (the `deadlineTone` helper already gives `amber` ≤2h / `red` ≤15m) so the trim keeps the last warning. Option B: truly remove it and rely on the match list + the planned 2h/15m a11y announcements — accept that a player on the board can be timed out with no on-screen clock.
2. **Score-bar word (3.5).** Option A: change online to **You** so both modes read the same. Option B: keep **Me** deliberately (e.g. because the opponent is a real person, "You/Opponent" still reads fine) — then say so and I will mark it INTENTIONAL.
3. **Finish-screen wording + information (7.2/7.3).** Option A: move the online result words into `src/strings.ts` and restore the descriptive, perspective-aware sentences (and fill in the breakdown/stats/highlights). Option B: keep the terse online wording on purpose (short screen) and explicitly hide the empty lines.
4. **Leaving a duel (8.3).** Confirm that "Main menu"/"New game" (pause) and "Back to menu" (finish) should **end the online duel** like `#go-other` does. If yes, that is a small `main.ts` fix for whichever worker holds it.
5. **Turn pill online (3.4/8.4).** Confirm the pill should not show a difficulty online (and ideally not duplicate the strip's turn word).
6. **Share on the online finish screen (7.6).** Keep (and make it work) or hide it.

## Could not test (and the manual step)

- **A full live online turn** (Draw → Grow → Throw, and the opponent's one-replay arrival). The selection interaction is being actively edited and the live build is pre-trim; automating it now would measure a moving target. *Manual:* two phones, `docs/PLAYTEST-0.5.md` Tests 1–2.
- **Online Skip during the opponent's replay** (4.2) and **sounds/haptics on the replay** (4.4). *Manual:* watch a replay and press the bottom-left Skip.
- **Offline game-over screens** for each reason. The product build has no quick way to finish a game. *Manual:* play a game to a Strangle or the deck end, or use the Lab in the test copy.
- **Per-setting online effect** (9.3). *Manual:* toggle each setting inside a duel and compare with offline.
- **Refresh / background / offline network mid-turn** (6.1–6.3). Partly covered by `web/e2e/online-*.ts` (another worker's suite); not re-run here to avoid clashing.

## Screenshots

`docs/screens/offline-vs-online/` (JPEG, same viewport for each pair):

Offline (local `futa04` build):
`offline-android-390x844-1-menu.jpg`, `-2-board-start.jpg`, `-3-board-midturn.jpg`, `-4-pause.jpg`, `-5-opponent-replay.jpg`
`offline-desktop-chromium-1280x800-1-menu.jpg`, `-2-board-start.jpg`, `-3-board-midturn.jpg`, `-4-pause.jpg`, `-5-opponent-replay.jpg`

Online (live `/futa0.5/`, SHA `d7453e3`):
`online-android-390x844-1-menu.jpg` (online hub), `-2-board.jpg`, `-3-pause.jpg`, `-4-finish.jpg`, `-5-matchlist.jpg`
`online-desktop-chromium-1280x800-1-menu.jpg`, `-2-board.jpg`, `-3-pause.jpg`, `-4-finish.jpg`, `-5-matchlist.jpg`

Note: the two board shots are the same viewport but **not the same deal** (each run is a fresh random match), so compare chrome/labels, not tile positions.
