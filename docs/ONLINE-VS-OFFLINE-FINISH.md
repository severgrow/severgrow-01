# Finishing the finish screen — offline is the reference, online matches it

**Branch:** `futa0.5-online` · **Date:** 2026-10-13 · **Game:** FUTASAKU
**Drives:** the finish-screen / wording / exit divergences found by
[`ONLINE-VS-OFFLINE.md`](ONLINE-VS-OFFLINE.md) (commit `cd5479b`). The owner's decision: **offline is
the reference** — but first check that the offline finish screen is itself up to standard; if it is
not, improve it, then make online match the *improved* offline.

**Built on:** `f78689b` (the concurrent Grow-selection / HUD-trim worker's commit).
**Live before:** `/futa0.5/` `release.json` commit `f78689b` (measured while auditing). **Live after:**
see §9.

**Intentional differences that stay (do not "fix"):** Undo is unavailable after Throw (the Throw is
the commit boundary); coach and hidden-deck hints are off online; the 24 h per-turn clock and the
one-grace rule; catch-up replay at 2×; no bot online. Match outcomes (`You won` / `You lost` /
draw) and reasons (`strangle`, `knock`, `deck end`, `turn limit`, `timeout`, `resigned`) are never
renamed — only the *wording* is aligned to offline.

---

## 1. Verdict on the OFFLINE finish screen

**It is on standard, with exactly one stale leftover.** Measured from the product build
(`CHANNEL=futa04`) at 390×844 and 1280×800.

| Judged on | Verdict |
| --- | --- |
| Information a player needs (who won, why, final score, what happened) | **Complete.** Title, a perspective reason sentence (`#go-reason`), the final score, the tile/gold breakdown (`#go-break`), "what you did with the Grow" (`#go-moves`), the three stat rows (`#go-highlights`) and the record line (`#go-stats`). |
| Wording quality | **Good.** Perspective-aware sentences ("You surrounded your opponent's home.", "The deck ran out. The higher score wins."), plain and calm — unchanged. |
| Typography / spacing hierarchy | **Correct.** Besley display for the title and the big stat numbers, small tracked Commissioner for the labels, muted Commissioner for the sentences, 10–24 px rhythm — unchanged. |
| Current glass language | **Matches.** Cream glass card, thin cream dividers (never boxed cards), one soft radial flourish, the same 52 px quiet-frame buttons as the menu — unchanged. |
| Leftovers from older passes | **ONE defect:** a win showed the subtitle **"Practice game: no Grow this time."** (`SPROUT.practice`). It was the only use of that string in the product, it was written for a long-gone "practice game" concept, and under **"You beat Level 7!"** it was simply wrong (the game just played *did* have Grow). The draw showed `Draw · Level N · <name>`, repeating the outcome the title already gave. |
| Same class of bug | The score-bar label `#score-you-label` had **no single owner**: only the online path wrote it (to `Me`), so after an online duel the label stayed `Me` in a following offline game. Fixed by giving the label one source (`src/strings.ts`). |

**Changes made offline (restrained, no new font / radius / shadow / colour / border):**

1. The subtitle is now **context only** — the same rule online follows: `Level N · <name>` for every
   outcome (win, loss, draw). It never repeats the outcome or the reason below it.
2. Title, breakdown and the Share word now come from the one copy source (`RESULT.*` / `src/strings.ts`).

`SPROUT.practice` is left in `src/strings.ts` (now unused) only because removing a `MoveWords` field
would ripple through the type; it is no longer rendered anywhere.

---

## 2. What online changed to match it

| # | Divergence (from the audit) | What changed |
| --- | --- | --- |
| 7.1 | Title `Draw` online vs `A draw` offline | Online uses `RESULT.draw` (`A draw`) |
| 7.2 | Reason `Surround.` / `Final score.`, no perspective | Online calls the **same** `resultReason()` offline does, plus its two online-only endings (`timeout`, `resigned`), all from the reader's seat |
| 7.3 | Breakdown / stats / highlights rendered empty | Breakdown computed from the online display state; highlights computed from the match's whole public event history (one `GET /view` with no `since` — the server keeps every move); the offline record line is hidden, never leaked |
| 7.4 | Subtitle repeated the reason | Online subtitle is context only: `vs <opponent name>` |
| 7.6 | Share could silently do nothing | **Kept and made to work** — builds the card from the online display state + highlights (§4) |
| 8.3 | Leaving a duel did not tear the session down | All five exit routes share one `tearDownOnlineDuel()` (§5) |
| 8.4 | Turn pill showed **"Level 7"** online | Online the pill shows only the turn clock (`30 turns left`) — no level, and no duplicate of the strip's turn word |
| 3.5 | Score bar read **Me** online | Online reads **You**, from `ONLINE.scoreYou`, and `perspective.labels.scoreMe` is the same source |
| 10.5 | Player-facing words hard-coded in online files | Moved into `src/strings.ts` (`RESULT`, `ONLINE.*`): session/driver/bridge errors, presence words, finish buttons, the share "Saved", the resign confirm |
| 5.3 | The trimmed HUD removed the in-duel clock | A small urgency-only indicator inside the strip (§6) |

### Copy table

Every player-facing line that changed, so any single line can be approved or reverted.

| State | Old | New | Where |
| --- | --- | --- | --- |
| Offline subtitle, win | `Practice game: no Grow this time.` | `Level 7 · Oak` | `main.ts` |
| Offline subtitle, draw | `Draw · Level 7 · Oak` | `Level 7 · Oak` | `main.ts` |
| Offline subtitle, loss | `Level 7 · Oak` | unchanged | `main.ts` |
| Offline Share button | `Share` | `Share` (now `RESULT.share`) | `main.ts` |
| Online score bar, left | `Me` | `You` | `perspective.ts`, `main.ts` |
| Online turn pill | `Your turn` + `Level 7 · 30 turns left` | `30 turns left` (strip already says the turn; no level) | `main.ts` |
| Online finish title, draw | `Draw` | `A draw` | `duel-session.ts` + `log.ts` |
| Online finish reason, Strangle (won) | `Surround.` | `You surrounded your opponent's home.` | `log.ts` |
| Online finish reason, Strangle (lost) | `Surround.` | `Your opponent surrounded your home.` | `log.ts` |
| Online finish reason, deck ran out | `Final score.` | `The deck ran out. The higher score wins.` | `log.ts` |
| Online finish reason, turn limit | `Final score.` | `Time's up: 30 turns each. The higher score wins.` | `log.ts` |
| Online finish reason, knock | `Final score.` | `You knocked and stayed ahead.` / `Your opponent knocked and stayed ahead.` | `log.ts` |
| Online finish reason, opponent timed out | `Time ran out.` | `Your opponent ran out of time.` | `log.ts` |
| Online finish reason, I timed out | `Time ran out.` | `You ran out of time.` | `log.ts` |
| Online finish reason, opponent resigned | `Resigned.` | `Your opponent resigned.` | `log.ts` |
| Online finish reason, I resigned | `Resigned.` | `You resigned.` | `log.ts` |
| Online finish subtitle | the reason again (`Resigned.`) | `vs RootWren` (opponent's name) | `duel-session.ts` |
| Online finish breakdown | leaked the previous offline game's line | `You: 12 tiles (3 on gold) · Opponent: 9 tiles` | `duel-session.ts` |
| Online finish record line | leaked the offline win/loss record | hidden | `main.ts` |
| Online match ended with an unknown reason | `Finished` | `Finished` (now `ONLINE.finishedFallback`) | `duel-session.ts` |
| Online finish buttons | `Back to matches` / `Menu` | unchanged words; now `ONLINE.backToMatches` / `ONLINE.menuButton` | `main.ts` |
| Online Share button / after saving | `Share` / `Saved` | unchanged words; now `RESULT.share` / `ONLINE.shareSaved` | `main.ts` |
| Online resign confirm | `Resign this duel?` | unchanged; now `ONLINE.resignConfirm` | `main.ts` |
| Online driver / session errors | `Busy`, `Draw failed.`, `Only a Draw commits immediately.`, `Throw must be EndAct or Discard.`, `That move is not legal right now.`, `That turn didn't go through. Your cards are back.`, `Resign failed.` | same words; now `ONLINE.err*` | `driver.ts`, `duel-session.ts`, `duel-bridge.ts` |
| Presence words | `Online` / `Away` / `Unknown` | same words; now `ONLINE.presence*` | `duel-hud.ts` |
| Mid-match urgency (new) | — (the in-duel clock was trimmed away) | amber `Less than 2 hours left`; red `Less than 15 minutes left` | `strings.ts`, `duel-hud.ts`, `index.html`, `online-css.ts` |

**The one line to think about:** online's draw now reads **`A draw`** (offline's word) rather than
`Draw`. The three outcomes are still exactly `You won` / `You lost` / the draw; only the article
follows offline, which is the reference.

## 3. Why online and offline cannot drift again

`web/src/logic/log.ts` owns `resultTitle()` and `resultReason()` over a widened result type
(`EndReason | 'timeout' | 'resigned'`), and every sentence lives in `src/strings.ts` (`RESULT`). The
offline finish screen and the online `OnlineSession.finishInfo()` now call the **same functions**, so
"match offline" is structural, not a copy that can rot.

## 4. Share on the online finish screen

**Kept and made to work.** `#go-share` built its card from the offline `session.state`, and the old
online branch of the finish screen never set the result properly, so the tap could do nothing.
`go-share` now branches: online it builds the card from the online display state (title, subtitle,
the two scores, the highlights when the history is known) exactly like offline, and a missing Web
Share API falls back to saving the picture.

## 5. The leave-duel bug

**Fixed: every exit route tears the session down through one function.** `#go-other` and
`#go-rematch` already stopped the driver, cleared the session and hid the strip, but `#gm-main`
("Main menu"), `#gm-new` ("New game") and `#go-menu` ("Back to menu") called
`showScreen('menu')`/`showScreen('levels')` **without** that teardown — so the client kept the duel
open and polling, and a following offline game ran the online path. All of them (and the lobby's own
Back) now call `tearDownOnlineDuel()`: stop the driver, drop the session, hide the strip, clear the
resign hook, sync the pause menu. **The match itself is untouched server-side** — no abandon concept,
no cancel, no delete: leaving and coming back is exactly a resume the server already supports (proved
by the e2e, which reopens the same duel after leaving through each route).

## 6. Mid-match deadline: urgency-only

- **Placement:** a small `data-duel-urgency` span **inside the existing `#duel-hud` strip** — the
  element whose geometry is already proven never to cover the menu button, the brand/logo or the
  board (`web/e2e/online-hud-overlap.ts`). No new fixed element, so the just-fixed header cannot
  regress. Phones give it its own tidy second line; wide screens keep it in the row (44 px total).
- **Thresholds** (the existing `deadlineTone()` helper): hidden with a full day left, **amber ≤ 2 h**,
  **red ≤ 15 min**. There is **no permanent countdown** — only the urgency case.
- **Text, never colour alone:** amber `Less than 2 hours left`; red `Less than 15 minutes left`.
- **Screen readers only at the thresholds:** the span is `role="status"` with the fuller sentence as
  its `aria-label`; its text changes only when the tone *crosses* a threshold (hidden → amber → red),
  so it never ticks or spams.

## 7. Tests

- **`web/tests/finish-copy.test.ts`** (new): offline and online share one finish-copy source; every
  outcome title, every reason sentence (including the online-only `timeout` / `resigned`) in both
  perspectives, the score-bar words and the urgency text.
- **`web/tests/duel-bridge.test.ts`**: adds the urgency thresholds (hidden / amber / red, text differs).
- **`web/tests/duel-session.test.ts`, `perspective.test.ts`**: updated for `You resigned.` and the
  `You` score label (the only assertions whose *expected* wording deliberately changed).
- **`web/e2e/online-finish-parity.ts`** (new): builds `CHANNEL=futa05` against a **local duel API with
  a controllable clock** and asserts, from both players' own screens: the finish reason equals
  `resultReason()` — the function offline renders — so a pass means offline and online literally
  agree; the score, breakdown and highlights; the score bar reads `You`; no `Level N`; every exit
  route hides the HUD, stops `/view` polling and leaves a following game offline; and the urgency is
  hidden at 24 h, amber under 2 h, red under 15 m, and never overlaps menu / logo / board. **32/32 pass.**
- **`web/e2e/online-hud-overlap.ts`** (the other worker's suite): still **all pass** with the urgency
  span present.

## 8. Evidence

`docs/screens/offline-vs-online/` (JPEG), 390×844 and 1280×800:

| Pair | Files |
| --- | --- |
| Offline finish screen, before → after | `offline-finish-before-390x844.jpg` / `offline-finish-after-390x844.jpg` and the `-1280x800` pair |
| Online finish screen, after | `online-finish-after-390x844.jpg` / `online-finish-after-1280x800.jpg` (the before is `online-android-390x844-4-finish.jpg` / `online-desktop-chromium-1280x800-4-finish.jpg` from the audit at `f78689b`, where the reason read `Resigned.` and the breakdown/highlights were blank) |
| Online deadline urgency, red | `online-finish-urgency-red-390x844.jpg` |

The offline pair is captured by seeding the `endgame()` fixture (`web/e2e/positions.ts`) through
`positionSave()` and playing the remaining turns; note `CHANNEL=futa04` served off `localhost` uses
the `main2:` storage prefix. The before build is the previous commit `f78689b`.

## 9. Deploy

Pushing `futa0.5-online` runs `.github/workflows/futasaku04-preview.yml`, which rebuilds `/futa0.5/`
alongside Main / futa0.4 / Test2 (their published SHAs are preserved) and writes
`/futa0.5/release.json` with the new commit. No Edge function and no `pages.yml` change was needed.
