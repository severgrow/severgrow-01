// The Territory entry's two read-outs (owner brief, 2026-10-20):
//
//   "work on TERRITORY button in menu and on side of it inside it show n seeds on one side and
//    n tiles on the other one - showing how much seeds and tiles on territory current player have
//    -- make it look good symmetric alligned stylish as fuck"
//
// The DATA is authoritative and never guessed: Seeds come from the server wallet the Territory
// screen already reads (`GET /v1/seeds/wallet`), tiles are the cells the player OWNS in the shared
// world (`world.claims` with `ownerId === playerId`) - not every filled tile. The menu reads both
// ONCE per menu show (see `refreshMenu` in `lobby-ui.ts`); nothing here fetches, polls or measures.
//
// The VIEW is deliberately all-or-nothing. A half-known pair (a wallet but no map, or the reverse)
// would leave one side of the entry empty and break the symmetry, and a made-up 0 would be a lie.
// So `territoryCounts` returns null unless BOTH numbers are known, and the paint simply hides both
// read-outs while keeping the "TERRITORY" label exactly where it is.
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import { MENU, ONLINE } from '../../../src/strings.js';
import { EASE, MOTION } from '../logic/motion.js';
import { seedBalanceLabel, seedIcon } from './seed-icon.js';

/**
 * The pair the entry shows, plus the world's own size for the spoken line. The WORDS are the
 * game's existing ones (owner decision, 2026-10-20: the noun stays TILES, and there is no second
 * word for the same count): the Seeds balance is written exactly as the Territory wallet writes it
 * (`seedBalanceLabel`, "128 SEEDS") and the tiles read exactly as the Territory screen reads them
 * (`ONLINE.worldHeld`, "3 of 183 tiles grown"). Nothing here coins copy.
 */
export type TerritoryCounts = Readonly<{ seeds: number; tiles: number; cells: number }>;

/** A sanity ceiling on both reads, so a malformed payload can never paint a broken number. */
const MAX_TILES = 100_000;
const MAX_SEEDS = 10_000_000;

/**
 * What the menu may honestly show, or `null` when either read is unavailable.
 *
 * - `wallet`   the server's wallet for this identity, or null when it could not be read.
 * - `world`    the shared map payload (`WorldMapPayload.world`), or null when it could not be read.
 * - `playerId` the identity the two reads belong to; a guest has a real wallet and can own tiles.
 *
 * `tiles` counts DISTINCT cells owned by `playerId`, the same rule `WorldView.paint` uses for "my
 * territory" (`own`). Another player's tiles never count, and an empty map honestly answers 0.
 */
export const territoryCounts = (
  wallet: SeedWallet | null,
  world: WorldMapPayload['world'] | null,
  playerId: string | null,
): TerritoryCounts | null => {
  if (!wallet || !world || !playerId) return null;
  if (!Number.isFinite(wallet.balance) || wallet.balance < 0 || wallet.balance > MAX_SEEDS) return null;
  // A malformed payload is treated as unknown, never as an empty world that would claim 0 tiles.
  if (!Array.isArray(world.claims)) return null;
  const owned = new Set<string>();
  for (const claim of world.claims) {
    if (claim && claim.ownerId === playerId && typeof claim.cellId === 'string') owned.add(claim.cellId);
  }
  if (owned.size > MAX_TILES) return null;
  const cells = Array.isArray(world.cells) ? world.cells.length : 0;
  if (!cells) return null;
  return { seeds: Math.floor(wallet.balance), tiles: owned.size, cells };
};

export type TerritoryCountsUI = {
  /** Paint a known pair, or hide both read-outs (the label stays). Never throws, never fetches. */
  paint(counts: TerritoryCounts | null): void;
};

/** Reduced motion is a designed static state: the numbers simply arrive, with no settle. */
const reducedMotion = (): boolean => {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.classList.contains('reduce-motion')) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * The one animated moment: numbers that actually CHANGED settle over one acknowledgement tempo
 * (`MOTION.ack`, 96 ms) on opacity only. No transform on the text (it must not jiggle the shared
 * centre line), no measurement, no timer, and nothing at all under reduced motion.
 */
const settle = (el: HTMLElement): void => {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  try {
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: MOTION.ack, easing: EASE.standard });
  } catch {
    /* An engine without Web Animations simply shows the number. */
  }
};

/**
 * Wire the markup once. The seed icon is the SAME authored SVG the Territory wallet uses, at the
 * sidebar size; the tile glyph is the shared `data-icon="tile"` (filled by `fillIcons`). Both sit
 * in equal 16px cells, so the two halves are the same instrument at the same scale.
 */
export const installTerritoryCountUI = (doc: Document = document): TerritoryCountsUI => {
  const button = doc.getElementById('menu-world');
  const seeds = doc.getElementById('menu-world-seeds');
  const tiles = doc.getElementById('menu-world-tiles');
  const seedsValue = doc.getElementById('menu-world-seeds-value');
  const tilesValue = doc.getElementById('menu-world-tiles-value');
  const seedsIcon = doc.getElementById('menu-world-seeds-icon');
  if (!button || !seeds || !tiles || !seedsValue || !tilesValue) {
    return { paint: () => undefined };
  }
  seedsIcon?.replaceChildren(seedIcon(16));
  let shown: TerritoryCounts | null = null;
  return {
    paint(counts) {
      button.setAttribute('aria-label', counts
        // The screen-reader line reuses the Territory screen's own words for both counts.
        ? `${MENU.world}. ${seedBalanceLabel(counts.seeds)}. ${ONLINE.worldHeld(counts.tiles, counts.cells)}`
        : MENU.world);
      if (!counts) {
        seeds.hidden = true;
        tiles.hidden = true;
        shown = null;
        return;
      }
      const changed = !shown || shown.seeds !== counts.seeds || shown.tiles !== counts.tiles;
      seedsValue.textContent = String(counts.seeds);
      tilesValue.textContent = String(counts.tiles);
      // The `hidden` attribute comes off BOTH sides in the same frame, so the entry never shows a
      // lone number: the pair appears and disappears as one instrument.
      seeds.hidden = false;
      tiles.hidden = false;
      if (changed) {
        settle(seeds);
        settle(tiles);
      }
      shown = counts;
    },
  };
};
