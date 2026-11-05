# Futasaku sound effects — handover for Claude Code

174 sounds cut from Patryk's one-take recording, trimmed, faded and level-matched.

## What's here
- `sfx/*.mp3` — game-ready files (mono, 44.1 kHz). Put them in the repo at `audio/sfx/`.
- `sfx-map.json` — every game moment → which sound set plays, volume (0–1) and pitch wobble.
- `index.html` — sound board to audition everything (needs the `sfx/` folder next to it).
- WAV masters (48 kHz / 24-bit) are in the separate masters zip — keep them out of the repo.

## Naming
`<set>_<take>.mp3`, e.g. `tile_land_02.mp3`. A set is several takes of the same sound;
the game picks one at random each time (never the same twice in a row).

## Levels (already baked into the files)
- quiet (soft): sounds heard constantly — key presses, card select, opponent tiles, glass ticks
- medium: most actions
- loud (big): rare moments — coins payout, glass ring, big metal, meld complete

## How to wire it (keep it simple)
1. Use the Web Audio API: on first user tap, create one AudioContext, then fetch + decode every file once and keep the buffers.
2. One helper: `sfx('hex.claim')` reads `sfx-map.json`, picks a random take from the listed set(s),
   applies `volume`, and sets `playbackRate = 1 ± pitchJitter` (random).
3. Special behaviours (see the "when" text in the map):
   - `seeds.payout`: coins, then one `glass_tap` per counter step, +1 semitone per step (`rate = 2^(n/12)`), max 12 steps.
   - `meld.add_card`: `wood_stack`, +2 semitones for each card added; `meld.complete` after.
   - `hex.claim` / `hex.claim_opp`: several tiles → play 80 ms apart.
   - `bot.level`: `rock_click_01` pitched +1 semitone per level.
   - Fixed takes: `ui.close` → `ui_tape_close_04`, `match.lose` → `metal_big_02`, `network.bloom` → `gritty_02`, `map.zoom` → `gritty_01`.
4. Max 4 copies of the same sound playing at once (drop extras).
5. Settings: one SFX volume slider + mute toggle, saved per player.
6. No music and no synth stabs yet — the plan leaves room for them on `match.found`, `match.win` and `meld.complete`.

If taps feel slightly late on iPhone Safari, re-export the soft UI sounds as `.m4a` (AAC) from the WAV masters — some Safari versions keep the tiny MP3 start gap.
