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
  // The shared Territory: one tile per won duel, the same map for everyone. Read as "Territory"
  // everywhere (owner, 2026-10-16); the field names stay `world*` for compatibility. The screen
  // title is uppercased by CSS, so these store the mixed-case form, never TERRITORY.
  worldMap: 'Territory',
  worldTitle: 'Territory',
  worldLoading: 'Reading the map',
  worldEmpty: 'No tiles yet. Win a duel to place the first one.',
  worldTaken: 'taken',
  worldYou: 'You',
  worldHeld: (filled: number, cells: number) => `${filled} of ${cells} tiles grown`,
  worldError: 'Could not read the map. Try again.',
  // THE FIT TOGGLE (owner, 2026-10-21: "keep it large and pannable in both axes, with a 'fit'
  // toggle"). Plain words for the screen reader label; the button shows a magnifying glass (2026-10-23).
  worldFit: 'Fit the whole map',
  /** the Seeds invitation card's button that opens the Territory (uppercase, like its LATER sibling) */
  worldInviteOpen: 'OPEN TERRITORY',
  playWithFriend: 'Play with a friend',
  findOpponent: 'Find opponent',
  // No baked-in dots: the UI appends the SHARED animated ellipsis (web/src/online/live/wait-dots.ts).
  findOpponentLooking: 'Searching',
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
  /** Timeout grace (owner rule: one grace per player per match). */
  graceYourWarning: 'Time ran out — one more chance',
  graceYouUsed: 'Grace used',
  graceOpponentUsed: 'Opponent used their grace',
  graceWarningSr: 'Time ran out. One more chance.',
  graceOpponentSr: 'Your opponent used their grace.',
  graceYouSr: 'You used your grace.',
  yourMatches: 'Your matches',
  /** The disclosure label carries the count: "Your matches (3)". */
  yourMatchesCount: (count: number) => `Your matches (${count})`,
  /** The red badge's spoken name. Never a bare "!" — screen readers hear the sentence. */
  matchesWaitingOne: '1 match waiting for your move',
  matchesWaitingMany: (count: number) => `${count} matches waiting for your move`,
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
  /** A standard duel's mutual rematch: the first to press waits here for the other's press. */
  rematchWaitingTitle: 'Waiting for their rematch',
  rematchWaitingBody: 'The new game starts the moment they press Rematch too.',
  waitingBody: 'Send the link. The duel opens when they join.',
  waitingExpiry: 'Invite expires in 48 hours.',
  waitingInviteHint: 'Waiting for a friend to join',
  cancelMatch: 'Cancel match',
  cancelMatchConfirm: 'Cancel this duel? The invite link stops working.',
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
    // Accurate, not scarier than the rule. It used to say "Miss it and you lose", but the server
    // gives ONE grace period per player (gracePeriodsPerPlayer: 1, and the in-match line already
    // reads "Time ran out — one more chance"). Overstating it could make a tester abandon a duel
    // they would have survived.
    'Each turn has 24 hours. Run out of time and you get one more chance; run out twice and you lose.',
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
  // A duel that was already over. Distinct from errBadOrExpired, which says the CODE was wrong -
  // here the code was fine and the game had already ended, which is what a tester sees when two
  // people finish and one taps the code again.
  errFinished: 'That duel has already finished.',
  // The server is briefly unable to reach its database (`DB_UNAVAILABLE`). Truthful, and calm - the
  // retry genuinely works. It used to fall through to errGeneric, which reads as "the app is broken".
  // NOT `errBusy`: that one already exists above and means the PLAYER is busy, a different thing.
  errDbBusy: 'The duel service is briefly busy. Try again in a moment.',
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

/** The pause faceplate (owner direction, 2026-10-22). One set of words for both the offline pause
 *  and the online match menu: a pause SUSPENDS a match; a match menu is still a live duel. The words
 *  here are deliberately small and literal — no "quit", no "exit", no implied frozen clock. */
export const PAUSE = Object.freeze({
  /** Offline heading: the game quietly suspended itself. */
  title: 'Paused',
  /** Online heading: a menu over a match that is still running. */
  matchTitle: 'Match menu',
  /** The one dominant offline action. */
  resume: 'Resume',
  /** The one dominant online action: the match has not gone anywhere. */
  returnToMatch: 'Return to match',
  /** The secondary key's specific words; main.ts picks one by mode. */
  restartLevel: 'Restart level',
  restartMatch: 'Restart match',
  restartLevelTitle: 'Restart this level?',
  restartMatchTitle: 'Restart this match?',
  restartLevelBody: 'The level starts again from its opening. Your progress in this level is lost.',
  restartMatchBody: 'The match starts again with a fresh deal at the same difficulty. This game is lost.',
  keepPlaying: 'Keep playing',
  mainMenu: 'Main menu',
  /** The compact turn-history helper (the reference's own title is HELP.howToTitle). */
  history: 'What happened',
  /** The words under the pause panel's icon tools (their spoken labels are the full names). */
  howToShort: 'Rules',
  historyShort: 'History',
  practiceMode: 'Practice',
  duelMode: 'Duel',
  /** Online only: a truthful note over a match that is still live while the menu is open. */
  clockRuns: 'The match clock keeps running.',
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
  /** The practice result's second line: "Practice match · Medium" (never the opponent's 1-9 level). */
  practice: (difficulty: string) => `Practice match · ${difficulty}`,
  /** Why the game ended. */
  doubleStrangle: 'Both homes were surrounded at once.',
  strangleWon: `You surrounded ${OPP.theirs} home.`,
  strangleLost: `${OPP.The} surrounded your home.`,
  knockAheadWon: 'You knocked and stayed ahead.',
  knockAheadLost: `${OPP.The} knocked and stayed ahead.`,
  knockUndercutWon: 'You knocked but did not finish ahead.',
  knockUndercutLost: `${OPP.The} knocked and you held on.`,
  turnLimit: "Time's up: 30 turns each. The higher score wins.",
  deckEnd: 'The cards ran out. The higher score wins.',
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
  /**
   * The finish card's ONE disclosure (owner direction, 2026-10-16: "way shorter… no scrolling").
   * The result, its one reason and a way forward stay on the card; the detail lines and the extra
   * actions live behind this one word, so every mode fits one phone screen.
   */
  more: 'More',
  /** The same disclosure once it is open. */
  less: 'Less',
  /** The quiet way out of an offline result. (An online result uses `ONLINE.menuButton`.) */
  backToMenu: 'Back to menu',
});

/**
 * THE REPLAY (owner brief, 2026-10-25): "at the end of every game you are able to see a replay of
 * the whole match … only the board and the logo … make it clear when the turn switches and which
 * player was going."
 */
