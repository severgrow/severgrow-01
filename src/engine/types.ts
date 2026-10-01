// Core serializable types (spec section 12). Everything here is plain JSON:
// no classes, Maps, Sets, Dates, functions or Infinity.

export type Player = 0 | 1;
export type Suit = 0 | 1 | 2 | 3;

export type Coord = { q: number; r: number };

export type Terrain = 'normal' | 'rock' | 'rich';

export type RootStyle = 'ring2' | 'corner';

export type RulesConfig = {
  /** Spec default 3. Typed as number so nothing else hardcodes the radius (open question C). */
  boardRadius: number;
  rootStyle: RootStyle;
  handSize: number;
  copiesPerCard: number;
  /** Must be even (mirrored pairs). */
  rockCount: number;
  /** Must be odd (centre + mirrored pairs). */
  richCount: number;
  knockDeadwood: number;
  knockGivesFinalTurn: boolean;
  rotThreshold: number;
  rotStep: number;
  forbidRedundantDiscard: boolean;
  allowHyphaOneBend: boolean;
  fruitPerPlayer: number;
  rootsScore: boolean;
  /** v0.4: cards run 1..maxRank (5-9). */
  maxRank: number;
  /** v0.4: Sprout moves allowed per turn (0 = off). */
  sproutsPerTurn: number;
  /** v0.4: redeal until both opening hands hold a combo. */
  guaranteeOpeningMeld: boolean;
  /** v0.4: the game ends after this many turns each (0 = no limit). */
  maxTurnsPerPlayer: number;
  /** v0.4: parked rules switches. */
  rotEnabled: boolean;
  knockEnabled: boolean;
};

export type Card = { id: number; suit: Suit; rank: number };

/** Root immunity is encoded by `root: true` (never by Infinity). */
export type Tile = { owner: Player; strength: number; root?: boolean };

export type Phase = 'DRAW' | 'ACT' | 'DISCARD' | 'KNOCK' | 'ROT_PICK' | 'GAME_OVER';

export type EndReason = 'knock' | 'deck_exhaustion' | 'turn_limit' | 'strangle' | 'double_strangle';

export type GameResult = {
  /** null only for double_strangle */
  winner: Player | null;
  reason: EndReason;
  undercut?: boolean;
  scores: [number, number];
  /** kept-hand deadwood at the end, when defined */
  deadwood?: [number, number];
};

export type ResolutionSummary = {
  placed: Coord[];
  overgrown: Coord[];
  rotted: Coord[];
  severed: { player: Player; coords: Coord[] }[];
  fruit?: { sacrifice: Coord[]; target: Coord };
  strangled?: Player;
  /** v0.4: the hex a Sprout claimed. */
  sprout?: Coord;
};

export type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  | { t: 'MeldRun'; cards: number[]; start: Coord; dir: number }
  | { t: 'MeldSet'; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; card: number; coord: Coord }
  | { t: 'Fruit'; sacrifice: Coord[]; target: Coord }
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }
  | { t: 'Knock' }
  | { t: 'Continue' }
  | { t: 'RotPick'; coord: Coord };

export type Event =
  | { t: 'Draw'; player: Player; from: 'deck' | 'discard'; card?: number }
  | { t: 'MeldRun' | 'MeldSet'; player: Player; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; player: Player; card: number; coord: Coord }
  | {
      t: 'Overgrow';
      player: Player;
      coord: Coord;
      oldOwner: Player;
      oldStrength: number;
      newStrength: number;
    }
  | { t: 'Fruit'; player: Player; sacrifice: Coord[]; target: Coord }
  | { t: 'Discard'; player: Player; card: number }
  | { t: 'Knock'; player: Player }
  | { t: 'FinalTurnStart'; player: Player }
  | { t: 'RotCount'; player: Player; deadwood: number; count: number }
  | { t: 'RotPick'; picker: Player; coord: Coord }
  | { t: 'Rot'; player: Player; coords: Coord[] }
  | { t: 'Sever'; player: Player; coords: Coord[] }
  | { t: 'Strangle'; player: Player }
  | { t: 'GameEnd'; result: GameResult };

export type RotPickState = { remaining: number; candidates: Coord[] };

export type State = {
  seed: number;
  config: RulesConfig;
  /** Every on-board hex has a key; null = empty (rock hexes are always null). */
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
  hands: [Card[], Card[]];
  /** Top of the deck is index 0. */
  deck: Card[];
  /** Top of the discard pile is the last element. */
  discard: Card[];
  turnPlayer: Player;
  actor: Player;
  phase: Phase;
  drawnFromDiscard: number | null;
  fruitUsed: [number, number];
  finalTurn: { knocker: Player } | null;
  rotPick: RotPickState | null;
  /** Increments per player-turn, starts at 1. */
  turnNumber: number;
  result: GameResult | null;
  lastResolution: ResolutionSummary | null;
  history?: Event[];
  /** v0.4: Sprouts played this turn. */
  sproutsThisTurn: number;
  /** v0.4: which deal attempt was used (debugging the opening guarantee). */
  dealAttempt: number;
};

export type View = {
  player: Player;
  config: RulesConfig;
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
  hand: Card[];
  opponentHandCount: number;
  discard: Card[];
  deckCount: number;
  turnPlayer: Player;
  actor: Player;
  phase: Phase;
  drawnFromDiscard: number | null;
  fruitUsed: [number, number];
  finalTurn: { knocker: Player } | null;
  rotPick: RotPickState | null;
  turnNumber: number;
  sproutsThisTurn: number;
  score: number;
  opponentScore: number;
  myDeadwood: number;
  result: GameResult | null;
  lastResolution: ResolutionSummary | null;
};
