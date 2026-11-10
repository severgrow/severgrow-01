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
import type { SeedWallet, WorldChallengesPayload } from '../../../server/src/seeds/types.js';
import { MENU, ONLINE, PLANET } from '../../../src/strings.js';
import { FEATURES } from '../channel.js';
/** The menu entry's spoken name: THE PLANET on the staging copy, Territory everywhere else. */
const worldName = () => (FEATURES.planet ? PLANET.menu : MENU.world);
import { EASE, MOTION } from '../logic/motion.js';
import { formatRemaining } from './clock.js';
import { groupDigits } from '../logic/format.js';
import { seedBalanceLabel, seedIcon } from './seed-icon.js';
import { CHALLENGE } from './challenge-copy.js';
import { challengeUrgency, type ChallengeUrgency } from './challenge-view.js';

/**
 * The pair the entry shows, plus the world's own size for the spoken line. The WORDS are the
 * game's existing ones (owner decision, 2026-10-20: the noun stays TILES, and there is no second
 * word for the same count): the Seeds balance is written exactly as the Territory wallet writes it
 * (`seedBalanceLabel`, "128 SEEDS") and the tiles read exactly as the Territory screen reads them
 * (`ONLINE.worldHeld`, "3 of 183 tiles grown"). Nothing here coins copy.
 */
export type TerritoryCounts = Readonly<{
  seeds: number;
  tiles: number;
  cells: number;
  /**
   * Actions waiting for THIS player in Territory (owner, 2026-10-30): an incoming challenge to
   * answer, or a linked duel where it is the player's turn. It is computed by the shared predicate
   * (`territory-attention.ts`), never widened to "open challenges"; when the list could not be read
   * it stays 0 and the entry simply shows no lamp.
   */
  waiting?: number;
}>;

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
  /** Actions waiting for this player (an incoming challenge or a duel of their turn). An unreadable
   *  list is 0, never a guess. */
  waitingCount = 0,
): TerritoryCounts | null => {  if (!wallet || !world || !playerId) return null;
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
  const waiting = Number.isFinite(waitingCount) ? Math.max(0, Math.min(99, Math.floor(waitingCount))) : 0;
  return { seeds: Math.floor(wallet.balance), tiles: owned.size, cells, waiting };
};

export type TerritoryCountsUI = {
  /** Paint a known pair, or hide both read-outs (the label stays). Never throws, never fetches. */
  paint(counts: TerritoryCounts | null): void;
  /**
   * The right-hand half while an incoming challenge waits for THIS player's answer: the compact
   * countdown, or null to go back to the tile count. The entry's LABEL and the Seeds half never
   * move, and a tick writes one text node, nothing more (owner, 2026-11-01).
   */
  answer(text: string | null, urgency?: ChallengeUrgency | null): void;
};

/**
 * A pending challenge still inside its answer window: what the entry counts down instead of the
 * tile count. Its id keeps two overlapping windows from being confused for one another.
 */
export type TerritoryAnswer = Readonly<{ challengeId: string; expiresAt: number;
  /** How many incoming challenges are waiting for an answer (the entry reads "2 · 3h 10m"). */
  count: number }>;

/**
 * THE ONE THING THAT OUTRANKS THE TILE COUNT (owner, 2026-11-01: "when a challenge needs THEIR
 * response, replace the tile count with the remaining time"). Only an INCOMING, PENDING challenge
 * inside its window qualifies: an ACCEPTED one has no answer window left (its duel is the next
 * move and the entry's lamp already says so), and a resolved one asks nothing at all. The soonest
 * window wins, so two challenges can never overwrite each other at random.
 *
 * `now` is the SERVER-corrected clock (`clock.ts`, built from the payload's `serverNow`); nothing
 * here invents a deadline or reads the browser clock on its own.
 */
