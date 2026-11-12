// Authored teaching positions. The rules still come entirely from apply/legalActions;
// these positions only arrange public terrain, territory, and the card order.
import {
  apply, coordKey, createCards, homeCoord, legalActions, neighbors, newGame, viewFor,
} from '../../../src/engine/index.js';
import type { Action, Card, Coord, State, Suit, Tile } from '../../../src/engine/index.js';
import { HELP, TUTORIAL } from '../../../src/strings.js';
import { SMALL_BOARD_RADIUS } from '../../../src/campaign/small-board.js';

type CardSpec = readonly [Suit | null, number];
type TileSpec = readonly [string, 0 | 1, number];
type ChapterSpec = {
  seed: number; phase: State['phase']; hand: CardSpec[]; opponent?: CardSpec[];
  draw?: CardSpec; discard?: CardSpec; tiles?: TileSpec[];
  final?: boolean; variant?: string;
};

export type TutorialFocus = 'deck' | 'discard' | 'card' | 'tile' | 'hand' | 'context' | 'bloom' | 'none' | 'home' | 'button' | 'explainer';
export type TutorialChapterId =
  | 'goal' | 'turn' | 'bloom' | 'strengthen' | 'cut' | 'skip' | 'buttons'
  | 'bomb' | 'blast' | 'throw-pile' | 'win' | 'final' | 'free';
export type TutorialLesson = {
  id: string;
  text: string;
  /** Short title shown large in the glass (e.g. HOME). */
  instruction: string;
  /** Simple body line under the title. */
  why?: string;
  /** Primary glass button label. Explanation steps always offer Next immediately. */
  cta?: string;
  /** Routine end-of-chapter throw: use the real action without reteaching it. */
  autoDiscard?: boolean;
  /**
   * Next beat after Grow: silently EndAct when seeking / replaying so the
   * following Throw lesson lands in DISCARD (no Skip button on this beat).
   */
  closesGrow?: boolean;
  focus: TutorialFocus;
  card?: CardSpec;
  cardId?: number;
  tile?: Coord;
  button?: string;
  reseat?: string;
  /** Show the Bloom examples mid-screen on this step. */
  bloomDemo?: boolean;
  /** Take back the previous step's move first (shown as a rewind: its tiles sink back into the hand). */
  rewind?: boolean;
  action: Action['t'] | 'Opponent' | 'FreeTurn' | 'Next';
};
export type LessonTarget = { kind: TutorialFocus | 'none'; selector: string; shape: 'hex' | 'card' | 'pill' | 'none' };

export const TUTORIAL_CHAPTER_IDS = Object.freeze([
  'goal', 'turn', 'bloom', 'strengthen', 'cut', 'skip', 'buttons',
  'bomb', 'blast', 'throw-pile', 'win', 'final', 'free',
] as const satisfies readonly TutorialChapterId[]);

export const wordCount = (line: string | undefined | null): number =>
  !line || line.trim().length === 0 ? 0 : line.trim().split(/\s+/).length;

/** Old 10-chapter saves → start of the matching new chapter by lesson family. */
const OLD_CHAPTER_TO_ID: readonly TutorialChapterId[] = [
  'turn', 'strengthen', 'skip', 'cut', 'bloom', 'bomb', 'blast', 'throw-pile', 'final', 'free',
];

export const migrateTutorialProgress = (
  raw: { chapter: number; step: number } | null | undefined,
): { chapter: number; step: number } => {
  if (!raw || typeof raw.chapter !== 'number' || typeof raw.step !== 'number'
    || !Number.isInteger(raw.chapter) || !Number.isInteger(raw.step)
    || raw.chapter < 0 || raw.chapter >= OLD_CHAPTER_TO_ID.length) {
    return { chapter: 0, step: 0 };
  }
  const id = OLD_CHAPTER_TO_ID[raw.chapter]!;
  const chapter = TUTORIAL_CHAPTER_IDS.indexOf(id);
  return { chapter: chapter < 0 ? 0 : chapter, step: 0 };
};

const L = (
  id: string,
  instruction: string,
  why: string | undefined,
  focus: TutorialFocus,
  action: TutorialLesson['action'],
  extra: Partial<TutorialLesson> = {},
): TutorialLesson => ({
  id, instruction, text: instruction, focus, action, ...extra,
  ...(why !== undefined ? { why } : {}),
});

