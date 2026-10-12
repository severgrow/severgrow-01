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

/** Online Duels (FUTASAKU 0.5) — every lobby / menu word the player reads. */
export const ONLINE = Object.freeze({
  brand: 'FUTASAKU',
  tagline: 'GROW · CONNECT · CONQUER',
  playOnline: 'Play online',
  playOffline: 'Play offline',
  pageTitleBase: 'FUTASAKU',
  hubTitle: 'Play online',
  hubBack: 'Back',
  playWithFriend: 'Play with a friend',
  yourMatches: 'Your online matches',
  create: 'Create a duel',
  join: 'Join with a code',
  joinTitle: 'Join a duel',
  joinPrompt: 'Enter the invite code',
  joinConfirm: (name: string) => `Join a duel against ${name}?`,
  joinConfirmUnknown: 'Join this duel?',
  joinSubmit: 'Join',
  cancel: 'Cancel',
  share: 'Share invite',
  copyLink: 'Copy link',
  copied: 'Link copied',
  waitingTitle: 'Waiting for a friend',
  waitingBody: 'Share this code. The duel opens when they join.',
  waitingExpiry: 'Invite expires in 48 hours.',
  waitingInviteHint: 'Waiting for a friend to join',
  cancelMatch: 'Cancel match',
  shareInvite: (link: string) => `Join my FUTASAKU duel: ${link}`,
  opponentFallback: 'Friend',
  statusYourTurn: 'Your turn',
  statusTheirTurn: "Opponent's turn",
  statusWaitingFriend: 'Waiting',
  statusActive: 'In play',
  statusFinished: 'Finished',
  warnLastTwoHours: 'Less than 2 hours left',
  emptyMatches: 'No online matches yet.',
  firstCardTitle: 'How online duels work',
  firstCardLines: Object.freeze([
    'Play live when both of you are here, or take turns over time.',
    'Your opponent only sees your turn after you Throw.',
    'Each turn has 24 hours. Miss it and you lose.',
  ] as const),
  firstCardOk: 'Got it',
  storageNote:
    'Your online matches live on this device until accounts exist.',
  linkCodeTitle: 'Use my matches on another browser',
  linkCodeHelp: 'Creates a one-time code (10 minutes). It never moves your existing token.',
  linkCodeMake: 'Make a link code',
  linkCodeRedeem: 'Enter a link code',
  linkCodeDone: (code: string) => `Code ${code} — enter it on the other browser.`,
  openDuelSoon: 'Duel screen opens in the next update.',
  errBadOrExpired: 'That code is wrong or has expired.',
  errOwnCode: 'That is your own invite code.',
  errFull: 'That duel is already full.',
  errAlreadyJoined: 'You are already in that duel.',
  errTooMany: 'You have too many open duels. Finish or cancel one first.',
  errRateLimited: 'Too many tries. Wait a moment and try again.',
  errClientTooOld: 'Reload to update FUTASAKU.',
  errGeneric: 'Something went wrong. Try again.',
  errNoApi: 'Online play is not configured in this build.',
  errStorage: 'This browser blocked storage. Online matches cannot be kept here.',
});

/** The words for the one-card Grow. Code still uses action `Sprout`; players read Grow. */
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
  Name: 'Grow',
  name: 'grow',
  howto: ' Once per turn you can <b>Grow</b> one tile with any single card.',
  strengthenExample: `<i>Example: your 5 sits next to ${OPP.the}; Grow a 9 on it and it becomes a 9.</i>`,
  tapHint: 'Tap a card to Grow it',
  pick: 'Pick a card to Grow',
  skip: 'Skip Grow',
  skipTitle: 'Skip the Grow and throw a card',
  practice: 'Practice game: no Grow this time.',
  coachTip: (combo: string) => `Grow: one card, one tile. Handy when you have no ${combo}.`,
  coachWhy: (combo: string) => `A Grow places one tile with a single card, so your ${combo} cards stay in your hand.`,
  bullet: 'No combo? Grow one card as one tile.',
  youDid: (hex: string) => `You grew one tile at ${hex}`,
  oppDid: (card: string, hex: string) => `${OPP.The} grew a ${card} at ${hex}`,
  suggest: (hex: string, card: string) => `Grow one tile at ${hex} with the ${card}`,
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
  tutorial: 'New here? The <b>tutorial</b> takes about 4 minutes, with a glow showing where to tap.',
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
    ' On your Grow turn you may also <b>bloom</b> (optional add-on): 3 to 6 cards that go together — the same number in different suits (a set), or consecutive numbers in one suit (a run). They grow that many tiles in any shape, as long as one touches your tiles. Each tile keeps its card\'s number.',
  /** the general hint */
  hint: 'Bloom on Grow: a set or a run of 3 to 6 cards.',
  /** why a held group cannot bloom right now */
  tooFew: (n: number) => `No room to bloom ${n}`,
  /** the move list and the log */
  suggest: (n: number, hexes: string) => `Bloom ${n} tiles at ${hexes}`,
  youDid: (n: number) => `You bloomed ${n} tiles`,
  oppDid: (n: number) => `${OPP.The} bloomed ${n} tiles`,
});

