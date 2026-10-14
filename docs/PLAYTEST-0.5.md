# FUTASAKU 0.5 — two-phone playtest script

> **Status pointer:** [`ONLINE.md`](ONLINE.md) is the index for the online-duels work.

**What you are testing:** online duels in FUTASAKU 0.5 — starting a match with a friend, playing live
and over time, the Find opponent queue, resigning, and the help screens.

**Live site:** <https://severgrow.github.io/severgrow-01/futa0.5/>
**Build tested:** FUTASAKU 0.5 online, channel `Futasaku0.5`, commit
`577744808b9e4b59896f98c7c4119bdbd35bdc56` (short `5777448`), taken from the site's
`release.json` on 13 Oct 2026. Every button name below was taken from this build.

You do not need dashboards, passwords or any setup. You just need the two devices and this page.

---

## Before you start

- **Two devices.** Two phones is ideal. One phone plus one computer also works, as long as they are
  two different devices.
- **Browser.** Any modern browser (Safari, Chrome, Edge, Firefox). For the first run, **use the
  browser, not the Home Screen app** — see the next point.
- **Same exact link.** Both devices must open this same address:
  <https://severgrow.github.io/severgrow-01/futa0.5/>
- **Home Screen note.** If you "Add to Home Screen", that app keeps its **own** separate set of
  matches. Matches you start in the browser will not appear there, and the other way around. So do
  this first run in the plain browser.
- **What not to do.** Clearing browsing data (or "Clear website data") will **lose that device's
  matches**, because a match is tied to that device until accounts exist. Don't clear it during the
  test.
- **One shared world.** All players share one database. If the site feels slow for a moment, wait a
  few seconds and try again — that is load, not a broken phone.
- **An empty match list on first load is normal.** If your browser still had an old sign-in (for
  example after the test database was wiped), the game quietly makes a fresh guest and retries. You
  may see **No matches yet.** — that is expected, not a bug.

Each test has three parts: **Do this** (the taps), **Should happen**, and **Write down if not**.
Fill in the results table at the end as you go.

---

## TEST 1 — Play a friend, live (both phones on at the same time)

**Do this**

1. **Phone A:** open the link. On the menu tap **Play online**.
2. **Phone A:** tap **Create a duel**. You get a waiting screen. The **invite code is 4 characters**
   now (a small chip you can tap to copy, with **Tap to copy** under it). **Share invite** is the
   main button; **Copy link** and **Cancel match** are also there.
3. **Phone A:** tap **Share invite** (or **Copy link**) and send the link to Phone B by any normal
   means (text, chat, email).
4. **Phone B:** open that link. It lands on the join screen with a confirm that reads
   **Join this duel?** and the buttons **Join** and **Cancel**. (The confirm does not name the
   opponent — that is on purpose.)
5. **Phone B:** tap **Join**.
6. Both phones should now be on the game board.

**Also worth checking (typed code):** instead of the link, open **Join with a code** on Phone B and
type the 4-character code. A **typed code joins straight away with no confirm** — only arriving by
link asks first.

**Should happen**

- Both phones show the board. Each person sees **their own home at the bottom** (your tree on moss,
  green) and **the opponent's home at the top** (their volcano on lava, red). So each phone looks
  "the same way up" to the person holding it.
- The thin strip across the top shows the **turn word** — **Your turn** or **Opponent's turn**. On a
  wider screen it also shows the opponent's name; on a phone the name is left out. There is **no
  "who starts" chip and no countdown in this strip any more**. Presence (Online / Away) is **not
  shown in this build**, so do not look for it.
- **If a turn is nearly up**, a short warning word appears in that same strip: **Less than 2 hours
  left** (amber) with under 2 hours to go, and **Less than 15 minutes left** (red) with under 15
  minutes. With plenty of time left nothing is shown. The full countdown is in the match list, not
  on the board.
- **Who starts:** there is no permanent chip. The result is said **once**, by the little
  **"Who starts?"** lottery animation when the duel opens: one phone tells you that you move first
  and the other that the opponent moves first. They must agree — if A sees "you move first", B must
  see "opponent moves first". After that reveal it is not kept on screen.
- **Nothing leaks mid-turn.** On the playing phone, draw and place a card but tap nothing that ends
  the turn. The other phone's board must **not move at all**.
- **The throw arrives as one replay.** When the playing phone throws to end the turn, the other
  phone shows that whole turn appear at once, as a short replay. Then the turn passes.

