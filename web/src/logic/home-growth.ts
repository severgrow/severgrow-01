// THE HOME GROWS — the player's own landmark carries the history of this device's play.
//
// The board already draws a home for each seat. This module is the pure half of making the
// player's own home (the tree / garden) grow with them: the ladder, the data that feeds it, the
// one-time "growth seen" record, and the precedence rule that keeps an in-match state (danger,
// smothered, withered) above the stage.
//
// WHAT FEEDS IT (honest, device-local sources only):
//   campaignLevels  src/campaign/progress.ts → `CampaignProgress.completed.length`
//                   (distinct levels won at least once; a replay of a level wins nothing new)
//   gamesPlayed     web/src/logic/stats.ts    → `Stats.played` (finished offline games; the
//                   campaign writes its own record, so a campaign game counts here only when the
//                   classic record was the one written)
//   growMoves       web/src/logic/play-record.ts → `PlayRecord.grow` (Grow + Strengthen MOVES,
//                   not tiles; the name says moves)
// A duel win is NOT available on the device: online results are kept by the server and the local
// identity record stores no record of them. It is deliberately not part of the ladder.
//
// WHAT IS DELIBERATELY NOT HERE: the opponent's home. The opponent's history is not on this device
// (and an online opponent's is not ours to show), so their home keeps its fixed art.
/** 1 = a new seedling; 4 = old growth. The ladder only ever climbs. */
export type HomeGrowthStage = 1 | 2 | 3 | 4;

export const HOME_GROWTH_STAGES = [1, 2, 3, 4] as const;

/** The store key for the stage already seen (one small record per channel). */
export const GROWTH_SEEN_KEY = 'severgrow.homes.growth.v1';

/** The history the ladder reads. Every field is a lifetime count that can only grow. */
export type GrowthHistory = {
  /** Distinct campaign levels won at least once (0+). */
  campaignLevels: number;
  /** Finished offline games in the classic/training record (0+). */
  gamesPlayed: number;
  /** Lifetime Grow + Strengthen moves from the play record (0+). */
  growMoves: number;
};

/**
 * The weights. A campaign level is the deepest evidence of growth (three points), a finished game
 * one point, and a hundred moves at the board one more. Volume alone therefore cannot make a home
 * old: you have to actually finish things.
 */
export const GROWTH_WEIGHT = Object.freeze({ campaignLevels: 3, game: 1, growMovesPerPoint: 10 });

/** The minimum score at which each stage is earned. Stage 1 is the floor, never withheld. */
export const STAGE_MIN_SCORE: Readonly<Record<HomeGrowthStage, number>> = Object.freeze({
  1: 0,
  2: 4,
  3: 14,
  4: 32,
});

const count = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

/** A bounded, deterministic growth score. Pure: the same history is always the same number. */
export const growthScore = (h: GrowthHistory): number =>
  count(h.campaignLevels) * GROWTH_WEIGHT.campaignLevels +
  count(h.gamesPlayed) * GROWTH_WEIGHT.game +
  Math.floor(count(h.growMoves) / GROWTH_WEIGHT.growMovesPerPoint);

/** The stage a history has earned. A new player (all zeroes) is stage 1, immediately. */
export const stageFor = (h: GrowthHistory): HomeGrowthStage => {
  const score = growthScore(h);
  if (score >= STAGE_MIN_SCORE[4]) return 4;
  if (score >= STAGE_MIN_SCORE[3]) return 3;
  if (score >= STAGE_MIN_SCORE[2]) return 2;
  return 1;
};

/** Clamps anything (a corrupt record, a caller's number) onto the ladder. */
export const clampStage = (n: unknown): HomeGrowthStage => {
  const k = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 1;
  return (k <= 1 ? 1 : k >= 4 ? 4 : k) as HomeGrowthStage;
};

/** `seen` is the stage already put on screen, or null when this device has never shown one. */
export type GrowthVisit = {
  /** The stage drawn first (the settled stage when no growth is due). */
  from: HomeGrowthStage;
  /** The stage that is on screen at the end of the visit. */
  to: HomeGrowthStage;
  /** True only when a one-shot growth should play. */
  grows: boolean;
  /** True when `to` still has to be written to the store (exactly once per earned stage). */
  record: boolean;
};

