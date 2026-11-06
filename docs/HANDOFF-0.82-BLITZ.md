# 0.82: FUTASAKU BLITZ remodel (handoff)

**Read this first if you pick this up.** Work is LOCAL ONLY (branch `claude/focused-fermat-kq2zyf`); another
agent is shipping fixes on `futa0.5-online`. Do NOT push this to `futa0.5-online` until the owner says so.

## The ask (owner, 2026-11-06)

> "blitz mode remodel: in blitz, undo ur move and match intel are disabled, same with replays. instead of
> those 2 buttons we replicate the led display screen frame, but we make it a timer like attached [a red
> 7-segment clock reading 6:28] and we set time to 21:00 (21 seconds but we're showing milliseconds too.
> same style glow as led display but with no dots but timer like attached. ALSO - for now it's just for
> /test and only for practice match - but when we activate it in online games - the moves should be shown
> as soon as they're done ... in real time if possible. so match is being observed each move of the turn
> for both players ... the idea for this is to become primary competitive mode ... FUTASAKU BLITZ"

## Owner's answers

1. Clock: **21 s per turn, fresh each turn**, shown as `SS:CC` (seconds:hundredths) counting down from `21:00`.
2. At `00:00`: **the turn ends and the lowest card is thrown automatically** (no match loss).
3. Build all three ideas:
   - **Pressure clock**: calm until 5 s, amber at 5 s, red at 3 s; the last 3 seconds tick (soft click,
     one glow pulse per second). No extra screen effects.
   - **Live play-by-play**: opponent moves appear as they happen; THEIR clock counts on their turn so you
     watch their pressure too. Practice now; designed so online can stream each action later.
   - **Tempo**: time left at the end of each of your turns is recorded; the finish shows your tempo
     (average time left, fastest turn).
4. Placement: **one wide LED timer frame replacing the Undo and Match Intel buttons**; Replays hidden.

## Plan / status

| # | Step | Status |
|---|------|--------|
| 1 | Pure rules in `web/src/logic/blitz.ts`: 21 s, `SS:CC` text, pressure stage, timeout action (lowest card), tempo summary — tests first | done (`web/tests/blitz.test.ts`) |
| 2 | `web/src/blitz/timer.ts`: 7-segment LED timer in an LED-display frame, rAF only while a clock runs | done; owner tweak "less intense, dark slightly scratched plastic": muted inks, low glow, smoked tint + static scratches |
| 3 | `blitz/practice.ts`: drive the timer for both sides (mine on my turn, theirs on theirs); timeout ends my turn | done (the old live-duel ring is no longer used by Blitz) |
| 4 | main.ts wiring: hide Undo, Match Intel, Replay in a Blitz match; timeout plays the auto turn-end; tempo on the finish card | done (`blitzTimeoutTurn`, guards in undoMove / replayLastTurn / toggleMatchIntel / openReplayForFinish, `#go-tempo`) |
| 5 | Browser check on a futa05 build at /test/ (FEATURES.blitz), screenshots | done: `web/e2e/blitz.ts` 36 checks (rewritten for the new rules; it also fixed its save key to the /test prefix `futa05-test:`) |
| 6 | Online design note (real-time per-action streaming) | written below; not built |

## Notes

- **Where the clock lives:** `#blitz-clock` is appended to `#smart-panel` (the cockpit's 3x2 key grid) at
  grid row 2, columns 1-2 — exactly the Undo and Match Intel slots. `html.blitz-match` hides
  `#tool-undo`, `#futa04-help-button`, `#tool-replay`, `#go-replay`. Sort stays.
- **Both clocks:** mine runs from the moment my turn is playable; THEIRS starts when their turn starts being
  shown (`opponentShowing` = main's `blocking()`) and freezes when it ends. With the bot, their clock shows
  how long their turn took to watch (usually a few seconds).
- **Timeout:** `blitzTimeoutTurn()` in main.ts applies `blitzTimeoutAction` until the turn passes (Draw from
  deck -> EndAct -> throw the lowest number card; a Bomb only if nothing else). LED shows TIME. Tempo
  records 0 s for that turn. The ladder records nothing (only finished matches count).
- **Found on the way (app fix):** a match that finishes while the page is still booting threw in the install
  counter; `noteInstallFinished` now retries. `web/tests/install-menu.test.ts` pins updated (same intent).
- **Not done / next:** sound tick uses the key click (`sound.press`, silent while sound is off by default).

## Online (design note, not built — owner: "when we activate it in online games the moves should be shown
## as soon as they're done ... in real time")

Today an online turn is sent as one batch when the player throws (`humanPlayOnline`: Draw commits, Grow
drafts locally, Throw sends the batch), and the opponent sees it replayed afterwards (live reveal). For
real-time Blitz:
1. **Server:** accept each action as it happens (`POST /v1/matches/:id/actions` per action, already the
   live duel's shape in `server/src/live/`), validate it against the server engine, append it to the
   match log and broadcast it on the match's realtime channel. Keep Undo off in Blitz, so nothing ever has
   to be taken back after it was broadcast.
2. **Client sender:** in a Blitz online duel, `humanPlayOnline` posts every action at once instead of
   drafting until the throw.
3. **Client watcher:** each incoming action goes straight into the AnimQueue (the same steps offline
   uses, `buildSteps`), played with the opponent pace; THEIR clock (this LED timer, side 'theirs') runs
   from the server's turn start time, not a local guess.
4. **Clock authority:** the server owns the 21 s deadline and the timeout turn-end (the same
   `blitzTimeoutAction` rule, ported to `server/`), so both players see the same 00:00.
5. **Spectators** (the "fun to watch" goal): the same broadcast feeds a read-only watcher.

## Status 2026-11-06 22:04 UTC: LIVE (9ee7e842 on futasaku.com and /test, ROOT_SHA confirmed)

- Blitz replaces Real time online (words, LED clock for YOU/OPP from the server deadline, every move committed
  at once, no undo); the send/accept windows say "21 seconds a turn. No undo."; Practice BLITZ has the bolt.
- Server (owner: "server ready"): 21 s turns; a connected player's timeout plays the turn out (lowest card).
- Startup: the installed app answers its saved page at once (no white wait), dark max 1.2 s, 400 ms fade; the
  app-switch curtain is gone. Owner must delete + re-add the home-screen icon to pick up the launch images.
- Not verified: a real iPhone; a real two-player online Blitz duel end to end.