**Write down if not**

- If both phones were told the same person starts (both "you first" or both "opponent first").
- If the other phone's board changed before the throw — note it (and what changed).
- If the turning phone saw the opponent's cards, or vice versa.
- If the top strip still shows a "who starts" chip, a countdown, or a presence dot/word.

---

## TEST 2 — Play a friend, over time (one phone closed)

**Do this**

1. Keep the duel from Test 1 going.
2. **Phone B:** close the page completely (close the tab, or close the browser).
3. **Phone A:** take one full turn and throw it (this works even though B is gone).
4. **Phone A:** tap the top-left menu button, then **Main menu** to leave the board. (Leaving ends
   the online session on that phone; the match itself is kept.)
5. **Phone A:** tap **Play online** and look at the match list. The time left for the match is shown
   on its row — that is where the deadline lives now, not in the duel strip.
6. Later (any time that day), **Phone B:** reopen the link, tap **Play online**, and open the match
   from the list.

**Should happen**

- On Phone A after the throw, the match is saved and the deadline resets for the other player.
- Time left is a **length of time, not a clock time** — it reads like **`23h 58m`**, not "18:42" or a
  date. When it gets close, the row adds **Less than 2 hours left**, and inside the duel the strip
  shows the amber/red warning word (see Test 1).
- The match list shows the state clearly: **Your turn** if it is that phone's move, **Opponent's
  turn** if it is the other player's move, **Waiting** while a fresh invite has not been joined yet,
  and **Finished** once the match is over.
- **Leaving and coming back is safe.** After **Main menu**, opening the same match again from the
  list brings it back exactly where it was — leaving never loses the match.
- When Phone B reopens and enters the match, it catches up: B sees everything that happened while
  away, played back.

**Write down if not**

- If the time left shows a clock time or a date instead of "23h 58m".
- If a match is missing from the list, or the list says the wrong turn.
- If leaving the board and reopening the match lost it or showed an error.

---

## TEST 3 — Find opponent (both phones ready)

Only do this when both phones are open and idle, so they can find each other.

**Do this**

1. **Both phones:** open **Play online** and tap **Find opponent** at about the same time.
2. Watch both screens for a few seconds.

**Should happen**

- While searching, the screen is clear about what is happening: **Finding an opponent**, with the
  line "You are in the queue. The duel opens the moment someone else joins." The way out is the
  **Stop searching** button.
- The phones pair with each other and open the duel. The pairing is live because both are here.
- You still get the same board and top strip as Test 1 (the turn word, no who-starts chip, no
  countdown, no presence).

**Write down if not**

- If they never pair, or pair with somebody who is not your friend.
- If the searching screen is unclear or the duel opens before the other phone is ready.

---

## TEST 4 — Find opponent when nobody is around

**Do this**

1. Use **one** phone only. Open **Play online** and tap **Find opponent**.
2. Leave that screen open and wait. (The app offers a way out after about three minutes.)

**Should happen**

- First you see the searching screen (**Finding an opponent**).
- After a few minutes with no opponent, it changes to **Nobody yet** with "You stay in the queue."
  and offers **three clear choices**:
  **Play the computer** · **Invite a friend** · **Keep searching**.
- It must be obvious that **Play the computer** means a game against the computer, not a real
  opponent. Tap it — a normal offline game starts, and it must be clear you are playing the computer
  (the board says "vs the computer").
- Important: choosing **Play the computer** does **not** cancel your search. The search keeps running
  in the background. If a real person turns up while you play, you get a dismissible **Opponent
  found** prompt with **Play now** / **Later**, and your computer game is not lost (Leave/Later keeps
  it, and Continue brings it back).

**Write down if not**

- If the three choices never appear, or the computer option looks like a real person.
- If picking the computer stops your search, or your computer game is lost when an opponent arrives.

---

## TEST 5 — A missed turn: first warning, then the loss

**Note:** this one needs a **test build with a short turn window**. On the normal live site every turn
lasts **24 hours**, so you cannot reach a timeout during an evening's play. If you are not using a
special short-window build, skip this test and write "needs test build" in the table. It cannot be
run on the live site.

**Do this (short-window build only)**

1. Start a duel with a friend and get to the board.
2. Whoever's turn it is does **not** play. Let the turn run out.
3. Wait for the next turn to run out as well.

