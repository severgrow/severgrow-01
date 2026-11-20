/**
 * Achievement copy (server/src/seeds/achievements.ts decides and pays; this only names).
 *
 * Kept in the online layer beside `challenge-copy.ts` for the same reason: the currency word lives on
 * this side of the `src/strings.ts` seed-words boundary. One short title and one plain sentence each:
 * what to do, never how it is counted.
 *
 * LEAN BY DIRECTION (owner, 2026-10-30): "remove the 'seeds for your first....' under achievments -
 * keep it clean lean and elegant". There is no intro line and no reward teaser on an UNEARNED row.
 * A row you have already earned is different (owner, 2026-11-20: "button 'COLLECT' by the seed
 * payout"): the card waiting on the shelf names the Seeds it is holding, and the notice repeats the
 * payment once it lands.
 */
import type { AchievementGroup, AchievementId } from '../../../server/src/seeds/achievements.js';

export const ACHIEVEMENT_COPY: Readonly<Record<AchievementId, { title: string; detail: string }>> = Object.freeze({
  roots: { title: 'Put down roots', detail: 'Grow your first tile' },
  neighbours: { title: 'Good neighbours', detail: 'Hold a tile next to another player' },
  'throw-down': { title: 'Throw down', detail: 'Send your first challenge' },
  'stand-ground': { title: 'Stand your ground', detail: 'Accept a challenge' },
  holding: { title: 'Small holding', detail: 'Hold 3 tiles' },
  conqueror: { title: 'Conqueror', detail: 'Win a challenge' },
  podium: { title: 'On the podium', detail: 'Reach the top 3' },
  estate: { title: 'Estate', detail: 'Hold 10 tiles' },
  'home-guard': { title: 'Hold the bough', detail: 'Win a challenge you accepted' },
  'ground-taken': { title: 'Ground taken', detail: 'Win a challenge you sent' },
  'first-crossing': { title: 'First crossing', detail: 'Win an online duel' },
  'three-crossings': { title: 'Three crossings', detail: 'Win three online duels' },
  'ten-crossings': { title: 'Ten crossings', detail: 'Win ten online duels' },
  'running-sap': { title: 'A running sap', detail: 'Win three duels in a row' },
  'long-growth': { title: 'The long growth', detail: 'Win five duels in a row' },
  'live-wood': { title: 'Live wood', detail: 'Win a live duel' },
  'higher-branch': { title: 'A higher branch', detail: 'Beat a player who has cleared a campaign level you have not' },
  unsevered: { title: 'Unsevered', detail: 'Win a duel without losing a tile to a cut' },
  'caught-knock': { title: 'Caught the knock', detail: 'Win by undercutting a knock' },
  'bloom-and-nothing': { title: 'Bloom and nothing else', detail: 'Win a duel where every grow you made was a Bloom' },
  'cut-and-standing': { title: 'Cut and still standing', detail: 'Win a duel after a cut took one of your tiles' },
  'ringed-root': { title: 'The ringed root', detail: 'Win a duel with every side of your home held by the other player' },
  'last-light': { title: 'Last light of the deck', detail: 'Win when the deck runs out' },
  'quiet-table': { title: 'The quiet table', detail: 'Finish a duel where nobody draws from the throw pile' },
  'open-door': { title: 'The door you opened', detail: 'An invite you sent is accepted and the duel is played' },
  company: { title: 'Company at the table', detail: 'Play a duel with a friend' },
  'grove-of-friends': { title: 'A grove of friends', detail: 'Play duels with three different friends' },
  'generous-host': { title: 'A generous host', detail: 'Invite a friend who then wins the duel' },
  'first-clearing': { title: 'First clearing', detail: 'Clear a campaign level' },
  'five-clearings': { title: 'Five clearings', detail: 'Clear five campaign levels' },
  'ten-clearings': { title: 'Ten clearings', detail: 'Clear ten campaign levels' },
  'whole-chapter': { title: 'A whole chapter', detail: 'Clear every level of a campaign chapter' },
  'last-lesson': { title: 'The last lesson', detail: 'Win the final lesson' },
  'clean-hands': { title: 'Clean hands', detail: 'Clear a campaign level without drawing from the throw pile' },
  'quick-work': { title: 'Quick work', detail: 'Clear a campaign level in twelve turns or fewer' },
});

/** The five headings that keep 35 rows readable. */
export const ACHIEVEMENT_GROUP_TITLES: Readonly<Record<AchievementGroup, string>> = Object.freeze({
  territory: 'Planet',
  duels: 'Duels',
  craft: 'Craft',
  company: 'Company',
  campaign: 'Campaign',
});

export const ACHIEVEMENTS_UI = Object.freeze({
  title: 'Achievements',
  /** The owner's own word for the one action (2026-11-20): "button 'COLLECT'". */
  claim: 'COLLECT',
  claimed: 'Claimed',
  claiming: '…',
  paid: (seeds: number) => `+${seeds} Seeds`,
  /**
   * The shelf's heading. The amount on a READY card is not a teaser: the reward is already earned,
   * and this is the moment it is collected. An unearned row still shows no amount at all (owner,
   * 2026-10-30: "keep it clean lean and elegant" — that rule was about selling the reward, not
   * about hiding a payout that is now owed).
   */
  ready: (count: number) => (count === 1 ? 'Ready to collect' : `${count} ready to collect`),
  /** The one word above the card's title: this is not a goal, it is a reward you already hold. */
  kicker: 'Just earned',
  /** The payout's spoken form, beside the seed glyph on a ready card. */
  payout: (seeds: number) => `${seeds} Seeds`,
  /** One accessible name for a COLLECT key: the visible word alone would repeat 35 times. */
  collectLabel: (title: string, seeds: number) => `${title}: COLLECT ${seeds} Seeds`,
  failed: 'That did not go through. Try again.',
  /**
   * ONE quiet line, never a spinner (owner, 2026-11-01: the key must always be there, and the
   * panel must not invent numbers while the server has not answered). It is shown only while there
   * is no list to draw: the first read is in flight, or the server's deadline fallback came back.
   */
  waiting: 'Reading your progress…',
  unavailable: 'Progress is not available just now. It will refresh on its own.',
});
