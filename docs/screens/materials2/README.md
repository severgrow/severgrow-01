# Material pass 2: screenshots, performance, self-review

Made with `npx tsx web/e2e/materials2-shots.ts --dir=docs/screens/materials2` (built page,
Chromium, device pixel ratio 2). Phone = 390x844, desktop = 1280x800.

| File | What it shows |
| --- | --- |
| `phone-board.jpg`, `desktop-board.jpg` | A mid-game board: moss 1-7, lava 4-9, a top-rank 9 with its double rim and glow |
| `phone-board-low.jpg`, `desktop-board-low.jpg` | The same board with Material detail: Low |
| `phone-lab.jpg`, `desktop-lab.jpg` | The lab (`?lab=1`): moss and lava 1-9 ramp strips, then a board of mixed strengths where moss meets lava, in every palette |
| `phone-lab-low.jpg`, `desktop-lab-low.jpg` | The lab at Low detail |
| `phone-pill-bot.jpg` | "Bot's turn" during its hold (the sweep, the thinking dots, the faint edge wash) |
| `phone-pill-you.jpg` | "Your turn" after the bot's turn |
| `perf.json` | The raw performance numbers below |

## Performance (Chromium, this container, no other load)

| Measure | Result |
| --- | --- |
| Frame rate during a full bot turn at Normal speed | **60 fps** average; 95% of frames within 16.7 ms; 1 of 344 frames over 20 ms; worst 33 ms |
| Full board paint (first open, palette or detail change) | ~645 ms of work, split into slices of 16 canvas rows (a few ms each), so frames keep coming; tiles show their plain look until it lands |
| Repaint after a move (only the changed tiles and the area they can reach) | ~42 ms of work, in the same thin slices (was 110 ms before the repaint area was narrowed) |
| Memory | Canvas 2.3 MB (about 574,000 pixels at 4 bytes each, the whole board at 1.9 px per board unit) plus one PNG of it; JS heap 7.6 MB |
| Size | Page JS +16.4 KB (+6.0 KB gzipped), CSS +2.5 KB (+0.55 KB gzipped) |
| Low fallback | Settings → Material detail: Low (fewer blades, no flowers or roots); a device whose full paint takes over 2.5 s of work switches to Low by itself |

## Tests

`web/tests/vigour.test.ts`, `web/tests/worldpaint.test.ts`, `web/tests/turnbanner.test.ts`,
including the 7 adversarial tests:
1. a strength-1 tile beside a top-rank tile of the same owner: no seam at the border;
2. the number meets WCAG AA over the worst texture colour, every material, t and palette;
3. top-rank lava beside moss: no lava colour on the moss side, no grass on the lava side;
4. maxRank 7 and 9 both give exactly the fullest look at the top;
5. after one tile changes, no pixel beyond the repaint area changes (checked to fail with
   a smaller area), so partial repaints never leave stale pixels;
6. a cut-off tile keeps its structure (a dried 9 is still bushier than a dried 1) with no
   living green and no glow;
7. the turn pill: skipped mid-way, Reduce motion, two turns' events back to back (the
   latest wins, nothing stacks), interrupted at any moment always a valid state.

## Self-review (honest)

- **Not done:** the optional moss-lava contact effect (lowest priority). Where they meet
  there is a clean hex edge, no smoke or scorch.
- **Cut-off tiles:** the painter can draw dried moss and cooled lava for cut-off tiles (and
  is tested for it), but the live board still shows the older fading scar for them, so
  that path is only seen in the lab.
- **First paint:** on opening, tiles show the plain look for about a second until the full
  paint lands, then switch. A cross-fade covers later repaints, not that first switch.
- **Encoding:** each repaint publishes the whole canvas as a PNG for the SVG pattern. It is
  async and was not seen in the frame times, but it is the largest remaining cost; on a
  slow phone it could show as a short hitch after a move.
- **The automatic Low fallback** is not unit-tested (it needs a real canvas); it was checked
  by reading the code path, not by forcing a slow device.
- **Edge wash:** deliberately faint; on a bright screen in daylight it may not be noticed.
  It only adds to the pill, which carries the message on its own.