const lessons: TutorialLesson[][] = [
  // 1 GOAL
  [
    L('goal-mine', 'YOUR HOME', 'Grow out from here. Every tile must stay joined, or it withers.', 'home', 'Next', {
      tile: { q: -2, r: 2 }, cta: 'NEXT',
    }),
    L('goal-turn-rhythm', 'EACH TURN', 'DRAW 1 card → GROW 1 tile → THROW 1 card.', 'explainer', 'Next', {
      cta: 'NEXT',
    }),
  ],
  // 2 YOUR TURN
  [
    L('draw', 'DRAW', 'Start your turn: take 1 card from the Draw pile.', 'deck', 'Draw', {
      cta: 'DRAW 1 CARD',
    }),
    L('grow', 'GROW', 'Tap a card, then a lit tile: the number becomes its strength.', 'hand', 'Sprout', {
      tile: { q: -1, r: 1 }, cta: 'TAP A CARD',
    }),
    L('rock-gold', 'ROCK AND GOLD', 'Gold: 2 points, others 1. Nothing grows on rock. Most points wins.', 'explainer', 'Next', {
      cta: 'NEXT', closesGrow: true,
    }),
    L('throw', 'THROW', 'End your turn: swipe up, drag it to the Throw pile, or tap the pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
  ],
  // 3 BLOOM (How to play: "What can bloom?")
  [
    L('bloom-explain', 'BLOOM', 'Extra move on Grow: 3–6 cards at once. Same number, or in a row.', 'explainer', 'Next', {
      cta: 'NEXT', bloomDemo: true,
    }),
    L('bloom-set', 'BLOOM', 'Three 3s, the same number. Tap Bloom, then tap or draw the tiles.', 'bloom', 'Bloom', {
      cta: 'TAP BLOOM',
    }),
    L('bloom-set-after', 'CARD POWER', 'Each tile keeps its card number. Save 8s and 9s for strong tiles.', 'explainer', 'Next', {
      cta: 'NEXT', closesGrow: true,
    }),
    L('bloom-set-throw', 'THROW', 'Swipe up, drag it to the Throw pile, or tap the pile.', 'hand', 'Discard', {
      autoDiscard: true,
    }),
    L('bloom-opponent', 'WAIT', 'They grow on their side.', 'none', 'Opponent'),
  ],
  // 4 STRENGTHEN (a way to use your Grow)
  [
    L('strength', 'STRENGTHEN', 'Another way to use Grow: a higher card makes your tile stronger.', 'tile', 'Sprout', {
      card: [0, 8], tile: { q: -1, r: 1 }, cta: 'TAP THE 8',
    }),
  ],
  // 5 CUT (a way to use your Grow)
  [
    L('cut', 'CUT IT OFF', 'Or a higher card on their tile cuts it off. Their tiles wither.', 'tile', 'Sprout', {
      card: [0, 8], tile: { q: 1, r: -1 }, cta: 'TAP THE 8',
    }),
  ],
  // 6 SKIP GROW (separate lesson)
  [
    L('skip', 'SKIP GROW', 'Nothing good to play? Tap » to skip Grow and go to Throw.', 'context', 'EndAct', {
      cta: 'SKIP »',
    }),
    L('skip-throw', 'THROW', 'Swipe up, drag it to the Throw pile, or tap the pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
  ],
  // 7 BUTTONS (after the free turn)
  [
    L('btn-undo', 'UNDO', 'Takes back your last move this turn.', 'button', 'Next', {
      button: 'undo', cta: 'NEXT',
    }),
    L('btn-history', 'BULB', 'Past moves and the cards they threw.', 'button', 'Next', {
      button: 'intel', cta: 'NEXT',
    }),
    // The tutorial's last line points at the reference that replaces the old in-match "?".
    L('btn-display', 'DISPLAY', `Important info. Respect it. ${HELP.tutorialFinal}`, 'button', 'Next', {
      button: 'display', cta: 'NEXT',
    }),
  ],
  // 8 BOMB (a way to use your Grow)
  [
    L('bomb', 'BOMB', 'A Bomb: your Grow destroys one of their tiles. Homes are safe.', 'tile', 'PlayFruit', {
      tile: { q: 0, r: 0 }, cta: 'TAP BOMB',
    }),
  ],
  // 9 BLAST (an extra move, like Bloom)
  [
    L('mega', 'BLAST', 'Two Bombs: extra move, like Bloom. Clears a tile and its neighbours.', 'bloom', 'MegaBomb', {
      tile: { q: 1, r: -1 }, cta: 'TAP BLAST',
    }),
  ],
  // 10 BLOOM WITH THE THROW PILE (on a Draw)
  [
    L('bloom-intro', 'BLOOM', 'Extra move on Grow: 3–6 cards at once. Same number, or in a row.', 'explainer', 'Next', {
      cta: 'NEXT', bloomDemo: true,
    }),
    L('discard-draw', 'THROW PILE', 'If the Throw pile glows gold, its top card completes your Bloom.', 'discard', 'Draw', {
      cta: 'TAKE IT',
    }),
    L('discard-bloom', 'BLOOM', 'Tap Bloom, then tap or draw the tiles.', 'bloom', 'Bloom', {
      cta: 'TAP BLOOM',
    }),
    L('bloom-skip', 'SKIP BLOOM', 'You can also skip Bloom and save the cards for later. Tap ».', 'context', 'EndAct', {
      cta: 'TAP »', rewind: true,
    }),
  ],
  // 11 HOW YOU WIN
  [
    L('win-place', 'KO', "Surround your opponent's home on every side for an instant win.", 'tile', 'Sprout', {
      card: [0, 5], tile: { q: 2, r: -1 }, cta: 'TAP THE 5',
    }),
  ],
  // 12 LAST ROUND (separate lesson)
  [
    L('final', 'LAST ROUND', 'The Draw pile is empty. One last turn each, starting at Grow.', 'context', 'EndAct', {
      cta: 'SKIP »',
    }),
    L('final-throw', 'LAST THROW', 'Throw your last card. Then most points wins.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('final-opponent', 'WAIT', 'They get the same last turn.', 'none', 'Opponent'),
  ],
  // 13 FREE
  [
    L('free', 'YOUR TURN', 'Play one turn on your own. Tip: save 8s and 9s for strong tiles.', 'none', 'FreeTurn'),
  ],
];

/**
 * The tutorial: Grow and its other uses (Strengthen, cut, Bomb), then Bloom on a Throw
 * pile Draw and Blast, the win, a free turn and the buttons. Skip and the last round are
 * separate lessons only.
 */
export const TUTORIAL_CORE = Object.freeze([
  'goal', 'turn', 'strengthen', 'cut', 'bomb', 'throw-pile', 'blast', 'win', 'free', 'buttons',
] as const satisfies readonly TutorialChapterId[]);

export type TutorialExtraId = 'grow' | 'bombs' | 'blooms' | 'last-round' | 'buttons';
/** Separate lessons (menu How to), each played on its own. */
export const TUTORIAL_EXTRAS: readonly { id: TutorialExtraId; title: string; chapters: readonly TutorialChapterId[] }[] = Object.freeze([
  { id: 'grow', title: 'Strengthen', chapters: ['strengthen', 'cut'] },
  { id: 'bombs', title: 'Bomb & Blast', chapters: ['bomb', 'blast'] },
  { id: 'blooms', title: 'Bloom', chapters: ['throw-pile'] },
  { id: 'last-round', title: 'Skip & last round', chapters: ['skip', 'final'] },
  { id: 'buttons', title: 'Buttons', chapters: ['buttons'] },
]);

/** The chapters of a track: 'core', an extra lesson id, or one chapter id on its own. */
export const tutorialTrackChapters = (track: string | undefined): readonly TutorialChapterId[] => {
  const extra = TUTORIAL_EXTRAS.find(e => e.id === track);
  if (extra) return extra.chapters;
  if (track !== 'core' && (TUTORIAL_CHAPTER_IDS as readonly string[]).includes(track ?? '')) return [track as TutorialChapterId];
  return TUTORIAL_CORE;
};

/** The track a chapter is played in when it is opened directly: the tutorial, a lesson, or itself. */
export const tutorialTrackFor = (chapter: number): string => {
  const id = TUTORIAL_CHAPTER_IDS[chapter];
  if (!id || (TUTORIAL_CORE as readonly string[]).includes(id)) return 'core';
  return TUTORIAL_EXTRAS.find(e => e.chapters.includes(id))?.id ?? id;
};

const trackStep = (chapter: number, track: string | undefined, by: 1 | -1): number | null => {
  const list = tutorialTrackChapters(track);
  const at = list.indexOf(TUTORIAL_CHAPTER_IDS[chapter]!);
  const id = at < 0 ? undefined : list[at + by];
  return id ? TUTORIAL_CHAPTER_IDS.indexOf(id) : null;
};
/** The next chapter in this track, or null when the track is done. */
export const nextTutorialChapter = (chapter: number, track: string | undefined): number | null => trackStep(chapter, track, 1);
/** The chapter before this one in the track, or null at its start. */
export const previousTutorialChapter = (chapter: number, track: string | undefined): number | null => trackStep(chapter, track, -1);

/** The free turn's one line, from the game's own state. */
export const freeTurnGuide = (s: {
  phase: State['phase']; mine: boolean; picked: boolean; grew: boolean; bloomReady: boolean;
}): { title: string; line: string } => {
  if (s.phase === 'GAME_OVER') return { title: 'DONE', line: 'Well played.' };
  if (!s.mine) return { title: 'WAIT', line: 'Watch what they grow and throw.' };
  if (s.phase === 'DRAW') return { title: 'DRAW', line: 'Tap the Draw pile, or take the top Throw pile card.' };
  if (s.phase === 'DISCARD') return { title: 'THROW', line: 'Swipe up, drag it to the Throw pile, or tap the pile.' };
  if (s.picked) return { title: 'GROW', line: 'Now tap a lit tile.' };
  if (s.grew) return s.bloomReady
    ? { title: 'BLOOM?', line: 'You can still Bloom. Or tap » to go to Throw.' }
    : { title: 'THROW', line: 'Tap » to go to Throw.' };
  return { title: 'GROW', line: 'Tap a card, then a lit tile. Nothing good? Tap ».' };
};

const baseSpecs: ChapterSpec[] = [
  { seed: 51000, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], opponent: [[1, 3], [2, 4], [3, 5]], draw: [3, 2], discard: [2, 2] },
  { seed: 51001, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], opponent: [[1, 3], [2, 4], [3, 5]], draw: [3, 2], discard: [2, 2] },
  { seed: 51005, phase: 'ACT', hand: [[0, 3], [1, 3], [2, 3], [1, 2], [2, 6], [3, 7], [1, 8]], tiles: [['-1,1', 0, 3]], variant: 'bloom-set' },
  { seed: 51002, phase: 'ACT', hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]], tiles: [['-1,1', 0, 2]] },
  { seed: 51004, phase: 'ACT', hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]], tiles: [['-1,1', 0, 4], ['0,0', 0, 3], ['1,-1', 1, 2], ['0,-1', 1, 5]] },
  { seed: 51003, phase: 'ACT', hand: [[0, 2], [1, 3], [2, 4], [3, 5], [0, 6], [1, 7], [2, 8]], tiles: [['-1,1', 0, 3]] },
  { seed: 51011, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], draw: [3, 2], discard: [2, 2] },
  { seed: 51006, phase: 'ACT', hand: [[null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7], [1, 8]], tiles: [['-1,1', 0, 3], ['1,-1', 1, 2], ['0,0', 1, 4]] },
  { seed: 51007, phase: 'ACT', hand: [[null, 0], [null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7]], tiles: [['-1,1', 0, 4], ['0,0', 0, 5], ['1,-1', 1, 2], ['0,-1', 1, 3], ['1,0', 1, 4], ['2,-1', 1, 4], ['1,-2', 1, 3]] },
  { seed: 51008, phase: 'DRAW', hand: [[0, 3], [0, 4], [1, 2], [2, 5], [3, 6], [1, 7], [2, 8]], discard: [0, 5], draw: [3, 2], tiles: [['-1,1', 0, 4]] },
  { seed: 51012, phase: 'ACT', hand: [[0, 5], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], tiles: [] },
  { seed: 51009, phase: 'ACT', hand: [[0, 3], [1, 4], [2, 5], [3, 6], [0, 7]], opponent: [[1, 3], [2, 4], [3, 5]], tiles: [['-1,1', 0, 4], ['1,-1', 1, 3]], final: true },
  { seed: 51010, phase: 'DRAW', hand: [[0, 4], [0, 5], [1, 3], [2, 4], [3, 5], [1, 7], [2, 8]], draw: [3, 2], tiles: [['-1,1', 0, 3], ['1,-1', 1, 3]] },
];

