# server-core and the world/reward boundary

`src/server-core/` is pure groundwork for the online world: player models, tickets/rewards, match
verification, world coordinates, territory placement, activity and leaderboards. It reads no clock,
database or network (`now` is always passed in). This pass audits it against the current Futasaku 0.4
engine and classifies each part.

## Classification

| Component | Status | Notes |
| --- | --- | --- |
| `types.ts` (`Ticket`, `Account`, `Cell`, `WorldEvent`, `Fail`) | **KEEP** | Plain serialisable records; no rules baked in. |
| `config.ts` (`WorldConfig`, `DEFAULT_WORLD_CONFIG`, `RULES_VERSION`, `BOT_VERSION`) | **KEEP** | `RULES_VERSION` is `CURRENT_RULES_VERSION`; single source of truth. |
| `tickets.ts` `issueTicket` | **KEEP** | Server-chosen seed, rules/bot version, TTL. Unchanged. |
| `tickets.ts` `verifyGame` | **UPDATED** | Now builds the opening from the engine match setup (`newMatch`), so it agrees with the client about who starts. Replays with the stored `rulesVersion` + `botVersion`. |
| `tickets.ts` `finishGame` (token banking) | **EXPERIMENTAL** | Ties a win to a banked sprout token. Keep for tests, but **do not connect to real player progress yet** (Section 10). |
| `nickname.ts` | **KEEP** | Pure validation/change; uniqueness is supplied by the caller's `taken` set. Needs a real store before use. |
| `world.ts` `canPlaceAt` / `planPlacement` | **KEEP** | Pure planning with a compare-and-set `expected` cell — the right shape for the transactional boundary below. |
| `world.ts` `InMemoryWorld.commit` | **KEEP** | Reference atomic commit (compare-and-set); the model for the real store. |
| `world.ts` `seedWorld` / `recentFeed` / `leaderboards` | **KEEP** | Pure; independent of duel rules. |
| `tests/server-core/*` | **UPDATED** | Helpers/verification now use the engine match setup and cover both starting seats. |

Nothing in `server-core` was written against a pre-0.4 *duel* rule except the old "player 0 always
moves first" assumption in `verifyGame`, which is fixed.

## Rules version (Section 11)

The authoritative persisted rules version is `CURRENT_RULES_VERSION` in `src/engine/versions.ts`:

```
futasaku0.4-strength-draw
```

Every persisted match record (game ticket, replay, future online match row) must store this string,
and every reader must resolve it through `rulesConfig(version)`. Archived versions
(`v0.8-fruit-sprout`, `futasaku0.3-*`) stay in `RULES_VERSIONS` so old matches keep replaying under
their own rules — never under future ones. Archived versions also set
`startingPlayerLottery: false`, so their recorded player-0 starts still verify.

## World / reward boundary (Section 10)

The duel engine must **never** mutate the world. The only allowed flow is:

```
VERIFIED MATCH RESULT  →  REWARD LEDGER  →  WORLD ACTION
```

1. **Verified match result.** `verifyGame` (or a future PvP equivalent) confirms the match under the
   stored rules version and produces a result — nothing more.
2. **Reward ledger.** A verified result is recorded once, keyed by a stable id (e.g. `matchId` +
   `seat`), as an append-only ledger entry. Rewards are *granted* here, not spent.
3. **World action.** Spending a reward to place/overgrow a tile is a separate, atomic step
   (`planPlacement` + `commit`), never a side effect of finishing a duel.

Requirements for any future reward spending or tile claiming:

- **One reward cannot be spent twice.** The ledger marks a reward spent by id, and the world action
  is committed with a compare-and-set on the ledger entry as well as the cell.
- **Two simultaneous requests cannot claim incorrectly.** `planPlacement` reads a snapshot and
  `commit` compares the expected prior cell; the store must enforce this atomically (e.g. a
  conditional write / transaction), not read-then-write.
- **Retries cannot duplicate rewards.** Granting uses the verified result id as an idempotency key;
  re-submitting the same result returns the stored ledger entry.
- **Concurrent world updates remain safe.** Every world mutation is a single atomic compare-and-set;
  no mutation reads state it does not also compare against.

`InMemoryWorld.commit` already models this. The real backend (database) must preserve the same
compare-and-set semantics; until then, do not wire rewards to real player progress.
