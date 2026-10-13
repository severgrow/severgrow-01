# FUTASAKU 0.5 — two-phone playtest script

**What you are testing:** online duels in FUTASAKU 0.5 — starting a match with a friend, playing live
and over time, the Find opponent queue, resigning, and the help screens.

**Live site:** <https://severgrow.github.io/severgrow-01/futa0.5/>
**Build tested:** channel `Futasaku0.5`, commit `9716463` (from the site's `release.json`,
dated 13 Oct 2026). Every button name below was taken from this build.

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

Each test has three parts: **Do this** (the taps), **Should happen**, and **Write down if not**.
Fill in the results table at the end as you go.

---

## TEST 1 — Play a friend, live (both phones on at the same time)

**Do this**

1. **Phone A:** open the link. On the menu tap **Play online**.
2. **Phone A:** tap **Create a duel**. You get a waiting screen with a short **invite code** and
   buttons **Share invite** and **Copy link**.
3. **Phone A:** tap **Share invite** (or **Copy link**) and send the link to Phone B by any normal
   means (text, chat, email).
4. **Phone B:** open that link. It goes straight to the join screen with the code filled in.
5. **Phone B:** tap **Join** (confirm if asked).
6. Both phones should now be on the game board.

**Should happen**

- Both phones show the board. Each person sees **their own home at the bottom** (your tree on moss,
  green) and **the opponent's home at the top** (their volcano on lava, red). So each phone looks
  "the same way up" to the person holding it.
- The small strip at the top shows the opponent's name, their presence (Online / Away), the turn
  ("Your turn" or "Opponent's turn"), a who-starts chip, and a countdown.
- **Who starts:** exactly one phone shows **You start** and the other shows **Opponent starts**. They
  must agree — if A sees "You start", B must see "Opponent starts".
- **Nothing leaks mid-turn.** On the playing phone, draw and place a card but tap nothing that ends
  the turn. The other phone's board must **not move at all**.
- **The throw arrives as one replay.** When the playing phone throws to end the turn, the other
  phone shows that whole turn appear at once, as a short replay. Then the turn passes.

**Write down if not**

- If both phones say "You start" (or both say "Opponent starts") — note it.
- If the other phone's board changed before the throw — note it (and what changed).
- If the turning phone saw the opponent's cards, or vice versa — note it.

---

## TEST 2 — Play a friend, over time (one phone closed)

**Do this**

1. Keep the duel from Test 1 going.
2. **Phone B:** close the page completely (close the tab, or close the browser).
3. **Phone A:** take one full turn and throw it (this works even though B is gone).
4. Look at Phone A's top strip: the countdown should be running.
5. **Phone A:** tap the top-left menu button, then **Main menu** to leave the board.
6. **Phone A:** tap **Play online** and look at the match list.
7. Later (any time that day), **Phone B:** reopen the link, tap **Play online**, and open the match
   from the list.

**Should happen**

- On Phone A after the throw, the match is saved and the countdown restarts for the other player.
- The countdown is a **length of time, not a clock time** — it reads like **`23h 58m`**, not "18:42"
  or a date.
- The match list shows the state clearly: **Your turn** if it is that phone's move, **Opponent's
  turn** if it is the other player's move, **Waiting** while a fresh invite has not been joined yet,
  and **Finished** once the match is over.
- When Phone B reopens and enters the match, it catches up: B sees everything that happened while
  away, played back.

**Write down if not**

- If the countdown shows a clock time or a date instead of "23h 58m".
- If a match is missing from the list, or the list says the wrong turn.

---

## TEST 3 — Find opponent (both phones ready)

Only do this when both phones are open and idle, so they can find each other.

**Do this**

1. **Both phones:** open **Play online** and tap **Find opponent** at about the same time.
2. Watch both screens for a few seconds.

**Should happen**

- While searching, the screen is clear about what is happening: **Finding an opponent**, with the
  line "You are in the queue. The duel opens the moment someone else joins." The button reads
  **Searching…**.
- The phones pair with each other and open the duel. The pairing is live because both are here.
- You still get the same board and top strip as Test 1 (who-starts chip, presence, countdown).

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
special short-window build, skip this test and write "needs test build" in the table.

**Do this (short-window build only)**

1. Start a duel with a friend and get to the board.
2. Whoever's turn it is does **not** play. Let the turn run out.
3. Wait for the next turn to run out as well.

**Should happen**

- The **first** missed turn by a player **warns** them and gives **one more chance** — the deadline
  is extended, and the screen reads **Time ran out — one more chance**. The match list row shows
  **Grace used** for that player.
- The **second** missed turn by that same player **ends the match**, with the reason shown as
  **timeout**.

**Write down if not**

- If the first miss ends the match with no warning.
- If the second miss does not end it, or the result does not say timeout.

---

## TEST 6 — Resign and the finished screen

**Do this**

1. Start a duel and get to the board.
2. On one phone, tap the small **Resign** button in the top strip. Confirm if asked.
3. Look at the finished screen on **both** phones.

**Should happen**

- Both phones show a finished screen with a clear headline: **You won** on one phone and **You lost**
  on the other (or **Draw** if it was a draw).
- It says **what happened** and **why** (for example, that you resigned), and shows the **final
  score**.
- It is **short**. No wall of text.
- There is a way onward (Play again / See the board / Back to menu).

**Write down if not**

- If the two phones disagree about who won.
- If the screen is missing the reason, the score, or is hard to read / too wordy.

---

## TEST 7 — How to / Match Intel during a duel

**Do this**

1. In a duel, tap the little **lightbulb** button (it is the Match Intel button; its tooltip says
   "Match Intel") near the card controls.
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
  carry your matches to another browser with a one-time code.)
- **No push notifications.** The app cannot ping your phone. You only find out it is your turn when
  you **open the site** and look at your matches.
- **One shared database.** Everyone plays on the same small database. Now and then it may be briefly
  slow or show a short error on a busy moment; wait a few seconds and try again.
- **Home Screen app has its own storage.** Installing to the Home Screen gives it a separate set of
  matches from the browser.

---

## Results

Fill this in as you test. `Pass` or `Fail`, plus a short note.

| Test | What it covers | Pass? | Notes |
| --- | --- | --- | --- |
| 1 | Friend invite, live play, who-starts, hidden mid-turn, one-replay throw | | |
| 2 | Friend invite, over time, saved turn, 24h countdown, correct list state | | |
| 3 | Find opponent pairs two live phones | | |
| 4 | Find opponent with nobody around, three choices, computer is honest | | |
| 5 | First miss warns, second miss loses as "timeout" (needs test build) | | |
| 6 | Resign and the finished screen (what, why, score, short) | | |
| 7 | Match Intel and its How to tab, never shows the opponent's hand | | |
