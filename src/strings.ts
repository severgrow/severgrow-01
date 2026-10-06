// The words the player sees for the other side, in one place (UI polish pass 3). Only text
// the player can read uses these; code names (src/bots/, botVersion, BOT, CSS classes) stay.

/** What the other side is called everywhere on the page. */
export const OPPONENT_LABEL = 'Opponent';

const lower = OPPONENT_LABEL.toLowerCase();

/** Ready-made phrases built from OPPONENT_LABEL, so the grammar stays right everywhere. */
export const OPP = Object.freeze({
  /** "Opponent" (a label: score bar, chips) */
  label: OPPONENT_LABEL,
  /** "opponent" (before a noun: "an opponent tile") */
  noun: lower,
  /** "Your opponent" (starting a sentence) */
  The: `Your ${lower}`,
  /** "your opponent" (inside a sentence) */
  the: `your ${lower}`,
  /** "Your opponent's" */
  Theirs: `Your ${lower}'s`,
  /** "your opponent's" */
  theirs: `your ${lower}'s`,
  /** "Opponent's" (a label: "Opponent's tile", "Opponent's turn") */
  Label: `${OPPONENT_LABEL}'s`,
});

/** The game's player-facing name. Historical save keys keep their original namespace. */
export const GAME_TITLE = 'Futasaku';

/** The words for the one-card move. It is called "Sprout" everywhere (one constant: SPROUT). */
export type MoveWords = {
  Name: string;
  name: string;
  /** the How to play sentence (HTML) */
  howto: string;
  /** the Strengthen example in How to play (HTML) */
  strengthenExample: string;
  /** the Grow-step hint when nothing is picked */
  tapHint: string;
  /** the note in the moves row */
  pick: string;
  /** the small link that skips the move, and its tooltip */
  skip: string;
  skipTitle: string;
  /** "Practice game: ..." under a win */
  practice: string;
  /** coach lines */
  coachTip: (combo: string) => string;
  coachWhy: (combo: string) => string;
  bullet: string;
  /** log lines */
  youDid: (hex: string) => string;
  oppDid: (card: string, hex: string) => string;
  /** the move list */
  suggest: (hex: string, card: string) => string;
};

export const SPROUT: Readonly<MoveWords> = Object.freeze({
  Name: 'Sprout',
  name: 'sprout',
  howto: ' Once per turn you can <b>sprout</b> one tile with any single card.',
  strengthenExample: `<i>Example: your 5 sits next to ${OPP.the}; sprout a 9 on it and it becomes a 9.</i>`,
  tapHint: 'Tap a card to sprout it',
  pick: 'Pick a card to sprout',
  skip: 'Skip sprout',
  skipTitle: 'Skip the sprout and throw a card',
  practice: 'Practice game: no sprout this time.',
  coachTip: (combo: string) => `Sprout: one card, one tile. Handy when you have no ${combo}.`,
  coachWhy: (combo: string) => `A Sprout grows one tile for you with a single card, so your ${combo} cards stay in your hand.`,
  bullet: 'No combo? Sprout one card as one tile.',
  youDid: (hex: string) => `You sprouted one tile at ${hex}`,
  oppDid: (card: string, hex: string) => `${OPP.The} sprouted a ${card} at ${hex}`,
  suggest: (hex: string, card: string) => `Sprout one tile at ${hex} with the ${card}`,
});


/** The turn pill's clock: "12 turns left", "Last turn". */
export const turnsLeftText = (n: number) => (n <= 1 ? 'Last turn' : `${n} turns left`);

/** v0.7: the two homes. Code says "root"; the player reads "home", "your tree", "opponent's volcano". */
/** Step 7: the first-run welcome card on the main menu. */
export const WELCOME = Object.freeze({
  title: `Welcome to ${GAME_TITLE}`,
  steps: Object.freeze([
    Object.freeze({ icon: 'deck', name: 'Draw', text: 'Take a card from the deck or the throw pile.' }),
    Object.freeze({ icon: 'sprout', name: 'Grow', text: 'Play cards to grow tiles. Matching cards bloom into several.' }),
    Object.freeze({ icon: 'throw', name: 'Throw', text: 'Throw one card to end your turn.' }),
  ]),
  goal: "Keep everything joined to your home, and cut your opponent's links.",
  tutorial: 'New here? The <b>tutorial game</b> teaches you in 15 moves, with an arrow showing where to tap.',
});