const TO_MOVE = 'to move';
export const REPLAY = Object.freeze({
  /** The finish card's control. */
  watch: 'Watch replay',
  /** The replay screen's own name (its accessible label). */
  title: 'Replay',
  /** The offline player's name on a replay: the same word the finish card uses. */
  you: 'You',
  /** The tail of the turn line; the player's name is set in the seat's own ink beside it. */
  moveSuffix: TO_MOVE,
  /** Whose turn it is, as one quiet line. */
  toMove: (name: string) => `${name} ${TO_MOVE}`,
  /** Restart from the first move. */
  again: 'Replay again',
  /** Leave the replay and come back to the finish card. */
  close: 'Close',
  /** What a screen reader hears for the scrub bar. */
  scrub: 'Replay position',
  /** The quiet control beside the footer mark: save or share the finished poster. */
  share: 'Share replay',
  /** The footer's export control: the whole replay as a silent video file. */
  exportVideo: 'Export video',
  /** While recording: "Recording 12s / 50s" — the replay's own length, not the file's size. */
  recording: (done: string, total: string) => `Recording ${done} / ${total}`,
  /** The way out of a recording that is already running. */
  cancel: 'Cancel',
  /** The recording is done and being handed to the phone (share sheet, else a download). */
  videoReady: 'Preparing the video…',
  /** What the player sees when the file has gone through the share sheet. */
  videoShared: 'Video shared',
  /** What the player sees when the file went to their downloads. */
  videoSaved: 'Video saved',
  /** Said plainly when this browser cannot record, or the encoder stopped. */
  videoFailed: 'Could not make the video',
  /** The notch on the scrub bar at the play that turned the match. */
  turningPoint: 'Turning point',
  /** The notch's own name, with the honest count of tiles the cut took. */
  turningPointLabel: (tiles: number) => `Turning point · ${tiles} tile${tiles === 1 ? '' : 's'}`,
  /** Said only when this match never cut anything: there is no notch to press. */
  noTurningPoint: 'No turning point in this match',
  /** The wordmark on the poster and the video (the only brand words the image carries): the address. */
  mark: 'FUTASAKU.COM',
  /** The replay's signature under the mark (owner, 2026-10-26: "an elegant place to place futasaku.com"). */
  site: 'futasaku.com',
  /** A biggest-moment mark on the scrub bar: who made the play and what it did, in plain words. */
  /** What a moment did, for its caption over the board (the name is set beside it, in its ink). */
  momentWhat: (cut: number, swing: number): string =>
    cut > 0 ? `cut ${cut} tile${cut === 1 ? '' : 's'}` : `${swing}-point swing`,
  momentLabel: (name: string, cut: number, swing: number): string =>
    cut > 0
      ? `${name} cut ${cut} tile${cut === 1 ? '' : 's'}`
      : `${name} · ${swing} point swing`,
  /** The online match list's word for a finished duel's row. */
  pastRow: 'Watch replay',
  /** Shown when a stored replay cannot be loaded (an old match, a lost connection). */
  unavailable: 'That replay is not available.',
  loading: 'Loading replay…',
});

/**
 * GAME REVIEW (owner, 2026-10-23): after a game the finish card can show the player's turning point
 * — the one move that fell furthest short of the best move they had — and that better move on the board.
 */
