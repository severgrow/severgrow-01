import { worldNeighbours } from '../world.js';
import type { WorldChallenge } from './types.js';

/**
 * ACHIEVEMENTS (owner, 2026-10-29: "turn it into achievements and pay seeds for those — for beta we
 * want quick easy engagement in territory"; owner, 2026-10-30: "achievements should also include
 * online games, campaign, inviting a friend to online game etc ... around 35 achievements in total
 * now ... make some smart ones").
 *
 * WHAT THIS IS. One flat, frozen table of every achievement. Progress is computed on the SERVER from
 * what it already stores; the page only draws the answer. A claim pays through the ordinary Seeds
 * settlement with the receipt key `achievement:<id>`: one receipt per player per achievement, so a
 * retried or doubled claim replays the first payment instead of paying twice.
 *
 * WHERE THE FACTS COME FROM (each definition names its own table; `FACTS_SOURCES` is the complete
 * set this module is allowed to read):
 *
 *   world_claims            tiles held, neighbours, rank
 *   world_challenges        sent, accepted, won, defended, taken
 *   matches                 finished online / live / friend duels (`matches` + `match_participants`)
 *   match_moves             the commits and their events (cuts, Blooms, throw-pile draws)
 *   seed_reward_receipts    campaign levels cleared (the ordered `campaign:cN-M` / `lesson:10` keys)
 *   campaign_clears         the verified clear's shape (turns, throw draws, Blooms) — migration 0021
 *
 * NO FABRICATED PROGRESS. A source that is absent (a database without migration 0021) simply reads as
 * zero. Nothing here guesses an undo, an attempt or a board it did not see.
 *
 * EARNED ONCE. `claimed` is the receipt, never a copied boolean; an achievement stays claimed after
 * the tiles that earned it are sold, the match row is pruned, or the campaign is replayed.
 */

/** The panel groups the set so 35 rows read as five short pages, not one long list. */
export type AchievementGroup = 'territory' | 'duels' | 'craft' | 'company' | 'campaign';

/** Every table an achievement is allowed to name. Tests pin both sides of this list. */
export const FACTS_SOURCES = Object.freeze([
  'world_claims',
  'world_challenges',
  'matches',
  'match_moves',
  'seed_reward_receipts',
  'campaign_clears',
] as const);
export type FactsSource = typeof FACTS_SOURCES[number];

export type AchievementId =
  | 'roots' | 'neighbours' | 'throw-down' | 'stand-ground' | 'holding' | 'conqueror' | 'podium' | 'estate'
  | 'home-guard' | 'ground-taken'
  | 'first-crossing' | 'three-crossings' | 'ten-crossings' | 'running-sap' | 'long-growth'
  | 'live-wood' | 'higher-branch' | 'unsevered' | 'caught-knock'
  | 'bloom-and-nothing' | 'cut-and-standing' | 'ringed-root' | 'last-light' | 'quiet-table'
  | 'open-door' | 'company' | 'grove-of-friends' | 'generous-host'
  | 'first-clearing' | 'five-clearings' | 'ten-clearings' | 'whole-chapter' | 'last-lesson'
  | 'clean-hands' | 'quick-work';

/**
 * The flat facts the pure matcher reads. Built by `achievementFacts` from `AchievementHistory`; tests
 * hand-build either shape. Every field is derived from one of `FACTS_SOURCES`.
 */
export type AchievementFacts = {
  // world_claims
  tiles: number;
  neighbour: boolean;
  rank: number | null;
  // world_challenges
  challengesSent: number;
  challengesAccepted: number;
  challengesWon: number;
  challengesDefended: number;
  challengesTaken: number;
  // matches / match_moves
  duelWins: number;
  duelStreak: number;
  liveWins: number;
  higherLevelWins: number;
  noCutWins: number;
  undercutWins: number;
  bloomOnlyWins: number;
  cutButWon: number;
  rootboundWins: number;
  deckEndWins: number;
  noThrowDuels: number;
  friendMatches: number;
  friendsPlayed: number;
  invitesPlayed: number;
  hostLosses: number;
  // seed_reward_receipts / campaign_clears
  levelsCleared: number;
  chaptersCleared: number;
  lessonCleared: boolean;
  cleanClears: number;
  quickClears: number;
};

export type AchievementDef = {
  id: AchievementId;
  group: AchievementGroup;
  /** Fixed, one-time Seeds paid on claim. Never multiplied by the beta payout. */
  seeds: number;
  goal: number;
  /** The table this condition actually reads (asserted by the tests). */
  source: FactsSource;
  progress: (f: AchievementFacts) => number;
};

