# FUTASAKU

A minimalist hex strategy game. Grow a connected network, cut your opponent's links, and protect your home. Campaign lessons, practice matches, online duels, replays, chat and the shared Planet use the same deterministic rules.

Play at **[futasaku.com](https://futasaku.com/)**. The web staging channel is **[/test/](https://futasaku.com/test/)**.

## Start here

Read **[AGENTS.md](AGENTS.md)** before changing anything. It is the authoritative working policy for every agent and contributor.

| Question | Authoritative source |
| --- | --- |
| Game rules | [SPEC](docs/SPEC.md) |
| Code layout and extension patterns | [Architecture](docs/ARCHITECTURE.md) |
| Materials, controls, motion and accessibility | [Visual conventions](docs/VISUAL-CONVENTIONS.md) |
| CI, staging, promotion and rollback | [Release flow](docs/RELEASE-FLOW.md) |
| Verified 0.81 foundation and performance evidence | [Foundation](docs/history/FOUNDATION-0.81.md) |
| Online client and server | [Online](docs/ONLINE.md), [backend](docs/BACKEND.md) |
| Planet rendering and interaction | [Planet](docs/PLANET.md) |
| Levels 1-10 and onboarding | [Lesson scripts](docs/LESSON-SCRIPTS.md), [campaign](docs/CAMPAIGN.md) |

## Local development

Use Node 20.19 or newer. CI's main checks use Node 20; 20.20.2 reproduces the recorded 0.81 simulations. Use the lockfile:

```sh
npm ci
CHANNEL=futa04 npm run web:dev
```

`futa04` is the default local product build. Online `futa05` builds also require the configured `VITE_DUEL_API_URL`, `VITE_SUPABASE_URL` and public `VITE_SUPABASE_ANON_KEY`. Keep privileged credentials out of browser builds. See the online documentation for local server setup.

```sh
npm run check
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
```

For UI changes, run the relevant suites in `web/e2e/`, listed in the release guide. If Playwright's Chromium is unavailable, set `PW_CHROMIUM` to an installed binary. WebKit suites cover the Safari engine; they do not replace a physical iPhone/PWA check. `web/e2e/motion-cost.ts` is a measuring tool, not a frame-rate guarantee.

## Shipping

- Work from the latest appropriate source and preserve concurrent changes. Keep experimental work isolated.
- Push verified changes to **`futa0.5-online`** for `/test/`. This does not promote the root.
- Promote only with the owner's approval, using the existing release process. **`live`** selects the root source.
- A branch move is not deployment proof. Confirm the approved publisher succeeded and resolved the intended live and test hashes.
- Never push this product to `main`, `dev` or `Main2.0`. They are different historical product lines.

`/test/` has isolated web storage and caches but uses the live online server. Edge Functions and migrations deploy separately. Preserve compatibility until the server rollout; never change account balances, ownership or gameplay authority through presentation code.

## Protected foundations

`v0.81` identifies the verified foundation at `65d78bf1`. The original 0.8 source is preserved as `v0.8-preserved-20261106` at `15f80b7c`. Restore instructions and verification limits live in the foundation document. Keep these tags fixed.

Engine state and replay logic live in `src/engine/`; browser presentation in `web/src/`; online authority in `server/`. Keep rules deterministic, presentation separate and saves compatible. Player-facing names are Grow, Bloom, Bomb and Blast. Legacy ids (`Sprout`, `PlayFruit`, `MegaBomb`, `severgrow.*`) remain compatibility contracts.

The previous top-level README described the old `/3/` onboarding branch. Its valuable history is preserved [here](docs/history/README-before-0.82.md). Historical documents explain past decisions; they do not override AGENTS.md or current release instructions.