export const REVIEW = Object.freeze({
  /** The finish-card key, beside "See the board". */
  open: 'Review',
  /** The review face's kicker: "Turning point · Turn 9". */
  kicker: (turn: number) => `Turning point · Turn ${turn}`,
  played: 'You played',
  better: 'Stronger',
  /** What the player did when they ended their Grow early. */
  stopped: 'You stopped growing with cards still in hand',
  show: 'Show me',
  back: 'Back',
  /** No choice fell short enough to call a slip. */
  clean: 'No slips to show: every move held up.',
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
 * (the recorded word list in docs/DECISIONS.md). One source of truth for the pile's label and its
 * accessible name; the pre-render labels in web/index.html mirror `draw`/`discard`.
 * In the Futa04 skin the visible label is hidden, so `draw` is mostly what a screen reader and a
 * long-press tooltip say. `lastCard` is the deck's own clock label, not a pile name.
 */
export const PILES = Object.freeze({
  draw: 'Draw pile',
  discard: 'Throw pile',
  lastCard: 'Last card',
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
  /** the tile card when a home is tapped: how many of its REAL sides are taken (a corner home has
   *  fewer than six, so "all 6" would be a lie there) */
  tapMine: (taken: number, open: number) => `Your home: everything you own must stay connected to it. ${taken} of ${open} sides taken.`,
  tapTheirs: (taken: number, open: number) => `Take every side of this home to win at once. ${taken} of ${open} taken.`,
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
    ' On your Grow turn you may also <b>bloom</b> (optional add-on): 3 to 6 cards that go together — the same number, in any suits (a set), or numbers in a row in one suit (a run). They grow that many tiles in any shape, as long as one touches your tiles. Each tile keeps its card\'s number.',
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
  grow: 'Play a card',
  throw: 'Throw one card',
  opp: OPP.label,
  /** the small line above the words */
  kicker: Object.freeze({ draw: 'Step 1 of 3', grow: 'Step 2 of 3', throw: 'Step 3 of 3' }),
  kickerOpp: 'Their turn',
});

/**
 * Why a tap did nothing: one short line, said at the touched hex, always read from the engine's own
 * state (the terrain, the phase, the legal moves) — never a second rule book. Sentence case; the
 * plate uppercases it.
 */
export const TAP_WHY = Object.freeze({
  draw: 'Draw a card first',
  rock: 'Blocked by rock',
  connect: 'Connect to your tree',
  pick: 'Pick a card',
  target: 'Not this hex',
});

/**
 * What each guided level taught, in three or four words, for the finish card. Deliberately concrete:
 * the player should recognise the thing they just did, not a chapter title.
 */
const RECAP: Readonly<Record<number, string>> = Object.freeze({
  1: 'Draw · Grow · Throw',
  2: 'Your turn, again',
  3: 'More than one way',
  4: 'Stay connected',
  5: 'Numbers are strength',
  6: 'Defend your link',
  7: 'Cut their link',
  8: 'Fruit takes a tile',
  9: 'Three in a row: Bloom',
  10: 'Gold is worth two',
});

/**
 * The campaign's first ten levels teach through the game, so their words are short, concrete and
 * in the game's own voice: an LED title (≤ 12 characters) and ONE line under it. They name the next
 * touch, never the whole rule book, and they never say "tutorial".
 */
export const ONBOARD = Object.freeze({
  /**
   * The objective, said before anything else. Beta feedback (2026-10-17): players could not tell
   * what winning looked like, even after playing. Levels 1 and 2 spend their opening draw on it —
   * level 1 the decisive win, level 2 both routes — while the window still points at the deck, so
   * the goal never hides the next action.
   */
  goal: 'THE GOAL',
  goalLine: 'Surround their home to win. Tap the Draw pile.',
  howToWin: 'HOW TO WIN',
  howToWinLine: 'Surround their home, or hold more ground.',
  /**
   * The win, said at the one moment it is concrete: their home has a single side left to take and
   * a legal move would take it. This is how the objective is actually learned — not from a paragraph.
   */
  oneMore: 'YOU CAN WIN',
  oneMoreLine: 'Surround their home now and it is over.',
  /**
   * The word "home" is useless until the player can see WHICH thing it is. On levels 1-2, after the
   * goal is stated, the window points at the opponent's landmark and names it once. After that the
   * word means something.
   */
  // Owner, 2026-10-24: the display never says "their".
  theirHome: 'OPPONENT HOME',
  theirHomeLine: 'This one. Surround it to win.',
  /**
   * What the level was teaching, said back to the player on the finish card after a win: the "you
   * did it, and this is what you just learned" beat. Empty past the guided levels, so a normal
   * match's finish card is unchanged.
   */
  recap: (level: number): string => RECAP[level] ?? '',  draw: 'DRAW',
  drawLine: 'Tap the Draw pile to start your turn.',
  take: 'TAKE A CARD',
  /**
   * Levels 2-7: ONE pile, because a beginner has not learned either yet, and the Throw pile's top
   * card can be a Fruit card — which is not taught until level 8.
   */
  takeLine: 'Tap the Draw pile.',
  pick: 'PICK A CARD',
  pickLine: 'Tap any card in your hand.',
  grow: 'GROW',
  growLine: 'Tap a lit tile.',
  throwTitle: 'THROW',
  throwLine: 'Tap a card to pick it for the Throw.',
  throwAgain: 'Swipe up, or tap the Throw pile.',
  throwDone: 'Tap » when you are done.',
  twoWays: 'TWO WAYS',
  twoWaysLine: 'More than one tile works. Pick one.',
  // Owner, 2026-10-24: while the opponent plays, the display just says WAIT.
  theirTurn: 'WAIT',
  theirTurnLine: 'Watch where they grow.',
  /** The one new idea each level introduces (levels 4-10), shown once on its first turn. */
  lessons: Object.freeze({
    4: Object.freeze({ title: 'CONNECTED', line: 'Every tile must join your tree.' }),
    5: Object.freeze({ title: 'STRONGER', line: 'A higher number is harder to take.' }),
    6: Object.freeze({ title: 'DEFEND', line: 'A joined tile is harder to cut.' }),
    7: Object.freeze({ title: 'CUT', line: 'Take a tile to break their link.' }),
    8: Object.freeze({ title: 'FRUIT', line: 'A Fruit card takes any neighbour.' }),
    9: Object.freeze({ title: 'BLOOM', line: 'Three in a row makes a bloom.' }),
    10: Object.freeze({ title: 'GOLD', line: 'Gold is worth two at the end.' }),
  } as Readonly<Record<number, { title: string; line: string }>>),
});

/** FUTASAKU 0.5 menu + Match Intel labels. One place to rename the single tutorial entry
 *  and the two Match Intel tabs. The moves reference text itself lives in SPROUT / BLOOM /
 *  FRUIT / BLAST and HOME above (the same shared rule words the game uses). */
export const HELP = Object.freeze({
  /** the only tutorial entry on the main menu */
  tutorial: 'Tutorial',
  /** the glass's own name (its spoken label) */
  intelTab: 'Match Intel',
  /** Match Intel's three tabs (owner, 2026-10-24: "Now · Tips · Rules"): the match as it stands,
   *  tips for this moment, and the ten lessons as cards with the full rules folded below. */
  nowTab: 'Now',
  tipsTab: 'Tips',
  rulesTab: 'Rules',
  /** the reference heading (also the legacy sheet title) */
  howToTitle: 'How to play',
  /** the tutorial's closing pointer to the reference (its last line) */
  tutorialFinal: 'Look up a move in Match Intel › Rules.',
});

/** Match Intel's words (owner, 2026-10-24: "pristine… easy to go through and read"). Titles are
 *  sentences, labels are short capitals, the rest is one plain sentence each. Every tip names
 *  only what is public: the board, my own hand and the Throw pile. */
export const INTEL = Object.freeze({
  lead: (by: number): string => `You lead by ${by}`,
  behind: (by: number): string => `They lead by ${by}`,
  level: 'All square',
  scoreLine: (you: number, them: number, turn: number): string => `${you} – ${them} points · turn ${turn}`,
  latest: 'LATEST',
  noMoves: 'No moves yet. The first card is face up on the Throw pile.',
  tiles: 'TILES',
  drawPile: 'DRAW PILE',
  theirHand: 'THEIR HAND',
  bombsUnseen: 'BOMBS UNSEEN',
  thrown: 'THROWN SO FAR',
  thrownNone: 'Nothing thrown yet.',
  /** one sentence per public move; `you` is true for my own */
  move: (you: boolean, verb: string, detail: string | null): string => {
    const who = you ? 'You' : 'They';
    const card = detail === 'BOMB' ? 'a Bomb' : detail ? `a ${detail}` : 'a card';
    switch (verb) {
      case 'THREW': return `${who} threw ${card}.`;
      case 'TOOK': return `${who} took ${card} from the Throw pile.`;
      case 'DREW': return `${who} drew ${card} from the Draw pile.`;
      case 'GREW': return `${who} grew ${card}.`;
      case 'UP': return `${who} strengthened a tile ${detail ?? ''}.`.replace(' .', '.');
      case 'BLOOM': return `${who} bloomed ${detail ?? 'three'} tiles at once.`;
      case 'BOMB': return `${who} played a Bomb.`;
      case 'BLAST': return `${who} blasted ${detail ?? 'several'} tiles.`;
      case 'CUT': return `${who} cut off ${detail ?? 'some'} tiles.`;
      case 'WIN': return `${who} surrounded the home.`;
      default: return `${who}: ${verb.toLowerCase()}${detail ? ` ${detail}` : ''}.`;
    }
  },
  tipLabel: (level: number, name: string): string => `LESSON ${level} · ${name.toUpperCase()}`,
  seeRule: 'See the rule',
  fullRules: 'Full rules',
  /** the tips, most urgent first */
  tips: Object.freeze({
    homeDanger: (left: number): string => left === 1
      ? 'Your home has one open side left. Fill it now, or they win by surrounding it.'
      : `Your home has ${left} open sides left. Fill one before they surround it.`,
    surround: (left: number): string => left === 1
      ? 'Their home has one open side left. Take it for an instant win.'
      : `Their home has only ${left} open sides left. Take them and you win at once.`,
    cut: (n: number): string => `A higher card on their weak link cuts off ${n} of their tiles.`,
    blast: 'Two Bombs make a Blast: it clears a whole area and does not use your Grow.',
    bloom: 'You can Bloom: several tiles at once, and it does not use your Grow.',
    bomb: 'Your Bomb removes any one of their tiles, even a 9.',
    pileBloom: 'The top card of the Throw pile completes a Bloom in your hand. Take it.',
    gold: 'A gold hex is in reach. It counts double at the end.',
    weak: (n: number): string => `If they cut your weak link you lose ${n} tiles. A higher card there holds it.`,
    deckLow: (n: number): string => n === 1 ? 'One card left in the Draw pile. Make this turn count.' : `${n} cards left in the Draw pile. Make each turn count.`,
    throwIt: 'Throw a card you cannot use. They see it, and may take it.',
    keepJoined: 'Keep every tile joined to your home. A cut chain withers.',
    stronger: 'A higher card can take their tile. Grow toward their home.',
  }),
});

/** FUTASAKU 0.5 main menu and its PLAY submenu (owner direction, 2026-10-15). One place for the
 *  words: the bottom row's LOG IN (or the player's name) beside Settings (owner brief, 2026-10-21),
 *  and PLAY holding exactly LEVEL <n> / Play online / Practice match (LEVEL leads the column since
 *  the owner's 2026-10-20 decision). */
export const MENU = Object.freeze({
  /** The sign-in key, now the LEFT key of the menu's bottom row (owner brief, 2026-10-21). It reads
   *  this only while signed out; a signed-in player's key carries their name instead. */
  login: 'LOG IN',
  /** The spoken name of the bottom row's group: the account key and Settings, side by side. */
  footerLabel: 'Account and settings',
  /** LEVEL <n>'s spoken label: the button starts the game, it does not open the level list. */
  levelAria: (number: number): string => `Play level ${number}`,
  /** the one doorway to the offline modes and the duel lobby */
  play: 'Play',
  /** the PLAY screen's heading */
  playTitle: 'Play',
  /** the main menu entry that opens the shared Territory */
  world: 'Territory',
  /** the quiet PLAY entry that browses the level list (LEVEL <n> starts a level outright) */
  // Removed (owner, 2026-10-16): the "Levels" entry that opened the whole chapter/level list. The
  // player is not given access to every level - MENU.level(n) starts the next one they have not
  // completed. Kept out of strings.ts entirely rather than left as a string nothing reads.
  /** the PLAY entry that opens the three practice-match tiers */
  training: 'Practice match',
  /** the PLAY entry that opens the campaign: "LEVEL 1", "LEVEL 25" (the level the player is on) */
  level: (number: number): string => `LEVEL ${number}`,
  /** The PLAY entry once every built level is complete: there is no next level to name, so it opens
   *  the chapter list instead. This is the ONLY state where the entry is not `LEVEL <n>`; while any
   *  level is unfinished the entry stays the single way in (owner, 2026-10-16). */
  levels: 'LEVELS',
  levelsAria: 'Levels. Choose a completed level to replay.',
  /** the practice-match screen's heading (the tier picker keeps its legacy heading off the product menu) */
  trainingTitle: 'Practice match',
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
    set: 'A set: same number, any suits — three to six cards.',
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
    // iOS 26 asks whether to "Open as Web App"; off, the game opens inside Safari with its bars.
    'Choose Add to Home Screen, keep Open as Web App on, then tap Add.',
  ] as const),
  manualSteps: Object.freeze([
    'Open your browser menu (the three dots).',
    'Choose Install app or Add to Home Screen.',
  ] as const),
  /**
   * On a computer there is no home screen: Chrome and Edge install the game as its own window,
   * started from the dock, taskbar or Start menu. Same invitation, desktop words.
   */
  desktop: Object.freeze({
    title: 'Open FUTASAKU in its own window',
    why: Object.freeze([
      'Its own window — no tabs, no browser bars',
      'Works offline, even with no connection',
      'Start it from your dock, taskbar or Start menu',
    ] as const),
    install: 'Open in its own window',
    /** The icon-only button, top right of the main menu on a computer (its tooltip / screen-reader name). */
    windowButton: Object.freeze({
      install: 'Open FUTASAKU in its own window',
      fullscreen: 'Full screen',
      exitFullscreen: 'Leave full screen',
    }),
    manualSteps: Object.freeze([
      'Click the install icon at the right end of the address bar (Safari on a Mac: open the File menu).',
      'Choose Install (Safari: Add to Dock).',
    ] as const),
  }),
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
  // The bolt's hidden words when a real-time duel is not possible because the opponent is away.
  away: 'Opponent away',
  awayAria: (name: string) => `Real time duel: ${name || 'your opponent'} is away`,
  notAvailable: 'Not available',
  busy: 'Busy',
  rateLimited: 'Try real time again later',
  wantsToGoLive: 'wants a real time duel',
  wantsRematch: 'wants a rematch',
  terms: (_secs: number) => 'Same match · each turn has a countdown',
  accept: 'Accept',
  notNow: 'Not now',
  // The SENDER's confirmation before the invite leaves the device (owner, 2026-10-26: tapping the
  // bolt must ask first). The seconds come from the server's own `limitMs` (LIVE_TURN_MS, default
  // 60 s, env-overridable), so the window never promises a number the match is not using.
  duelQuestion: 'Real time duel?',
  duelTerms: (secs: number) => `${secs} seconds on every move.`,
  sendChallenge: 'Send challenge',
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
  // Owner, 2026-10-15: the reconnect grace is never explained to players (it still exists).
  leaveWarningHelp: 'In real time, leaving or running out of time loses the whole match. Normal 24-hour games are unaffected.',
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
  failed: 'Could not start real time right now.',
});

