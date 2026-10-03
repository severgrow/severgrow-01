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

