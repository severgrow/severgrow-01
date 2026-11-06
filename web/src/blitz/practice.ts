// EXPERIMENTAL BLITZ — the /test/-only Practice tier. Presentation + wiring only; every rule it
// uses lives in `logic/blitz.ts` so the ladder, the clock value and the board pick are unit-tested
// without a browser.
//
// 0.82 REMODEL (owner, 2026-11-06, docs/HANDOFF-0.82-BLITZ.md): the clock is an LED stopwatch in the
// cockpit (`blitz/timer.ts`), 21 s a turn, fresh each turn. It shows MY time on my turn and THEIR
// time while their turn is being played, so both players' pressure is visible. At 00:00 my turn ends
// on its own (draw, stop, throw the lowest card): the match goes on. The time left at the end of each
// of my turns is my TEMPO, shown on the finish card. (The live-duel ring is no longer used here.)
import type { Level } from '../../../src/bots/levels.js';
import type { CampaignLevel } from '../../../src/campaign/levels.js';
import type { State } from '../../../src/engine/index.js';
import { FEATURES } from '../channel.js';
import { BLITZ_TURN_MS, blitzRemainingMs, blitzTempo, blitzTimeoutState, pickBlitzMap, readBlitzState, recordBlitzOutcome } from '../logic/blitz.js';
import type { BlitzOutcome, BlitzStore, BlitzTempo } from '../logic/blitz.js';
import { blitzClockIn } from './timer.js';

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
  /** The opponent's turn is still being shown on the board (their clock runs while it is). */
  opponentShowing: () => boolean;
  /** Where the clock frame lives (the cockpit's key grid, #smart-panel), or null before it is mounted. */
  clockHost: () => HTMLElement | null;
  /** The last three seconds: one soft click each. */
  tick: () => void;
  /** My time ran out: end my turn (draw, stop, throw the lowest card). The match goes on. */
  onTimeout: () => void;
};

export type BlitzPractice = {
  /** The visible tier name (Practice: EASY / MEDIUM / HARD / BLITZ). */
  readonly label: string;
  /** Put the BLITZ tile at the end of the tier grid (again after every grid re-render). */
  appendTile: (grid: HTMLElement) => void;
  /** The bot level the NEXT Blitz game uses (the persisted ladder). */
  botLevel: () => Level;
  losses: () => number;
  /** A fresh random board, for a rematch from the same tier. */
  newMap: () => CampaignLevel;
  /** Record one finished Blitz game. Never call it for a normal tier. */
  record: (outcome: BlitzOutcome) => void;
  /** The finished state of a match lost on time (kept for the online live duel's rule). */
  timeoutState: (state: State) => State;
  /** This match's tempo so far (null before my first finished turn). */
  tempo: () => BlitzTempo | null;
  /** A Blitz match was opened (fresh or resumed): reset the clock and start watching. */
  beginMatch: () => void;
  /** Sync the clock with the current turn (cheap; the render path calls it). */
  sync: () => void;
  /** What the test hook reports: the persisted ladder and the live deadline. */
  status: () => { level: Level; losses: number; turnMs: number; deadline: number | null; remainingMs: number | null; side: 'mine' | 'theirs' | null; tempo: number[]; timeouts: number; clock: { on: boolean; text: string; stage: string; side: string; running: boolean } | null };
  destroy: () => void;
};

/** Player 0 is the human everywhere in the page (main.ts's HUMAN). */
const HUMAN = 0;
const SELECTED_KEY = 'severgrow.difficulty';

/**
 * Mount the tier — or nothing. `FEATURES.blitz` is false on futa04 and on the futa05 live ROOT (the
 * same build one promote behind /test/), so neither can ever create the tile, the HUD or a timer.
 */
