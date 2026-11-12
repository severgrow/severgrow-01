// PER-ACTION MASTERY — how much light an action gets, from how many times this player has done it.
//
// The teaching levels fade by ACTION, not by level: the first time a player draws, the Draw pile is
// a full spotlight; the second time it is a soft guide; the third a whisper; after that the light
// says nothing and the player simply plays. Counts are saved in this channel's own storage, keyed to
// the lesson version, so a version bump starts the teaching cleanly and no old count is misread.
//
// Pure: no DOM, no clock, no storage. The UI hands in the elapsed idle stage and the wrong-tap
// escalation; every decision here is a function of its arguments.
import type { Action, State } from '../../../src/engine/index.js';

/** Bump with the lessons. A saved count from another version is ignored, never migrated. */
export const LESSON_VERSION = 3;

/** One channel-local record. The /3/ storage prefix is applied below the app by channel.ts. */
export const LESSON_MASTERY_KEY = 'severgrow.lesson.mastery.v1';

export type ActionKind =
  | 'draw' | 'grow' | 'throw' | 'cut' | 'take'
  | 'bloom' | 'bomb' | 'blast' | 'strengthen' | 'surround';

export type LessonTier = 'silent' | 'whisper' | 'guide' | 'spotlight';
export type PowerKind = 'bloom' | 'bomb' | 'blast';

export type Mastery = {
  version: number;
  counts: Partial<Record<ActionKind, number>>;
  /** Levels 2-9 get at most ONE new-idea spotlight; the kind that spent it is kept. */
  spotlights: Partial<Record<number, ActionKind>>;
  /** Bloom / Bomb / Blast hellos already shown. Never shown twice on this device. */
  hellos: PowerKind[];
};

export const freshMastery = (version: number = LESSON_VERSION): Mastery => ({
  version, counts: {}, spotlights: {}, hellos: [],
});

const KINDS: readonly ActionKind[] = Object.freeze([
  'draw', 'grow', 'throw', 'cut', 'take', 'bloom', 'bomb', 'blast', 'strengthen', 'surround',
]);
const POWERS: readonly PowerKind[] = Object.freeze(['bloom', 'bomb', 'blast']);

/** Read a saved record. A different lesson version, or anything malformed, is a fresh start. */
export const decodeMastery = (raw: string | null, version: number = LESSON_VERSION): Mastery => {
  if (!raw) return freshMastery(version);
  try {
    const v = JSON.parse(raw) as Partial<Mastery> | null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return freshMastery(version);
    if (v.version !== version) return freshMastery(version);
    const out = freshMastery(version);
    if (v.counts && typeof v.counts === 'object') {
      for (const kind of KINDS) {
        const n = (v.counts as Record<string, unknown>)[kind];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) out.counts[kind] = Math.trunc(n);
      }
    }
    if (v.spotlights && typeof v.spotlights === 'object') {
      for (const [level, kind] of Object.entries(v.spotlights)) {
        const n = Number(level);
        if (Number.isInteger(n) && n >= 2 && n <= 9 && KINDS.includes(kind as ActionKind)) {
          out.spotlights[n] = kind as ActionKind;
        }
      }
    }
    if (Array.isArray(v.hellos)) out.hellos = [...new Set(v.hellos.filter((p): p is PowerKind => POWERS.includes(p as PowerKind)))];
    return out;
  } catch {
    return freshMastery(version);
  }
};

export const encodeMastery = (m: Mastery): string => JSON.stringify(m);

/** The base tier a count earns: 0 spotlight, 1 guide, 2 whisper, 3+ silent. */
export const tierOf = (count: number): LessonTier =>
  count <= 0 ? 'spotlight' : count === 1 ? 'guide' : count === 2 ? 'whisper' : 'silent';

const TIER_RANK: Record<LessonTier, number> = { silent: 0, whisper: 1, guide: 2, spotlight: 3 };

export const worse = (a: LessonTier, b: LessonTier): LessonTier => (TIER_RANK[a] <= TIER_RANK[b] ? a : b);
export const better = (a: LessonTier, b: LessonTier): LessonTier => (TIER_RANK[a] >= TIER_RANK[b] ? a : b);

/** One wrong-tap step up: SILENT→WHISPER, WHISPER→GUIDE, GUIDE→SPOTLIGHT on L1 only. */
export const escalate = (tier: LessonTier, level: number): LessonTier => {
  if (tier === 'silent') return 'whisper';
  if (tier === 'whisper') return 'guide';
  if (tier === 'guide' && level === 1) return 'spotlight';
  return tier;
};