/** Player-facing Bomb words. Engine actions stay `PlayFruit` for compatibility. */
export const FRUIT = Object.freeze({
  /** "Bomb" */
  card: 'Bomb',
  /** "Bombs" */
  cards: 'Bombs',
  /** the small print on the card face */
  print: 'Bomb',
  /** the one-time tip (re-openable from How to play) */
  tip: `Bombs: play one on an ${lower} tile that touches yours to remove it, even a 9.`,
  /** How to play (HTML) */
  howto: ` <b>Bombs</b> (4 in the deck) have no number. In your Grow step, play one on an ${lower} tile that touches yours (your home counts): that tile is removed, even a 9, and anything that hung on it is cut off. A Bomb uses your Grow for the turn (one Grow or one Bomb per turn; Bloom and Blast are still fine). It never makes a numbered combo; you can throw it, and then ${OPP.the} can take it.`,
  /** first time a Bomb is picked */
  anyStrength: 'Any strength, even a 9',
  /** the hint while a Bomb is picked */
  tapTarget: `Tap a lit ${lower} tile`,
  /** the shortcut on an opponent tile's card */
  use: 'Use Bomb',
  /** the shortcut's note on a top-rank tile */
  topRank: 'No combo can replace this. A Bomb can.',
  /** why a held Bomb has nothing to do */
  noTarget: `No ${lower} tile by yours`,
  notNow: 'Play it in your Grow step.',
  /** a Bomb uses the turn's Grow */
  used: 'Bomb is back next turn',
  /** the Grow step's first hint when a Bomb is playable */
  orSprout: 'Grow, or play a Bomb',
  /** the burst banner */
  banner: 'Boom!',
  /** a move, in plain words */
  suggest: (hex: string, strength: number) => `Use a Bomb on ${OPP.theirs} ${strength} at ${hex}`,
  youDid: (hex: string, strength: number) => `You used a Bomb on ${OPP.theirs} ${strength} at ${hex}`,
  oppDid: (strength: number) => `${OPPONENT_LABEL} used a Bomb on your ${strength}`,
  oppTook: `${OPPONENT_LABEL} took the Bomb`,
  youTook: 'You took the Bomb',
});

