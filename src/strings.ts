// The words the player sees for the other side, in one place (UI polish pass 3). Only text
// the player can read uses these; code names (src/bots/, botVersion, BOT, CSS classes) stay.
import { INVITE_CODE_LENGTH, LINK_CODE_LENGTH } from './invite-code.js';

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

/**
 * The main-menu tagline ("GROW · CONNECT · CONQUER"). The owner removed it from the menu on
 * 2026-10-14: it read as clutter under the wordmark. The words (`ONLINE.tagline`, below) and the
 * `.tagline` styling are kept, so bringing it back is a ONE-LINE change — flip this to `true`.
 * Nothing else needs to change: the menu markup carries no tagline and no hidden placeholder, and
 * `web/src/main.ts` rebuilds the element in its old slot (wordmark → buttons) when this is true.
 * See `docs/DECISIONS.md`.
 */
export const SHOW_MENU_TAGLINE = false;

/**
 * The hint shown when a typed invite code is malformed. Built from the ONE invite-code length
 * (`src/invite-code.ts`, re-exported by the server as `inviteCodeLength`), so the copy can never
 * drift from the codes the server actually generates. The parameter defaults to the real length;
 * tests pass an explicit value to prove the wording tracks the number.
 */
export const inviteCodeFormatHint = (length: number = INVITE_CODE_LENGTH): string => `Enter the ${length} characters.`;

/**
 * The Settings hint for the device link code ("Use my matches on another browser"). Built from the
 * ONE link-code length (`src/invite-code.ts`, re-exported by the server as `linkCodeLength`), so the
 * copy can never drift from the codes the server actually generates. A link code is longer than a
 * match invite code on purpose: redeeming it mints a new token for another player (account
 * takeover), so it must never inherit the short invite length. The parameter defaults to the real
 * length; tests pass an explicit value to prove the wording tracks the number.
 */
