# Device and quality checks that have never been run

Every number in every handoff so far comes from **Chromium with mobile emulation**. No human has
held this game on a real phone. That is the single largest unmeasured risk in 0.6, and this is the
programme that closes it: a device matrix, then four passes — performance, feel, experience, and the
one that actually decides whether people come back, satisfaction.

Run it in this order. The early passes find bugs; the last one finds whether the game is worth
playing, and the answer there is not a pass/fail.

## 0. The device matrix

Six devices cover the space; a seventh is a "cheap and old" canary.

| # | Device | Width class | Why this one |
| --- | --- | --- | --- |
| 1 | iPhone SE (2nd/3rd gen) | 375 × 667, no safe areas | smallest modern iPhone, worst case for the dock |
| 2 | iPhone 13 / 14 | 390 × 844, notch | the modal phone; matches every screenshot we own |
| 3 | iPhone 15 Pro Max | 430 × 932, Dynamic Island | biggest handset, largest safe-area insets |
| 4 | iPad (any, Safari) | 768+ | the wide-screen case and Safari's different scroll model |
| 5 | Pixel 7a (Chrome) | 412 × 915 | the Android reference |
| 6 | Galaxy A14 / similar | 360 × 800, slow | the budget Android most of the world actually uses |
| 7 | *canary:* any 3+ year-old Android | 360 | throttle it: does the game still run at 30 fps? |

Both **Safari** and **Chrome** on iPhone if possible (they share WebKit; the difference is UI chrome
and the PWA shell).

**Set every device to the same conditions**: 50% brightness, silent switch off, no low-power mode
first, then repeat the key flows once *with* low-power mode on — iOS throttles animation there and
we should know what it looks like.

## 1. Platform risks (do these first — they are the likely failures)

These are the specific things emulation cannot tell us:

- **`:has()` support.** The press-shade, the FIT corner fix and several cockpit rules depend on
  `:has()`. It is Safari 15.4+; on anything older those rules silently do nothing. Check the
  attributes-styled state actually applies, not just that the page loads.
- **`dvh` / `svh`.** The world window and the game screen are sized with viewport units. Safari's
  collapsing toolbar is the classic way to get a 60px jump. Scroll the Territory and the game and
  watch for the layout moving under a finger.
- **Safe-area insets.** Notch and Dynamic Island must not eat the header, the FIT button, the LED or
  the bottom keys. Every full-height screen: menu, game, pause, Territory, Settings.
- **Momentum scrolling inside the fixed game.** iOS rubber-bands the page behind a fixed overlay.
  The board must never move the page: drag the map and the board hard at the top and bottom.
- **Audio unlock.** iOS only starts audio from a real gesture. The first tap must produce sound;
  check that a mute-then-unmute works and does not need a second tap.
- **Haptics.** iOS Safari has **no** `navigator.vibrate`. Every `vibrate()` call is a silent no-op
  there. That is acceptable, but it means "feel" on iPhone is carried entirely by sight and sound —
  judge it that way, and do not report haptics as broken.
- **PWA / Home Screen.** Install to the Home Screen and open from the icon: no browser chrome,
  correct icons, the manifest's scope respected, and back navigation does not escape the app.
- **Text size and zoom.** Safari's minimum font size and the reader's own larger-text setting. This
  is where the 320-wide no-scroll promise actually gets tested.
- **The keyboard.** Any input (invite code, report a problem): does the viewport survive it, does the
  field stay visible, does closing restore the layout.

## 2. Performance

Measure, do not eyeball. For each device, at least once:

- **Cold start** — tap the icon to the menu being tappable. Target **< 2.5 s** on device 2, **< 4 s**
  on device 6. Record it; there is no baseline yet.
- **Board start** — tap a level to a playable board, including the first-visit art warm (capped at
  800 ms).
- **Frame health during the heavy moments** — the cut animation, a Bloom, the LED marquee, the
  Territory pan. Use Safari's Web Inspector timeline / Chrome's performance panel on a tethered
  device. Look for dropped frames, not average fps. **Criterion: no visible stutter in a cut or a
  pan.** The pan was optimised to one `viewBox` write per frame — verify that on hardware.
- **The tap-to-response budget.** With the timeline recording, from finger down to the first painted
  change. Target **< 100 ms** perceived. This is the number that decides whether the game feels
  expensive or cheap.
- **Memory and heat.** Play 20 matches in a row; watch memory in the inspector and feel the phone.
  A leak shows up here or nowhere.
- **Battery.** 15 minutes of play, note the battery delta. A game that eats 10% in 15 minutes on an
  idle-ish board is a problem.
- **Offline.** Airplane mode: the menu, an offline match and a saved match must all still work. The
  online surfaces should fail politely, not blank.

## 3. Feel

The things that make input feel good, judged by hand, twice each:

- **Tap latency** on a card, a hex, a menu key. Nothing should need a second tap.
- **Drag thresholds** — grow, paint and the Territory pan: does the gesture start when you expect,
  and does a slightly shaky finger still register as a tap?
- **Double-tap throw** — does the second tap feel deliberate or accidental? (This is where #5 in the
  papercut list came from.)
- **The 3 s lesson floor** — does it feel like reading time or like a delay? If it feels like a
  delay on a real phone, say so; the number is adjustable.
- **Scroll and panning momentum** inside the map, and whether the page ever fights it.
- **The FIT toggle** at thumb reach, and whether 44 px is genuinely comfortable one-handed.

## 4. Experience

The journey, as a person:

- First ever open → menu → a level → a win. Where is the first confusion? Note the exact moment.
- Every screen at the reader's largest text size.
- Every sheet: does closing it return you where you came from, with the keyboard focus visible?
- Online: guest name, find opponent, an invite code, a live duel to the end. Nothing should feel
  like a different game from offline — that is now a stated requirement.

## 5. Satisfaction — the dopamine pass

Not pass/fail. Record what actually happens and whether it lands.

For each of these moments, watch a first-time player (or yourself, cold, on a device you have not
used for this): **what makes the moment feel good, and is it all on the same frame?**

- **A cut** — is there punch, sound, shake, particles, and does the opponent's loss read clearly?
- **A Bloom** — does the extra move feel like a bonus, or like a chore? (This is papercut #2.)
- **The win** — the finish card, the Seeds line, the sound. Does it feel earned and finished, or
  abruptly cut off?
- **The Seed reward** — the moment a number goes up. Is it visible, is it celebrated, does the ledger
  ever feel like a receipt instead of a reward?
- **A loss** — does it sting without feeling unfair? Can you see what beat you?
- **Territory** — growing a tile and watching the colour spread. Does the map make you want one more
  cell? That is the whole retention loop in one gesture.

The test that matters: **after the win, do you want to start another match immediately?** If not,
the problem is in this section, not in the bug list.

## Recording

One row per device per pass, in a spreadsheet: device, OS/browser, pass, what was measured, result,
verdict, screenshot filename. Anything that fails becomes an issue with the device named — "fails on
iOS Safari" is actionable, "fails on mobile" is not.

Suggested order of execution, so the expensive parts are not wasted: **§1 platform risks on devices
2 and 6 → fix → §2 performance on 2 and 6 → §3 feel on 2 → §4 journey on 2 and 5 → §5 with a real
person.** Devices 1, 3, 4 and 7 are the edges; they confirm, they do not lead.

## What this programme is not

It is not a substitute for CI. The Chromium suites stay the regression net; this finds the things a
headless browser on a Mac cannot. Both are needed, and only one of them has ever been run.
