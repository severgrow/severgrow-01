// THE IN-GAME GUIDE'S WATCHER (owner, 2026-11-09: a new player who opens a friend's duel link "should
// be able to learn inside that real game, without being forced through a tutorial").
//
// Pure: it reads the player's View and the moves legalActions() offers right now, and says which
// teaching beats are POSSIBLE, which one is the first this player has not been shown, and what the
// window for it says and lights. No timers, no DOM, no storage. The page (player/guide.ts) asks.
//
// Nothing here ever opens by itself: the page only offers the beat ("?" in the cockpit, the LED's
// "TAP ? →"), and the player decides.
import { coordKey, homeCoord } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';
import type { Lit } from '../lessons/lessons.js';
import { TUTORIAL_CHAPTER_IDS, tutorialLessons } from './tutorial-script.js';

/** One move family the guide can teach, plus how a match is won. */
export type GuideBeat =
  | 'draw' | 'draw-choice' | 'grow' | 'throw' | 'strengthen' | 'cut'
  | 'bloom' | 'bomb' | 'blast' | 'skip' | 'win';

/**
 * The order beats are offered in when several are new at once: the turn's own rhythm first
 * (Draw, Grow, Throw), then the other uses of Grow, the extra moves, Skip, and how to win.
 */
export const GUIDE_BEATS: readonly GuideBeat[] = Object.freeze([
  'draw', 'grow', 'throw', 'draw-choice', 'strengthen', 'cut', 'bloom', 'bomb', 'blast', 'skip', 'win',
]);

/** How many games show the HOW TO PLAY label (owner, 2026-11-09: "First 3 games"). */
export const GUIDE_LABEL_GAMES = 3;

/** The LED's pointer at the "?" (it sits directly to the display's right). Six cells, the
 *  display's own width for a step word ("THROW!"), so it never scrolls. */
export const GUIDE_LED_WORD = 'TAP ?→';

const tileOwner = (view: View, key: string): 0 | 1 | null => view.board[key]?.owner ?? null;

/** Every beat possible for the player to act right now, in GUIDE_BEATS order. Pure. */
export const possibleBeats = (view: View, legal: readonly Action[]): GuideBeat[] => {
  const me = view.player;
  if (view.phase === 'GAME_OVER' || view.actor !== me) return [];
  const has = new Set<GuideBeat>();
  for (const a of legal) {
    switch (a.t) {
      case 'Draw': has.add(a.from === 'discard' ? 'draw-choice' : 'draw'); break;
      case 'Discard': has.add('throw'); break;
      case 'Bloom': has.add('bloom'); break;
      case 'PlayFruit': has.add('bomb'); break;
      case 'MegaBomb': has.add('blast'); break;
      case 'EndAct': if (view.phase === 'ACT') has.add('skip'); break;
      case 'Sprout': {
        const owner = tileOwner(view, coordKey(a.coord));
        has.add(owner === null ? 'grow' : owner === me ? 'strengthen' : 'cut');
        break;
      }
      default: break;
    }
  }
  // How a match is won is always worth knowing on your own turn.
  has.add('win');
  return GUIDE_BEATS.filter((b) => has.has(b));
};

/** The first possible beat this player has not opened yet, or null when nothing new is possible. */
export const nextGuideBeat = (view: View, legal: readonly Action[], seen: ReadonlySet<string>): GuideBeat | null =>
  possibleBeats(view, legal).find((b) => !seen.has(b)) ?? null;

/** The guide runs only when its setting is on, and never in a Blitz duel (30 s a turn). */
export const guideActive = (s: { setting: boolean; blitz: boolean }): boolean => s.setting && !s.blitz;

/**
 * The cockpit's CONTEXT button shows "?" only when it has no real action: the moment a real
 * context action exists (Skip, Clear, Confirm...), the action wins.
 */
export const contextShowsGuide = (s: { active: boolean; contextHasAction: boolean }): boolean =>
  s.active && !s.contextHasAction;