/**
 * What this visit shows. `motion` is the app's own gate (Reduce motion, Speed Off): when it is
 * off the visit settles straight onto `to` and no growth plays — the stage is still recorded, so
 * turning motion back on never replays a moment the player has already been given.
 */
export const growthVisit = (earned: HomeGrowthStage, seen: HomeGrowthStage | null, motion: boolean): GrowthVisit => {
  const to = clampStage(earned);
  const record = seen === null || seen !== to;
  // No motion: the next stage is already the settled state (there is nothing to animate from).
  if (!motion) return { from: to, to, grows: false, record };
  // A record from a newer/reset history can never show more than the player has earned now.
  const prev = seen === null ? 1 : clampStage(Math.min(seen, to));
  const from = Math.min(prev, to) as HomeGrowthStage;
  return { from, to, grows: to > from, record };
};

/** Reads the one-word record. Anything unreadable means "never shown". */
export const parseGrowthSeen = (raw: string | null): HomeGrowthStage | null => {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { v?: unknown; stage?: unknown };
    if (!s || s.v !== 1) return null;
    return typeof s.stage === 'number' && Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= 4
      ? (s.stage as HomeGrowthStage)
      : null;
  } catch {
    return null;
  }
};

export const serializeGrowthSeen = (stage: HomeGrowthStage): string =>
  JSON.stringify({ v: 1, stage: clampStage(stage) });

/** The record write this visit needs, or null (idempotent: a settled visit writes nothing). */
export const growthRecord = (visit: GrowthVisit): string | null =>
  visit.record ? serializeGrowthSeen(visit.to) : null;

/** Reads the visible history from the app's own stores. Missing/broken values are zeroes. */
export const growthHistoryFrom = (opts: {
  campaign: { completed: readonly string[] } | null;
  stats: { played: number } | null;
  play: { grow: number } | null;
}): GrowthHistory => ({
  campaignLevels: opts.campaign?.completed.length ?? 0,
  gamesPlayed: opts.stats?.played ?? 0,
  growMoves: opts.play?.grow ?? 0,
});

// ---------------------------------------------------------------------------------------------
// PRECEDENCE — an in-match state is never masked by the growth stage.
// ---------------------------------------------------------------------------------------------

export type HomeKind = 'tree' | 'volcano';
export type HomeState = 'healthy' | 'danger' | 'withered' | 'smothered' | 'won';
export type InMatchState = { danger: boolean; won: boolean; strangled: boolean };

/**
 * The one state a home shows. Dying beats winning, winning beats danger, and danger beats the
 * healthy stage. The growth stage is NOT an input here: it can add wood, it can never take the
 * dying state away.
 */
export const homeState = (kind: HomeKind, m: InMatchState): HomeState => {
  if (m.strangled) return kind === 'tree' ? 'withered' : 'smothered';
  if (m.won) return 'won';
  if (m.danger) return 'danger';
  return 'healthy';
};

export type HomePresentation = {
  kind: HomeKind;
  /** The growth stage drawn for this home, or null when the home keeps its fixed art. */
  stage: HomeGrowthStage | null;
  state: HomeState;
};

/**
 * Everything the UI needs to compose one home. `stage` is null for the opponent: their history is
 * not honestly available on this device, so their home stays fixed at all times.
 */
export const homePresentation = (kind: HomeKind, stage: HomeGrowthStage, m: InMatchState): HomePresentation => ({
  kind,
  stage: kind === 'tree' ? clampStage(stage) : null,
  state: homeState(kind, m),
});

/** The in-match classes the board already uses, from the same priority as `homeState`. */
export const homeClasses = (p: HomePresentation): { strangled: boolean; danger: boolean; won: boolean } => ({
  strangled: p.state === 'withered' || p.state === 'smothered',
  danger: p.state === 'danger',
  won: p.state === 'won',
});

// ---------------------------------------------------------------------------------------------
// MOTION — the growth moment is launched, never looped.
// ---------------------------------------------------------------------------------------------

/** Reduce motion or Speed Off (time scale 0) settles straight onto the earned stage. */
export const growthMomentAllowed = (reduceMotion: boolean, timeScale: number): boolean => !reduceMotion && timeScale > 0;

/** How long the one-shot growth plays; the caller removes the leaving layer after it. */
export const GROWTH_MOMENT_MS = 900;