/** In the order the panel lists them: territory first, then duels, craft, company, campaign. */
export const ACHIEVEMENTS: readonly AchievementDef[] = Object.freeze([
  // ---- TERRITORY (the original eight, kept byte-for-byte where the owner already saw them) ------
  { id: 'roots', group: 'territory', seeds: 100, goal: 1, source: 'world_claims', progress: (f) => f.tiles },
  { id: 'neighbours', group: 'territory', seeds: 50, goal: 1, source: 'world_claims', progress: (f) => (f.neighbour ? 1 : 0) },
  { id: 'throw-down', group: 'territory', seeds: 75, goal: 1, source: 'world_challenges', progress: (f) => f.challengesSent },
  { id: 'stand-ground', group: 'territory', seeds: 75, goal: 1, source: 'world_challenges', progress: (f) => f.challengesAccepted },
  { id: 'holding', group: 'territory', seeds: 100, goal: 3, source: 'world_claims', progress: (f) => f.tiles },
  { id: 'conqueror', group: 'territory', seeds: 150, goal: 1, source: 'world_challenges', progress: (f) => f.challengesWon },
  { id: 'podium', group: 'territory', seeds: 100, goal: 1, source: 'world_claims', progress: (f) => (f.rank !== null && f.rank <= 3 ? 1 : 0) },
  { id: 'estate', group: 'territory', seeds: 250, goal: 10, source: 'world_claims', progress: (f) => f.tiles },
  { id: 'home-guard', group: 'territory', seeds: 75, goal: 1, source: 'world_challenges', progress: (f) => f.challengesDefended },
  { id: 'ground-taken', group: 'territory', seeds: 75, goal: 1, source: 'world_challenges', progress: (f) => f.challengesTaken },

  // ---- ONLINE DUELS -----------------------------------------------------------------------------
  { id: 'first-crossing', group: 'duels', seeds: 100, goal: 1, source: 'matches', progress: (f) => f.duelWins },
  { id: 'three-crossings', group: 'duels', seeds: 100, goal: 3, source: 'matches', progress: (f) => f.duelWins },
  { id: 'ten-crossings', group: 'duels', seeds: 150, goal: 10, source: 'matches', progress: (f) => f.duelWins },
  { id: 'running-sap', group: 'duels', seeds: 100, goal: 3, source: 'matches', progress: (f) => f.duelStreak },
  { id: 'long-growth', group: 'duels', seeds: 150, goal: 5, source: 'matches', progress: (f) => f.duelStreak },
  { id: 'live-wood', group: 'duels', seeds: 100, goal: 1, source: 'matches', progress: (f) => f.liveWins },
  { id: 'higher-branch', group: 'duels', seeds: 75, goal: 1, source: 'seed_reward_receipts', progress: (f) => f.higherLevelWins },
  { id: 'unsevered', group: 'duels', seeds: 100, goal: 1, source: 'match_moves', progress: (f) => f.noCutWins },
  { id: 'caught-knock', group: 'duels', seeds: 100, goal: 1, source: 'matches', progress: (f) => f.undercutWins },

  // ---- CRAFT / MASTERY (the ones that reward a way of playing, not a volume) --------------------
  { id: 'bloom-and-nothing', group: 'craft', seeds: 125, goal: 1, source: 'match_moves', progress: (f) => f.bloomOnlyWins },
  { id: 'cut-and-standing', group: 'craft', seeds: 125, goal: 1, source: 'match_moves', progress: (f) => f.cutButWon },
  { id: 'ringed-root', group: 'craft', seeds: 150, goal: 1, source: 'matches', progress: (f) => f.rootboundWins },
  { id: 'last-light', group: 'craft', seeds: 125, goal: 1, source: 'matches', progress: (f) => f.deckEndWins },
  { id: 'quiet-table', group: 'craft', seeds: 100, goal: 1, source: 'match_moves', progress: (f) => f.noThrowDuels },

  // ---- COMPANY (inviting a friend is its own kind of win) --------------------------------------
  { id: 'open-door', group: 'company', seeds: 75, goal: 1, source: 'matches', progress: (f) => f.invitesPlayed },
  { id: 'company', group: 'company', seeds: 50, goal: 1, source: 'matches', progress: (f) => f.friendMatches },
  { id: 'grove-of-friends', group: 'company', seeds: 100, goal: 3, source: 'matches', progress: (f) => f.friendsPlayed },
  { id: 'generous-host', group: 'company', seeds: 50, goal: 1, source: 'matches', progress: (f) => f.hostLosses },

  // ---- CAMPAIGN ---------------------------------------------------------------------------------
  { id: 'first-clearing', group: 'campaign', seeds: 75, goal: 1, source: 'seed_reward_receipts', progress: (f) => f.levelsCleared },
  { id: 'five-clearings', group: 'campaign', seeds: 100, goal: 5, source: 'seed_reward_receipts', progress: (f) => f.levelsCleared },
  { id: 'ten-clearings', group: 'campaign', seeds: 125, goal: 10, source: 'seed_reward_receipts', progress: (f) => f.levelsCleared },
  { id: 'whole-chapter', group: 'campaign', seeds: 200, goal: 1, source: 'seed_reward_receipts', progress: (f) => f.chaptersCleared },
  { id: 'last-lesson', group: 'campaign', seeds: 100, goal: 1, source: 'seed_reward_receipts', progress: (f) => (f.lessonCleared ? 1 : 0) },
  { id: 'clean-hands', group: 'campaign', seeds: 125, goal: 1, source: 'campaign_clears', progress: (f) => f.cleanClears },
  { id: 'quick-work', group: 'campaign', seeds: 125, goal: 1, source: 'campaign_clears', progress: (f) => f.quickClears },
]);