/**
 * Beta feedback (web/src/feedback/): "Report a problem" (pause menu and Settings) and the tester
 * guide at futasaku.com/#beta. Plain words; promise only what is true.
 */
export const FEEDBACK = Object.freeze({
  open: 'Report a problem',
  /** The pause panel's tool key carries a one-word label under its flag (owner, 2026-10-23). */
  openShort: 'Report',
  title: 'Report a problem',
  prompt: 'What happened? What did you expect?',
  placeholder: 'e.g. After my Bloom the board froze and I could not throw.',
  attached: 'We also send your app version, phone type, screen size and where you are in the game (turn and step) — never your cards or your name.',
  send: 'Send',
  cancel: 'Cancel',
  sending: 'Sending…',
  sent: 'Thanks — sent.',
  queued: 'Saved. It will send when you are back online.',
  failed: 'Could not send. Please try again in a minute.',
  empty: 'Please write a few words first.',
  guideLink: 'Tester guide',
  close: 'Close',
  betaVersion: '0.7',
  /**
   * The beta line on the main menu, between the wordmark and the buttons: one calm sentence with the
   * version. Owner (2026-10-27): no date or time stamp on the main menu.
   */
  betaNote: (version: string) =>
    `This is a beta version (${version}) of an evolving game. If you spot any problems or have suggestions for improvement,`,
  betaLink: 'let us know here.',
});

/** The one-page tester guide (futasaku.com/#beta). Each section: a heading and a few lines. */
export const BETA_GUIDE = Object.freeze({
  title: 'Welcome, tester',
  intro: 'Thank you for helping test FUTASAKU. This page has everything you need — it takes two minutes.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'Put it on your home screen',
      lines: Object.freeze([
        'iPhone (Safari): tap Share, then Add to Home Screen.',
        'Android (Chrome): tap the ⋮ menu, then Install app or Add to Home screen.',
        'It then opens full-screen like an app, and works offline for games against the computer.',
      ]),
    }),
    Object.freeze({
      heading: 'Learn the game',
      lines: Object.freeze([
        'Play the Tutorial from the main menu once — it is short and shows every move.',
        'Then try a game against the computer before playing a person.',
      ]),
    }),
    Object.freeze({
      heading: 'Play a friend online',
      lines: Object.freeze([
        'Main menu → Play online → invite a friend and send them the code or link.',
        'Each turn can take up to 24 hours. There are no notifications yet, so tell your opponent when you have moved, or agree a time to play together.',
        'When you both have the match open, you can try Real time: 60 seconds a turn. Careful — in Real time, running out of time or leaving loses the match.',
      ]),
    }),
    Object.freeze({
      heading: 'Tell us what you find',
      lines: Object.freeze([
        'Anything odd, confusing, slow or broken: open the menu (☰) and tap Report a problem.',
        'Say what you did and what happened. Screenshots help too — send them to whoever invited you.',
        'Crashes are reported automatically, without your cards or your name.',
      ]),
    }),
  ]),
});

