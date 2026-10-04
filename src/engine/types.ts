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
  /** v0.7: a Bloom must touch my network (my root counts), judged before the move. */
  bloomMustTouchNetwork: boolean;
  rootsScore: boolean;
  /** v0.4: cards run 1..maxRank (5-9). */
  maxRank: number;
  /** v0.4: Sprout moves allowed per turn (0 = off). */
  sproutsPerTurn: number;
  /** v0.8: a Fruit card uses the turn's Sprout (like Strengthen): one of Sprout, Strengthen or Fruit card per Grow step. */
  fruitUsesSprout: boolean;
  /** v0.4: the game ends after this many turns each (0 = no limit). */
  maxTurnsPerPlayer: number;
  /** v0.5: a Sprout may raise one of my own weaker tiles (Strengthen). */
  allowStrengthen: boolean;
  /** v0.5: Strengthens per player per game; -1 = no limit. */
  strengthenLimitPerGame: number;
  /** v0.6: Fruit cards in the deck (joker-style: no suit, no number). */
  fruitCardCount: number;
  /** v0.6: a Fruit target may be touched by my root, not only by my other tiles. */
  fruitRootCountsAsTouch: boolean;
  /** v0.4: parked rules switches. */
  rotEnabled: boolean;
  knockEnabled: boolean;
};

/**
 * A card. Numbered cards have a suit and a rank 1-9. A v0.6 Fruit card has no suit
 * (`suit: null`) and no number (`rank: 0`, FRUIT_CARD_RANK): see isFruitCard.
 */
export type Card = { id: number; suit: Suit | null; rank: number };

/** Root immunity is encoded by `root: true` (never by Infinity). */
export type Tile = {
  owner: Player;
  strength: number;
  root?: boolean;
};

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
  /** v0.7: a Bloom: cards in ascending order, hexes[i] got cards[i]. */
  bloom?: { cards: number[]; hexes: Coord[] };
  /** v0.6: a Fruit card removed this tile (its strength before). */
  fruit?: { card: number; target: Coord; strength: number };
  strangled?: Player;
  /** v0.4: the hex a Sprout claimed. */
  sprout?: Coord;
  /** v0.5: a Sprout that strengthened my own tile. */
  strengthen?: { coord: Coord; from: number; to: number };
};

export type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  /** v0.7 Bloom, the only combo: hexes[i] receives cards[i] (a set or a run of 3-4 cards). */
  | { t: 'Bloom'; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; card: number; coord: Coord }
  | { t: 'PlayFruit'; card: number; target: Coord }
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }
  | { t: 'Knock' }
  | { t: 'Continue' }
  | { t: 'RotPick'; coord: Coord };

export type Event =
  | { t: 'Draw'; player: Player; from: 'deck' | 'discard'; card?: number }
  | { t: 'Bloom'; player: Player; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; player: Player; card: number; coord: Coord }
  | { t: 'Strengthen'; player: Player; card: number; coord: Coord; oldStrength: number; newStrength: number }
  | {
      t: 'Overgrow';
      player: Player;
      coord: Coord;
      oldOwner: Player;
      oldStrength: number;
      newStrength: number;
    }
  | { t: 'FruitCard'; player: Player; card: number; target: Coord; strength: number }
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
  /** v0.6: Fruit cards played so far (they leave the game). */
  fruitPlayed: number;
  /** v0.6: Fruit cards each player holds that the other saw them take from the throw pile. */
  fruitKnown: [number, number];
  /** v0.5: Strengthens used per player this game. */
  strengthenUsed: [number, number];
  finalTurn: { knocker: Player } | null;
  rotPick: RotPickState | null;
  /** Increments per player-turn, starts at 1. */
  turnNumber: number;
  result: GameResult | null;
  lastResolution: ResolutionSummary | null;
  history?: Event[];
  /** v0.4: Sprouts played this turn. */
  sproutsThisTurn: number;
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
  /** v0.6: Fruit cards played so far. */
  fruitPlayed: number;
  /** v0.6: Fruit cards I have not seen (not in my hand, not played, not in the throw pile, not known to be in the opponent's hand). */
  fruitUnseen: number;
  strengthenUsed: [number, number];
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