export const achievementById = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);
export const achievementSourceKey = (id: AchievementId): string => `achievement:${id}`;

/** What the page receives for one achievement. */
export type AchievementView = {
  id: AchievementId;
  group: AchievementGroup;
  seeds: number;
  goal: number;
  progress: number;
  done: boolean;
  claimed: boolean;
};

export type ClaimView = { cellId: string; ownerId: string };

/** The challenge columns the matcher reads; `WorldChallenge` satisfies it structurally. */
export type ChallengeView = Pick<WorldChallenge, 'challengerId' | 'defenderId' | 'status' | 'matchId' | 'winnerId'>;

/**
 * One finished duel, already reduced to the facts a campaign page may show. The service builds this
 * from `matches`, `match_participants` and `match_moves`; nothing here is invented.
 */
export type DuelView = {
  opponentId: string | null;
  kind: 'duel' | 'territory';
  openQueue: boolean;
  live: boolean;
  finishedAt: number;
  won: boolean;
  draw: boolean;
  undercut: boolean;
  reason: string;
  /** How many times THIS player's network was cut (Sever events naming them). */
  myCuts: number;
  /** Grow actions this player committed: Bloom vs every other grow. */
  myBlooms: number;
  myOtherGrows: number;
  /** Draws from the throw pile by either seat. */
  throwDraws: number;
  megaBomb: boolean;
  /** At the end, every side of this player's home held by the other player. */
  rootSurrounded: boolean;
  /** This player created the match in seat 0 (a friend invite or a rematch they opened). */
  creator: boolean;
};

/** One verified Campaign clear (migration 0021). Best attempt per level is kept by the store. */
export type CampaignClearView = {
  levelKey: string;
  levelNumber: number;
  turns: number;
  throwDraws: number;
  blooms: number;
  grows: number;
};

/** Everything the matcher may look at. Hand-built in the tests, assembled by the service. */
export type AchievementHistory = {
  playerId: string;
  claims: readonly ClaimView[];
  challenges: readonly ChallengeView[];
  duels: readonly DuelView[];
  /** Campaign receipts, reduced to what the ordered progress keys mean. */
  campaign: {
    highestLevel: number | null;
    chaptersCleared: number;
    lessonCleared: boolean;
    clears: readonly CampaignClearView[];
  };
  /** Each opponent's highest campaign level (null = none). Only for opponents in `duels`. */
  opponentLevels: Readonly<Record<string, number | null>>;
};

const rankOf = (claims: readonly ClaimView[], playerId: string): number | null => {
  const mine = claims.filter((c) => c.ownerId === playerId).length;
  if (mine === 0) return null;
  const counts = new Map<string, number>();
  for (const c of claims) counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
  return 1 + [...counts.values()].filter((n) => n > mine).length;
};

