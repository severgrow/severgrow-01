// Authored teaching positions. The rules still come entirely from apply/legalActions;
// these positions only arrange public terrain, territory, and the card order.
import { coordKey, createCards, homeCoord, neighbors, newGame, rootCoord } from '../../../src/engine/index.js';
import type { Action, Card, Coord, State, Suit, Tile } from '../../../src/engine/index.js';
import { TUTORIAL } from '../../../src/strings.js';

type CardSpec = readonly [Suit | null, number];
type TileSpec = readonly [string, 0 | 1, number];
type ChapterSpec = {
  seed: number; phase: State['phase']; hand: CardSpec[]; opponent?: CardSpec[];
  draw?: CardSpec; discard?: CardSpec; tiles?: TileSpec[];
  final?: boolean; variant?: string;
};

export type TutorialFocus = 'deck' | 'discard' | 'card' | 'tile' | 'context' | 'bloom' | 'none' | 'home' | 'button' | 'explainer';
export type TutorialChapterId =
  | 'goal' | 'turn' | 'bloom' | 'strengthen' | 'cut' | 'skip' | 'buttons'
  | 'bomb' | 'blast' | 'throw-pile' | 'win' | 'final' | 'free';
export type TutorialLesson = {
  id: string;
  text: string;
  instruction: string;
  why?: string;
  focus: TutorialFocus;
  card?: CardSpec;
  cardId?: number;
  tile?: Coord;
  button?: string;
  reseat?: string;
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
  // 1 GOAL — glow the home; tap it to advance (no real action).
  [
    L('goal-mine', 'Tap your home.', 'Everything you own must stay joined to it.', 'home', 'Next', { tile: { q: -2, r: 2 } }),
    L('goal-theirs', 'Tap their home.', 'Surround it to win.', 'home', 'Next', { tile: { q: 2, r: -2 } }),
  ],
  // 2 YOUR TURN
  [
    L('draw', 'Tap the draw pile.', 'Your hand needs cards to grow.', 'deck', 'Draw'),
    L('grow', 'Tap the glowing card.', 'Then the lit tile by your home.', 'tile', 'Sprout', { card: [0, 4], tile: { q: -1, r: 1 } }),
    L('connection', 'Tap End Grow.', 'Cut-off tiles wither and score nothing.', 'context', 'EndAct'),
    L('throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard', { card: [1, 2] }),
    L('opponent', 'Watch their turn.', 'They grow the same way you do.', 'none', 'Opponent'),
  ],
  // 3 BLOOM
  [
    L('bloom-explain', 'Tap Next.', 'A set or a run of three to six.', 'explainer', 'Next'),
    L('bloom-set', 'Tap Bloom.', 'Three same numbers, different suits.', 'bloom', 'Bloom'),
    L('bloom-set-after', 'Tap End Grow.', 'Stronger cards make stronger tiles.', 'context', 'EndAct'),
    L('bloom-set-throw', 'Tap the glowing card.', 'Clear a card you do not need.', 'card', 'Discard'),
    L('bloom-run', 'Tap Bloom.', 'Numbers in a row, one suit.', 'bloom', 'Bloom', { reseat: 'bloom-run' }),
    L('bloom-run-after', 'Tap End Grow.', 'The tiles match the cards you spent.', 'context', 'EndAct'),
    L('bloom-run-throw', 'Tap the glowing card.', 'Then their turn begins.', 'card', 'Discard'),
  ],
  // 4 STRENGTHEN
  [
    L('strength', 'Tap the glowing card.', 'A higher card makes it stronger.', 'tile', 'Sprout', { card: [0, 8], tile: { q: -1, r: 1 } }),
    L('strength-done', 'Tap End Grow.', 'You already used your one Grow.', 'context', 'EndAct'),
    L('strength-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 5 CUT
  [
    L('cut', 'Tap the glowing card.', 'Break this link. Cut tiles wither.', 'tile', 'Sprout', { card: [0, 8], tile: { q: 1, r: -1 } }),
    L('cut-after', 'Tap End Grow.', 'Their score drops when tiles fall.', 'context', 'EndAct'),
    L('cut-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 6 SKIP GROW
  [
    L('skip', 'Tap End Grow.', 'You can skip Grow this turn.', 'context', 'EndAct'),
    L('skip-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 7 BUTTONS — glow the named control; tap it to advance (no real action).
  [
    L('btn-explain', 'Tap Next.', 'Meet each control one by one.', 'explainer', 'Next'),
    L('btn-deck', 'Tap the draw pile.', 'You draw from here.', 'button', 'Next', { button: 'deck' }),
    L('btn-discard', 'Tap the throw pile.', 'You may take its top card.', 'button', 'Next', { button: 'discard' }),
    L('btn-sort', 'Tap Sort.', 'Same numbers and suits line up.', 'button', 'Next', { button: 'sort' }),
    L('btn-undo', 'Tap Undo.', 'Takes back your last move.', 'button', 'Next', { button: 'undo' }),
    L('btn-turns', 'Tap Turns.', 'Thirty turns each, then score.', 'button', 'Next', { button: 'turns' }),
    L('btn-score', 'Tap Score.', 'Most tiles wins if time runs out.', 'button', 'Next', { button: 'score' }),
    L('btn-menu', 'Tap Menu.', 'Settings and How to play live here.', 'button', 'Next', { button: 'menu' }),
    L('btn-history', 'Tap History.', 'Public cards only — nothing hidden.', 'button', 'Next', { button: 'history' }),
    L('btn-word', 'Tap the step word.', 'Draw, Grow, or Throw.', 'button', 'Next', { button: 'word' }),
  ],
  // 8 BOMB
  [
    L('bomb', 'Tap the Bomb card.', 'Removes any enemy tile. Uses Grow.', 'tile', 'PlayFruit', { tile: { q: 0, r: 0 } }),
    L('bomb-after', 'Tap End Grow.', 'Your home stays safe.', 'context', 'EndAct'),
    L('bomb-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 9 BLAST
  [
    L('mega', 'Tap Blast.', 'Clears the tile and its neighbours.', 'bloom', 'MegaBomb', { tile: { q: 1, r: -1 } }),
    L('mega-after', 'Tap End Grow.', 'Homes are safe. Not your Grow.', 'context', 'EndAct'),
    L('mega-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 10 THROW PILE
  [
    L('discard-draw', 'Tap the throw pile.', 'It can finish blooms.', 'discard', 'Draw'),
    L('discard-bloom', 'Tap Bloom.', 'Use the card you took.', 'bloom', 'Bloom'),
    L('discard-after', 'Tap End Grow.', 'Watch what they throw.', 'context', 'EndAct'),
    L('discard-throw', 'Tap the glowing card.', 'Throwing ends your turn.', 'card', 'Discard'),
  ],
  // 11 HOW YOU WIN
  [
    L('win-explain', 'Tap Next.', 'Surround their home, or most tiles.', 'explainer', 'Next'),
    L('win-place', 'Tap the glowing card.', 'Close the ring to win.', 'tile', 'Sprout', { card: [0, 5], tile: { q: 2, r: -1 } }),
  ],
  // 12 FINAL TURN
  [
    L('final', 'Tap End Grow.', 'No card left. Grow comes first.', 'context', 'EndAct'),
    L('final-throw', 'Tap the glowing card.', 'Both get a fair last turn.', 'card', 'Discard'),
    L('final-opponent', 'Watch their turn.', 'Same fair Grow-first turn.', 'none', 'Opponent'),
  ],
  // 13 FREE
  [
    L('free', 'Your turn. No guide.', undefined, 'none', 'FreeTurn'),
  ],
];

const baseSpecs: ChapterSpec[] = [
  // goal — no cards played; any legal opening is fine
  { seed: 51000, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], opponent: [[1, 3], [2, 4], [3, 5]], draw: [3, 2], discard: [2, 2] },
  // turn (old 0)
  { seed: 51001, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], opponent: [[1, 3], [2, 4], [3, 5]], draw: [3, 2], discard: [2, 2] },
  // bloom set
  { seed: 51005, phase: 'ACT', hand: [[0, 3], [1, 3], [2, 3], [1, 2], [2, 6], [3, 7], [1, 8]], tiles: [['-1,1', 0, 3]], variant: 'bloom-set' },
  // strengthen (old 1)
  { seed: 51002, phase: 'ACT', hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]], tiles: [['-1,1', 0, 2]] },
  // cut (old 3)
  { seed: 51004, phase: 'ACT', hand: [[0, 8], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7]], tiles: [['-1,1', 0, 4], ['0,0', 0, 3], ['1,-1', 1, 2], ['0,-1', 1, 5]] },
  // skip (old 2)
  { seed: 51003, phase: 'ACT', hand: [[0, 2], [1, 3], [2, 4], [3, 5], [0, 6], [1, 7], [2, 8]], tiles: [['-1,1', 0, 3]] },
  // buttons
  { seed: 51011, phase: 'DRAW', hand: [[0, 4], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], draw: [3, 2], discard: [2, 2] },
  // bomb (old 5)
  { seed: 51006, phase: 'ACT', hand: [[null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7], [1, 8]], tiles: [['-1,1', 0, 3], ['1,-1', 1, 2], ['0,0', 1, 4]] },
  // blast (old 6)
  { seed: 51007, phase: 'ACT', hand: [[null, 0], [null, 0], [0, 3], [1, 4], [2, 5], [3, 6], [0, 7]], tiles: [['-1,1', 0, 4], ['0,0', 0, 5], ['1,-1', 1, 2], ['0,-1', 1, 3], ['1,0', 1, 4], ['2,-1', 1, 4], ['1,-2', 1, 3]] },
  // throw pile (old 7)
  { seed: 51008, phase: 'DRAW', hand: [[0, 3], [0, 4], [1, 2], [2, 5], [3, 6], [1, 7], [2, 8]], discard: [0, 5], draw: [3, 2], tiles: [['-1,1', 0, 4]] },
  // win — built dynamically below
  { seed: 51012, phase: 'ACT', hand: [[0, 5], [1, 2], [2, 3], [3, 4], [0, 7], [1, 6], [2, 8]], tiles: [] },
  // final (old 8)
  { seed: 51009, phase: 'ACT', hand: [[0, 3], [1, 4], [2, 5], [3, 6], [0, 7]], opponent: [[1, 3], [2, 4], [3, 5]], tiles: [['-1,1', 0, 4], ['1,-1', 1, 3]], final: true },
  // free (old 9)
  { seed: 51010, phase: 'DRAW', hand: [[0, 4], [0, 5], [1, 3], [2, 4], [3, 5], [1, 7], [2, 8]], draw: [3, 2], tiles: [['-1,1', 0, 3], ['1,-1', 1, 3]] },
];

const bloomRunSpec: ChapterSpec = {
  seed: 51015, phase: 'ACT',
  hand: [[0, 3], [0, 4], [0, 5], [1, 2], [2, 6], [3, 7], [1, 8]],
  tiles: [['-1,1', 0, 3]],
  variant: 'bloom-run',
};

export const TUTORIAL_CHAPTER_COUNT = baseSpecs.length;

export const tutorialLessons = (chapter: number): readonly TutorialLesson[] => lessons[chapter] ?? [];
export const tutorialLesson = (chapter: number, step: number): TutorialLesson | null => lessons[chapter]?.[step] ?? null;
export const tutorialChapterId = (chapter: number): TutorialChapterId | null => TUTORIAL_CHAPTER_IDS[chapter] ?? null;

export const resolveLessonTarget = (lesson: TutorialLesson, state: State): LessonTarget | null => {
  if (lesson.focus === 'none' || lesson.action === 'FreeTurn' || lesson.action === 'Opponent') {
    return { kind: 'none', selector: '', shape: 'none' };
  }
  // Pure explainers: only the Next button.
  if (lesson.focus === 'explainer') {
    return { kind: 'explainer', selector: '#futasaku-glass [data-tut="next"]', shape: 'pill' };
  }
  if (lesson.focus === 'deck') return { kind: 'deck', selector: '#deck', shape: 'pill' };
  if (lesson.focus === 'discard') return { kind: 'discard', selector: '#discard', shape: 'pill' };
  if (lesson.focus === 'context') return { kind: 'context', selector: '#smart-context', shape: 'pill' };
  if (lesson.focus === 'bloom') return { kind: 'bloom', selector: '#smart-bloom-button', shape: 'pill' };
  if (lesson.focus === 'button') {
    const id = lesson.button ?? lesson.id;
    const map: Record<string, string> = {
      deck: '#deck', discard: '#discard', sort: '#hand-sort', undo: '#tool-undo',
      turns: '#turn-pill', score: '#race', menu: '#hud-menu', history: '#hud-history', word: '#turn',
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
    return { kind: 'card', selector: `#hand .card[data-card="${card.id}"]`, shape: 'card' };
  }
  if ((lesson.focus === 'tile' || lesson.focus === 'home') && lesson.tile) {
    return { kind: lesson.focus, selector: `#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`, shape: 'hex' };
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
  // Leave the last neighbour empty for the scripted Grow; fill the rest with my tiles.
  const open = around[around.length - 1]!;
  const filled = around.slice(0, -1);
  const path: TileSpec[] = [
    [coordKey({ q: mine.q + 1, r: mine.r - 1 }), 0, 3], // -1,1 from -2,2
    ['0,0', 0, 3],
  ];
  for (const c of filled) path.push([coordKey(c), 0, 4]);
  // Ensure open hex is reachable: last filled should touch it (neighbours are adjacent ring).
  void open;
  return path;
};

/** Move named cards into authored hand/discard/deck positions without cloning or inventing cards. */
export const tutorialChapter = (chapter: number, variant?: string): State => {
  let spec = baseSpecs[chapter];
  if (!spec) throw new RangeError(`Unknown tutorial chapter ${chapter}`);
  if (variant === 'bloom-run' || (chapter === 2 && variant === 'bloom-run')) spec = bloomRunSpec;
  const opening = newGame(spec.seed, { rockCount: 0, richCount: 1 });
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

  // Goal / win lessons use live home coords.
  if (chapter === 0) {
    const mine = homeCoord(0, opening.config);
    const theirs = homeCoord(1, opening.config);
    const goalLessons = lessons[0]!;
    goalLessons[0] = { ...goalLessons[0]!, tile: mine };
    goalLessons[1] = { ...goalLessons[1]!, tile: theirs };
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
  const state: State = {
    ...opening, board, hands: [hand, opponent],
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
  if (action.t === 'Bloom') return true;
  if (action.t === 'Discard' && lesson.card) {
    const card = state.hands[0].find(c => c.id === action.card);
    return !!card && card.suit === lesson.card[0] && card.rank === lesson.card[1];
  }
  return true;
};

/** The tutorial opponent visibly grows once where possible, using legal engine moves. */
export const tutorialOpponentAction = (legal: readonly Action[]): Action | null =>
  legal.find(action => action.t === 'Draw' && action.from === 'deck')
  ?? legal.find(action => action.t === 'Sprout')
  ?? legal.find(action => action.t === 'EndAct')
  ?? legal.find(action => action.t === 'Discard')
  ?? legal[0] ?? null;

/** Drag tests and old call sites: map by familiar seed / role. */
export const tutorialChapterById = (id: TutorialChapterId, variant?: string): State => {
  const chapter = TUTORIAL_CHAPTER_IDS.indexOf(id);
  if (chapter < 0) throw new RangeError(`Unknown tutorial id ${id}`);
  return tutorialChapter(chapter, variant);
};

void rootCoord;
