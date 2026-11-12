# Owner instruction — version this polish pass as **0.83**

When the misc polish pass on `misc-polish-futa05` finishes and is green:

1. **Rename / version the release to 0.83** so it is clearly distinct from the frozen
   `v0.82` line (immutable tag `v0.82`).
2. **Follow existing repo patterns** used for 0.82 — same kinds of touchpoints, not a new scheme:
   - In-product beta label (`FEEDBACK.betaVersion` / beta note → `0.83`)
   - Docs / handoff / precision-style notes as appropriate (`docs/PRECISION-0.82.md`,
     `docs/HANDOFF-0.82-*.md`, `docs/RELEASES.md`, history snapshots)
   - Git tag `v0.83` after the green release SHA is known (mirror `v0.81` / `v0.82`)
   - Release flow remains [`docs/RELEASE-FLOW.md`](docs/RELEASE-FLOW.md): push → `/test/`, then
     promote when authorised
3. **Auto-promote to live remains approved** for this polish pass. In the final report, say
   explicitly that the release is **0.83** (and that promote put / will put it live).

Do not treat this as a rules or scoring change — packaging / clarity only after the polish work
is verified green.
