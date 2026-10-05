# SEVEROR V3 Art System Starter

This ZIP is a **technical-art production starter**, not the final painted asset pack.

It is built from the current SEVEROR board problem, the previous V1/V2 lessons, and the new V3 requirements:
- continuous world textures instead of one picture per hex;
- strict top-down projection;
- network as the hero;
- local clarity masks for numbers and gold badges;
- separate master / hi / lo tiers;
- exact pointy + flat masks;
- screen-upright lighting/art when the board rotates;
- no V1/V2 per-tile connector sprites;
- no contact-sheet extraction as production art.

## What is already real in this starter
- exact master/hi/lo coverage masks for pointy and flat orientation;
- exact hex clip masks;
- number-zone and gold-zone clarity masks;
- geometry metadata;
- network style specification;
- cutoff-state specifications;
- full production brief;
- renderer handoff;
- QA/export scripts;
- manifest schema/template;
- the current failed screenshot as a clearly labelled negative reference.

## What is intentionally NOT in this starter
The final V3 painted textures, homes, props, strips and FX are **not fabricated from the old V2 art**. That would reproduce the exact problem V3 is meant to solve.

The next art task is **Phase 1 style frames only**. The art agent must create the real V3 art language, prove it at 40/80/150 px, then stop for approval. Only after approval should the full painted pack be produced.

## Start here
1. `PASTE_INTO_ART_AGENT.md`
2. `spec/ART_DIRECTION_V3.md`
3. `spec/RESOLUTION_EXPORT.md`
4. `developer_handoff/RENDERER_HANDOFF.md`
5. `spec/FUTURE_FAILURE_PREVENTION.md`
6. `qa/README.md`

The screenshot in `reference/CURRENT_ATTEMPT_DO_NOT_COPY.png` is a negative reference only.
