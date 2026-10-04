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

/** The game's name, as the player sees it (the code, storage keys and repo keep "severgrow"). */
export const GAME_TITLE = 'Severor';

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
  howto: ` <b>Fruit cards</b> (4 in the deck) have no number. In your Grow step, play one on an ${lower} tile that touches yours (your root counts): that tile is removed, even a 9, and anything that hung on it is cut off. Play as many as you hold. A Fruit card never makes a combo or a sprout; you can throw it, and then ${OPP.the} can take it.`,
  /** first time a Fruit card is picked */
  anyStrength: 'Any strength: even a 9 can go.',
  /** the hint while a Fruit card is picked */
  tapTarget: `Tap a lit ${lower} tile to remove it`,
  /** the shortcut on an opponent tile's card */
  use: 'Use Fruit card',
  /** the shortcut's note on a top-rank tile */
  topRank: 'No combo can replace this. A Fruit card can.',
  /** why a held Fruit card has nothing to do */
  noTarget: `No ${lower} tile touches yours.`,
  notNow: 'Play it in your Grow step.',
  /** the chip near the deck */
  unseen: (n: number) => `Fruit cards unseen: ${n}`,
  /** the burst banner */
  banner: 'Fruited!',
  /** a move, in plain words */
  suggest: (hex: string, strength: number) => `Use a Fruit card on ${OPP.theirs} ${strength} at ${hex}`,
  youDid: (hex: string, strength: number) => `You used a Fruit card on ${OPP.theirs} ${strength} at ${hex}`,
  oppDid: (strength: number) => `${OPPONENT_LABEL} used a Fruit card on your ${strength}`,
  oppTook: `${OPPONENT_LABEL} took the Fruit card`,
  youTook: 'You took the Fruit card',
});