export const TUTORIAL_CHAPTER_COUNT = baseSpecs.length;

/**
 * Tutorial-only map: one ring smaller than the product board (radius 2 → 19 hexes;
 * normal Play stays at DEFAULT_CONFIG.boardRadius 3 → 37 hexes). Same hex shape.
 */
export const TUTORIAL_BOARD_RADIUS = SMALL_BOARD_RADIUS;
const TUTORIAL_OPENING = Object.freeze({
  boardRadius: TUTORIAL_BOARD_RADIUS,
  rockCount: 0,
  richCount: 1,
});

export const tutorialLessons = (chapter: number): readonly TutorialLesson[] => lessons[chapter] ?? [];
export const tutorialLesson = (chapter: number, step: number): TutorialLesson | null => lessons[chapter]?.[step] ?? null;
export const tutorialChapterId = (chapter: number): TutorialChapterId | null => TUTORIAL_CHAPTER_IDS[chapter] ?? null;

export const resolveLessonTarget = (lesson: TutorialLesson, state: State): LessonTarget | null => {
  if (lesson.focus === 'none' || lesson.action === 'FreeTurn' || lesson.action === 'Opponent') {
    return { kind: 'none', selector: '', shape: 'none' };
  }
  if (lesson.focus === 'explainer') {
    return { kind: 'explainer', selector: '#futasaku-glass [data-tut="next"]', shape: 'pill' };
  }
  // Throw: union hand + discard pile (soft rounded rect via measureTarget).
  if (lesson.focus === 'hand' || lesson.action === 'Discard') {
    return { kind: 'hand', selector: '#hand .card, #discard', shape: 'pill' };
  }
  if (lesson.focus === 'deck') return { kind: 'deck', selector: '#deck', shape: 'pill' };
  if (lesson.focus === 'discard') return { kind: 'discard', selector: '#discard', shape: 'pill' };
  if (lesson.focus === 'context') return { kind: 'context', selector: '#smart-context', shape: 'pill' };
  // Before paint: Bloom button. While painting, main.ts unions planted hexes + tip hexes.
  if (lesson.focus === 'bloom') return { kind: 'bloom', selector: '#smart-bloom-button', shape: 'pill' };
  if (lesson.focus === 'button') {
    const id = lesson.button ?? lesson.id;
    const map: Record<string, string> = {
      deck: '#deck', discard: '#discard', sort: '#hand-sort', undo: '#tool-undo',
      score: '#race', intel: '#futa04-help-button', display: '#smart-led',
    };
    return { kind: 'button', selector: map[id] ?? `[data-tutorial-btn="${id}"]`, shape: 'pill' };
  }
  if (lesson.focus === 'card') {
    const card = lesson.cardId != null
      ? state.hands[0].find(c => c.id === lesson.cardId)
      : lesson.card
        ? state.hands[0].find(c => c.suit === lesson.card![0] && c.rank === lesson.card![1])
        : state.hands[0][0];
    if (!card) return null;
    return { kind: 'card', selector: `#hand .card[data-card="${card.id}"]`, shape: 'pill' };
  }
  if ((lesson.focus === 'tile' || lesson.focus === 'home') && lesson.tile) {
    return { kind: lesson.focus, selector: `#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`, shape: 'pill' };
  }
  return null;
};