export const answerWaiting = (
  payload: Pick<WorldChallengesPayload, 'incoming'> | null | undefined,
  now: number,
): TerritoryAnswer | null => {
  if (!payload) return null;
  let soonest: { challengeId: string; expiresAt: number } | null = null;
  let count = 0;
  for (const challenge of payload.incoming) {
    if (!challenge || challenge.fromMe === true || challenge.status !== 'pending') continue;
    const { id, expiresAt } = challenge;
    if (typeof id !== 'string' || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
    count += 1;
    if (!soonest || expiresAt < soonest.expiresAt) soonest = { challengeId: id, expiresAt };
  }
  return soonest ? { ...soonest, count } : null;
};

/**
 * THE COMPACT COUNTDOWN ITSELF: the lobby's own formatter (`formatRemaining`, "18h 42m") applied to
 * an absolute deadline on the SERVER's clock, or null when the window has closed. It never adds a
 * word ("left" / "to answer"), so the entry cannot show anything but the time itself.
 */
export const answerLabel = (deadline: number | null, now: number, count = 1): string | null =>
  deadline !== null && deadline > now ? `${count > 1 ? `${count} · ` : ''}${formatRemaining(deadline - now)}` : null;

/** The countdown's colour step, the tile's own (calm / warm / hot), or null with no live window. */
export const answerUrgency = (deadline: number | null, now: number): ChallengeUrgency | null =>
  deadline !== null && deadline > now ? challengeUrgency(deadline - now) : null;

/**
 * The right-hand read-out at `now`: the compact time left to answer, or the player's tile count.
 * When the window closes the tile count returns by itself, so accepted / resolved rows and a
 * passed deadline all read as tiles again without any extra state.
 */
export const territoryReadout = (
  tiles: number,
  answer: TerritoryAnswer | null,
  now: number,
): string => answerLabel(answer?.expiresAt ?? null, now, answer?.count ?? 1) ?? String(tiles);

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
  const waiting = doc.getElementById('menu-world-waiting');
  if (!button || !seeds || !tiles || !seedsValue || !tilesValue) {
    return { paint: () => undefined, answer: () => undefined };
  }
  seedsIcon?.replaceChildren(seedIcon(16));
  let shown: TerritoryCounts | null = null;
  /**
   * The answer countdown's current text, or null when the tile count owns the half. It is kept
   * here (not read back from the DOM) so a menu pass can repaint the pair without losing the
   * countdown: the clock and the counts are written by two different reads of the same pass.
   */
  let answerText: string | null = null;
  /** Write the right-hand value from the ONE state: the countdown while one is live, else tiles. */
  const writeTiles = () => {
    if (!shown) return;
    const text = answerText ?? groupDigits(shown.tiles);
    if (tilesValue.textContent !== text) tilesValue.textContent = text;
  };
  return {
    paint(counts) {
      button.setAttribute('aria-label', counts
        // The screen-reader line reuses the Territory screen's own words for both counts. It stays
        // the same while the countdown ticks: a spoken name that changes every minute would chatter.
        ? `${worldName()}. ${seedBalanceLabel(counts.seeds)}. ${ONLINE.worldHeld(counts.tiles, counts.cells)}${
          counts.waiting ? `. ${CHALLENGE.actionsWaiting(counts.waiting)}` : ''}`
        : worldName());
      if (!counts) {
        seeds.hidden = true;
        tiles.hidden = true;
        if (waiting) waiting.hidden = true;
        shown = null;
        return;
      }
      const changed = !shown || shown.seeds !== counts.seeds || shown.tiles !== counts.tiles;
      // Five-digit balances are grouped the way the profile groups them ("12 400"): the same number
      // reads the same way in both places (owner, 2026-11-01 polish pass).
      seedsValue.textContent = groupDigits(counts.seeds);
      shown = counts;
      writeTiles();
      // The `hidden` attribute comes off BOTH sides in the same frame, so the entry never shows a
      // lone number: the pair appears and disappears as one instrument.
      seeds.hidden = false;
      tiles.hidden = false;
      if (waiting) {
        // THE LOOP'S SIGNAL: an action waiting for THIS player is the reason to open this screen,
        // so the key itself says so. Quiet by design — one lamp, not a badge with a number in it.
        const waitingCount = counts.waiting ?? 0;
        waiting.hidden = waitingCount === 0;
        if (waitingCount > 0 && waiting.dataset.count !== String(waitingCount)) {
          waiting.dataset.count = String(waitingCount);
          settle(waiting);
        }
      }
      if (changed) {
        settle(seeds);
        settle(tiles);
      }
    },
    answer(text, urgency = null) {
      // The countdown wears the tile's colour step (calm / warm / hot); the tile count wears none.
      const step = text === null ? null : urgency;
      if (step) { if (tiles.dataset.urgency !== step) tiles.dataset.urgency = step; } else delete tiles.dataset.urgency;
      if (text === answerText) return;
      const wasAnswering = answerText !== null;
      answerText = text;
      writeTiles();
      // One acknowledgement on the SWITCH (tiles → clock, or back), never on a tick: the countdown
      // itself only ever writes its text node.
      if (wasAnswering !== (text !== null)) settle(tiles);
    },
  };
};