**Should happen**

- The **first** missed turn by a player **warns** them and gives **one more chance** — the deadline
  is extended, and the screen reads **Time ran out — one more chance**. The match list row shows
  **Grace used** for that player.
- The **second** missed turn by that same player **ends the match**, with the reason shown as
  **timeout** (on the finish screen: "You ran out of time." / "Your opponent ran out of time.").

**Write down if not**

- If the first miss ends the match with no warning.
- If the second miss does not end it, or the result does not say timeout.

---

## TEST 6 — Resign and the finished screen

**Do this**

1. Start a duel and get to the board.
2. On one phone, tap the top-left **menu** button, then **Resign**, and confirm **Resign this duel?**.
   (Resign now lives inside the pause menu — it is no longer a button in the top strip.)
3. Look at the finished screen on **both** phones.

**Should happen**

- Both phones show a finished screen with a clear headline: **You won** on one phone and **You lost**
  on the other (or **A draw** if it was a draw).
- It says **what happened** and **why** in a full sentence — for example **You resigned.** /
  **Your opponent resigned.**, **You surrounded your opponent's home.**, **The deck ran out. The
  higher score wins.**, or **You ran out of time.**
- It shows the **final score**, a **tiles/gold breakdown** (like "You: 12 tiles (3 on gold) ·
  Opponent: 9 tiles"), and a short list of **highlights**. Under the title a small line reads
  **vs <opponent>**.
- It is **short**. No wall of text.
- There is a way onward: the buttons are **Back to matches** / **Menu** / **Share**.
- Leaving from here (**Back to matches** or **Menu**) ends the session on that phone, and the match
  stays in the list so it can be reopened.

**Write down if not**

- If the two phones disagree about who won.
- If the screen is missing the reason, the score or the breakdown, or is hard to read / too wordy.
- If the buttons are not **Back to matches** / **Menu** / **Share**, or leaving loses the match.

---

## TEST 7 — How to / Match Intel during a duel

**Do this**

1. In a duel, tap the little **lightbulb** button near the card controls (it is the Match Intel
   button; its tooltip reads **Tips**).
2. Tap the **How to** tab.
3. Also stop the duel and open **How to play** from the in-game menu (top-left menu button →
   **How to play**) to check the same reference.

**Should happen**

- Match Intel opens with **two tabs**: **Match Intel** (what has happened in this match) and
  **How to**.
- The **How to** tab is the moves reference: Grow, Bloom, Bomb and Blast, with plain wording and a
  small example. It reads clearly and can be scrolled.
- It **never shows the opponent's hand**. You may see how many cards they hold, but never which
  cards. The same reference opens from the in-game menu's **How to play**.

**Write down if not**

- If the tabs are missing or the wording is confusing.
- If you can ever see the opponent's actual cards.

---

## Known limits — these are not bugs

- **Matches live on this device.** Until accounts exist, a match is tied to the browser/device you
  started it on. Clearing website data loses that device's matches. (There is a Settings option to
  carry your matches to another browser with a one-time 8-character link code — that one is longer
  than an invite code on purpose.)
- **No push notifications.** The app cannot ping your phone. You only find out it is your turn when
  you **open the site** and look at your matches.
- **One shared database.** Everyone plays on the same small database. Now and then it may be briefly
  slow or show a short error on a busy moment; wait a few seconds and try again.
- **Presence is not shown in this build.** There is no Online / Away dot or word on the board yet, so
  do not go looking for one.
- **Home Screen app has its own storage.** Installing to the Home Screen gives it a separate set of
  matches from the browser.

---

## Results

Fill this in as you test. `Pass` or `Fail`, plus a short note.

| Test | What it covers | Pass? | Notes |
| --- | --- | --- | --- |
| 1 | Friend invite (link confirm / typed code), live play, once-only who-starts reveal, hidden mid-turn, one-replay throw | | |
| 2 | Friend invite, over time, saved turn, 24h time left in the list, leave-and-reopen keeps the match | | |
| 3 | Find opponent pairs two live phones | | |
| 4 | Find opponent with nobody around, three choices, computer is honest | | |
| 5 | First miss warns, second miss loses as "timeout" (needs test build) | | |
| 6 | Resign in the pause menu, finished screen (full reason, score, breakdown, vs name, buttons) | | |
| 7 | Match Intel and its How to tab, never shows the opponent's hand | | |