const WRONG = TUTORIAL.wrong;
const PRAISE = TUTORIAL.praise;
let wrongCursor = 0;
let praiseCursor = 0;
let lastPraise = -1;
let lockedCursor = 0;

export const tutorialFeedback = (
  kind: 'wrong' | 'praise' | 'chapter-done' | 'idle' | 'locked',
  _lesson?: TutorialLesson,
): string => {
  void _lesson;
  if (kind === 'wrong') {
    const line = WRONG[wrongCursor % WRONG.length]!;
    wrongCursor++;
    return line;
  }
  if (kind === 'locked') {
    const lines = TUTORIAL.locked;
    const line = lines[lockedCursor % lines.length]!;
    lockedCursor++;
    return line;
  }
  if (kind === 'praise') {
    let idx = praiseCursor % PRAISE.length;
    if (idx === lastPraise) idx = (idx + 1) % PRAISE.length;
    lastPraise = idx;
    praiseCursor = idx + 1;
    return PRAISE[idx]!;
  }
  if (kind === 'chapter-done') return TUTORIAL.chapterDone;
  return TUTORIAL.showMe;
};

const winTiles = (state: State): TileSpec[] => {
  const enemy = homeCoord(1, state.config);
  const mine = homeCoord(0, state.config);
  const around = neighbors(enemy, state.config.boardRadius);
  const open = around[around.length - 1]!;
  const filled = around.slice(0, -1);
  const path: TileSpec[] = [
    [coordKey({ q: mine.q + 1, r: mine.r - 1 }), 0, 3],
    ['0,0', 0, 3],
  ];
  for (const c of filled) path.push([coordKey(c), 0, 4]);
  void open;
  return path;
};