/** The pure matcher: history in, flat facts out. No I/O, no clocks. */
export const achievementFacts = (history: AchievementHistory): AchievementFacts => {
  const { playerId, claims, challenges, duels, campaign, opponentLevels } = history;
  const owner = new Map(claims.map((c) => [c.cellId, c.ownerId]));
  const mine = claims.filter((c) => c.ownerId === playerId);
  const neighbour = mine.some((c) => worldNeighbours(c.cellId).some((id) => {
    const other = owner.get(id);
    return other !== undefined && other !== playerId;
  }));

  const challengesSent = challenges.filter((c) => c.challengerId === playerId).length;
  const challengesAccepted = challenges.filter((c) => c.defenderId === playerId && c.matchId !== null).length;
  const challengesWon = challenges.filter((c) =>
    (c.status === 'resolved' && c.winnerId === playerId) ||
    (c.status === 'expired' && c.challengerId === playerId)).length;
  const challengesDefended = challenges.filter((c) =>
    c.status === 'resolved' && c.defenderId === playerId && c.winnerId === playerId).length;
  const challengesTaken = challenges.filter((c) =>
    c.status === 'resolved' && c.challengerId === playerId && c.winnerId === playerId).length;

  const ordered = [...duels].sort((a, b) => a.finishedAt - b.finishedAt);
  const engineFinished = (d: DuelView) => d.reason !== 'resigned' && d.reason !== 'timeout';
  const myLevel = campaign.highestLevel ?? 0;
  let duelWins = 0;
  let duelStreak = 0;
  let running = 0;
  let liveWins = 0;
  let higherLevelWins = 0;
  let noCutWins = 0;
  let undercutWins = 0;
  let bloomOnlyWins = 0;
  let cutButWon = 0;
  let rootboundWins = 0;
  let deckEndWins = 0;
  let noThrowDuels = 0;
  let friendMatches = 0;
  let invitesPlayed = 0;
  let hostLosses = 0;
  const friends = new Set<string>();
  for (const d of ordered) {
    if (d.won) {
      duelWins += 1;
      running += 1;
      duelStreak = Math.max(duelStreak, running);
    } else {
      running = 0;
    }
    if (d.won && d.live) liveWins += 1;
    if (d.won && (opponentLevels[d.opponentId ?? ''] ?? 0) > myLevel) higherLevelWins += 1;
    if (d.won && engineFinished(d) && d.myCuts === 0) noCutWins += 1;
    if (d.won && engineFinished(d) && d.undercut) undercutWins += 1;
    if (d.won && engineFinished(d) && d.myBlooms > 0 && d.myOtherGrows === 0) bloomOnlyWins += 1;
    if (d.won && engineFinished(d) && d.myCuts > 0) cutButWon += 1;
    if (d.won && engineFinished(d) && d.rootSurrounded) rootboundWins += 1;
    if (d.won && engineFinished(d) && d.reason === 'deck_exhaustion') deckEndWins += 1;
    if (d.throwDraws === 0) noThrowDuels += 1;
    if (!d.openQueue && d.kind === 'duel') {
      friendMatches += 1;
      if (d.opponentId !== null) friends.add(d.opponentId);
      if (d.creator) {
        invitesPlayed += 1;
        if (!d.won && !d.draw) hostLosses += 1;
      }
    }
  }

  return {
    tiles: mine.length,
    neighbour,
    rank: rankOf(claims, playerId),
    challengesSent,
    challengesAccepted,
    challengesWon,
    challengesDefended,
    challengesTaken,
    duelWins,
    duelStreak,
    liveWins,
    higherLevelWins,
    noCutWins,
    undercutWins,
    bloomOnlyWins,
    cutButWon,
    rootboundWins,
    deckEndWins,
    noThrowDuels,
    friendMatches,
    friendsPlayed: friends.size,
    invitesPlayed,
    hostLosses,
    levelsCleared: campaign.highestLevel ?? 0,
    chaptersCleared: campaign.chaptersCleared,
    lessonCleared: campaign.lessonCleared,
    cleanClears: campaign.clears.filter((c) => c.throwDraws === 0).length,
    quickClears: campaign.clears.filter((c) => c.turns > 0 && c.turns <= 12).length,
  };
};

export const achievementViews = (facts: AchievementFacts, claimed: ReadonlySet<string>): AchievementView[] =>
  ACHIEVEMENTS.map((a) => {
    const progress = Math.max(0, Math.min(a.goal, a.progress(facts)));
    return {
      id: a.id, group: a.group, seeds: a.seeds, goal: a.goal, progress,
      done: progress >= a.goal, claimed: claimed.has(achievementSourceKey(a.id)),
    };
  });
