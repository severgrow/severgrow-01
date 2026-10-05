# Design V3 art (development pack)

The V3 starter pack: briefs (`PASTE_INTO_ART_AGENT.md`, `spec/`), the renderer handoff,
geometry, QA/export scripts and the editable `masters/`. Nothing here ships to players.

Runtime files (only `lo/` and `hi/`) live in `web/public/design-v3/`. To drop in approved art:

1. Export the tiers from `masters/` (`qa/export_tiers.py`) into `web/public/design-v3/lo/` and
   `web/public/design-v3/hi/`, keeping the pack's file names and folders.
2. Run `npm run skin:manifest` (writes `web/public/design-v3/manifest.json`, the list of files the
   game may load; anything not listed is treated as missing and falls back).
3. Open the test copy, menu -> V3.

The renderer is `web/src/ui/skin/` (generic) and the skin data is `web/src/skins/forestVolcanoV3.ts`.
The negative reference screenshot is intentionally not kept.