/** Move named cards into authored hand/discard/deck positions without cloning or inventing cards. */
export const tutorialChapter = (chapter: number, variant?: string): State => {
  const spec = baseSpecs[chapter];
  if (!spec) throw new RangeError(`Unknown tutorial chapter ${chapter}`);
  void variant;
  const opening = newGame(spec.seed, TUTORIAL_OPENING);
  const pool = createCards(opening.config);
  const take = ([suit, rank]: CardSpec): Card => {
    const index = pool.findIndex(card => card.suit === suit && card.rank === rank);
    if (index < 0) throw new Error(`Tutorial card missing: ${suit}:${rank}`);
    return pool.splice(index, 1)[0]!;
  };
  const hand = spec.hand.map(take);
  const opponent = (spec.opponent ?? [[1, 3], [2, 4], [3, 5], [0, 6], [1, 7], [2, 8], [3, 9]]).map(take);
  const discard = spec.discard ? [take(spec.discard)] : [take([3, 1])];
  const next = spec.draw ? [take(spec.draw)] : [];
  const board = { ...opening.board };
  const tileList = chapter === TUTORIAL_CHAPTER_IDS.indexOf('win') && (!spec.tiles || spec.tiles.length === 0)
    ? winTiles(opening)
    : (spec.tiles ?? []);
  for (const [key, owner, strength] of tileList) board[key] = { owner, strength } satisfies Tile;

  if (chapter === 0) {
    const mine = homeCoord(0, opening.config);
    const goalLessons = lessons[0]!;
    goalLessons[0] = { ...goalLessons[0]!, tile: mine };
  }
  if (chapter === TUTORIAL_CHAPTER_IDS.indexOf('win')) {
    const enemy = homeCoord(1, opening.config);
    const open = neighbors(enemy, opening.config.boardRadius).at(-1)!;
    const winLessons = lessons[chapter]!;
    const place = winLessons.find(l => l.id === 'win-place');
    if (place) {
      const idx = winLessons.indexOf(place);
      winLessons[idx] = { ...place, tile: open, card: [0, 5] };
    }
  }

  const rest = [...pool];
  // The first played turn teaches both special terrain types without changing
  // the ordinary match's generated board or rules.
  const terrain = chapter === TUTORIAL_CHAPTER_IDS.indexOf('turn')
    ? { ...opening.terrain, '-2,0': 'rock' as const }
    : opening.terrain;
  const state: State = {
    ...opening, board, hands: [hand, opponent],
    terrain,
    deck: spec.final ? [] : [...next, ...rest],
    discard: spec.final ? [...rest, ...discard] : discard,
    phase: spec.phase, turnNumber: spec.final ? 51 : 1,
    deckFinal: spec.final ? { first: 0, remaining: 2 } : null,
    startingPlayer: 0, turnPlayer: 0, actor: 0,
  };
  return state;
};