/**
 * The TUTORIAL (owner, 2026-10-24): the first nine campaign levels, replayable from Settings.
 * "Tutorial" is the owner's word for it, so it is the label everywhere the player sees it. A replay
 * is deliberately inert: these words never promise progress ("play again", not "continue").
 */
export const TUTORIAL_REPLAY = Object.freeze({
  title: 'Tutorial',
  /** the Settings row's short value, beside the entry */
  levelsWord: 'Levels 1–9',
  /** what the sheet says the replay is, in one line */
  hint: 'Play the first nine levels again. Your place in the campaign stays where it is.',
  /** a tutorial tile's spoken label (the tile itself is its number, exactly like a campaign tile) */
  levelAria: (number: number): string => `Level ${number}. Play the tutorial lesson.`,
  /** the finish card's leading action after a tutorial lesson: back to where they came from */
  back: 'Back to Tutorial',
});

/**
 * The Settings sheet (`web/index.html` `#sheet-settings`). Every visible word lives here, so the
 * screen can be re-organised without hunting through markup; `web/src/main.ts` fills them in from
 * the `data-copy` keys (`applySettingsCopy`).
 *
 * The shape (test: web/tests/settings-sheet.test.ts): the controls a player reaches for are plain
 * rows, and EVERYTHING else sits in one of two collapsed `details` groups — "More options" (look,
 * motion and volume detail) and "More playing options" (the teaching aids). Owner, 2026-10-17:
 * "settings should hold only essentials". The Coach switch is gone entirely: the advice is always on
 * in Match Intel, so there is nothing to switch.
 *
 * Accessibility rule, locked by that test: Reduce motion and Large text must stay OUTSIDE every
 * group. For some players they are the difference between playable and not.
 */
export const SETTINGS = Object.freeze({
  title: 'Settings',
  /** the Tutorial entry (owner, 2026-10-24): replays campaign levels 1-9 from Settings. */
  tutorial: TUTORIAL_REPLAY.title,
  tutorialLevels: TUTORIAL_REPLAY.levelsWord,
  lookHeading: 'Look',
  colours: 'Colours',
  materialDetail: 'Material detail',
  topGlow: 'Top-rank glow',
  lookGroup: 'More options',
  lookGroupHint: 'material, glow, animation, effects and volume',
  soundHeading: 'Sound and feel',
  sound: 'Sound',
  music: 'Music',
  vibration: 'Vibration',
  vibrationOff: 'Vibration (not available on this phone)',
  sfxVolume: 'Effects volume',
  musicVolume: 'Music volume',
  testSound: 'Test sound',
  testVibration: 'Test vibration',
  motionHeading: 'Motion and comfort',
  reduceMotion: 'Reduce motion',
  largeText: 'Large text',
  eyeCandy: 'Decorative effects',
  speed: 'Speed',
  effects: 'Effects',
  playingHeading: 'Playing',
  confirmMoves: 'Confirm moves',
  autoSkip: 'Auto-skip empty turns',
  helpGroup: 'More playing options',
  helpGroupHint: 'step guidance, placement list and weak spots',
  placementList: 'Show the places to play',
  weakSpots: 'Show weak spots',
  weakPulse: 'Pulse my weakest link',
  restartTutorial: 'Restart the guided run with a new game',
});

/** Accounts: "Continue with Google" (web/src/accounts/, docs/ACCOUNTS.md). */
export const ACCOUNT = Object.freeze({
  continueGoogle: 'Continue with Google',
  playAsGuest: 'Play as guest',
  welcomeTitle: 'Keep your games',
  welcomeBody: 'Sign in with Google to keep your online matches safe and pick them up on any phone or computer.',
  welcomeSmall: 'Games against the computer never need an account. You can sign in later from Settings.',
  privacy: 'Privacy',
  hubGuest: 'Playing as a guest: your matches live only on this device.',
  settingsTitle: 'Account',
  youAre: (name: string) => `You are ${name}`,
  signedIn: (email: string | null) => (email ? `Signed in with Google · ${email}` : 'Signed in with Google'),
  guestNote: 'Guest on this device. Sign in with Google to keep your matches on every device.',
  signOut: 'Sign out',
  signOutTitle: 'Sign out on this device?',
  signOutBody: 'Your matches stay in your account. Sign in with Google again to get them back.',
  deleteAccount: 'Delete my account',
  deleteTitle: 'Delete your account?',
  deleteLines: Object.freeze([
    'Your Google sign-in and your email address are deleted from FUTASAKU.',
    'Every other phone or computer signed in to this account is signed out.',
    'This device keeps playing as a guest. Finished matches stay in your opponents’ history under your nature name.',
  ]),
  deleteConfirm: 'Delete',
  cancel: 'Cancel',
  deleted: 'Your account is deleted. You are now playing as a guest.',
  working: 'One moment…',
  opening: 'Opening Google…',
  // Choosing a name — asked once, right after the first Google sign-in, and changeable in Settings.
  // Only a signed-in account may choose one; a guest keeps its generated nature name. The server
  // re-checks every name (server/src/display-name.ts), so this copy is only what the player sees.
  nicknameTitle: 'Choose your name',
  nicknameBody: 'This is the name other players see. You can change it later in Settings.',
  nicknamePlaceholder: 'Your name',
  nicknameSave: 'Save',
  nicknameSkip: 'Skip for now',
  nicknameSaved: 'Name saved.',
  nicknameError: "That name cannot be used. Use 1 to 40 letters, numbers, spaces or - _ '.",
  nicknameSettings: 'Change nickname',
  linked: (name: string) => `Signed in. Your matches are saved to your account, ${name}.`,
  welcomeBack: (name: string) => `Signed in. Welcome back, ${name}.`,
  switched: (name: string) => `Signed in as ${name}. Games played as a guest on this device were not moved.`,
  failed: 'Google sign-in did not finish. Please try again.',
  offline: 'You are offline. Connect and try again.',
  unavailable: 'Google sign-in is not available right now. Please try again later.',
});

/**
 * The player's profile (owner brief, 2026-10-21). A SKELETON: five read-only lines and nothing to
 * press. The words are here so a later rename is one line; the VALUES are never invented — an
 * unknown number is an em dash, never a 0.
 */
