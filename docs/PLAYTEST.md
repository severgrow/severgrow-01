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
> 4. **PLAY → PLAY ONLINE → Create a duel.** Share the 4-character code with someone else testing,
>    or send them the link. Then play your turns — you each get 24 hours, so you can take your time.
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
3. **The admin dashboard** (see below — it is not published yet).
4. **The world map** at https://www.futasaku.com → The world map, to watch claims appear.

### The admin dashboard, right now

It is **built and its database migration is applied**, but publishing it needs a GitHub workflow
change I could not push — the token lacks `workflow` scope. Two options:

- **Run it locally** (works fine today): `npm run admin:dev`, then open the URL it prints. It talks
  to the live API, so it shows real data. Only you can see it, and only while it runs.
- **Or publish it properly**: add `workflow` scope to the GitHub token (GitHub → Settings →
  Developer settings → Personal access tokens → your token → tick `workflow`), then say so and I
  will push `f33163d`, the one commit that is already written and waiting. `docs/ADMIN.md` §7 has the
  exact text if you would rather paste it yourself.

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
| 1 | **`/admin/` is not published** | Migration applied and the dashboard works; the one-line CI change is written but unpushable without `workflow` scope. Run it locally today. |
| 2 | **Player-name search in the dashboard is case-sensitive** | Being fixed now. Searching `ryk` finds nothing; `RYK` works. Only affects the dashboard, not the game. |
| 3 | **The `#tag` is not shown next to names in the match list** | So two players with the same generated name can look identical. Accepted **for the playtest**; a per-player report/block flow is the real fix, and it is not built. Worth knowing if a tester says "who am I playing?". |
| 4 | **Campaign balance is measured, not felt** | Levels 1–3 are deliberately gentle, 4–10 ramp, 11–20 step up visibly, 21–30 are the hardest built. The numbers came from bot-vs-bot games: a fixed bot wins **90% / 70% / 40%** across the three chapters. No human has played it. Ask testers whether the step from 10 to 11 actually feels like one. |
| 5 | **The world map is nearly empty** | It started fresh again today — expect a small number of claims, not a busy map. |
| 6 | **Four bot test suites are slow enough to flake under load** | Test-only. They pass when the machine is quiet; it does not affect players. |
| 7 | **The public world map has NO rate limit at all** | I checked this because ten testers on one wifi share a per-IP budget, and the world view polls every 12 seconds while visible. **Good news: the world read is not rate-limited** — `GET /v1/world` returns before any limiter (`server/src/seeds/router.ts:27`), and it needs no account. So the one-wifi arithmetic that worried me (3,000 requests/hour for ten viewers against a 600/hour cap) **does not apply**. **But it leaves two real observations:** (a) `worldPerIpPerHour` in `server/src/config.ts` is **dead config** — documented as the world's cap, defined as 600, and never applied anywhere, so it reads like a control that does not exist; (b) the endpoint does a Postgres transaction per call (`for share` on `world_meta`), so it is unmetered database work. Fine for 10 testers; a flood surface at scale. **Deliberately not changed tonight** — adding a limiter hours before a playtest risks breaking the playtest, and the current state is safe at this scale. |
| 7b | **The other per-IP limits do apply to the group** | Ten in one house share: **create 120/hour** (12 duels each), **join 400/hour** (40 each), **guests 200/hour**. Generous for a playtest, but if two testers on the same wifi both see a rate-limit message at once, that is why. |
| 8 | **No accounts beyond Google, and no password reset by design** | If someone clears their browser data without an account, their guest identity is gone. Sign in with Google first and this cannot happen. |
| 9 | **The main menu can take 1–3 seconds to show a way to play** | Measured on live: PLAY appears **594ms, 1282ms, and 1.5–3s** across runs. Until it does, a tester sees the wordmark, an empty gap, and only Tutorial and Settings — it looks like a menu with no game in it. The cause is traced: the product buttons are revealed only after boot awaits a network round-trip to Supabase (`accounts/mount.ts` probes whether Google is on), which none of PLAY / World map / the beta line actually need. **Being fixed right now.** If a tester says "the site is broken / there's no play button", this is what they saw; a refresh or a two-second wait clears it. |
| 10 | **A native browser confirm when you start a new game over a saved one** | Clicking **Training** with a saved game asks `window.confirm("Start a new game? The saved game will be lost.")`. It works, but it is the **only** piece of the app that looks like a browser alert instead of FUTASAKU. Cosmetic; not worth risking a change before the playtest. |

---

## Part 4 — what "done" looks like for the playtest

The point is not that they find no bugs — it is that they can **play a full game, start to finish,
without me explaining anything**. So the two questions worth asking each of them afterwards:

1. Did you finish a game? (If not, where did you stop, and why?)
2. What did you not understand? — that one is about the game being clear, not the code being right.
