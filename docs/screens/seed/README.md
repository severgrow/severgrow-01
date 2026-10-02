# Seed A/B test: screenshots

Made by the browser test `web/e2e/seed-ab.ts` (`npx tsx web/e2e/seed-ab.ts --shots=docs/screens/seed`),
which plays, on a 390x844 phone: menu -> **Sprout version** -> a complete game -> menu ->
**Seed version** -> a complete game -> a saved Seed game after a reload. Games are dealt at
random, so the boards differ from run to run.

| File | What it shows |
| --- | --- |
| `menu.jpg` | SEVEROR with the two version buttons |
| `sprout-after-first-move.jpg` | Sprout version: the first sprout is worth its card, moss as before |
| `sprout-game-over.jpg` | the result screen says "Sprout version" |
| `seed-targets.jpg` | Seed version: a card picked, the hexes where the seed can go |
| `seed-after-first-move.jpg` | a seed planted with a high card is worth 1, drawn as a seed |
| `seed-after-strengthen.jpg` | the seed strengthened with a higher card: a normal tile again |
| `seed-game-over.jpg` | the result screen says "Seed version" |

The seed look: a small almond seed in freshly turned soil, mine with a curling shoot, the
opponent's an ember with a slowly waking spark, in the palette's own colours. Only tiles
placed by a Seed (and not yet strengthened) use it; lines, clumps and strengthened tiles are
the usual moss and lava.