export const PROFILE = Object.freeze({
  title: 'Profile',
  /** The account key's spoken label while signed in; the name is part of the label. */
  open: (name: string): string => `${name}. Your profile`,
  name: 'Name',
  signIn: 'Sign-in',
  signedIn: 'Signed in with Google',
  guest: 'Guest on this device',
  /** The Seeds line's label is the ECONOMY's word, and it lives with the wallet's own wording in
   *  web/src/online/seed-icon.ts (`SEEDS_WORD`): this file must stay free of that word
   *  (web/tests/seed-words.test.ts), and the profile takes it from the one place the currency is
   *  named to the player. */
  tiles: 'Tiles',
  matchesWon: 'Matches won',
  /** An em dash is a FACT: this value is not known. It is never a made-up 0. */
  unknown: '—',
  /** Player stats (owner, 2026-10-23): the record against the computer, kept on this device. */
  playTitle: 'Your games',
  playNote: 'Against the computer, on this device',
  games: 'Games',
  winRate: 'Win rate',
  streak: 'Win streak',
  /** The streak tile's label once there is a record: the value is the current run. */
  streakBest: (best: number): string => `Win streak · best ${best}`,
  bestScore: 'Best score',
  favourite: 'Favourite move',
  longestBloom: 'Longest Bloom',
  tilesCount: (n: number): string => `${n} tile${n === 1 ? '' : 's'}`,
});

/**
 * The privacy policy, opened at futasaku.com/#privacy (web/src/accounts/mount.ts). Keep it TRUE: every
 * line here is checked against the code in docs/ACCOUNTS.md ("Privacy policy — where each line comes
 * from"). Change the code, change this, change `updated`.
 */
export const PRIVACY = Object.freeze({
  title: 'Privacy',
  updated: 'Last updated 15 October 2026',
  intro:
    'FUTASAKU is a small independent game. We collect as little as we can, we never sell data, and there are no ads or tracking.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'Playing against the computer',
      lines: Object.freeze([
        'Nothing leaves your device. Your settings and saved game are kept in your browser.',
      ]),
    }),
    Object.freeze({
      heading: 'Playing online as a guest',
      lines: Object.freeze([
        'We store a random player id, your generated name (like MapleFox #7QK2), your online matches (the moves, the result and the times), and sign-in keys that only work from your device (stored scrambled).',
        'Your IP address is used for a short time to stop spam (counting requests per hour). Those counters are deleted after two days.',
        'A guest with no matches is deleted after 30 days.',
      ]),
    }),
    Object.freeze({
      heading: 'Signing in with Google',
      lines: Object.freeze([
        'Sign-in runs through Supabase Auth. It receives from Google your email address, your name, your profile picture link and your Google account id.',
        'We use them only to recognise you when you sign in again. Our game database keeps just a link between your sign-in and your player. Your email is shown only to you, in Settings.',
        'We never see your Google password, and we never post anything or read anything else from your Google account.',
      ]),
    }),
    Object.freeze({
      heading: 'Problem reports',
      lines: Object.freeze([
        'When you use Report a problem, or the game crashes, we receive your message, your player id, the app version, your device type, screen size, browser and language, your game settings, and the game position (turn and step). Never your cards, your email or your sign-in keys.',
      ]),
    }),
    Object.freeze({
      heading: 'Who handles the data',
      lines: Object.freeze([
        'FUTASAKU is run by Patryk Socha, who is responsible for the data described here.',
        'Supabase runs our game server and database, in the EU (Ireland).',
        'GitHub Pages delivers the website itself.',
        'Google handles signing in with Google.',
        'Each of them may keep short technical logs, such as IP addresses, under their own privacy policies.',
      ]),
    }),
    Object.freeze({
      heading: 'Deleting your data',
      lines: Object.freeze([
        'Settings → Delete my account removes your Google sign-in and your email from FUTASAKU at once, and signs out your other devices.',
        'Finished matches stay in your opponents’ history under your generated name, which is not linked to you any more.',
        'To have everything removed, matches included, or to ask what we hold about you, use Report a problem and say so, or email info@futasaku.com.',
        'You can also remove FUTASAKU from your Google account at myaccount.google.com/permissions.',
      ]),
    }),
    Object.freeze({
      heading: 'Children',
      lines: Object.freeze([
        'FUTASAKU is not made for children under 13, and we do not knowingly collect their data.',
      ]),
    }),
    Object.freeze({
      heading: 'Contact',
      lines: Object.freeze([
        'Any question about your data, or a request to see or remove it: info@futasaku.com. We reply within 30 days.',
      ]),
    }),
    Object.freeze({
      heading: 'Changes',
      lines: Object.freeze([
        'If this policy changes, the date above changes with it. A big change is announced in the game first.',
      ]),
    }),
  ]),
  close: 'Close',
});

/**
 * Campaign mode. Every word a player reads on the campaign surfaces lives here; the ten level
 * NAMES are level data (`src/campaign/levels.ts`), exactly as the tutorial's lesson lines are.
 * The copy stays in the game's own voice and promises nothing the game does not do.
 */
