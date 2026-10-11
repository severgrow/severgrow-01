// Authored teaching positions. The rules still come entirely from apply/legalActions;
// these positions only arrange public terrain, territory, and the card order.
import { coordKey, createCards, newGame } from '../../../src/engine/index.js';
import type { Action, Card, Coord, State, Suit, Tile } from '../../../src/engine/index.js';

type CardSpec = readonly [Suit | null, number];
type TileSpec = readonly [string, 0 | 1, number];
type ChapterSpec = {
  seed: number; phase: State['phase']; hand: CardSpec[]; opponent?: CardSpec[];
  draw?: CardSpec; discard?: CardSpec; tiles?: TileSpec[];
  final?: boolean;
};

export type TutorialFocus = 'deck' | 'discard' | 'card' | 'tile' | 'context' | 'bloom' | 'none' | 'home' | 'button' | 'explainer';
export type TutorialChapterId =
  | 'goal' | 'turn' | 'bloom' | 'strengthen' | 'cut' | 'skip' | 'buttons'
  | 'bomb' | 'blast' | 'throw-pile' | 'win' | 'final' | 'free';
export type TutorialLesson = {
  id: string; text: string; focus: TutorialFocus; card?: CardSpec; tile?: Coord;
  cardId?: number;
  /** Short instruction (≤6 words). Falls back to `text` until the Pro copy lands. */
  instruction?: string;
  why?: string;
  action: Action['t'] | 'Opponent' | 'FreeTurn' | 'Next';
};
export type LessonTarget = { kind: TutorialFocus | 'none'; selector: string; shape: 'hex' | 'card' | 'pill' | 'none' };

/** Final Pro chapter order (13). Count stays 10 until the chapter rewrite lands. */
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

export const resolveLessonTarget = (lesson: TutorialLesson, state: State): LessonTarget | null => {
  if (lesson.focus === 'none' || lesson.action === 'FreeTurn') {
    return { kind: 'none', selector: '', shape: 'none' };
  }
  if (lesson.focus === 'deck') return { kind: 'deck', selector: '#deck', shape: 'pill' };
  if (lesson.focus === 'discard') return { kind: 'discard', selector: '#discard', shape: 'pill' };
  if (lesson.focus === 'context') return { kind: 'context', selector: '#smart-context', shape: 'pill' };
  if (lesson.focus === 'bloom') return { kind: 'bloom', selector: '#smart-bloom-button', shape: 'pill' };
  if (lesson.focus === 'card') {
    const card = lesson.cardId != null
      ? state.hands[0].find(c => c.id === lesson.cardId)
      : lesson.card
        ? state.hands[0].find(c => c.suit === lesson.card![0] && c.rank === lesson.card![1])
        : state.hands[0][0];
    if (!card) return null;
    return { kind: 'card', selector: `#hand .card[data-card="${card.id}"]`, shape: 'card' };
  }
  if (lesson.focus === 'tile' && lesson.tile) {
    return { kind: 'tile', selector: `#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`, shape: 'hex' };
  }
  if (lesson.focus === 'home' && lesson.tile) {
    return { kind: 'home', selector: `#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`, shape: 'hex' };
  }
  if (lesson.focus === 'button' && lesson.id) {
    return { kind: 'button', selector: `[data-tutorial-btn="${lesson.id}"]`, shape: 'pill' };
  }
  if (lesson.focus === 'explainer') return { kind: 'explainer', selector: '#futasaku-glass', shape: 'none' };
  return null;
};

export const tutorialFeedback = (
  kind: 'wrong' | 'praise' | 'chapter-done' | 'idle',
  _lesson?: TutorialLesson,
): string => {
  // Stub until strings land in P3/P4 — wrong answer so Pro tests stay red.
  if (kind === 'wrong') return '';
  if (kind === 'praise') return '';
  if (kind === 'chapter-done') return '';
  return '';
};

