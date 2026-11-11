# The Art Lab (futasaku.com/art)

A hidden page for the hired designer: upload art, see it at once in the real game at phone size,
export one art pack an agent drops into the game unchanged. Not linked from the game, `noindex`,
never cached by the game's offline worker. Everything stays on the designer's device (IndexedDB);
"Clear all" deletes it. No server, no account.

## What the designer does

1. Open futasaku.com/art. It starts with **today's art** in every slot (marked "Today's art").
2. Work down the checklist (left): each slot says its exact size, transparency, where it appears and
   what it weighs. Drop a file on a slot. PNG, JPG or WebP; the lab makes both tiers (phones and big
   screens) and checks it: size and shape, see-through where required, seams (3×3 tiling preview),
   weight. A refused file shows its error in its slot and the slot keeps what it had.
3. Judge it in the phone frame: the real game (cockpit, hand, piles, stars) with the board drawn by
   the game's skinned renderer. Real bot games: seed, board size, move scrubber, play; animations
   (Grow, Strengthen, Cut, Bomb, Blast, Card play, Idle motion); phone sizes; Reduce motion.
4. Checks for the eye: **Hold: today's art** (before / after), Squint (values only), red-green and
   blue-yellow colour blindness, arm's length. Number plates show their contrast ratio.
5. **Export art pack** → one zip. **Import pack** reopens a zip (how the owner opens what the
   designer sent). **Copy link** shares an exact position ("seed 4821, move 37").

## What an agent does with a pack

The zip is the game's own layout (see its README.md):

- `skin.json` — the SkinDef as JSON; `skinFromJson(json, root)` (web/src/ui/skin/pack-json.ts) gives
  the SkinDef that `SkinBoardView` draws. `manifest.json` lists every file per tier with hashes.
- `lo/`, `hi/` — board art per tier, at the skin root. Strength masks are included.
- `cards/` — the four suit sheets (3×3, 256×356 each), back, back frame, Bomb; `cards/icons/*.svg`.
- `planet/` — one 512 px seamless texture per tile kind for the planet's textured mode
  (`PlanetRenderer` option `textures`; the live planet does not use it yet).
- `pack.json` — the lab's own record (settings, which slots are the designer's, today's or empty).

**The live board does not use the skin system yet.** Today's board is `DefaultArtBoardView` (painted
sprites). The owner's decision (2026-11-11): the lab and packs use the skin system; moving the live
game onto `SkinBoardView` is a separate step once a pack is ready and measured on phones.

## How it works (code)

- `web/art/index.html`, `web/src/art-lab/` — the page. Built by its own pass
  (`web/vite.art.config.ts`, run by `scripts/build-art-lab.mjs` for CHANNEL=futa05 only) into
  `dist/art/`, so the game's build, chunks and first load are untouched.
- The phone frame loads the real game as `../?artlab=1&seed=N`: its own storage prefix and no server
  (`IS_ART_FRAME` in web/src/channel.ts, `duelApiUrl` in web/src/online/config.ts). The lab renames
  the game's `#board` to `#board-game` (hidden) and draws a `SkinBoardView` as `#board` with the
  pack's files held in memory (`provideSkinFiles` in web/src/ui/skin/assets.ts).
- Slot rules: `web/src/art-lab/slots.ts` (sizes from the skin tiers and today's files). Upload checks:
  `checks.ts`. Pack format: `pack.ts`, `zip.ts`. Bot games: `generator.ts`.
- Tests: `web/tests/art-lab.test.ts` (rules, checks, export → import, every file the board asks for,
  the game never imports the lab); browser walk `web/e2e/art-lab.ts` (+ `art-lab-ios` on WebKit).