export const CAMPAIGN = Object.freeze({
  /** the main menu entry that opens the campaign */
  title: 'Campaign',
  /** the main menu entry that keeps the old difficulty picker */
  classic: 'Classic vs AI',
  /** the level screen heading. The player-facing progression is never called "Campaign": the game
   *  simply has LEVEL 1, LEVEL 2, … (owner brief, 2026-10-17). */
  heading: 'Levels',
  /** the prominent button that resumes an unfinished campaign match */
  resume: 'Resume',
  /** the prominent button that opens the current level when nothing is unfinished */
  play: 'Continue',
  /** The question asked when the player enters a level that has an unfinished saved match (owner
   *  decision, 2026-10-19: there is no resume on the main menu, so entering always asks). When the
   *  save belongs to the level being entered, the question and both answers are about THAT level;
   *  when it belongs to another level, they name both honestly. */
  askTitle: (saved: number, next: number): string =>
    saved === next ? `Level ${saved} is unfinished.` : 'Another level is unfinished.',
  askBody: (saved: number, next: number): string =>
    saved === next
      ? `Continue level ${saved} where you left off, or start it over?`
      : `Level ${saved} is still in progress. Start level ${next} instead?`,
  /** continue the saved match on the level being entered */
  askContinue: (level: number): string => `Continue level ${level}`,
  /** throw that saved match away and play the level from its opening */
  askRestart: (level: number): string => `Start level ${level} over`,
  /** the saved match is a different level: resume it, or start the level being entered */
  askResume: (saved: number): string => `Resume level ${saved}`,
  askStart: (next: number): string => `Start level ${next}`,
  /** the state words on a level tile (a completed tile is tapped to replay it) */
  completed: 'Completed',
  current: 'You are here',
  locked: 'Locked',
  /** small progress line under the heading, e.g. "3 of 10 complete" */
  progress: (done: number, total: number): string => `${done} of ${total} complete`,
  /**
   * The caption under the PLAY submenu's LEVEL <n> key (owner direction, 2026-10-23): "3 of 10
   * lessons completed". It is deliberately its own key rather than `progress`, because this line
   * counts LESSONS in the level's own chapter (levels 1-10 are the tutorial), while the campaign
   * screen's `progress` counts every level built. The line retires once the chapter is finished.
   */
  lessonsCompleted: (done: number, total: number): string => `${done} of ${total} lessons completed`,
  /** the chapter label, e.g. "Chapter I" (Roman numeral from the chapter number) */
  chapterName: (chapter: number): string =>
    `Chapter ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][chapter - 1] ?? chapter}`,
  /** chapter titles + subtitles, keyed by the chapter id in src/campaign/levels.ts */
  chapters: Object.freeze({
    'first-growth': Object.freeze({
      title: 'First Growth',
      subtitle: 'Ten gentle levels on the open ground.',
    }),
    'broken-ground': Object.freeze({
      title: 'Broken Ground',
      subtitle: 'Ten levels of broken ground, with a way round.',
    }),
    'narrow-paths': Object.freeze({
      title: 'Narrow Paths',
      subtitle: 'Ten narrow levels where space must be won.',
    }),
    'hollow-ground': Object.freeze({
      title: 'Hollow Ground',
      subtitle: 'Ten boards that ask you to read the route.',
    }),
    'gold-country': Object.freeze({
      title: 'Gold Country',
      subtitle: 'Ten boards where the ground is worth fighting for.',
    }),
    'the-long-way': Object.freeze({
      title: 'The Long Way',
      subtitle: 'Ten boards where the short path is a trap.',
    }),
    'broken-crown': Object.freeze({
      title: 'Broken Crown',
      subtitle: 'Ten boards where every shape is broken on purpose.',
    }),
  }) as Readonly<Record<string, { title: string; subtitle: string }>>,
  /** a level's spoken label. The owner removed level and chapter NAMES everywhere (2026-10-16), so
   *  this is the number alone: "Level 4". */
  levelLabel: (number: number): string => `Level ${number}`,
  /** resume the campaign match exactly where it stopped */
  resumeHint: 'Your level is unfinished.',
  /** the log line when a campaign level opens (Level N · name) */
  started: (number: number): string => `Level ${number}`,
  /** the campaign finish title after a win: "Level 6 Complete" (owner, 2026-10-24: capital C, it is
   *  the outcome word of the lockup and reads as a stamp, not a sentence tail). */
  levelWon: (number: number): string => `Level ${number} Complete`,
  /** the finish screen's secondary way out, back to the level list */
  back: 'Back to levels',
  /**
   * The finish screen's LEADING action after a won level (owner direction, 2026-10-16): the next
   * level starts straight away, so the player never has to walk back to the list to pick it. The
   * list stays one tap away as the secondary action.
   */
  nextLevel: 'Next level',
  /** the finish screen's small "next level unlocked" note after a campaign win */
  unlockedNext: (): string => 'Next level unlocked',
  /** the finish screen's note after the last level of the campaign as built */
  chapterDone: 'Chapter complete. More levels are on the way.',
});

// ======================================================================================
// LESSONS — levels 1-10 are the tutorial (/3 onboarding line, 2026-10-18).
//
// Every word a player reads in a teaching level. The DISPLAY (the cockpit's LED) says what to do
// now: a short action line, never a lone word. The INFO BOX (#lesson-plate) explains: one full
// sentence, shown once, dismissed by a tap anywhere. A wrong tap is answered on the display.
// One word list: Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points, home. Bloom is never
// "set" or "run"; no tile colours. Scoring words follow SPEC ("Ending the game").
// docs/LESSON-SCRIPTS.md holds the same text beat by beat; web/tests/lesson-words.test.ts pins both.
// ======================================================================================
export const LESSON = Object.freeze({
  // ---- the display: what to do now (never more than three words) ----
  // Owner, 2026-10-20: the LED is small and read at a glance, so the action is at most three
  // words ("TAP THE DRAW PILE" -> "TAP DRAW PILE"). The game's own names stay: DRAW PILE and
  // THROW PILE, never "discard". The box keeps the full sentences below.
  tapDraw: 'TAP DRAW PILE',
  tapThrowPile: 'TAP THROW PILE',
  chooseCard: 'CHOOSE A CARD',
  tapTile: 'TAP LIT TILE',
  tapTiles: 'TAP LIT TILES',
  throwCard: 'THROW A CARD',
  tapThrow: 'TAP »',
  tapBloom: 'TAP BLOOM',
  tapBlast: 'TAP BLOOM',
  chooseBomb: 'CHOOSE THE BOMB',
  // Owner, 2026-10-24: never "their" on the display, and (2026-10-19) never a tile colour: the
  // tile to take is the lit one.
  bombTile: 'BOMB LIT TILE',
  tapTheirTile: 'TAP LIT TILE',
  tapLastSide: 'TAP LAST SIDE',
  // a power's once-ever hello (the card itself glows)
  bloomHello: 'TAP TO BLOOM',
  bombHello: 'TAP THE BOMB',
  theirTurn: 'WAIT',
  lastCards: 'LAST CARDS',
  lastTurn: 'LAST TURN',
  // level 1's first three explanations: the display welcomes, it scrolls and never competes with
  // the box (owner, 2026-10-22: it used to blink DRAW DRAW DRAW while the box was being read)
  welcome: 'HELLO ♥ WELCOME ♥',
  // ---- the info box: explanations, one full sentence each ----
  yourHomeLine: 'This is your home. Place cards on the tiles that connect to your home to Grow.',
  theirHomeLine: 'TO WIN: surround opponent’s home tile, or have more tiles on the board when the Draw pile runs out.',
  tapDrawLine: 'Every turn has 3 steps – Draw, Grow and Throw. You start by drawing 1 card from the top of the Draw pile or the Throw pile.',
  growLine: 'Grow: drag one of your cards from your hand onto the board, or tap it to select and then place it on the board.',
  // Owner's word list (2026-10-20, "Draw pile / Throw pile"): keep the online line's wording.
  throwLine: 'Throw: swipe up, drag the card to the Throw pile, or tap the pile. This ends your turn.',
  youGrewLine: 'Tiles keep the rank of the card used. Higher ranks are harder to cut.',
  biggerWinsLine: 'Strengthen: a stronger card can replace your own tile.',
  // "Take", not "Cut": a cut is level 4's idea (breaking the chain), and the two never share a name (owner, 2026-10-24).
  takeTileLine: 'Take: a higher card can take an opponent’s tile.',
  rocksBlockLine: 'Nothing can Grow on a rock.',
  goldDoubleLine: 'A gold tile counts double, so it is worth two points.',
  cutLinkLine: 'Cut a tile to break the chain behind it.',
  witheredLine: 'Tiles cut off from their home disappear.',
  cardsThatBloomLine: 'BLOOM: three cards with the same number, or three in order in one suit.',
  bloomedLine: 'Bloom grows several tiles at once and does NOT use your Grow.',
  surroundLine: 'Surround: fill every tile around their home for an instant win.',
  bombLine: 'Bomb: removes one enemy tile, even a 9. Uses your Grow.',
  blastLine: 'Blast: two Bombs clear a large area. Homes are safe.',
  freeGrowLine: 'Blast clears several tiles at once and does NOT use your Grow.',
  pileGoldLine: 'The Throw pile glows gold when its top card completes a Bloom in your hand.',
  // the last lesson's send-off, before the first real game (owner, 2026-10-24), verbatim
  firstGameLine: 'You are ready now for your first game of Futasaku. Good luck!',
  optionalLine: 'Tap » to skip Grow/Bloom and keep your cards for later.',
  // right after the skip, the Undo key lit (owner, 2026-10-22)
  undoLine: 'You are able to undo your previous moves until you Throw a card at the end of your turn.',
  lastTurnLine: 'The Draw pile is empty – this is your last turn.',
  theirTurnLine: 'They Draw, Grow and Throw too.',
  restartLine: 'This lesson cannot finish from here.',
  // the one button the box ever holds, only while the lesson cannot finish (owner, 2026-10-22)
  startAgain: 'START AGAIN',
  // finish cards: the one idea learned, with a small mark, then the way on
  learned: 'YOU LEARNED',
  youWin: 'YOU WIN',
  wonOnPoints: 'You had more points – you won!',
  wonByKo: 'You surrounded their home.',
  goldDecided: 'Gold put you ahead.',
  canPlay: 'YOU CAN PLAY FUTASAKU',
  canPlayLine: 'Next: the big board.',
  // wrong taps (the engine says why; these are its words)
  drawFirst: 'DRAW FIRST',
  notYet: 'NOT YET',
  tapLit: 'TAP THE LIT ONE',
  connect: 'CONNECT TO YOUR HOME',
  rockBlocks: 'ROCK BLOCKS THIS',
  isTheirHome: 'HOMES ARE SAFE',
  isYourHome: 'THAT IS YOUR HOME',
  /** level 1 withholds Overgrow: a tap on their tile with a higher card says why, not "too weak" */
  theirTileSafe: 'THEIR TILE IS SAFE',
  tooWeak: (card: number, tile: number): string => `TOO WEAK: ${card} VS ${tile}`,
  ownTile: 'YOUR TILE NEEDS A HIGHER CARD',
  mustTouch: 'MUST TOUCH YOUR TILES',
  homesSafe: 'HOMES ARE SAFE',
  pickFirst: 'PICK A CARD FIRST',
  oneDraw: 'ONE CARD PER TURN',
  bloomNeeds: 'THREE CARDS OR MORE',
  bloomMatch: 'SAME NUMBER, OR COUNTING UP',
  theirTurnNow: 'WAIT',
});