const lessons: TutorialLesson[][] = [
  [
    { id:'draw', text:'DRAW ONE.', focus:'deck', action:'Draw' },
    { id:'grow', text:'GROW FROM YOUR HOME.', focus:'tile', card:[0,4], tile:{q:-1,r:1}, action:'Sprout' },
    { id:'connection', text:'KEEP IT CONNECTED.', focus:'context', action:'EndAct' },
    { id:'throw', text:'THROW ONE CARD.', focus:'card', action:'Discard' },
    { id:'opponent', text:'WATCH THEIR TURN.', focus:'none', action:'Opponent' },
  ],
  [
    { id:'strength', text:'A HIGHER NUMBER STRENGTHENS YOUR TILE.', focus:'tile', card:[0,8], tile:{q:-1,r:1}, action:'Sprout' },
    { id:'strength-done', text:'NOW END GROW.', focus:'context', action:'EndAct' },
    { id:'strength-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'skip', text:'YOU CAN SKIP GROW. USUALLY, GROWING HELPS.', focus:'context', action:'EndAct' },
    { id:'skip-throw', text:'THROW TO END YOUR TURN.', focus:'card', action:'Discard' },
  ],
  [
    { id:'cut', text:'BREAK THIS LINK.', focus:'tile', card:[0,8], tile:{q:1,r:-1}, action:'Sprout' },
    { id:'cut-after', text:'THAT\'S A CUT. SEPARATED TILES FALL.', focus:'context', action:'EndAct' },
    { id:'cut-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'bloom', text:'THREE CONNECTED CARDS CAN BLOOM.', focus:'bloom', action:'Bloom' },
    { id:'bloom-after', text:'ONE CARD. ONE TILE.', focus:'context', action:'EndAct' },
    { id:'bloom-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'bomb', text:'ONE BOMB REMOVES AN ENEMY TILE.', focus:'tile', tile:{q:0,r:0}, action:'PlayFruit' },
    { id:'bomb-after', text:'YOUR HOME AND THEIRS STAY SAFE.', focus:'context', action:'EndAct' },
    { id:'bomb-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'mega', text:'TWO BOMBS. ONE BLOOM.', focus:'bloom', tile:{q:1,r:-1}, action:'MegaBomb' },
    { id:'mega-after', text:'THE BLAST TAKES NEIGHBOURS. YOUR TILES SURVIVE.', focus:'context', action:'EndAct' },
    { id:'mega-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'discard-draw', text:'THE THROW PILE CAN COMPLETE A BLOOM.', focus:'discard', action:'Draw' },
    { id:'discard-bloom', text:'USE WHAT YOU SAW.', focus:'bloom', action:'Bloom' },
    { id:'discard-after', text:'WATCH THE DISCARD.', focus:'context', action:'EndAct' },
    { id:'discard-throw', text:'THROW ONE.', focus:'card', action:'Discard' },
  ],
  [
    { id:'final', text:'NO CARD LEFT. THIS TURN BEGINS AT GROW.', focus:'context', action:'EndAct' },
    { id:'final-throw', text:'BOTH SIDES GET A FAIR LAST TURN.', focus:'card', action:'Discard' },
    { id:'final-opponent', text:'THEIR LAST TURN.', focus:'none', action:'Opponent' },
  ],
  [
    { id:'free', text:'YOUR TURN.', focus:'none', action:'FreeTurn' },
  ],
];

const specs: ChapterSpec[] = [
  {seed:51001,phase:'DRAW',hand:[[0,4],[1,2],[2,3],[3,4],[0,7],[1,6],[2,8]],opponent:[[1,3],[2,4],[3,5]],draw:[3,2],discard:[2,2]},
  {seed:51002,phase:'ACT',hand:[[0,8],[1,2],[2,3],[3,4],[0,5],[1,6],[2,7]],tiles:[['-1,1',0,2]]},
  {seed:51003,phase:'ACT',hand:[[0,2],[1,3],[2,4],[3,5],[0,6],[1,7],[2,8]],tiles:[['-1,1',0,3]]},
  {seed:51004,phase:'ACT',hand:[[0,8],[1,2],[2,3],[3,4],[0,5],[1,6],[2,7]],tiles:[['-1,1',0,4],['0,0',0,3],['1,-1',1,2],['0,-1',1,5]]},
  {seed:51005,phase:'ACT',hand:[[0,3],[0,4],[0,5],[1,2],[2,6],[3,7],[1,8]],tiles:[['-1,1',0,3]]},
  {seed:51006,phase:'ACT',hand:[[null,0],[0,3],[1,4],[2,5],[3,6],[0,7],[1,8]],tiles:[['-1,1',0,3],['1,-1',1,2],['0,0',1,4]]},
  {seed:51007,phase:'ACT',hand:[[null,0],[null,0],[0,3],[1,4],[2,5],[3,6],[0,7]],tiles:[['-1,1',0,4],['0,0',0,5],['1,-1',1,2],['0,-1',1,3],['1,0',1,4],['2,-1',1,4],['1,-2',1,3]]},
  {seed:51008,phase:'DRAW',hand:[[0,3],[0,4],[1,2],[2,5],[3,6],[1,7],[2,8]],discard:[0,5],draw:[3,2],tiles:[['-1,1',0,4]]},
  {seed:51009,phase:'ACT',hand:[[0,3],[1,4],[2,5],[3,6],[0,7]],opponent:[[1,3],[2,4],[3,5]],tiles:[['-1,1',0,4],['1,-1',1,3]],final:true},
  {seed:51010,phase:'DRAW',hand:[[0,4],[0,5],[1,3],[2,4],[3,5],[1,7],[2,8]],draw:[3,2],tiles:[['-1,1',0,3],['1,-1',1,3]]},
];

export const TUTORIAL_CHAPTER_COUNT = specs.length;
export const tutorialLessons = (chapter: number): readonly TutorialLesson[] => lessons[chapter] ?? [];
export const tutorialLesson = (chapter: number, step: number): TutorialLesson | null => lessons[chapter]?.[step] ?? null;

/** Move named cards into authored hand/discard/deck positions without cloning or inventing cards. */
export const tutorialChapter = (chapter: number): State => {
  const spec = specs[chapter];
  if (!spec) throw new RangeError(`Unknown tutorial chapter ${chapter}`);
  const opening = newGame(spec.seed,{rockCount:0,richCount:1});
  const pool = createCards(opening.config);
  const take = ([suit,rank]: CardSpec): Card => {
    const index = pool.findIndex(card=>card.suit===suit && card.rank===rank);
    if (index < 0) throw new Error(`Tutorial card missing: ${suit}:${rank}`);
    return pool.splice(index,1)[0]!;
  };
  const hand = spec.hand.map(take);
  const opponent = (spec.opponent ?? [[1,3],[2,4],[3,5],[0,6],[1,7],[2,8],[3,9]]).map(take);
  const discard = spec.discard ? [take(spec.discard)] : [take([3,1])];
  const next = spec.draw ? [take(spec.draw)] : [];
  const board = {...opening.board};
  for (const [key,owner,strength] of spec.tiles ?? []) board[key] = {owner,strength} satisfies Tile;
  const rest = [...pool];
  const state: State = {
    ...opening, board, hands:[hand,opponent],
    deck:spec.final ? [] : [...next,...rest],
    discard:spec.final ? [...rest,...discard] : discard,
    phase:spec.phase, turnNumber:spec.final ? 51 : 1,
    deckFinal:spec.final ? {first:0,remaining:2} : null,
    startingPlayer:0, turnPlayer:0, actor:0,
  };
  return state;
};

/** Early lessons accept only the intended legal move; the last lesson is free. */
export const tutorialAccepts = (lesson: TutorialLesson, action: Action, state: State): boolean => {
  if (lesson.action === 'FreeTurn' || lesson.action === 'Next') return true;
  if (lesson.action === 'Opponent' || action.t !== lesson.action) return false;
  if (action.t === 'Draw') return action.from === (lesson.focus === 'discard' ? 'discard' : 'deck');
  if (action.t === 'Sprout') {
    const card = state.hands[0].find(c=>c.id===action.card);
    return !!card && card.suit===lesson.card?.[0] && card.rank===lesson.card[1] && coordKey(action.coord)===coordKey(lesson.tile!);
  }
  if (action.t === 'PlayFruit' || action.t === 'MegaBomb') return coordKey(action.target) === coordKey(lesson.tile!);
  if (action.t === 'Bloom') return true;
  return true;
};

/** The tutorial opponent visibly grows once where possible, using legal engine moves. */
export const tutorialOpponentAction = (legal: readonly Action[]): Action | null =>
  legal.find(action=>action.t==='Draw' && action.from==='deck')
  ?? legal.find(action=>action.t==='Sprout')
  ?? legal.find(action=>action.t==='EndAct')
  ?? legal.find(action=>action.t==='Discard')
  ?? legal[0] ?? null;