/** The HOW TO PLAY label: a player's first games only, and gone once the lessons are finished. */
export const showGuideLabel = (s: { active: boolean; gamesStarted: number; lessonsDone: boolean }): boolean =>
  s.active && !s.lessonsDone && s.gamesStarted <= GUIDE_LABEL_GAMES;

/** The LED message, or null for the display's normal idle blink. */
export const guideLedWord = (s: { active: boolean; beat: GuideBeat | null }): string | null =>
  s.active && s.beat ? GUIDE_LED_WORD : null;

/** What the "?" does right now. */
export type GuideTap =
  | { kind: 'window'; beat: GuideBeat }
  /** Nothing new is possible: light the next move the way the idle re-prompt does. */
  | { kind: 'glow' }
  /** The opponent is moving: Match Intel (Tips if there are any, else Rules). */
  | { kind: 'intel'; tab: 'tips' | 'rules' }
  | { kind: 'none' };

export const guideTap = (s: {
  active: boolean; view: View; legal: readonly Action[]; seen: ReadonlySet<string>; tips: number;
}): GuideTap => {
  if (!s.active || s.view.phase === 'GAME_OVER') return { kind: 'none' };
  if (s.view.actor !== s.view.player) return { kind: 'intel', tab: s.tips > 0 ? 'tips' : 'rules' };
  const beat = nextGuideBeat(s.view, s.legal, s.seen);
  return beat ? { kind: 'window', beat } : { kind: 'glow' };
};

/** The window for a beat: the existing lesson's title and line, and what to light on THIS board. */
export type GuideWindow = {
  beat: GuideBeat;
  /** The tutorial lesson the words come from (tutorial-script.ts). */
  lesson: string;
  title: string;
  why: string;
  lit: Lit;
  /** Show the Bloom examples (the lesson's own demo). */
  bloomDemo?: boolean;
  /** The window closes when the player makes one of these moves ("close when they do it"). */
  closesOn: readonly Action['t'][];
};

/** Which lesson each beat borrows. */
export const GUIDE_LESSON: Readonly<Record<GuideBeat, string>> = Object.freeze({
  draw: 'draw', 'draw-choice': 'discard-draw', grow: 'grow', throw: 'throw', strengthen: 'strength',
  cut: 'cut', bloom: 'bloom-explain', bomb: 'bomb', blast: 'mega', skip: 'skip', win: 'win-place',
});

/**
 * Lines that only made sense in the lesson's fixed position, trimmed so they are true on ANY board
 * (owner's rule: list every one for approval; no new copy beyond that).
 *   draw-choice: the lesson says the gold Throw pile "completes your Bloom", which is only true on
 *     that lesson's board. The turn guide's own existing line is used instead.
 *   cut: the lesson's line starts "Or ..." because it follows the Strengthen lesson.
 */
export const GUIDE_TRIMMED_LINES: Readonly<Partial<Record<GuideBeat, { title?: string; why: string }>>> = Object.freeze({
  'draw-choice': { title: 'DRAW', why: 'Tap the Draw pile, or take the top Throw pile card.' },
  cut: { why: 'A higher card on their tile cuts it off. Their tiles wither.' },
});

const lessonById = (id: string) => {
  for (let c = 0; c < TUTORIAL_CHAPTER_IDS.length; c++) {
    const found = tutorialLessons(c).find((l) => l.id === id);
    if (found) return found;
  }
  return null;
};

const CLOSES: Readonly<Record<GuideBeat, readonly Action['t'][]>> = Object.freeze({
  draw: ['Draw'], 'draw-choice': ['Draw'],
  grow: ['Sprout', 'Bloom', 'PlayFruit', 'MegaBomb', 'EndAct'],
  throw: ['Discard'], strengthen: ['Sprout'], cut: ['Sprout'], bloom: ['Bloom'],
  bomb: ['PlayFruit'], blast: ['MegaBomb'], skip: ['EndAct'],
  // Nothing to "do": the next move of any kind closes it (or "?" again).
  win: ['Draw', 'Sprout', 'Bloom', 'PlayFruit', 'MegaBomb', 'EndAct', 'Discard'],
});

