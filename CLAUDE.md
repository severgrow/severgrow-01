# Futasaku 0.3 development notes

Read `AGENTS.md` and `docs/SPEC.md`. Work on `Futasaku0.3` only. The game rules are pure and deterministic; keep the engine free of clocks, I/O and unseeded randomness. Do not change gameplay or bot decisions during visual or cleanup tasks. Do not weaken tests or regenerate golden results to mask a regression.

Build the current game with `CHANNEL=test2 npm run web:build`, run `npm run check`, and run the relevant browser checks before a green commit. Preserve the existing save keys, boot event and action identifiers. Main, Dev and the frozen Main2.0 branch are outside this branch's development scope.