/** Early lessons accept only the intended legal move; the last lesson is free. */
export const tutorialAccepts = (lesson: TutorialLesson, action: Action, state: State): boolean => {
  if (lesson.action === 'FreeTurn' || lesson.action === 'Next') return true;
  if (lesson.action === 'Opponent' || action.t !== lesson.action) return false;
  if (action.t === 'Draw') return action.from === (lesson.focus === 'discard' ? 'discard' : 'deck');
  if (action.t === 'Sprout') {
    const card = state.hands[0].find(c => c.id === action.card);
    const tile = lesson.tile ?? { q: 0, r: 0 };
    return !!card && (!lesson.card || (card.suit === lesson.card[0] && card.rank === lesson.card[1]))
      && coordKey(action.coord) === coordKey(tile);
  }
  if (action.t === 'PlayFruit' || action.t === 'MegaBomb') return coordKey(action.target) === coordKey(lesson.tile!);
  if (action.t === 'Bloom' || action.t === 'Discard') return true;
  return true;
};

/** After Blast (and similar), still in Grow — advance silently to Throw for the next lesson. */
const endActIfNeeded = (state: State): State => {
  if (state.phase !== 'ACT' || state.actor !== 0) return state;
  const end = legalActions(viewFor(state, 0)).find(a => a.t === 'EndAct');
  return end ? apply(state, end) : state;
};