/** The light for a beat on THIS board: a real tile, a real card, a real pile or key. */
const litFor = (beat: GuideBeat, view: View, legal: readonly Action[]): Lit => {
  const me = view.player;
  const sprouts = legal.filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout');
  const keysWhere = (pred: (owner: 0 | 1 | null) => boolean) =>
    [...new Set(sprouts.map((a) => coordKey(a.coord)).filter((k) => pred(tileOwner(view, k))))];
  switch (beat) {
    case 'draw': return { t: 'deck' };
    case 'draw-choice': return { t: 'discard' };
    case 'grow': case 'throw': {
      const ids = [...new Set(legal.flatMap((a) => (a.t === 'Sprout' || a.t === 'Discard' ? [a.card] : [])))];
      return ids.length ? { t: 'cards', ids } : { t: 'none' };
    }
    case 'strengthen': { const keys = keysWhere((o) => o === me); return keys.length ? { t: 'hexes', keys } : { t: 'none' }; }
    case 'cut': { const keys = keysWhere((o) => o !== null && o !== me); return keys.length ? { t: 'hexes', keys } : { t: 'none' }; }
    case 'bloom': case 'blast': return { t: 'bloom' };
    case 'bomb': {
      const ids = [...new Set(legal.flatMap((a) => (a.t === 'PlayFruit' ? [a.card] : [])))];
      return ids.length ? { t: 'cards', ids } : { t: 'none' };
    }
    case 'skip': return { t: 'end' };
    case 'win': return { t: 'hex', key: coordKey(homeCoord((1 - me) as 0 | 1, view.config)) };
    default: return { t: 'none' };
  }
};

/** The window for a beat, or null if its lesson is missing. Pure. */
export const guideWindow = (beat: GuideBeat, view: View, legal: readonly Action[]): GuideWindow | null => {
  const lesson = lessonById(GUIDE_LESSON[beat]);
  if (!lesson) return null;
  const trimmed = GUIDE_TRIMMED_LINES[beat];
  return {
    beat,
    lesson: lesson.id,
    title: trimmed?.title ?? lesson.instruction,
    why: trimmed?.why ?? lesson.why ?? '',
    lit: litFor(beat, view, legal),
    ...(lesson.bloomDemo ? { bloomDemo: true } : {}),
    closesOn: CLOSES[beat],
  };
};

/** What the guide remembers for a player (this device, and the account when signed in). */
export type GuideProgress = {
  /** Beats this player has opened. Only ever grows. */
  seen: readonly GuideBeat[];
  /** Real games started with the guide on (the label shows for the first GUIDE_LABEL_GAMES). */
  games: number;
};

export const EMPTY_GUIDE_PROGRESS: GuideProgress = Object.freeze({ seen: [], games: 0 });

const isBeat = (v: unknown): v is GuideBeat => typeof v === 'string' && (GUIDE_BEATS as readonly string[]).includes(v);

/** Read a stored or received value defensively: unknown beats and bad numbers are dropped. */
export const parseGuideProgress = (raw: unknown): GuideProgress => {
  const r = raw as { seen?: unknown; games?: unknown } | null;
  const seen = Array.isArray(r?.seen) ? [...new Set(r!.seen.filter(isBeat))] : [];
  const games = typeof r?.games === 'number' && Number.isFinite(r.games) && r.games > 0 ? Math.min(1_000_000, Math.floor(r.games)) : 0;
  return { seen: GUIDE_BEATS.filter((b) => seen.includes(b)), games };
};

/** Two copies (this device and the account) join: everything either has seen, the higher count. */
export const mergeGuideProgress = (a: GuideProgress, b: GuideProgress): GuideProgress => {
  const seen = new Set<GuideBeat>([...a.seen, ...b.seen]);
  return { seen: GUIDE_BEATS.filter((x) => seen.has(x)), games: Math.max(a.games, b.games) };
};

export const markGuideSeen = (p: GuideProgress, beat: GuideBeat): GuideProgress =>
  p.seen.includes(beat) ? p : mergeGuideProgress(p, { seen: [beat], games: 0 });