/**
 * The safety net, measured from the last input. 6 s WHISPER, 12 s GUIDE, 20 s GUIDE with the
 * pointer/glow light (the UI marks stage 3 separately; the tier never passes GUIDE).
 */
export const safetyStage = (elapsedMs: number): 0 | 1 | 2 | 3 =>
  elapsedMs >= 20_000 ? 3 : elapsedMs >= 12_000 ? 2 : elapsedMs >= 6_000 ? 1 : 0;

export const safetyTier = (elapsedMs: number): LessonTier => {
  const stage = safetyStage(elapsedMs);
  return stage === 1 ? 'whisper' : stage >= 2 ? 'guide' : 'silent';
};

/** A spotlight is allowed for a new action, within the level's budget (L1 may show three). */
export const spotlightAllowed = (
  m: Mastery,
  level: number,
  kind: ActionKind,
  newActions: readonly ActionKind[],
): boolean => {
  if (level === 1) return true;
  if (level < 2 || level > 9) return false;
  if (!newActions.includes(kind)) return false;
  const spent = m.spotlights[level];
  return spent === undefined || spent === kind;
};

export type TierInput = {
  mastery: Mastery;
  kind: ActionKind;
  level: number;
  /** The actions this LEVEL introduces (a spotlight from L2 is only for one of these). */
  newActions: readonly ActionKind[];
  /** The current safety stage from idle time. */
  safety?: 0 | 1 | 2 | 3;
  /** A second wrong tap on this same step. */
  escalation?: boolean;
};

/** The tier to paint, combining learned counts, this level's budget, the safety net and escalation. */
export const displayTier = (input: TierInput): LessonTier => {
  const { mastery, kind, level, newActions, safety = 0, escalation = false } = input;
  let tier = tierOf(mastery.counts[kind] ?? 0);
  if (tier === 'spotlight' && !spotlightAllowed(mastery, level, kind, newActions)) tier = 'guide';
  if (safety >= 1) tier = better(tier, safetyTier(safety === 1 ? 6_000 : safety === 2 ? 12_000 : 20_000));
  if (escalation) tier = escalate(tier, level);
  return tier;
};

/** Record one correct player action. A spotlight shown for L2-L9 spends that level's budget. */
export const recordAction = (
  m: Mastery,
  kind: ActionKind,
  opts: { level?: number; tier?: LessonTier; newActions?: readonly ActionKind[] } = {},
): Mastery => {
  const counts = { ...m.counts, [kind]: (m.counts[kind] ?? 0) + 1 };
  const spotlights = { ...m.spotlights };
  const { level, tier, newActions = [] } = opts;
  if (level !== undefined && level >= 2 && level <= 9 && tier === 'spotlight' && newActions.includes(kind)) {
    spotlights[level] = kind;
  }
  return { ...m, counts, spotlights };
};

export const helloSeen = (m: Mastery, power: PowerKind): boolean => m.hellos.includes(power);
export const recordHello = (m: Mastery, power: PowerKind): Mastery =>
  (helloSeen(m, power) ? m : { ...m, hellos: [...m.hellos, power] });

/** The power an action plays, if it is one of the three extra powers. */
export const powerOf = (a: Action): PowerKind | null =>
  a.t === 'Bloom' ? 'bloom' : a.t === 'PlayFruit' ? 'bomb' : a.t === 'MegaBomb' ? 'blast' : null;

/**
 * The action a played move taught. `before`/`after` are the engine's own states: the new events say
 * whether an Overgrow cut a link, and a Strangle says the move was the surround (not a plain Grow).
 */
export const actionKindOf = (before: State, action: Action, after: State): ActionKind | null => {
  const added = (after.history ?? []).slice(before.history?.length ?? 0);
  if (added.some((e) => e.t === 'Strangle') || (after.result?.reason === 'strangle' && after.result.winner === actionPlayer(before))) {
    return 'surround';
  }
  switch (action.t) {
    case 'Draw': return 'draw';
    case 'Discard': return 'throw';
    case 'Bloom': return 'bloom';
    case 'PlayFruit': return 'bomb';
    case 'MegaBomb': return 'blast';
    // A Grow is one action whose plan the engine records as Strengthen, Overgrow or Sprout.
    case 'Sprout':
      if (added.some((e) => e.t === 'Strengthen')) return 'strengthen';
      if (added.some((e) => e.t === 'Overgrow')) {
        return added.some((e) => e.t === 'Sever' && e.coords.length > 0) ? 'cut' : 'take';
      }
      return 'grow';
    default: return null;
  }
};

const actionPlayer = (s: State): 0 | 1 => s.turnPlayer;
