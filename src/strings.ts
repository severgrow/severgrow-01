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

/**
 * The words for the one-card move in each version of the Seed A/B test. The Sprout version
 * keeps its exact old wording; the Seed version never says "sprout".
 */
export type MoveWords = {
  /** "Sprout" / "Seed" */
  Name: string;
  /** "sprout" / "seed" ("it uses your sprout for the turn") */
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

export const MOVE_WORDS: Readonly<Record<'sprout' | 'seed', MoveWords>> = Object.freeze({
  sprout: Object.freeze({
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
  }),
  seed: Object.freeze({
    Name: 'Seed',
    name: 'seed',
    howto: ' Once per turn you can <b>plant a seed</b>: any single card grows one tile worth <b>1</b>, whatever its number. Strengthen it later with a higher card.',
    strengthenExample: '<i>Example: plant a seed (worth 1); on a later turn play a 9 on it and it becomes a 9.</i>',
    tapHint: 'Tap a card to plant it as a seed',
    pick: 'Pick a card to plant a seed',
    skip: 'Skip seed',
    skipTitle: 'Skip the seed and throw a card',
    practice: 'Practice game: no seed planted this time.',
    coachTip: (combo: string) => `Seed: one card, one tile worth 1. Handy when you have no ${combo}; strengthen it later.`,
    coachWhy: (combo: string) => `A Seed plants one tile (worth 1) with a single card, so your ${combo} cards stay in your hand. A higher card can strengthen it later.`,
    bullet: 'No combo? Plant a card as a seed (worth 1), then strengthen it.',
    youDid: (hex: string) => `You planted a seed at ${hex}`,
    oppDid: (card: string, hex: string) => `${OPP.The} planted a seed (with a ${card}) at ${hex}`,
    suggest: (hex: string, card: string) => `Plant a seed at ${hex} with the ${card}`,
  }),
});

/** The words for a game's version ('sprout' when the config has no ruleset). */
export const moveWords = (c: { ruleset?: string }): MoveWords => (c.ruleset === 'seed' ? MOVE_WORDS.seed : MOVE_WORDS.sprout);

/** "Sprout version" / "Seed version". */
export const versionLabel = (c: { ruleset?: string }): string => `${moveWords(c).Name} version`;