/** Two Bombs together: target + six neighbours. Extra action like Bloom (does not use Grow). */
export const BLAST = Object.freeze({
  Name: 'Blast',
  name: 'blast',
  howto: ' Two Bombs can <b>Blast</b> together: clear an enemy tile and its six neighbours (homes are safe). Blast is an extra play, like Bloom — it does not use your Grow.',
  suggest: (hex: string, n: number) => `Blast at ${hex}, clearing ${n} tiles`,
  youDid: (hex: string) => `You blasted at ${hex}`,
  oppDid: (hex: string) => `${OPP.The} blasted at ${hex}`,
  banner: 'Blast!',
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

/** Tutorial Pro window copy — one place for every player-facing tutorial line. */
export const TUTORIAL = Object.freeze({
  showMe: 'Show me',
  skip: 'Skip',
  previous: 'Previous',
  chaptersBtn: 'Chapters',
  next: 'NEXT',
  exit: 'Exit tutorial',
  chapterDone: 'Chapter done',
  free: 'Your turn. No guide.',
  recap: Object.freeze([
    'Draw. Grow. Throw.',
    'Keep joined, cut theirs.',
    'Surround their home to win',
  ]),
  playReal: 'Play',
  replayChapter: 'Replay a chapter',
  praise: Object.freeze(['Clean.', 'Nice.', 'There it is.', 'Easy.'] as const),
  wrong: Object.freeze([
    'Not that one. This one.',
    'Close. Try the glowing one.',
    'Other side.',
  ] as const),
  /** Taps on dead / locked areas during a guided step. */
  locked: Object.freeze([
    'Tap the glowing one.',
    'Not there. Here.',
    'Almost. The glowing one.',
    "That's locked for now.",
  ] as const),
  bloomHints: 'Show bloom hints',
  menuChapters: 'Tutorial chapters',
  replayTutorial: 'Replay tutorial',
  chapters: Object.freeze([
    Object.freeze({ id: 'goal', title: 'Your goal', lessons: Object.freeze([
      Object.freeze({ instruction: 'HOME', why: 'Every tile you grow must stay joined to it.' }),
      Object.freeze({ instruction: 'THEIR HOME', why: 'Surround its tiles for a KO win.' }),
    ]) }),
    Object.freeze({ id: 'turn', title: 'Your turn', lessons: Object.freeze([
      Object.freeze({ instruction: 'DRAW PILE', why: 'You start every turn by drawing 1 card from draw or discard pile.' }),
      Object.freeze({ instruction: 'GROW', why: 'Tap a card and a tile to grow.' }),
    ]) }),
    Object.freeze({ id: 'bloom', title: 'Bloom', lessons: Object.freeze([
      Object.freeze({ instruction: 'BLOOM', why: 'Extra step on Grow. Same number different suits, or consecutive same suit — 3 to 6 cards.' }),
      Object.freeze({ instruction: 'LOOK FOR', why: '8 and 9 are strong. Sets: same number, different suits. Runs: consecutive, one suit.' }),
    ]) }),
    Object.freeze({ id: 'strengthen', title: 'Strengthen', lessons: Object.freeze([
      Object.freeze({ instruction: 'STRENGTHEN', why: 'Play a higher card on your tile to make it stronger.' }),
    ]) }),
    Object.freeze({ id: 'cut', title: 'Cut', lessons: Object.freeze([
      Object.freeze({ instruction: 'CUT', why: 'Break their link. Cut-off tiles wither.' }),
    ]) }),
    Object.freeze({ id: 'skip', title: 'Skip Grow', lessons: Object.freeze([
      Object.freeze({ instruction: 'SKIP GROW', why: 'You can end Grow without placing a tile.' }),
    ]) }),
    Object.freeze({ id: 'buttons', title: 'Buttons', lessons: Object.freeze([
      Object.freeze({ instruction: 'CONTROLS', why: 'A quick look at the buttons around the board.' }),
    ]) }),
    Object.freeze({ id: 'bomb', title: 'Bomb', lessons: Object.freeze([
      Object.freeze({ instruction: 'BOMB', why: 'Destroy an enemy tile; cut-off tiles wither. Uses your Grow turn.' }),
    ]) }),
    Object.freeze({ id: 'blast', title: 'Blast', lessons: Object.freeze([
      Object.freeze({ instruction: 'BLAST', why: 'Two Bombs clear a tile and its neighbours.' }),
    ]) }),
    Object.freeze({ id: 'throw-pile', title: 'Throw pile', lessons: Object.freeze([
      Object.freeze({ instruction: 'THROW PILE', why: 'Glows when a card there can finish a bloom.' }),
    ]) }),
    Object.freeze({ id: 'win', title: 'How you win', lessons: Object.freeze([
      Object.freeze({ instruction: 'HOW YOU WIN', why: 'Surround their home for a KO, or hold most tiles.' }),
    ]) }),
    Object.freeze({ id: 'final', title: 'Final turn', lessons: Object.freeze([
      Object.freeze({ instruction: 'FINAL TURN', why: 'Last round: no cards left. This turn starts at Grow.' }),
    ]) }),
    Object.freeze({ id: 'free', title: 'Play', lessons: Object.freeze([
      Object.freeze({ instruction: 'REMEMBER', why: 'Hold 8s and 9s. Bloom sets or suit runs on Grow.' }),
      Object.freeze({ instruction: 'PLAY', why: 'Your turn. The bulb shows what to do.' }),
    ]) }),
  ]),
  winHow: Object.freeze({
    title: 'How do I win?',
    lines: Object.freeze([
      'Surround their home to win at once.',
      'Or have the most tiles when it ends.',
      'Thirty turns each; the deck end gives each side a fair last turn.',
      'Ties go to the stronger tiles.',
    ]),
  }),
  bloomHow: Object.freeze({
    title: 'What can bloom?',
    set: 'A set: same number, different suits — three to six cards.',
    run: 'A run: consecutive numbers, one suit — three to six cards.',
    badSuit: 'Not a run: two suits mixed.',
    badGap: 'Not a run: a gap in the numbers.',
  }),
});