export const linkCodeHelpText = (length: number = LINK_CODE_LENGTH): string =>
  `Creates a one-time ${length}-character code (10 minutes). It never moves your existing token.`;

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
  findOpponent: 'Find opponent',
  findOpponentLooking: 'Searching…',
  findOpponentHint: 'Matched with the next player who taps Find opponent.',
  /** Find-opponent states (punchy copy standard). */
  searchTitle: 'Finding an opponent',
  searchBody: 'You are in the queue. The duel opens the moment someone else joins.',
  searchParkedTitle: 'Nobody yet',
  searchParkedBody: 'You stay in the queue.',
  searchPlayComputer: 'Play the computer',
  searchInviteFriend: 'Invite a friend',
  searchKeepWaiting: 'Keep searching',
  searchStop: 'Stop searching',
  searchCancelled: 'Search stopped',
  searchStatusSr: 'Searching for an opponent.',
  /** Matched while away / while playing the computer. */
  matchedTitle: 'Opponent found',
  matchedBody: 'Your duel is ready.',
  matchedPlayNow: 'Play now',
  matchedLater: 'Later',
  matchedNotice: 'Opponent found.',
  computerVs: 'vs the computer',
  /** The map choice when creating a duel or parking a Find-opponent search (owner request). */
  mapLabel: 'Map size',
  mapSmall: 'Small map',
  mapClassic: 'Classic map',
  /**
   * Told to the JOINER when the waiting game's map is not the one they picked. Find opponent
   * never filters on the map, so the joiner adopts whatever was waiting — and must know it.
   */
  opponentGameSmall: "Opponent's game: small map",
  opponentGameClassic: "Opponent's game: classic map",
  /** Timeout grace (owner rule: one grace per player per match). */
  graceYourWarning: 'Time ran out — one more chance',
  graceYouUsed: 'Grace used',
  graceOpponentUsed: 'Opponent used their grace',
  graceWarningSr: 'Time ran out. One more chance.',
  graceOpponentSr: 'Your opponent used their grace.',
  graceYouSr: 'You used your grace.',
  yourMatches: 'Your matches',
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
  /** The invite code is a tappable fallback: a hint under it, and the tap confirmation. */
  codeTapCopy: 'Tap to copy',
  codeCopied: 'Code copied',
  waitingTitle: 'Waiting for a friend',
  waitingBody: 'Send the link. The duel opens when they join.',
  waitingExpiry: 'Invite expires in 48 hours.',
  waitingInviteHint: 'Waiting for a friend to join',
  cancelMatch: 'Cancel match',
  shareInvite: (link: string) => `Join my FUTASAKU duel: ${link}`,
  opponentFallback: 'Friend',
  /** Who-starts chip in the online duel HUD (perspective-correct, icon + word, never colour only). */
  starterYou: 'You start',
  starterOpponent: 'Opponent starts',
  starterYouSr: 'You move first in this match.',
  starterOpponentSr: 'Your opponent moves first in this match.',
  statusYourTurn: 'Your turn',
  statusTheirTurn: "Opponent's turn",
  /**
   * The turn word while the opponent's finished turn is being replayed. It is NOT "Opponent's
   * turn": that is the exact confusion the two-phone playtest reported (both phones reading the
   * same words, on the phone whose turn it already is). The state is derived from the server's
   * real actor, never from the animation gate.
   */
  statusReplaying: 'Replaying their turn',
  /** Shown only if a move is attempted while the opponent's turn is still replaying. */
  statusRevealWait: 'Watching their turn play out',
  statusWaitingFriend: 'Waiting',
  statusActive: 'In play',
  statusFinished: 'Finished',
  warnLastTwoHours: 'Less than 2 hours left',
  emptyMatches: 'No matches yet.',
  firstCardTitle: 'How online duels work',
  firstCardLines: Object.freeze([
    'Play in real time when both of you are here, or take turns over time.',
    'Your opponent only sees your turn after you Throw.',
    'Each turn has 24 hours. Miss it and you lose.',
  ] as const),
  firstCardOk: 'Got it',
  storageNote:
    'Your online matches live on this device until accounts exist.',
  /**
   * Shown once when a rejected token forced a fresh guest on this device. Honest, not alarming:
   * the old identity (and its matches) is gone, so the player knows why their list is empty.
   */
  identityReset: 'Your sign-in was reset. Earlier matches are gone.',
  linkCodeTitle: 'Use my matches on another browser',
  linkCodeHelp: linkCodeHelpText(),
  linkCodeMake: 'Make a link code',
  linkCodeRedeem: 'Enter a link code',
  linkCodeDone: (code: string) => `Code ${code} — enter it on the other browser.`,
  openDuelSoon: 'Duel screen opens in the next update.',
  errBadOrExpired: 'That code is wrong or has expired.',
  errCodeFormat: inviteCodeFormatHint(),
  errLinkBroken: 'Link looks broken. Enter the code.',
  errOwnCode: 'That is your own invite code.',
  errFull: 'That duel is already full.',
  errAlreadyJoined: 'You are already in that duel.',
  errTooMany: 'Too many open duels. Finish or cancel one first.',
  errRateLimited: 'Too many tries. Wait a moment and try again.',
  errClientTooOld: 'Reload to update FUTASAKU.',
  errGeneric: 'Something went wrong. Try again.',
  errNoApi: 'Online play is not configured in this build.',
  errStorage: 'This browser blocked storage. Online matches cannot be kept here.',
  /** Score bar: the same two words offline and online read (You : Opponent). */
  scoreYou: 'You',
  scoreOpponent: OPPONENT_LABEL,
  /** Presence words — always beside the dot, never colour alone. */
  presenceOnline: 'Online',
  presenceAway: 'Away',
  presenceUnknown: 'Unknown',
  /** End-of-game screen: the small context line under the title (never a repeat of the reason). */
  finishSubFallback: 'Online duel',
  finishSubOpponent: (name: string) => `vs ${name}`,
  /**
   * The standard (async) finish screen's FIRST, primary action: a fresh invite to the same friend
   * on the existing invite/share screen. Same word as the live end window's rematch (`LIVE.rematch`)
   * so the two flows read the same from the player's seat.
   */
  rematch: 'Rematch',
  backToMatches: 'Back to matches',
  menuButton: 'Menu',
  shareSaved: 'Saved',
  /** The one confirm before resigning. */
  resignConfirm: 'Resign this duel?',
  /** A finished match whose reason the client does not know. */
  finishedFallback: 'Finished',
  /** Mid-match deadline urgency — shown only when it matters: amber ≤2h, red ≤15m. */
  urgencyAmber: 'Less than 2 hours left',
  urgencyRed: 'Less than 15 minutes left',
  urgencyAmberSr: 'Less than 2 hours left on this turn.',
  urgencyRedSr: 'Less than 15 minutes left on this turn.',
  /** Driver / session messages the player can read (one home, like every other word). */
  errBusy: 'Busy',
  errDrawOnly: 'Only a Draw commits immediately.',
  errThrowShape: 'Throw must be EndAct or Discard.',
  errTurnFailed: "That turn didn't go through. Your cards are back.",
  errMoveIllegal: 'That move is not legal right now.',
  errDrawFailed: 'Draw failed.',
  errResignFailed: 'Resign failed.',
});