/** Match chat: stable phrase IDs are stored, labels are translated at render time.
 * A localisation integration can replace this copy object; never persist translated phrases. */
export const MATCH_CHAT = {
  title: 'Match chat', open: 'Open match chat', close: 'Close chat', you: 'You', opponent: 'Opponent',
  empty: 'A little company across the board.',
  // Owner, 2026-10-26: chat can be sent at any point in an active match. The old sentence promised
  // the opponent-turn rule that no longer exists.
  available: 'Chat is open for this match',
  ended: 'Match ended · history only',
  message: 'Message', send: 'Send', pending: 'Sending…', sent: 'Sent', failed: 'Not sent',
  retry: 'Retry', discard: 'Discard', older: 'Earlier messages', newer: 'New messages',
  quickPhrases: 'Quick phrases', messageActions: 'Message actions',
  reconnecting: 'Live updates reconnecting…', offline: 'Offline · draft saved',
  opponentOnline: 'Opponent online', opponentOffline: 'Opponent offline', opponentUnknown: 'Opponent status unavailable',
  // A direct mute key in the chat header (owner, 2026-10-26): no ··· menu any more.
  mute: 'Mute chat', unmute: 'Unmute chat',
  // The cockpit chat key's accessible name while this player has muted this match.
  mutedToggle: 'Chat muted for this match',
  // The quiet line the OTHER player reads. It states the fact only: no reason, no timestamp.
  opponentMuted: 'Opponent muted chat for this match.',
  block: 'Block chat with opponent', blockShort: 'Block',
  unblock: 'Unblock opponent', unblockShort: 'Unblock',
  blocked: 'Chat blocked · history only',
  report: 'Report message',
  // Reporting always mutes this match too (owner, 2026-10-26).
  reportConfirm: 'Report and mute', reportDone: 'Report sent for review. Chat muted.',
  abuse: 'Abusive message', spam: 'Spam', other: 'Other', cancel: 'Cancel',
  loading: 'Connecting chat…', unavailable: 'Chat unavailable · try again', reconnect: 'Reconnect chat',
  error: 'Couldn’t complete that. Try again.', rate: 'Give your opponent a moment.',
  unread: (n: number) => `${n} unread ${n === 1 ? 'message' : 'messages'}`,
  remaining: (n: number) => `${n} characters remaining`,
  phrases: { 'good-luck': 'Good luck!', 'nice-move': 'Nice move!', gg: 'GG' },
};

/**
 * THE DAILY PUZZLE (owner, 2026-10-27). One turn a day, the same everywhere; solving it grows one
 * Territory tile. The LED tokens are at most five cells (web/src/player/led-cells.ts).
 */
export const DAILY = Object.freeze({
  /** The PLAY submenu key: `DAILY #042`. */
  key: (no: number) => `DAILY #${String(no).padStart(3, '0')}`,
  number: (no: number) => `#${String(no).padStart(3, '0')}`,
  newToday: 'NEW TODAY',
  triesLeft: (n: number) => `${n} ${n === 1 ? 'TRY' : 'TRIES'} LEFT`,
  solved: 'SOLVED',
  toPlace: (n: number) => `${n} ${n === 1 ? 'TILE' : 'TILES'} TO PLACE`,
  tomorrow: 'NEXT PUZZLE TOMORROW',
  streak: (n: number) => `STREAK ${n}`,
  soon: 'SOON',
  /** The intro sheet. */
  rules: 'One turn. The opponent never moves. Undo is free; ending your turn uses a try.',
  start: 'Start',
  /** LED tokens. */
  ledTry: (n: number) => `TRY ${n}`,
  ledSolved: 'GROW+',
  ledMiss: 'MISS',
  /** The result sheet. */
  solvedTitle: 'Solved',
  missTitle: 'Not quite',
  overTitle: 'Not today',
  earned: 'You earned 1 tile in your Territory.',
  placeIt: 'Place it',
  /** PLACE IT while the server confirms the solve. */
  checking: 'One moment…',
  tryAgain: 'Try again',
  showAnswer: 'Show the answer',
  share: 'Share',
  copied: 'Copied',
  backToGames: 'Back to games',
  nextIn: (h: number, m: number) => `NEXT IN ${h}H ${String(m).padStart(2, '0')}M`,
  /** The tile was earned but the server could not be reached yet. */
  waiting: 'Your tile is safe. It will be ready to place the next time you are online.',
  /** The server refused the solve (it should never happen for a real solve). */
  refused: 'That solve could not be verified, so no tile was added.',
  /** The Territory screen while a tile waits to be placed. */
  placeTitle: 'Place your tile',
  placeLine: 'Grow it next to your land, or anywhere for your first tile.',
  placed: 'Your Territory grew.',
});
