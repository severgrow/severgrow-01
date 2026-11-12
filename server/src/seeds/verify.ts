import { apply, newMatch, viewFor } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { botSeed, isBotLevel } from '../../../src/bots/levels.js';
import { botFor, CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { ALTERNATE_OPENINGS, RETIRED_OPENINGS, campaignDeal, campaignLevelById, campaignOpening, dealsRandomly, isDealSeed } from '../../../src/campaign/index.js';
import { FINAL_LESSON, finalLessonLegacyOpening, finalLessonOpening } from '../../../web/src/lessons/final.js';

export type OfflineProof = { actions: readonly Action[]; botVersion: string };
/**
 * `human` is measured while replaying, from actions whose ACTOR was seat 0: the shape of the clear
 * the achievements page may name (migration 0021). It is never supplied by the browser.
 */
export type VerifiedOffline = {
  winner: 0 | 1 | null;
  actionCount: number;
  turns: number;
  human: { throwDraws: number; blooms: number; grows: number };
  result: State['result'];
};
const MAX_ACTIONS = 1600;

/** How a sliced check is budgeted: a clock (ms) and how much of it one slice may spend. */
export type VerifyBudget = { clock: () => number; budget: number };

export type VerifyStep =
  | { kind: 'done'; verified: VerifiedOffline | null }
  /** `at` bot moves are proven; the next slice starts there. */
  | { kind: 'paused'; at: number };

/**
 * Replays human actions against the *actual deterministic bot*, never a browser result flag.
 * No client-supplied opening state, board, hand, difficulty or outcome is accepted.
 *
 * SLICED (2026-11-12): `from` bot moves were already proven by an earlier slice (a signed resume
 * token, seeds/resume-token.ts), so they are applied without being recomputed; then bot moves are
 * recomputed and compared until the budget is spent, and the step PAUSES at a bot-move boundary.
 * With no budget it runs to the end, exactly as it always did.
 */
export const stepOfflineMatch = (
  opening: State,
  botLevel: number,
  proof: OfflineProof,
  from = 0,
  budget: VerifyBudget | null = null,
): VerifyStep => {
  const none: VerifyStep = { kind: 'done', verified: null };
  if (!Array.isArray(proof.actions) || proof.actions.length < 3 || proof.actions.length > MAX_ACTIONS) return none;
  const bot = botFor(proof.botVersion);
  // 1-9 or a rival (10-12). Whether THIS version has that bot is the version's call: bots-v0.10
  // throws on a rival, which lands in the catch below as "not verified".
  if (!bot || !isBotLevel(botLevel)) return none;
  const deadline = budget ? budget.clock() + budget.budget : Infinity;
  let state = opening;
  const human = { throwDraws: 0, blooms: 0, grows: 0 };
  let botMoves = 0;
  try {
    for (let i = 0; i < proof.actions.length; i++) {
      const action = proof.actions[i]!;
      if (state.phase === 'GAME_OVER') return none;
      if (state.actor === 1) {
        if (botMoves >= from) {
          if (budget && botMoves > from && budget.clock() > deadline) return { kind: 'paused', at: botMoves };
          const expected = bot(viewFor(state, 1), botLevel,
            botSeed(state.seed, botLevel, state.turnNumber, state.history?.length ?? 0));
          if (JSON.stringify(action) !== JSON.stringify(expected)) return none;
        }
        botMoves += 1;
      } else {
        if (action.t === 'Draw' && action.from === 'discard') human.throwDraws += 1;
        else if (action.t === 'Bloom') human.blooms += 1;
        else if (action.t === 'Sprout' || action.t === 'PlayFruit' || action.t === 'MegaBomb') human.grows += 1;
      }
      state = apply(state, action);
    }
  } catch {
    return none;
  }
  // A token can only name bot moves this proof has: one that claims more is not a proof.
  if (from > botMoves) return none;
  if (state.phase !== 'GAME_OVER' || !state.result) return none;
  return {
    kind: 'done',
    verified: {
      winner: state.result.winner,
      actionCount: proof.actions.length,
      turns: state.turnNumber,
      human,
      result: state.result,
    },
  };
};

export const verifyOfflineMatch = (opening: State, botLevel: number, proof: OfflineProof): VerifiedOffline | null => {
  const step = stepOfflineMatch(opening, botLevel, proof);
  return step.kind === 'done' ? step.verified : null;
};

/**
 * Every opening a campaign proof may have been played on, in the order they are tried: today's
 * (or, for a random deal, today's board dealt with that seed), the alternate line's, then each one
 * the level shipped with before a fix. Null for an unknown level or an invalid deal.
 */
const campaignCandidates = (levelId: string, dealSeed?: number): { botLevel: number; openings: State[] } | null => {
  const level = campaignLevelById(levelId);
  if (!level) return null;
  if (dealSeed !== undefined) {
    if (!dealsRandomly(level) || !isDealSeed(dealSeed)) return null;
    return {
      botLevel: level.botLevel,
      openings: [campaignDeal(level, dealSeed), ...(RETIRED_OPENINGS[level.id] ?? []).map((retired) => newMatch(dealSeed, retired.config))],
    };
  }
  const alternate = ALTERNATE_OPENINGS[level.id];
  return {
    botLevel: level.botLevel,
    openings: [
      campaignOpening(level),
      ...(alternate ? [newMatch(level.seed, { ...level.config, ...alternate })] : []),
      ...(RETIRED_OPENINGS[level.id] ?? []).map((retired) => newMatch(retired.seed, retired.config)),
    ],
  };
};

export type ProofStep =
  | { kind: 'done'; verified: VerifiedOffline | null }
  | { kind: 'paused'; opening: number; at: number };

/** Steps through `openings` from a resume point: the first that verifies wins; a pause names its opening. */
const stepOpenings = (
  openings: readonly State[], botLevel: number, proof: OfflineProof,
  resume: { opening: number; at: number } | null, budget: VerifyBudget | null,
): ProofStep => {
  const start = resume?.opening ?? 0;
  if (!Number.isSafeInteger(start) || start < 0 || start >= Math.max(1, openings.length)) return { kind: 'done', verified: null };
  for (let i = start; i < openings.length; i++) {
    const step = stepOfflineMatch(openings[i]!, botLevel, proof, i === start ? resume?.at ?? 0 : 0, budget);
    if (step.kind === 'paused') return { kind: 'paused', opening: i, at: step.at };
    if (step.verified) return step;
  }
  return { kind: 'done', verified: null };
};

/** A campaign proof, one slice at a time (see `stepOfflineMatch`). */
export const stepCampaignProof = (
  levelId: string, actions: readonly Action[], botVersion: string, dealSeed: number | undefined,
  resume: { opening: number; at: number } | null, budget: VerifyBudget | null,
): ProofStep => {
  const candidates = campaignCandidates(levelId, dealSeed);
  if (!candidates) return { kind: 'done', verified: null };
  return stepOpenings(candidates.openings, candidates.botLevel, { actions, botVersion }, resume, budget);
};

/** A Training proof, one slice at a time. */
export const stepTrainingProof = (
  seed: number, botLevel: number, actions: readonly Action[], botVersion: string,
  resume: { opening: number; at: number } | null, budget: VerifyBudget | null,
): ProofStep => stepOpenings([newMatch(seed)], botLevel, { actions, botVersion }, resume, budget);

export const verifyCampaignProof = (
  levelId: string,
  actions: readonly Action[],
  botVersion = CURRENT_BOT_VERSION,
  /**
   * RANDOM DEALS (owner, 2026-11-01): from level 11 up each attempt is a fresh shuffle, and the
   * proof names that deal's seed. The deal is rebuilt on the level's authored board and replayed
   * against the real bot like any other proof. Absent: the level's fixed opening (every proof
   * queued before random deals, and every lesson level, which never accepts a seed).
   */
  dealSeed?: number,
): VerifiedOffline | null => {
  const level = campaignLevelById(levelId);
  if (!level) return null;
  if (dealSeed !== undefined) {
    if (!dealsRandomly(level) || !isDealSeed(dealSeed)) return null;
    const onToday = verifyOfflineMatch(campaignDeal(level, dealSeed), level.botLevel, { actions, botVersion });
    if (onToday) return onToday;
    // A board the level shipped with before a fix (frozen.ts, RETIRED_OPENINGS), dealt with the SAME
    // seed: a random-deal win played on the old board still pays.
    for (const retired of RETIRED_OPENINGS[level.id] ?? []) {
      const viaRetired = verifyOfflineMatch(newMatch(dealSeed, retired.config), level.botLevel, { actions, botVersion });
      if (viaRetired) return viaRetired;
    }
    return null;
  }
  // The level's CURRENT opening first. Then the alternate one: since 2026-10-17 both the released
  // campaign and the /2/ onboarding line are live against this single Edge function, and they play
  // levels 4-10 on different boards. See src/campaign/frozen.ts.
  const current = verifyOfflineMatch(campaignOpening(level), level.botLevel, { actions, botVersion });
  if (current) return current;
  const alternate = ALTERNATE_OPENINGS[level.id];
  if (alternate) {
    const viaAlternate = verifyOfflineMatch(newMatch(level.seed, { ...level.config, ...alternate }), level.botLevel, { actions, botVersion });
    if (viaAlternate) return viaAlternate;
  }
  // Openings the level shipped with before a fix (src/campaign/frozen.ts, RETIRED_OPENINGS).
  for (const retired of RETIRED_OPENINGS[level.id] ?? []) {
    const viaRetired = verifyOfflineMatch(newMatch(retired.seed, retired.config), level.botLevel, { actions, botVersion });
    if (viaRetired) return viaRetired;
  }
  return null;
};

export const verifyTrainingProof = (seed: number, botLevel: number, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION): VerifiedOffline | null =>
  verifyOfflineMatch(newMatch(seed), botLevel, { actions, botVersion });

/**
 * Level 10, the final lesson (owner, 2026-10-24: it pays 100 Seeds): a real game against the real
 * bot from its one authored opening (web/src/lessons/final.ts), replayed exactly like a Campaign
 * level. Levels 1-9 are scripted lessons and pay nothing, so no other lesson id is accepted.
 */
export const verifyLessonProof = (levelId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION): VerifiedOffline | null => {
  if (levelId !== FINAL_LESSON.id) return null;
  // Since 2026-11-04 level 10 is a real game on the full board. A win from a page still on the old
  // small-map opening is checked against that opening, so nobody loses a payout to the change.
  return verifyOfflineMatch(finalLessonOpening(), FINAL_LESSON.botLevel, { actions, botVersion })
    ?? verifyOfflineMatch(finalLessonLegacyOpening(), FINAL_LESSON.botLevel, { actions, botVersion });
};