/**
 * The online duel header lane — the ONE place the strip's short words live (owner's cleanup,
 * 2026-10-14). The lane is a single fixed-height row that must never wrap or reach the board, so
 * these strings are deliberately tiny: aim for 24 characters or fewer, hard cap `HEADER_MAX`.
 *
 * ONE message is shown at a time. `HEADER_PRIORITY` (highest first) decides which source owns the
 * lane; `HEADER_SOURCE` places each word. The live clock is the `clock` source (its text is the
 * digit clock, not a word, so it is built by the UI, not listed here).
 */
export const HEADER_MAX = 32;

export const HEADER = Object.freeze({
  /** A pressing danger/timeout line — outranks everything. */
  timeout: "Time's up",
  graceWarning: 'One more chance',
  /** Whose turn it is (the established two-phone words, all inside the 24-char target). */
  yourTurn: 'Your turn',
  theirTurn: "Opponent's turn",
  replaying: 'Replaying their turn',
  finished: 'Finished',
  /** The presence/opponent line. */
  opponentAway: 'Opponent away',
  opponentHere: 'Opponent here',
  waiting: 'Waiting',
  /** Nothing pressing to say. */
  idle: 'In play',
});

export type HeaderKey = keyof typeof HEADER;

/** Highest priority first: the first source with something to say owns the lane. */
export const HEADER_PRIORITY = Object.freeze(['danger', 'clock', 'turn', 'presence', 'idle'] as const);
export type HeaderSource = (typeof HEADER_PRIORITY)[number];

/** Which slot in `HEADER_PRIORITY` each header word belongs to. */
export const HEADER_SOURCE: Readonly<Record<HeaderKey, HeaderSource>> = Object.freeze({
  timeout: 'danger',
  graceWarning: 'danger',
  yourTurn: 'turn',
  theirTurn: 'turn',
  replaying: 'turn',
  finished: 'turn',
  opponentAway: 'presence',
  opponentHere: 'presence',
  waiting: 'presence',
  idle: 'idle',
});

/** The one accessor the header lane uses to get a word. */
export const headerText = (key: HeaderKey): string => HEADER[key];

/**
 * The end-of-game screen in ONE place, so offline and online say the same thing. Reasons are
 * perspective-aware: "you" is always the player reading the screen. The three outcome titles
 * (`won` / `lost` / `draw`) are the product's fixed names and are never renamed.
 */