export const HOME = Object.freeze({
  word: 'home',
  Word: 'Home',
  /** the tile card and captions */
  mine: 'Your tree',
  theirs: `${OPPONENT_LABEL}'s volcano`,
  danger: 'Home in danger',
  cutOff: 'Tiles cut off from your home wither',
  surround: `Surround ${OPP.theirs} home to win at once`,
  /** the tile card when a home is tapped */
  tapMine: (blocked: number) => `Your home: everything you own must stay connected to it. ${blocked} of 6 sides blocked.`,
  tapTheirs: (blocked: number) => `Surround all 6 sides to win at once. ${blocked} of 6 sides blocked.`,
  /** the Strangle captions */
  mineSurrounded: 'Your tree is surrounded!',
  theirsSurrounded: `${OPPONENT_LABEL}'s volcano is surrounded!`,
});

/** v0.7: the only combo, "Bloom", in one place. */
export const BLOOM = Object.freeze({
  Name: 'Bloom',
  name: 'bloom',
  /** the move button: "Bloom 3 tiles" / "Bloom 4 tiles" */
  button: (n: number) => `Bloom ${n} tiles`,
  /** the one button that opens the list when there are several ways to bloom */
  choices: (n: number) => `${n} ways`,
  /** when the group is longer than the bloom: "Bloom 3 tiles, keep the other" */
  buttonKeep: (n: number, kept: number) => `Bloom ${n} tiles, keep the ${kept === 1 ? 'other' : `other ${kept}`}`,
  /** How to play (HTML) */
  howto:
    " Three or four cards that go together (the same number in different suits, or numbers in a row in one suit) can <b>bloom</b>. They grow that many tiles in any shape, as long as one touches your tiles. Each tile keeps its card's number.",
  /** the general hint */
  hint: 'You can bloom with cards that match or follow on.',
  /** why a held group cannot bloom right now */
  tooFew: (n: number) => `No room to bloom ${n}`,
  /** the move list and the log */
  suggest: (n: number, hexes: string) => `Bloom ${n} tiles at ${hexes}`,
  youDid: (n: number) => `You bloomed ${n} tiles`,
  oppDid: (n: number) => `${OPP.The} bloomed ${n} tiles`,
});

/** The words for v0.6 Fruit cards, in one place. */
export const FRUIT = Object.freeze({
  /** "Fruit card" */
  card: 'Fruit card',
  /** "Fruit cards" */
  cards: 'Fruit cards',
  /** the small print on the card face */
  print: 'Fruit',
  /** the one-time tip (re-openable from How to play) */
  tip: `Fruit cards: play one on an ${lower} tile that touches yours to remove it, even a 9.`,
  /** How to play (HTML) */
  howto: ` <b>Fruit cards</b> (4 in the deck) have no number. In your Grow step, play one on an ${lower} tile that touches yours (your home counts): that tile is removed, even a 9, and anything that hung on it is cut off. A Fruit card uses your sprout for the turn (one sprout or one Fruit card per turn; a Bloom is still fine). It never makes a combo; you can throw it, and then ${OPP.the} can take it.`,
  /** first time a Fruit card is picked */
  anyStrength: 'Any strength, even a 9',
  /** the hint while a Fruit card is picked */
  tapTarget: `Tap a lit ${lower} tile`,
  /** the shortcut on an opponent tile's card */
  use: 'Use Fruit card',
  /** the shortcut's note on a top-rank tile */
  topRank: 'No combo can replace this. A Fruit card can.',
  /** why a held Fruit card has nothing to do */
  noTarget: `No ${lower} tile by yours`,
  notNow: 'Play it in your Grow step.',
  /** v0.8: a Fruit card uses the turn's sprout */
  used: 'Fruit is back next turn',
  /** v0.8: the Grow step's first hint when a Fruit card is playable */
  orSprout: 'Sprout, or play Fruit',
  /** the burst banner */
  banner: 'Fruited!',
  /** a move, in plain words */
  suggest: (hex: string, strength: number) => `Use a Fruit card on ${OPP.theirs} ${strength} at ${hex}`,
  youDid: (hex: string, strength: number) => `You used a Fruit card on ${OPP.theirs} ${strength} at ${hex}`,
  oppDid: (strength: number) => `${OPPONENT_LABEL} used a Fruit card on your ${strength}`,
  oppTook: `${OPPONENT_LABEL} took the Fruit card`,
  youTook: 'You took the Fruit card',
});

/** The test copy's step guidance: the plate on the map when a step starts (at most ~24 letters). */
export const STEP_CUE = Object.freeze({
  draw: 'Draw a card',
  grow: 'Play or skip',
  throw: 'Throw one card',
  opp: OPP.label,
  /** the small line above the words */
  kicker: Object.freeze({ draw: 'Step 1 of 3', grow: 'Step 2 of 3', throw: 'Step 3 of 3' }),
  kickerOpp: 'Their turn',
});
