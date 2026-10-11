// Authored teaching positions. The rules still come entirely from apply/legalActions;
// these positions only arrange public terrain, territory, and the card order.
import {
  apply, coordKey, createCards, homeCoord, legalActions, neighbors, newGame, viewFor,
} from '../../../src/engine/index.js';
import type { Action, Card, Coord, State, Suit, Tile } from '../../../src/engine/index.js';
import { TUTORIAL } from '../../../src/strings.js';

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
  /** Primary glass button label. Empty = no primary CTA yet (delayed Next). */
  cta?: string;
  /** Ms before Next appears and blinks (Next-style steps). */
  delayNextMs?: number;
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
    L('goal-mine', 'HOME', 'Every tile you grow must stay joined to it.', 'home', 'Next', {
      tile: { q: -2, r: 2 }, delayNextMs: 2200, cta: 'NEXT',
    }),
    L('goal-theirs', 'THEIR HOME', 'Surround its tiles for a KO win.', 'home', 'Next', {
      tile: { q: 2, r: -2 }, delayNextMs: 2200, cta: 'NEXT',
    }),
  ],
  // 2 YOUR TURN
  [
    L('draw', 'DRAW PILE', 'You start every turn by drawing 1 card from draw or discard pile.', 'deck', 'Draw', {
      cta: 'TAP DRAW PILE',
    }),
    L('grow', 'GROW', 'Tap a card and a tile to grow.', 'hand', 'Sprout', {
      tile: { q: -1, r: 1 }, cta: 'TAP A CARD',
    }),
    L('connection', 'STAY JOINED', 'Tiles cut off from your home wither and score nothing.', 'explainer', 'Next', {
      delayNextMs: 1600, cta: 'NEXT', closesGrow: true,
    }),
    L('throw', 'THROW', 'Double-tap a card, or drag it to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('opponent', 'THEIR TURN', 'They grow the same way you do.', 'none', 'Opponent'),
  ],
  // 3 BLOOM
  [
    L('bloom-explain', 'BLOOM', 'Extra step on Grow. Same number different suits, or consecutive same suit — 3 to 6 cards.', 'explainer', 'Next', {
      delayNextMs: 2400, cta: 'NEXT',
    }),
    L('bloom-strategy', 'LOOK FOR', '8 and 9 are strong. Sets: same number, different suits. Runs: consecutive, one suit.', 'explainer', 'Next', {
      delayNextMs: 2200, cta: 'NEXT',
    }),
    L('bloom-set', 'BLOOM SET', 'Same number, different suits — three to six cards.', 'bloom', 'Bloom', {
      cta: 'TAP BLOOM',
    }),
    L('bloom-set-after', 'CARD POWER', 'Each card keeps its number on the tile.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('bloom-set-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('bloom-run', 'BLOOM RUN', 'Consecutive numbers, one suit — three to six cards.', 'bloom', 'Bloom', {
      reseat: 'bloom-run', cta: 'TAP BLOOM',
    }),
    L('bloom-run-after', 'MATCHED TILES', 'The tiles match the cards you spent.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('bloom-run-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('bloom-opponent', 'THEIR TURN', 'A quick look at their grow.', 'none', 'Opponent'),
  ],
  // 4 STRENGTHEN
  [
    L('strength', 'STRENGTHEN', 'Play a higher card on your tile to make it stronger.', 'tile', 'Sprout', {
      card: [0, 8], tile: { q: -1, r: 1 }, cta: 'TAP DECK',
    }),
    L('strength-done', 'AFTER GROW', 'After Growing, go straight to throw — pick a card.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('strength-opponent', 'THEIR TURN', 'They place a few tiles too.', 'none', 'Opponent'),
  ],
  // 5 CUT
  [
    L('cut', 'CUT', 'Break their link. Cut-off tiles wither.', 'tile', 'Sprout', {
      card: [0, 8], tile: { q: 1, r: -1 }, cta: 'TAP DECK',
    }),
    L('cut-after', 'WITHER', 'Their score drops when tiles fall.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('cut-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('cut-opponent', 'THEIR TURN', 'Their turn — same draw, grow, throw.', 'none', 'Opponent'),
  ],
  // 6 SKIP GROW
  [
    L('skip', 'SKIP GROW', 'You can end Grow without placing a tile.', 'context', 'EndAct', {
      cta: 'NEXT',
    }),
    L('skip-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
  ],
  // 7 BUTTONS
  [
    L('btn-explain', 'CONTROLS', 'A quick look at the buttons around the board.', 'explainer', 'Next', {
      delayNextMs: 1800, cta: 'NEXT',
    }),
    L('btn-deck', 'DRAW PILE', 'Tap here on your Draw step.', 'button', 'Next', {
      button: 'deck', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-discard', 'THROW PILE', 'You may take its top card on Draw.', 'button', 'Next', {
      button: 'discard', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-sort', 'SORT', 'Tidies your hand by number and suit.', 'button', 'Next', {
      button: 'sort', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-undo', 'UNDO', 'Takes back your last move on your turn.', 'button', 'Next', {
      button: 'undo', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-score', 'SCORE', 'Most tiles wins if the deck runs out.', 'button', 'Next', {
      button: 'score', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-history', 'HISTORY', 'Match Intel — past moves, public cards.', 'button', 'Next', {
      button: 'intel', delayNextMs: 1600, cta: 'NEXT',
    }),
    L('btn-display', 'DISPLAY', 'Shows important info — respect it.', 'button', 'Next', {
      button: 'display', delayNextMs: 1600, cta: 'NEXT',
    }),
  ],
  // 8 BOMB
  [
    L('bomb', 'BOMB', 'Destroy an enemy tile; cut-off tiles wither. Uses your Grow turn.', 'tile', 'PlayFruit', {
      tile: { q: 0, r: 0 }, cta: 'TAP BOMB',
    }),
    L('bomb-after', 'SAFE HOME', 'Homes cannot be destroyed.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('bomb-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('bomb-opponent', 'THEIR TURN', 'They answer on their side.', 'none', 'Opponent'),
  ],
  // 9 BLAST
  [
    L('mega', 'BLAST', 'Two Bombs clear a tile and its neighbours.', 'bloom', 'MegaBomb', {
      tile: { q: 1, r: -1 }, cta: 'TAP BLAST',
    }),
    L('mega-after', 'AFTER BLAST', 'Blast does not use your Grow turn.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('mega-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('mega-opponent', 'THEIR TURN', 'Watch them grow once.', 'none', 'Opponent'),
  ],
  // 10 THROW PILE
  [
    L('discard-draw', 'THROW PILE', 'Glows when a card there can finish a bloom.', 'discard', 'Draw', {
      cta: 'TAP THROW PILE',
    }),
    L('discard-bloom', 'USE IT', 'Bloom with the card you took.', 'bloom', 'Bloom', {
      cta: 'TAP BLOOM',
    }),
    L('discard-after', 'WATCH THEM', 'What they throw often completes a set or run.', 'explainer', 'Next', {
      delayNextMs: 1400, cta: 'NEXT', closesGrow: true,
    }),
    L('discard-throw', 'THROW', 'Double-tap or drag to the discard pile.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('discard-opponent', 'THEIR TURN', 'Their turn — short and clear.', 'none', 'Opponent'),
  ],
  // 11 HOW YOU WIN
  [
    L('win-explain', 'HOW YOU WIN', 'Surround their home for a KO, or hold most tiles.', 'explainer', 'Next', {
      delayNextMs: 2200, cta: 'NEXT',
    }),
    L('win-place', 'CLOSE THE RING', 'The last neighbour ends it at once.', 'tile', 'Sprout', {
      card: [0, 5], tile: { q: 2, r: -1 }, cta: 'TAP DECK',
    }),
  ],
  // 12 FINAL TURN
  [
    L('final', 'FINAL TURN', 'Last round: no cards left. This turn starts at Grow.', 'context', 'EndAct', {
      cta: 'NEXT',
    }),
    L('final-throw', 'LAST THROW', 'Both get a fair last turn. Then score wins.', 'hand', 'Discard', {
      cta: 'TAP A CARD',
    }),
    L('final-opponent', 'THEIR LAST', 'Same fair Grow-first turn for them.', 'none', 'Opponent'),
  ],
  // 13 FREE
  [
    L('free-recap', 'REMEMBER', 'Hold 8s and 9s. Bloom sets or suit runs on Grow.', 'explainer', 'Next', {
      delayNextMs: 1800, cta: 'NEXT',
    }),
    L('free', 'PLAY', 'Your turn. The bulb shows what to do.', 'none', 'FreeTurn'),
  ],
];

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

const bloomRunSpec: ChapterSpec = {
  seed: 51015, phase: 'ACT',
  hand: [[0, 3], [0, 4], [0, 5], [1, 2], [2, 6], [3, 7], [1, 8]],
  tiles: [['-1,1', 0, 3]],
  variant: 'bloom-run',
};

export const TUTORIAL_CHAPTER_COUNT = baseSpecs.length;

/**
 * Tutorial-only map: one ring smaller than the product board (radius 2 → 19 hexes;
 * normal Play stays at DEFAULT_CONFIG.boardRadius 3 → 37 hexes). Same hex shape.
 */
export const TUTORIAL_BOARD_RADIUS = 2;
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
  let spec = baseSpecs[chapter];
  if (!spec) throw new RangeError(`Unknown tutorial chapter ${chapter}`);
  if (variant === 'bloom-run' || (chapter === 2 && variant === 'bloom-run')) spec = bloomRunSpec;
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
  for (let i = from; i < step; i++) state = tutorialApplyLesson(state, lessons[i]!);
  // Throw beat: silent EndAct so the authored position matches live ensureTutorialThrowPhase.
  if (lessons[step]?.action === 'Discard') state = endActIfNeeded(state);
  return state;
};

export const tutorialChapterById = (id: TutorialChapterId, variant?: string): State => {
  const chapter = TUTORIAL_CHAPTER_IDS.indexOf(id);
  if (chapter < 0) throw new RangeError(`Unknown tutorial chapter id ${id}`);
  return tutorialChapter(chapter, variant);
};