export const RESULT = Object.freeze({
  /** Outcome titles — the same three offline and online. */
  won: 'You won',
  lost: 'You lost',
  draw: 'A draw',
  /** Offline win headline: "You beat Level 7!" */
  beatLevel: (level: number) => `You beat Level ${level}!`,
  /** Why the game ended. */
  doubleStrangle: 'Both homes were surrounded at once.',
  strangleWon: `You surrounded ${OPP.theirs} home.`,
  strangleLost: `${OPP.The} surrounded your home.`,
  knockAheadWon: 'You knocked and stayed ahead.',
  knockAheadLost: `${OPP.The} knocked and stayed ahead.`,
  knockUndercutWon: 'You knocked but did not finish ahead.',
  knockUndercutLost: `${OPP.The} knocked and you held on.`,
  turnLimit: "Time's up: 30 turns each. The higher score wins.",
  deckEnd: 'The Draw pile ran out. The higher score wins.',
  /** Appended when the raw scores were level and tile strength decided it. */
  decidedByStrength: ' Scores were level; higher total tile strength decided it.',
  /** Appended when scores and tile strength both matched — a true draw. */
  trueDraw: ' Scores and tile strengths matched — a true draw.',
  /** Online-only endings, still from the reader's point of view. */
  timeoutWon: `${OPP.The} ran out of time.`,
  timeoutLost: 'You ran out of time.',
  resignedWon: `${OPP.The} resigned.`,
  resignedLost: 'You resigned.',
  /** The breakdown line under the final score: "You: 12 tiles (3 on gold) · Opponent: 9 tiles". */
  breakdown: (mine: string, theirs: string) => `You: ${mine} · ${OPP.label}: ${theirs}`,
  /** The share button (offline and online alike). */
  share: 'Share',
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

/**
 * The two piles on the board, named the way the tutorial names them: "Draw pile", "Throw pile"
 * (the recorded word list in docs/DECISIONS.md). One source of truth for the names: the board
 * shows the short forms, the accessible label uses the full ones. The pre-render labels in
 * web/index.html mirror `drawShort`/`discardShort`. `lastCard` is the deck's own clock label.
 */
export const PILES = Object.freeze({
  draw: 'Draw pile',
  discard: 'Throw pile',
  /** The short forms the pile shows on the board; the full names stay the accessible label. */
  drawShort: 'Draw',
  discardShort: 'Throw',
  /** The Draw pile's own clock label when one card is left. "Last" is the longest form the pile
   *  fits: "Last card" (≈66px) overflows the ≈50px pile and clips, so the amber count carries the
   *  rest. The word stays, so the state is never signalled by colour alone. */
  lastCard: 'Last',
});

/** v0.7: the two homes. Code says "root"; the player reads "home", "your tree", "opponent's volcano". */
/** Step 7: the first-run welcome card on the main menu. */
export const WELCOME = Object.freeze({
  title: `Welcome to ${GAME_TITLE}`,
  steps: Object.freeze([
    Object.freeze({ icon: 'deck', name: 'Draw', text: 'Take a card from the Draw pile or the Throw pile.' }),
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
    ' On your Grow turn you may also <b>bloom</b> (optional add-on): 3 to 6 cards that go together — the same number in different suits (a set), or numbers in a row in one suit (a run). They grow that many tiles in any shape, as long as one touches your tiles. Each tile keeps its card\'s number.',
  /** the general hint */
  hint: 'Bloom on Grow: a set or a run of 3 to 6 cards.',
  /** why a held group cannot bloom right now */
  tooFew: (n: number) => `No room to bloom ${n}`,
  /** the move list and the log */
  suggest: (n: number, hexes: string) => `Bloom ${n} tiles at ${hexes}`,
  youDid: (n: number) => `You bloomed ${n} tiles`,
  oppDid: (n: number) => `${OPP.The} bloomed ${n} tiles`,
  /**
   * A tap on a hex that cannot be painted next: the shape does not change, so say WHY (the same
   * words the desktop paint machine already uses) instead of leaving the finger with no answer.
   * The two-phone playtest read that silence as "Bloom does not work on this phone".
   */
  nextHint: 'Choose a glowing hex',
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
  howto: ` <b>Bombs</b> (4 in the Draw pile) have no number. In your Grow step, play one on an ${lower} tile that touches yours (your home counts): that tile is removed, even a 9, and anything that hung on it is cut off. A Bomb uses your Grow for the turn (one Grow or one Bomb per turn; Bloom and Blast are still fine). It never makes a numbered combo; you can throw it, and then ${OPP.the} can take it.`,
  /** first time a Bomb is picked */
  anyStrength: 'Any strength, even a 9',
  /** the hint while a Bomb is picked */
  tapTarget: `Tap a lit ${lower} tile`,
  /** the shortcut on an opponent tile's card */
  use: 'Use Bomb',
  /** the shortcut's note on a top-rank tile */
  topRank: 'No combo can overgrow this. A Bomb can.',
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

/** FUTASAKU 0.5 menu + Match Intel labels. One place to rename the single tutorial entry
 *  and the two Match Intel tabs. The moves reference text itself lives in SPROUT / BLOOM /
 *  FRUIT / BLAST and HOME above (the same shared rule words the game uses). */
export const HELP = Object.freeze({
  /** the only tutorial entry on the main menu */
  tutorial: 'Tutorial',
  /** Match Intel tab 1 — what happened in this match */
  intelTab: 'Match Intel',
  /** Match Intel tab 2 — the moves reference */
  howToTab: 'How to',
  /** the reference heading (also the legacy sheet title) */
  howToTitle: 'How to play',
  /** the tutorial's closing pointer to the reference (its last line) */
  tutorialFinal: 'Look up any move later in Match Intel › How to.',
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
  winHow: Object.freeze({
    title: 'How do I win?',
    lines: Object.freeze([
      'Surround their home to win at once.',
      'Or have the most points when the Draw pile runs out.',
      'Thirty turns each; when the Draw pile runs out, each side gets a fair last turn.',
      'Ties go to the stronger tiles.',
    ]),
  }),
  bloomHow: Object.freeze({
    title: 'What can bloom?',
    set: 'A set: same number, different suits — three to six cards.',
    run: 'A run: numbers in a row, one suit — three to six cards.',
    badSuit: 'Not a run: two suits mixed.',
    badGap: 'Not a run: a gap in the numbers.',
  }),
});

/**
 * The install invitation — the timed prompt that replaced the old always-on menu button. It is
 * offered after a game the player actually finished (the exact rule lives in
 * `web/src/logic/install-prompt.ts`), in the game's own voice. `install` is the button that opens
 * the browser's own install dialog; `done` is what the instruction face uses to close (there is
 * nothing to press there); the two step lists are the fallback when a button cannot install
 * (iOS Safari especially). Promise only what is true today — no notifications, nothing about
 * accounts — so these words still read correctly once sign-in ships.
 */
export const INSTALL = Object.freeze({
  title: 'Grow FUTASAKU on your home screen',
  why: Object.freeze([
    'Opens full-screen — straight in, no browser bars',
    'Works offline, even with no signal',
    'One tap from your home screen — no typing the address',
  ] as const),
  install: 'Add to home screen',
  done: 'Got it',
  notNow: 'Not now',
  never: "Don't show again",
  iosSteps: Object.freeze([
    'Tap the Share button — the square with the arrow pointing up.',
    'Choose Add to Home Screen, then tap Add.',
  ] as const),
  manualSteps: Object.freeze([
    'Open your browser menu (the three dots).',
    'Choose Install app or Add to Home Screen.',
  ] as const),
});

/**
 * Live duels (test channel only, `web/src/online/live/`). Two players who share an online match
 * switch the SAME match to a short per-turn clock. Nothing about the board or the rules changes.
 */
export const LIVE = Object.freeze({
  // Owner's rename, 2026-10-14: the mode is "Real time" everywhere a player can read it. The
  // internal identifiers (LIVE_TURN_MS, the `live` mode id, DB columns, file names) stay.
  goLive: 'Real time',
  // No rule-stating number of seconds anywhere in the copy (owner, 2026-10-14): the live turn
  // length never appears as words. The live clock in the header is the only place a digit shows.
  goLiveAria: (name: string, _secs: number) => `Start a real time duel with ${name}`,
  waiting: (name: string, _secs: number) => `Waiting for ${name}`,
  // The waiting words carry no dots: the UI appends the SHARED animated ellipsis (see wait-dots).
  waitingFor: (name: string) => `Waiting for ${name}`,
  waitingShort: 'Waiting',
  // The narrowest phones (360 px) give the pill only ~110 px, and the state word shares it with the
  // shared animated ellipsis AND the Cancel control. Measured in the header-lane e2e, "Waiting"
  // cannot fit there, so the word drops to its one-word short form rather than clipping to
  // "Waiti…". It is still the word for waiting — never a cut-off word, never a dropped control.
  waitingTiny: 'Wait',
  cancel: 'Cancel',
  inLiveGame: 'In real time',
  notAvailable: 'Not available',
  busy: 'Busy',
  rateLimited: 'Try real time again later',
  wantsToGoLive: 'wants a real time duel',
  wantsRematch: 'wants a rematch',
  terms: (_secs: number) => 'Same match · each turn has a countdown',
  accept: 'Accept',
  notNow: 'Not now',
  notNowFrom: (name: string) => `${name}: Not now`,
  expired: 'No answer',
  live: 'Real time',
  chip: (_secs: number) => 'Real time',
  chipAria: (_secs: number) => 'Real time duel, each turn has a countdown',
  timeLeftSr: (secs: number) => `${secs} seconds left`,
  timesUp: "Time's up",
  leaveLive: 'Leave real time',
  // Owner's ruling, 2026-10-14: leaving real-time FORFEITS the match, so the confirm states the
  // consequence outright. The warning lives in the confirm itself — there is no way to leave real
  // time that does not acknowledge the loss.
  leaveConfirm: 'Leave and lose this real-time duel?',
  // Said BEFORE the situation, on the accept surface (the challenge glass): one short line...
  leaveWarning: 'Leaving real time loses',
  // ...plus the fuller explanation in the same glass window, never a wall of text.
  leaveWarningHelp: 'In real time, leaving or running out of time loses the whole match. A dropped connection gets 10 seconds to reconnect first. Normal 24-hour games are unaffected.',
  // The header strip's "the opponent has dropped" state. The animated dots are added by the UI (the
  // shared `wait-dots` treatment), never baked into this string.
  opponentReconnecting: 'Opponent reconnecting',
  endedTitle: 'Real time ended',
  endedFinished: 'Match over',
  endedLeft: 'Back to 24-hour turns',
  backToYourGame: 'Back to your game',
  backTo: (what: string) => `Back to ${what}`,
  targetBot: 'your game',
  targetMatch: 'your match',
  targetMenu: 'the menu',
  rematch: 'Rematch',
  rematchWaiting: (name: string, _secs: number) => `Rematch? Waiting for ${name}`,
  close: 'Close',
  allowChallenges: 'Allow real time challenges',
  allowChallengesHelp: 'Off: you show as Not available.',
  failed: 'Could not start real time right now.',
});
