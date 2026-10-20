# Levels: the learning journey

The primary single-player flow is **PLAY → LEVEL n**. Internally this is still called Campaign, but the player sees Levels. Training and the separate Tutorial remain optional. A level is an ordinary deterministic engine match with an authored board, a fixed seed and an existing bot tier. Guidance is presentation only: it cannot force a move, change the rules or change a score. Online and Territory use their own game setup.

## Progression

| Levels | Board | Guidance | Teaching focus |
| --- | --- | --- | --- |
| 1–3 | 19 hexes | High | Draw, Grow, Throw; choose between legal placements |
| 4–7 | 19 hexes | Medium | Connection, strength, defense and cutting |
| 8–10 | 19 hexes | Targeted | Bomb, Bloom, then gold and a combined small-board match |
| 11–15 | 37 hexes | Low | Larger space, rocks, detours, contested ground |
| 16–20 | 37 hexes | Optional | Independent play and tactical variation |
| 21–30 | 37 hexes | Normal game | Existing Chapter III levels and identity |

Level objectives are recorded in `CAMPAIGN_LESSONS` in `web/src/logic/campaign-guide.ts`. This is a design target, not a forced script. The exact per-level sequence comes from the owner's level-by-level onboarding addendum. Level 8's fixed opening includes a Bomb; the normal engine can create a legal Bomb opportunity when networks meet. Level 9's opening can create a legal Bloom after the first Draw. Rocks first appear in Level 10 alongside gold; Level 11 expands the board on open ground, and Level 12 teaches a blocked route. Levels 1–9 have no terrain teaching clutter. Bot tiers rise gradually: 1 for Levels 1–5, 2 for 6–11, then 3–7 through Level 20. Levels 21–30 keep their published definitions.

## Guidance and feedback

`campaignCue` reads the current engine phase, legal actions and event history. Early levels put one short cue in the existing compact `first-tip` surface and dock hint. The same currently actionable deck, card, Bloom control or legal target receives a restrained emphasis. This is one visual language built on existing legal-target highlights. An invalid hex/card tap gets a brief nearby message such as `DRAW FIRST` or `BLOCKED BY ROCK`; `invalidCampaignHex` derives this from phase, terrain and legal actions. The message does not block the next move.

Guidance is turned off with **Settings → More playing options → Guided level cues**. This affects presentation only. Levels 16–20 have no compulsory phase prompts. Early guidance never locks an alternative legal move, so the same match remains playable after Undo, restart or refresh.

When adding a teaching level, first verify its learning situation with the actual engine and seeded opening. A text cue must be conditional on a real action or visible event. Do not solve the problem by writing an engine rule into the UI. Confirm the next level does not introduce a new board size, a stronger opponent and unfamiliar terrain together.

## Persistence and Seeds

Stable level IDs and progress keys are unchanged. A win still unlocks the next level; a replay of a completed level cannot produce a second first-clear reward. The Campaign save wrapper now records `openingVersion`. Existing v1 saves are interpreted as the published v1 opening; new matches are v2. The underlying encoded match still carries its original base state and replays from that state on resume. The server verifies queued v1 proofs against `legacy-levels-v1.ts` and new v2 proofs against the new definition. An old proof with no version defaults to v1. The Seeds settlement source key remains `campaign:<level-id>` across revisions, preserving one-time reward constraints and wallet history. Publish the API verifier before the new web build. If a v2 proof reaches the older verifier during rollout, the browser retains it for a later retry instead of dropping the first-clear replay.

The first three first-clear rewards remain 50 Seeds each. Chapter bonuses still occur every ten levels. No engine, card, scoring, AI implementation or online match rule was changed for onboarding.

## Source map

- `src/campaign/levels.ts`: current authored openings and bot tiers.
- `src/campaign/legacy-levels-v1.ts`: frozen published openings for saved games and pending proofs.
- `src/campaign/validate.ts`: authored-board legality and reachability.
- `src/campaign/progress.ts`: unlock and completed-level records.
- `web/src/logic/campaign-guide.ts`: presentation cues and invalid-tap explanations.
- `web/src/logic/campaign.ts`: save wrapper and opening revision.
- `web/src/main.ts`: shared board, cockpit, menu and tip rendering.
- `server/src/seeds/verify.ts`: deterministic reward-proof replay by opening revision.

## Verification

Run `npm run typecheck`, `npx vitest run tests/campaign web/tests/campaign-guide.test.ts web/tests/campaign-save.test.ts server/tests/seeds-verify.test.ts`, and a local Futasaku 0.5 build with the three public Vite API variables set. `web/e2e/campaign-onboarding.ts` opens Levels 1–20 in a browser and checks phone, tablet and desktop layouts. Also play the first several levels manually with the text ignored, try wrong targets, an alternative legal target, refresh mid-level, Undo and the guidance toggle. Automated checks cannot prove that a new player understands the game; that requires the next human playtest.

Representative screenshots are in [`docs/screens/campaign-onboarding/`](screens/campaign-onboarding/): first Draw and Grow on a 320px phone, legal Bloom on a 390px phone, the first full board, Level 20 and the desktop opening.

Previous board and balance research is preserved in [CAMPAIGN-PRE-ONBOARDING.md](CAMPAIGN-PRE-ONBOARDING.md) as historical documentation; its old level table is no longer the active design.