/** The tutorial opponent visibly grows once where possible, using legal engine moves. */
export const tutorialOpponentAction = (legal: readonly Action[]): Action | null =>
  legal.find(action => action.t === 'Draw' && action.from === 'deck')
  ?? legal.find(action => action.t === 'Sprout')
  ?? legal.find(action => action.t === 'EndAct')
  ?? legal.find(action => action.t === 'Discard')
  ?? legal[0] ?? null;

/** Apply one guided lesson's move (or a full opponent turn) without UI. */
export const tutorialApplyLesson = (state: State, lesson: TutorialLesson): State => {
  if (lesson.action === 'FreeTurn') return state;
  // Next after Grow: close ACT silently so Throw / seek lands in DISCARD.
  if (lesson.action === 'Next') return lesson.closesGrow ? endActIfNeeded(state) : state;
  if (lesson.action === 'Opponent') {
    let next = state;
    // Prefer a short authored turn that still places tiles when legal.
    for (let guard = 0; guard < 12; guard++) {
      if (next.phase === 'GAME_OVER' || next.actor === 0) break;
      const action = tutorialOpponentAction(legalActions(viewFor(next, next.actor)));
      if (!action) break;
      next = apply(next, action);
    }
    return next;
  }
  // Throw lessons expect DISCARD — EndAct first when Grow is still open.
  let from = lesson.action === 'Discard' ? endActIfNeeded(state) : state;
  const legal = legalActions(viewFor(from, 0));
  const action = legal.find(candidate => tutorialAccepts(lesson, candidate, from));
  if (!action) return from;
  const next = apply(from, action);
  // Blast does not spend Grow; tutorial throw lessons expect DISCARD.
  if (lesson.action === 'MegaBomb') return endActIfNeeded(next);
  return next;
};

/**
 * Authored board at the start of (chapter, step). Rebuilds from the chapter opening
 * (and any reseat), then silently applies every earlier lesson — safe for Previous.
 */
export const tutorialStateAt = (chapter: number, step: number): State => {
  const lessons = tutorialLessons(chapter);
  if (!lessons.length || step < 0 || step >= lessons.length) {
    throw new RangeError(`Tutorial seek out of range: ${chapter}:${step}`);
  }
  let reseatAt = -1;
  let variant: string | undefined;
  for (let i = 0; i <= step; i++) {
    const reseat = lessons[i]?.reseat;
    if (reseat) { reseatAt = i; variant = reseat; }
  }
  let state = tutorialChapter(chapter, variant);
  const from = reseatAt >= 0 ? reseatAt : 0;
  for (let i = from; i < step; i++) {
    // a rewind step takes back the move just before it, so that move is never applied
    if (lessons[i + 1]?.rewind) continue;
    state = tutorialApplyLesson(state, lessons[i]!);
  }
  // Throw beat: silent EndAct so the authored position matches live ensureTutorialThrowPhase.
  if (lessons[step]?.action === 'Discard') state = endActIfNeeded(state);
  return state;
};

export const tutorialChapterById = (id: TutorialChapterId, variant?: string): State => {
  const chapter = TUTORIAL_CHAPTER_IDS.indexOf(id);
  if (chapter < 0) throw new RangeError(`Unknown tutorial chapter id ${id}`);
  return tutorialChapter(chapter, variant);
};
