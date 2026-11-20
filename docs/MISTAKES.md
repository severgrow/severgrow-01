# The undo nudge

> "…create a glow pulsate on the 'redo' button. like its suggested to redo." — the owner

This is the design note for `web/src/logic/mistakes.ts`, the pulse on the Undo key, and the browser
proof in `web/e2e/undo-nudge.ts`. Nothing here changes a rule: `src/engine/` is untouched.

## 0. There is no redo — and the undo window is the whole design

**The fact.** The product has no redo affordance. The key the owner means is `#tool-undo` in
`web/index.html` — *"Take back your last move (you can until you throw)"*. The same slot shows
**Replay** (the opponent's last turn) when nothing can be undone, and nothing else in the page can
replay a move. So the nudge lands on **Undo**, because that is the only control that can take a
move back.

**The deadline.** `Session.play` (`web/src/logic/session.ts`) keeps a checkpoint for the Grow step
only: Bloom, Bomb (`PlayFruit`), Blast (`MegaBomb`), Grow (`Sprout`) and the deliberate "done
growing" (`EndAct`) push one; **anything else — the draw that opens a turn, the throw that closes
it — empties the stack**. `Session.canUndo` also requires that it is still the player's action and
the game is not over. So:

| moment | Undo possible? |
| --- | --- |
| My Draw step | no (nothing played yet) |
| My Grow step, after Grow/Bloom/Bomb/Blast/Strengthen | **yes** |
| My Grow step, after "done growing" (EndAct) | **yes** — EndAct is itself a checkpoint |
| My Throw step, before the throw | yes, but only back to the Grow step |
| My Throw step, after the throw | **no — the stack is empty** |
| The opponent's turn | no |

Consequences, and how they are honoured:

- The nudge is computed **only when the player ends the Grow step themselves** (`EndAct`, and never
  the app's own auto-skip, which is flagged `auto`). That is the last instant at which Undo is both
  **possible** and **useful**: the move it would take back is the only thing left in the window.
- If the same mistake is noticed later (after the throw), the detector returns nothing at all. A
  pulse then would advertise a take-back the key cannot perform. `undoNudge` also takes `canUndo`
  and refuses on its own, so even a stale call cannot light the key.
- The nudge is bound to the exact state object it was computed for, so the next move, the throw or
  a take-back kills it with no timers and no dismissal.

### What this means for the owner's second example

"Selecting card 9 to throw (when a 5 is throwable)" is a **throw-step** mistake: by the time it is
visible, the throw has already emptied the undo stack, so no pulse can help. It is also not
objective loss under the shipped rules — rot is **off** (`rotEnabled: false`) and the throw pile is
free, so throwing a 9 instead of a 5 costs nothing on the rules; it is a judgement about which
cards to keep. So it is **rejected as a nudge** (see §2), not merely deferred.

## 1. What "obviously wrong" means here

The bar: **there is a legal alternative that is strictly better on the rules alone**, with no
judgement about style, plans or card economy. Three mistakes clear it, and only at the moment the
Grow step is ended:

| # | Name | Exact condition (over the player's `View` of the last Grow step) | Why it is unambiguously bad |
| --- | --- | --- | --- |
| 1 | **Win skipped** | The opponent's home is surrounded except for **one** door that is on-board, non-rock and empty; that hex touches my network; I still have a Grow and a numbered card; claiming it ends the game by Strangle in my favour (never a double strangle). | Winning the game now beats every other move. |
| 2 | **Last door left open** | My home has exactly one door on-board, non-rock and empty; a rival tile touches that door; I still have a Grow and a numbered card, so I can fill it. | Passing loses the game on their next Grow; filling it cannot cost me anything. |
| 3 | **Big cut skipped** | I still have a Grow (or a Bomb that does not use it) and a reachable rival non-root tile; the best of those claims cuts off **≥ `MISTAKE_BIG_CUT` (4)** of their tiles (`cutLoss`), the same size the game's own "Cut off 4!" moment celebrates. | Four of their tiles leave the board for one card, and my Grow expires at the throw. |

Each is checked in that order (win → defence → cut), so the player is told **one** thing, the worst
one, and never a lesser point on top of it.

**Where the scan is deliberately conservative.** A win that needs a *Bloom* (no Grow left) or that
must *overgrow* a rival tile in a door is not detected, and neither is a blocked door that can only
be saved by an overgrow. Those cases stay silent rather than risk a false pulse — silence costs a
nudge, a false pulse costs trust.

**Why class 2 is rare, on purpose.** Any tile of mine beside my home already keeps a door from
closing, and every path out of my home starts in a door. So "one empty door" means my home has **no
tile of mine beside it** — the single position where ending the Grow step loses outright. That is
exactly where the nudge is worth spending.

## 2. Candidates that were rejected (and why)

| Candidate | Verdict | Reason |
| --- | --- | --- |
| Threw a **9** while a **5** was throwable | **Reject** | Undo is already gone (post-throw), *and* with rot off it is hand-shaping taste, not loss. |
| Threw a Bomb card | **Reject** | Same post-throw deadline; which card to keep is judgement. |
| Strangling yourself | **Reject** | **Impossible by the rules.** A Strangle needs *enemy* tiles in every door; my own tiles never count, and my growth only adds my tiles. |
| Breaking your own connectivity | **Reject** | **Impossible.** A Grow must touch my network, an overgrow replaces an enemy tile with mine, and a Bloom only adds mine — no move can disconnect me. |
| Wasting a Bomb/Blast on an empty hex | **Reject** | Not legal in the first place: the engine only lists rival non-root targets. |
| Wasting a Bomb/Blast on a "worthless" hex | **Reject** | A one-tile Blast that cuts a bridge can be far better than a three-tile Blast. Judgement. |
| Bombing a tile you could overgrow with a card | **Reject** | The numbered card may be a Bloom card; which card is worth more is card economy, not a rule. |
| Not Blooming when a recipe had room | **Reject** | Suboptimal, not obvious: keeping a Bloom for the turn that counts is normal play. |
| Leaving a tile cuttable with `cutLoss ≥ N` | **Reject** | Positional judgement and a wolf-crier: extending always creates exposure, the rival may not hold the card, and "no defence exists" needs a search. `web/src/analysis.ts` (`dangerWarning`) already warns about the move itself. |

Ten candidates, three shipped. Where in doubt the answer was **no pulse**.

## 3. The trigger: every guard and why it exists

`undoNudge(found, gate)` refuses unless **all** of these hold:

| Guard | Why |
| --- | --- |
| `found` — the move was a **deliberate EndAct** | Only the end of the Grow step is judged; `auto` (the app's jump to Throw) is never the player's move. |
| `canUndo` | The throw closes the window; a pulse after it would be a lie about the key. |
| `!lesson` | A lesson, the tutorial, a watched replay, an online duel, or the coach's opening hints already own guidance. This is also why the coach and the detector can never contradict each other: they never speak on the same position. |
| `severity ≥ MISTAKE_MIN_SEVERITY` (**one number**) | Raising the bar is one edit; every class has a fixed severity (3 win, 2 last door, 1 big cut). |
| `shownThisMatch < MISTAKE_MAX_PER_MATCH` (**1**) | **One nudge per match** (owner direction, 2026-11-20). Rare enough to mean something, and it always falls on the first proven mistake — the worst one the player actually made. Per turn is already structural (one EndAct per turn), so the cap only limits how often the game speaks. |

Also, by construction:

- **Never the opponent's move, never a spectator/replay** — the nudge only comes from `humanPlay`
  (the offline human funnel), and the page also requires the stored position to be the one on
  screen, an offline session, and `!watching`.
- **Never blocks input** — the halo is `pointer-events: none`, absolutely positioned, and the key's
  hit area, size and place are untouched (measured in the browser proof).
- **Never requires a dismissal, never moves layout** — bound to the state object; the next move,
  the throw or the take-back removes it.
- **Silent for a strong player who simply plays differently** — nothing here compares moves to the
  bot's ranking or to the coach's choice. Only objective loss counts.

## 4. Cost

Once per Grow step the player ends (a handful of times a match — and nothing at all for the app's
auto-skips). The work over the `View` already in hand:

- two `viewFor` copies (37-hex board + hand, microseconds);
- ≤ 6 neighbours per home, twice;
- one `cutLoss` per reachable rival non-root tile (a `sever` over ≤ 37 hexes) — and only when the
  first two checks are silent.

No move search, no `rankActions`, no Bloom enumeration, no network, no timers, no per-frame work.
It runs in the same tick as the move; it never touches a render loop.

## 5. The visual

The halo is a child of the existing key (`<i class="nudge-halo">` in `web/index.html`), so nothing
is created at runtime and the key's geometry is unchanged (28 px in the legacy dock, **44 px** in
the FUTASAKU 0.4 cockpit). CSS lives beside `.hand-slot` in `web/src/style.css`:

- a **painted layer** carrying one fixed `box-shadow` (the game's cream/ivory glow vocabulary,
  like the guide's `.gd-halo`), animated with **opacity and transform only** (1.9 s, `.97 → 1.05`
  scale) — no `filter`, no animated `box-shadow`, no per-frame JS;
- **Reduce motion** (`html.reduce-motion` or the OS preference): the animation stops and the glow
  stays at its bright value — still an affordance, simply still;
- **Effects Low**: the same pulse at roughly half strength (`--nudge-lo/-hi`), never removed. **Not
  reachable on the 0.4 product**: the Futasaku channel parses settings with `essentialsOnly`, which
  fixes `effects` to `normal`, so the quiet class can never be set there. It remains defined for the
  classic/live line and is pinned by `web/tests/mistakes.test.ts` rather than claimed in the browser
  suite (which seeded it and could never pass);
- while lit, the key's `aria-label`/`title` say *why*: "Undo: take back your last move — the win was
  on the table". No banner, no new element, no board overlay.

## 6. What the tests prove

`web/tests/mistakes.test.ts` (32 tests) — every class fires on a hand-built position that really is
that mistake (including a real `apply` that wins by Strangle, and a real block that keeps the game
alive), and every near-miss stays silent:

- win: two doors open · the door not touching my network · Grow spent · no numbered card · a move
  that is not the end of the Grow step · the app's auto-skip · the coach's own winning move;
- last door: Grow spent · two doors open · the door already mine · Sprouts off;
- cut: one tile short of the bar · a bridge that cannot be overgrown · a bridge out of reach ·
  Grow spent;
- guards: no undo · lesson · cap reached · raised bar · wording;
- a clean position is silent.

`web/e2e/undo-nudge.ts` (browser, Chromium, 23 checks) — the pulse on a real bad end-of-Grow, the
key's size unchanged, the aria words, a real Undo press taking the move back, the pulse **gone after
the throw**, silence on a good move, Reduce motion (static glow) and the channel fact that Effects is
fixed to normal on 0.4.

**How the suite drives the Grow step's end (fixed 2026-11-20).** It used to click
`#smart-context[data-action="skip"]` and wait for `DISCARD`; that timed out every run. The key is the
cockpit's **popup trigger** (`aria-haspopup="menu"`), so the click only opened `#smart-selector` and
the phase stayed `ACT`. The action is the menu item the trigger reveals ("Skip the Grow and throw a
card"). The suite now taps the trigger, then that item — the path a player takes — and falls back to
the hidden `#moves .end` row when the cockpit key is absent. The nudge was working the whole time;
the harness was pressing the wrong control.
