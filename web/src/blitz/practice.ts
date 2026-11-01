// EXPERIMENTAL BLITZ — the /test/-only Practice tier. Presentation + wiring only; every rule it
// uses lives in `logic/blitz.ts` so the ladder, the clock value and the board pick are unit-tested
// without a browser.
//
// THE TIMER IS THE ONLINE TIMER. The draining ring on the player's home, its green -> orange -> red
// arc, and the red vignette in the last five seconds are `createHud` from the live-duel module
// (`online/live/ui.ts`, the same one the server-driven real-time duel uses). Nothing new is drawn
// here: this file only hands the HUD the 15 s limit and a local deadline, and ends the match the way
// a real-time timeout does — the player whose clock ran out loses (server `reason: 'timeout'`).
import type { Level } from '../../../src/bots/levels.js';
import type { CampaignLevel } from '../../../src/campaign/levels.js';
import type { State } from '../../../src/engine/index.js';
import { FEATURES } from '../channel.js';
import { BLITZ_TURN_MS, blitzDeadlineAt, blitzRemainingMs, blitzTimeoutState, pickBlitzMap, readBlitzState, recordBlitzOutcome } from '../logic/blitz.js';
import type { BlitzOutcome, BlitzStore } from '../logic/blitz.js';
import { createHud, injectLiveStyles } from '../online/live/ui.js';

/** What main.ts hands the feature. All page state stays in main; this module never reads it directly. */
export type BlitzHooks = {
  store: BlitzStore;
  /** The start path's own seed helper (`randomSeed`), so the board pick is not a second RNG. */
  randomSeed: () => number;
  /** Start the picked board as a Blitz match (main.ts's `startBlitzMatch`). */
  startMatch: (map: CampaignLevel) => void;
  /** The page's sound unlock, on the same user gesture that starts the match. */
  unlock: () => void;
  state: () => State | null;
  isMatch: () => boolean;
  busy: () => boolean;
  /** The pre-game ceremony owns the screen: the clock must not run through it. */
  hold: () => boolean;
  homeKey: () => string | null;
  reduceMotion: () => boolean;
  /** The local deadline passed: end the match exactly as the online timer would (a loss). */
  onTimeout: () => void;
};

export type BlitzPractice = {
  /** The visible tier name (Practice: EASY / MEDIUM / HARD / PRO). */
  readonly label: string;
  /** Put the PRO tile at the end of the tier grid (again after every grid re-render). */
  appendTile: (grid: HTMLElement) => void;
  /** The bot level the NEXT Blitz game uses (the persisted ladder). */
  botLevel: () => Level;
  losses: () => number;
  /** A fresh random board, for a rematch from the same tier. */
  newMap: () => CampaignLevel;
  /** Record one finished Blitz game. Never call it for a normal tier. */
  record: (outcome: BlitzOutcome) => void;
  /** The finished state a timed-out Blitz match continues as (the shared finish path reads it). */
  timeoutState: (state: State) => State;
  /** A Blitz match was opened (fresh or resumed): reset the clock and start watching. */
  beginMatch: () => void;
  /** Sync the clock with the current turn (cheap; the render path calls it). */
  sync: () => void;
  /** What the test hook reports: the persisted ladder and the live deadline. */
  status: () => { level: Level; losses: number; turnMs: number; deadline: number | null; remainingMs: number | null };
  destroy: () => void;
};

/** Player 0 is the human everywhere in the page (main.ts's HUMAN); the bot's turn has no clock. */
const HUMAN = 0;
const SELECTED_KEY = 'severgrow.difficulty';

/**
 * Mount the tier — or nothing. `FEATURES.blitz` is false on futa04 and on the futa05 live ROOT (the
 * same build one promote behind /test/), so neither can ever create the tile, the HUD or a timer.
 */
export const mountBlitzPractice = (hooks: BlitzHooks): BlitzPractice | null => {
  if (!FEATURES.blitz) return null;

  injectLiveStyles();
  const hud = createHud();
  let deadline: number | null = null;
  let timer = 0;

  const gameVisible = () => {
    const game = document.getElementById('game');
    return !!game && !game.hidden;
  };

  const paint = (): void => {
    if (deadline === null) {
      hud.render(null);
      return;
    }
    hud.render({
      live: true,
      limitMs: BLITZ_TURN_MS,
      deadline,
      // The ring sits on MY home: the clock is the human's turn (the bot acts at once).
      side: 'me',
      homeKey: hooks.homeKey(),
      opponentReconnecting: false,
      reduceMotion: hooks.reduceMotion(),
    });
  };

  const disarm = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    deadline = null;
    hud.render(null);
  };

  const activeTurn = (): boolean => {
    const state = hooks.state();
    return !!state
      && hooks.isMatch()
      && gameVisible()
      && state.phase !== 'GAME_OVER'
      && state.actor === HUMAN;
  };

  const expire = (): void => {
    timer = 0;
    if (deadline === null) return;
    // The turn may have passed (or the game left) between the deadline and this callback.
    // Re-check before charging the player with a loss they did not earn.
    const still = activeTurn();
    disarm();
    if (still) hooks.onTimeout();
  };

  const arm = (): void => {
    deadline = blitzDeadlineAt(Date.now());
    paint();
    timer = window.setTimeout(expire, BLITZ_TURN_MS);
  };

  /**
   * The clock starts when the human's turn is actually PLAYABLE — after the pre-game ceremony, and
   * after the opponent's turn has finished animating in. It runs through the player's own move
   * animations (the turn has not passed) and stops the moment the turn does.
   */
  const sync = (): void => {
    if (!activeTurn()) {
      if (deadline !== null) disarm();
      return;
    }
    if (deadline !== null) {
      if (blitzRemainingMs(deadline, Date.now()) === 0) expire();
      else paint();
      return;
    }
    if (hooks.hold() || hooks.busy()) {
      hud.render(null);
      return;
    }
    arm();
  };

  /** A hidden tab must not end a match unseen; when it comes back the clock is checked again. */
  const onVisible = (): void => {
    if (!document.hidden) sync();
  };
  document.addEventListener('visibilitychange', onVisible);

  const tile = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    const selected = hooks.store.get(SELECTED_KEY) === 'pro';
    button.className = `btn big level-tile difficulty-tile${selected ? ' primary on' : ' ghost'}`;
    button.dataset.difficulty = 'pro';
    button.textContent = 'PRO';
    button.setAttribute('aria-label', 'Pro. Blitz: 15 seconds a turn against the computer at level 9.');
    button.addEventListener('click', () => {
      hooks.unlock();
      hooks.store.set(SELECTED_KEY, 'pro');
      hooks.startMatch(pickBlitzMap(hooks.randomSeed()));
    });
    return button;
  };

  return {
    label: 'Pro',
    appendTile(grid) {
      grid.append(tile());
    },
    botLevel: () => readBlitzState(hooks.store).level,
    losses: () => readBlitzState(hooks.store).losses,
    newMap: () => pickBlitzMap(hooks.randomSeed()),
    record(outcome) {
      recordBlitzOutcome(hooks.store, true, outcome);
    },
    timeoutState: (state) => blitzTimeoutState(state),
    beginMatch() {
      disarm();
      // `sync` arms only once the ceremony has released the board; `render` keeps calling it after.
      sync();
    },
    sync,
    status() {
      const ladder = readBlitzState(hooks.store);
      return {
        level: ladder.level,
        losses: ladder.losses,
        turnMs: BLITZ_TURN_MS,
        deadline,
        remainingMs: deadline === null ? null : blitzRemainingMs(deadline, Date.now()),
      };
    },
    destroy() {
      disarm();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
};