export const mountBlitzPractice = (hooks: BlitzHooks): BlitzPractice | null => {
  if (!FEATURES.blitz) return null;

  let clock: ReturnType<typeof blitzClockIn> | null = null;
  const theClock = () => {
    if (clock) return clock;
    const host = hooks.clockHost();
    if (!host) return null;
    clock = blitzClockIn(host, { reduceMotion: hooks.reduceMotion, tick: () => hooks.tick() });
    return clock;
  };
  /** My clock: armed when my turn is playable, stopped the moment it passes. */
  let deadline: number | null = null;
  let timer = 0;
  /** Their clock: started when their turn starts being shown, frozen when it ends. */
  let theirDeadline: number | null = null;
  let side: 'mine' | 'theirs' | null = null;
  /** Time left at the end of each of my turns, this match (the tempo). */
  let leftAtEnd: number[] = [];
  let timeouts = 0;
  /** My time ran out this turn: the clock stays at 00:00 while the turn ends on its own. */
  let spent = false;

  const gameVisible = () => {
    const game = document.getElementById('game');
    return !!game && !game.hidden;
  };

  const inMatch = () => {
    const state = hooks.state();
    return !!state && hooks.isMatch() && gameVisible() && state.phase !== 'GAME_OVER';
  };

  const myTurn = (): boolean => inMatch() && hooks.state()!.actor === HUMAN;

  const disarmMine = (record: boolean): void => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (deadline !== null && record) leftAtEnd.push(blitzRemainingMs(deadline, performance.now()));
    deadline = null;
  };

  const expire = (): void => {
    timer = 0;
    if (deadline === null) return;
    // The turn may have passed (or the game left) between the deadline and this callback.
    const still = myTurn() && !hooks.opponentShowing();
    if (!still) return;
    deadline = null;
    spent = true;
    leftAtEnd.push(0);
    timeouts++;
    theClock()?.hold('mine', 0);
    hooks.onTimeout();
  };

  const armMine = (): void => {
    // the steady clock (never jumps when the phone adjusts its time): owner, "super reliable"
    deadline = performance.now() + BLITZ_TURN_MS;
    timer = window.setTimeout(expire, BLITZ_TURN_MS);
  };

  /**
   * One sync per render. MY clock starts when my turn is PLAYABLE (after the ceremony and after their
   * turn has finished being shown) and runs through my own move animations. THEIR clock starts when
   * their turn starts being shown and freezes when it is over.
   */
  const sync = (): void => {
    const c = theClock();
    if (!inMatch()) {
      if (deadline !== null) disarmMine(false);
      spent = false;
      theirDeadline = null;
      // Only stand the clock down if THIS mode had it up (an online Blitz duel shares the clock).
      if (side !== null) c?.off();
      side = null;
      return;
    }
    const state = hooks.state()!;
    const theirsShowing = state.turnPlayer !== HUMAN || hooks.opponentShowing();
    if (theirsShowing) {
      spent = false;
      if (deadline !== null) disarmMine(true);
      if (theirDeadline === null) theirDeadline = performance.now() + BLITZ_TURN_MS;
      side = 'theirs';
      c?.runSteady('theirs', theirDeadline);
      return;
    }
    theirDeadline = null;
    if (spent) {
      side = 'mine';
      c?.hold('mine', 0);
      return;
    }
    if (hooks.hold()) {
      side = 'mine';
      c?.hold('mine', BLITZ_TURN_MS);
      return;
    }
    if (deadline === null) armMine();
    else if (blitzRemainingMs(deadline, performance.now()) === 0) {
      expire();
      return;
    }
    side = 'mine';
    c?.runSteady('mine', deadline!);
  };

  /** A hidden tab is checked again when it comes back. */
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
    // THE TIER IS CALLED BLITZ (owner, 2026-11-02: "BLITZ should be call BLITZ no 'PRO' in practice
    // match"). It sits in the same grid as EASY / MEDIUM / HARD, so it wears that family's shape but
    // its own name — the mode is the feature, not a difficulty rung.
    button.textContent = 'BLITZ';
    // The online duels' bolt beside the word, as tall as its letters (owner, 2026-11-06: "BLITZ X - but
    // x is the lightning"). The same path as the Blitz duel key (online/live/ui.ts).
    const bolt = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bolt.setAttribute('viewBox', '5 2.5 13.4 19');
    bolt.setAttribute('aria-hidden', 'true');
    bolt.setAttribute('class', 'blitz-bolt');
    bolt.style.cssText = 'height:.74em;width:auto;margin-left:.32em;vertical-align:-.02em;fill:currentColor;overflow:visible';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M13.4 2.5 5 13.6h6.1l-1.3 7.9 8.6-11.3h-6.2z');
    bolt.append(path);
    button.append(bolt);
    button.setAttribute('aria-label', 'Blitz: 21 seconds a turn against the computer at level 9.');
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
    tempo: () => blitzTempo(leftAtEnd),
    beginMatch() {
      disarmMine(false);
      theirDeadline = null;
      leftAtEnd = [];
      timeouts = 0;
      spent = false;
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
        remainingMs: deadline === null ? null : blitzRemainingMs(deadline, performance.now()),
        side,
        tempo: [...leftAtEnd],
        timeouts,
        clock: clock?.snapshot() ?? null,
      };
    },
    destroy() {
      disarmMine(false);
      clock?.destroy();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
};
