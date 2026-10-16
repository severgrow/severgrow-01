# FUTASAKU 0.55 — playtest pack (Saturday morning, 10 testers)

Two audiences in one file: **Part 1** is what you send the testers. **Part 2** is your own runbook
for while they play. Part 3 lists what is genuinely not finished, so nothing surprises you.

Live at **https://www.futasaku.com** — the real thing, a real server, real accounts.

---

## Part 1 — copy-paste this to the testers

> **FUTASAKU — a card and board game I've been building. Can you give me 20 minutes?**
>
> 👉 **https://www.futasaku.com**
>
> Tap **LOG IN** at the top and sign in with Google — that keeps your games, your Seeds and your
> territory if you switch phones. On a phone you can also "Add to Home Screen" and it behaves like an
> app.
>
> **What to try, roughly in this order:**
>
> 1. **Tutorial** first if you've never played — it teaches one turn at a time.
> 2. **PLAY → Training** for a game against the computer. Easy if you want to learn, Hard if you
>    want to be beaten up.
> 3. **PLAY → LEVEL 1–30** — a campaign. Starts very gentle and gets nasty around level 11.
> 4. **PLAY → Play online → Create a duel.** Share the 4-character code with someone else testing,
>    or send them the link. Then play your turns — you each get 24 hours, so you can take your time.
>    *(The first time you tap "Play online" it asks whether to continue with Google or play as a guest.
>    Either works, and it only asks once — if you already signed in above, you will not see it.)*
> 5. **Real time** turns the same duel into a live game with a 60-second clock per turn. Good with
>    two phones in the same room. **Leaving a real-time game forfeits it** — that's on purpose.
> 6. **Win and you earn Seeds.** Then open **The world map** from the main menu and spend 100 Seeds
>    to claim your first hex. Beat someone who owns a hex and you take it off them. It's one shared
>    map for everyone.
> 7. **Set a nickname** — you'll be asked once, right after signing in.
>
> **When something goes wrong, please use it:** in a game, open the menu (☰) → **Report a problem**.
> That sends me your device details and where you were. It is the single most useful thing you can
> do — a report from a real phone is worth more than any amount of my own testing.
>
> **Please tell me specifically:**
> - Anything that felt **broken** (a button that did nothing, a screen that wouldn't load).
> - Anything that felt **slow** or **stuttery**.
> - Anything you **couldn't work out** how to do — that's a design failure, not yours.
> - Whether **maps, numbers and text look right** on your screen.
>
> Try it on your phone **and** on a computer if you can. Bugs that only show on one are the ones I
> most need.

---

## Part 2 — your runbook while they play

### What to have open

1. **The game** on a phone, signed in as yourself. You are the only account, so you can be the other
   player in any duel they create.
2. **Reports**, one command:
   ```sh
   npm run feedback:recent                  # newest 20, marks anything new since you last looked
   npm run feedback:recent -- --kind=crash  # crashes only
   ```
3. **The admin dashboard**: https://www.futasaku.com/admin/ — sign in with Google as **RYK**.
4. **The world map** at https://www.futasaku.com → The world map, to watch claims appear.

### The admin dashboard

**It is live: https://www.futasaku.com/admin/**. Sign in with Google as **RYK** and you are in —
the allow-list already defaults to your account, so there is nothing to configure. It is marked
`noindex` and is not linked from the game, so only you will find it.

Worth a look while people play: **Reports** (what they have filed), **Overview** (players, matches,
Seeds, world), and **Economy** if you want to see the Seeds totals move. `npm run admin:dev` also
runs it locally against the same live data if you would rather.

### Things worth watching for, in the order they usually matter

- **Someone can't sign in.** The likeliest cause is Google, not us — but check `auth.users` grows.
- **A duel won't join.** Codes are 4 characters; check for typos.
- **The board doesn't update.** It should after each opponent turn; if it lags, that is a real bug.
- **Someone is stuck on "Opponent's turn"** for more than a few seconds while the other has finished.
- **Seeds not appearing after a win.** Note resignations and timeouts deliberately pay **nothing**.
- **Reports arriving** — read them as they come in rather than at the end; a tester who gets a reply
  bothers to report the next one.

### If someone reports a bug

Ask for the **match code** (the 4 characters) and the **build** they are on — it is on the beta line
under the FUTASAKU wordmark on the main menu. With those two I can find the exact game and what
happened.

---

## Part 3 — what is genuinely not finished

Know these before they do. None of them should stop a game being played.

| # | Thing | State |
|---|---|---|
| 1 | **`/admin/` is LIVE** | `https://www.futasaku.com/admin/` — sign in with Google as **RYK**. Nothing to set up; the allow-list already defaults to your account. (`npm run admin:dev` still runs it locally if you prefer.) |
| 2 | **Player-name search in the dashboard** | Fixed — case-insensitive, so `ryk` finds you. Not a wildcard search: it matches the whole name exactly, because the lookup returns ONE player and a partial match could silently show the wrong account as "the" match. |
| 3 | **The `#tag` is not shown next to names in the match list** | So two players with the same generated name can look identical. Accepted **for the playtest**; a per-player report/block flow is the real fix, and it is not built. Worth knowing if a tester says "who am I playing?". |
| 4 | **Campaign balance is measured, not felt** | Levels 1–3 are deliberately gentle, 4–10 ramp, 11–20 step up visibly, 21–30 are the hardest built. The numbers came from bot-vs-bot games: a fixed bot wins **90% / 70% / 40%** across the three chapters. No human has played it. Ask testers whether the step from 10 to 11 actually feels like one. |
| 5 | **The world map carries 2 tiles, not zero** | Both are **yours** (RYK), from your own duels. All the test tiles were removed today, so the 183-hex map is otherwise fresh and waiting for the testers. Say the word if you would rather it started completely empty. |
| 6 | **Four bot test suites are slow enough to flake under load** | Test-only. They pass when the machine is quiet; it does not affect players. One (`bloom-bands`) has a 60s timeout it can exceed on a busy machine — that is the suite, not the game. |
| 7 | **The public world map has NO rate limit at all** | The world read is not rate-limited — `GET /v1/world` returns before any limiter (`server/src/seeds/router.ts:27`) and needs no account, so ten testers all viewing it is fine. Two honest observations: (a) `worldPerIpPerHour` in `server/src/config.ts` is **dead config** — documented as the world's cap, defined as 600, applied nowhere, so it reads like a control that does not exist; (b) the endpoint does a Postgres transaction per call, so it is unmetered database work. Safe at ten people. **Deliberately not changed** — adding a limiter hours before a playtest risks breaking the thing it protects. |
| 7b | **The other per-IP limits do apply to the group** | Ten in one house share: **create 120/hour** (12 duels each), **join 400/hour** (40 each), **guests 200/hour**. Generous — and measured tonight: 11 creates + 21 guests + 20 joins from one IP in one hour, no refusals. Only a rematch marathon would reach the create ceiling. |
| 8 | **No accounts beyond Google, and no password reset by design** | If someone clears their browser data without an account, their guest identity is gone. Sign in with Google first and this cannot happen. |
| 9 | **A wrong invite code used to say "Something went wrong"** | **Fixed.** The join screen was mapping six error codes the server has never sent and missing all three it does send, so every failed join — the likeliest thing to go wrong tomorrow — read as a broken app. Now: a wrong code says "*That code is wrong or has expired*", a full duel says it is full, a finished one says it has finished. Two regression tests hold it: one drives the real server, one fails if the client ever maps a code the server cannot emit. Tests passed while the feature was broken, which is why this is now guarded rather than trusted. |
| 10 | **A native browser confirm when you start a new game over a saved one** | Clicking **Training** with a saved game asks `window.confirm("Start a new game? The saved game will be lost.")`. It works, but it is the **only** piece of the app that looks like a browser alert instead of FUTASAKU. Cosmetic; not worth risking a change before the playtest. |
| 11 | **On a tall phone the world map cannot zoom out to the whole world** | You chose a map that fills the column, and the world is nearly square — so filling the height on a portrait phone crops the width. You see ~151 of 183 tiles and can **pan** to the rest (verified: it clamps at the world edge). Zoom-*out* stops at the framed view, so the entire map at once is desktop/landscape only. A deliberate trade for "no empty bands"; it can be changed back if seeing all 183 at a glance matters more. |
| 12 | **Old test rows are still in the database** | ~228 throwaway guests and ~101 matches from testing, all auto-generated nature names. **Invisible to testers** (matches are per-player) — the only thing you would notice is inflated numbers on the admin dashboard. I left them in place deliberately: tidying them needs a multi-table delete against `RESTRICT` foreign keys, and I would rather not do that hours before a playtest. Say so and I will sweep them cleanly. |

---

## Part 4 — what "done" looks like for the playtest

The point is not that they find no bugs — it is that they can **play a full game, start to finish,
without me explaining anything**. So the two questions worth asking each of them afterwards:

1. Did you finish a game? (If not, where did you stop, and why?)
2. What did you not understand? — that one is about the game being clear, not the code being right.
