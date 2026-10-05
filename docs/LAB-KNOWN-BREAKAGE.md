# Lab: known breakage

Tests that fail on `dev` because of the Lab work. Lite mode leaves them failing on purpose.
"Lock it in" fixes them all before anything goes to `main`.

| Test | Why it fails | The fix when locking in |
| --- | --- | --- |
| `tests/engine/config.test.ts` › DEFAULT_CONFIG › matches the spec defaults (v0.4) | The config has two new keys, `board: null` and `reshuffleDiscard: false`. Their defaults change nothing. | Add both keys to the expected defaults, and to SPEC. |
| `tests/engine/golden.test.ts` › golden games › seeds 1-8 | The saved game states include the config, and the config has the two new keys. The moves and results are the same as before: the Classic preset plays identically. | Regenerate the 8 goldens after checking that only the two config keys differ. |

Only these likely-affected files were run (lite mode): config, golden, hygiene-pure, names,
share, endgame, layout. Others were not run; the full suite may show more.
