// THE DAILY PUZZLE, on the page (owner, 2026-10-27; design: the "Futasaku Daily Puzzle" doc).
//
// One turn a day, the same for everyone: the position is a real game frozen at the start of my
// Grow step, the opponent never moves, and the goal is checked by the same code the server uses
// (src/daily/core.ts). Three tries; Undo is free inside a try; ending the Grow step ends the try.
// A solve earns ONE Territory tile: PLACE IT takes the player to their Territory, where they grow
// it, and only then BACK TO GAMES. Leaving first keeps the tile waiting ("1 TILE TO PLACE").
//
// This module owns the Daily's words, sheets and record. The game itself is main.ts's: it is
// reached only through `DailyHooks`, so the match code knows nothing about puzzles beyond a flag.
import type { Action, State } from '../../../src/engine/index.js';
import { apply } from '../../../src/engine/index.js';
import type { DailyPuzzle, TurnOutcome } from '../../../src/daily/core.js';
import { goalMet, playTurn } from '../../../src/daily/core.js';
import { TRIES, msToNextPuzzle, puzzleNoOn, shareLine, streakOf } from '../../../src/daily/calendar.js';
import { DAILY_COUNT, DAILY_EPOCH } from '../../../src/daily/schedule.js';
import { DAILY } from '../../../src/strings.js';
import { WORLD_CLAIMED_EVENT } from '../online/world-events.js';
import {
  DAILY_RECORD_KEY,
  dayOf,
  decodeRecord,
  encodeRecord,
  goalLine,
  goalToken,
  hudGoal,
  menuCaption,
  recordPlaced,
  recordTry,
  shortfallLine,
} from './record.js';
import type { DailyRecord } from './record.js';

export type SettleOutcome = 'settled' | 'waiting' | 'refused';

export type DailyHooks = {
  store: { get(key: string): string | null; set(key: string, value: string): void };
  now(): number;
  /** Start one try: the puzzle's position as a fresh, unsaved offline match with no opponent. */
  begin(start: State): void;
  /** Leave puzzle mode (the match screen is being left). */
  end(): void;
  /** Every action played in this try, from the puzzle's start. */
  actions(): readonly Action[];
  /** Plays `actions` from `start` on the board, at the game's own pace (the answer). */
  playAnswer(start: State, actions: readonly Action[]): Promise<void>;
  /** A short word on the LED display. */
  led(text: string): void;
  sheet(id: string | null): void;
  toMenu(): void;
  /** Whether this build has a Territory to grow a tile in. */
  territory(): boolean;
  openTerritory(): void;
  /**
   * Sends the solve to the server (kept in the device's proof queue until it answers) and resolves
   * with what came of it. Without `actions`, it asks again about a solve already queued.
   */
  settle(no: number, actions?: readonly Action[]): Promise<SettleOutcome>;
};

const $ = (id: string) => document.getElementById(id)!;
const diamonds = (filled: number) => '◆'.repeat(filled) + '◇'.repeat(Math.max(0, TRIES - filled));

/** The actions of the turn proper: everything up to and including the move that ended the Grow step. */
const turnPrefix = (start: State, actions: readonly Action[]): Action[] => {
  const out: Action[] = [];
  let s = start;
  for (const a of actions) {
    out.push(a);
    s = apply(s, a);
    if (s.phase !== 'ACT') break;
  }
  return out;
};

export const mountDaily = (hooks: DailyHooks) => {
  let record: DailyRecord = decodeRecord(hooks.store.get(DAILY_RECORD_KEY));
  const save = (next: DailyRecord) => {
    record = next;
    try { hooks.store.set(DAILY_RECORD_KEY, encodeRecord(record)); } catch { /* the day still plays */ }
  };
  /** The puzzle being played, and whether a try is running on the board. */
  let current: DailyPuzzle | null = null;
  let playing = false;
  /** The result sheet must be answered: a tap on the scrim does not dismiss it. */
  let locked = false;
  /** Placing: the Territory strip is up and waiting for a tile to be grown. */
  let placing = false;

  const today = (): number | null => {
    const no = puzzleNoOn(hooks.now(), DAILY_EPOCH);
    return no !== null && no <= DAILY_COUNT ? no : null;
  };
  const streak = () => {
    const no = today();
    return no === null ? 0 : streakOf(record.solved, no);
  };

  const loadPuzzle = async (no: number): Promise<DailyPuzzle | null> => {
    const { dailyPuzzle } = await import('../../../src/daily/puzzles.js');
    return dailyPuzzle(no);
  };

  // ---- the PLAY submenu entry ----------------------------------------------------------------
  const refreshMenu = () => {
    const key = document.getElementById('menu-daily');
    const caption = document.getElementById('daily-readout');
    if (!key || !caption) return;
    const no = today();
    key.hidden = no === null && record.toPlace.length === 0;
    caption.hidden = key.hidden;
    if (key.hidden) return;
    const shown = no ?? record.toPlace[0]!;
    key.textContent = DAILY.key(shown);
    key.setAttribute('aria-label', `${DAILY.key(shown)}, ${menuCaption({ day: dayOf(record, shown), streak: streak(), toPlace: record.toPlace.length })}`);
    caption.textContent = menuCaption({ day: dayOf(record, shown), streak: streak(), toPlace: record.toPlace.length });
  };

  // ---- the sheet -------------------------------------------------------------------------------
  type Button = { label: string; run: () => void; kind?: 'primary' | 'ghost' };
  const paint = (s: { title: string; kicker: string; goal: string; tries: number | null; body: string; buttons: Button[]; lock: boolean }) => {
    $('daily-title').textContent = s.title;
    $('daily-kicker').textContent = s.kicker;
    $('daily-goal').textContent = s.goal;
    const tries = $('daily-tries');
    tries.hidden = s.tries === null;
    if (s.tries !== null) {
      tries.textContent = diamonds(s.tries);
      tries.setAttribute('aria-label', `${s.tries} of ${TRIES} tries used`);
    }
    $('daily-body').textContent = s.body;
    $('daily-body').hidden = !s.body;
    const row = $('daily-actions');
    row.replaceChildren();
    for (const b of s.buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn ${b.kind ?? 'ghost'}`;
      el.textContent = b.label;
      el.addEventListener('click', b.run);
      row.append(el);
    }
    locked = s.lock;
    hooks.sheet('sheet-daily');
    (row.firstElementChild as HTMLElement | null)?.focus();
  };

  const countdown = () => {
    const ms = msToNextPuzzle(hooks.now());
    const m = Math.floor(ms / 60_000);
    return DAILY.nextIn(Math.floor(m / 60), m % 60);
  };

  const share = async (button: HTMLButtonElement, p: DailyPuzzle) => {
    const day = dayOf(record, p.no);
    const text = shareLine({ no: p.no, title: p.title, tries: day.tries, solved: day.solved, streak: streak() });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* dismissed share sheet: fall through to copying */
    }
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = DAILY.copied;
    } catch {
      /* nothing to copy into */
    }
  };
  const shareButton = (p: DailyPuzzle): Button => ({
    label: DAILY.share,
    run: () => {
      const el = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
      if (el) void share(el, p);
    },
  });

  const backToGames: Button = { label: DAILY.backToGames, run: () => leave() };

  // ---- a try -----------------------------------------------------------------------------------
  const startTry = () => {
    if (!current) return;
    const day = dayOf(record, current.no);
    if (day.over) return void showDone(current);
    locked = false;
    hooks.sheet(null);
    playing = true;
    hooks.begin(current.start);
    showHud(current, day.tries);
    hooks.led(day.tries === 0 ? goalToken(current.goal) : DAILY.ledTry(day.tries + 1));
  };

  const showHud = (p: DailyPuzzle, used: number) => {
    const hud = document.getElementById('daily-hud');
    if (!hud) return;
    hud.hidden = false;
    $('daily-hud-no').textContent = DAILY.number(p.no);
    $('daily-hud-goal').textContent = hudGoal(p.goal);
    $('daily-hud-tries').textContent = diamonds(used);
    hud.setAttribute('aria-label', `${DAILY.key(p.no)}. ${goalLine(p.goal)} ${TRIES - used} of ${TRIES} tries left.`);
  };
  const hideHud = () => {
    const hud = document.getElementById('daily-hud');
    if (hud) hud.hidden = true;
  };

  /** The Grow step has ended on the board: was the goal met? */
  const onTurnEnd = () => {
    if (!playing || !current) return;
    playing = false;
    const p = current;
    const actions = turnPrefix(p.start, hooks.actions());
    let outcome: TurnOutcome | null = null;
    try {
      outcome = playTurn(p.start, actions);
    } catch {
      outcome = null;
    }
    const solved = !!outcome && goalMet(p.goal, outcome);
    save(recordTry(record, p.no, solved));
    const day = dayOf(record, p.no);
    showHud(p, day.tries);
    if (solved) {
      hooks.led(DAILY.ledSolved);
      void hooks.settle(p.no, actions).then((r) => { lastSettle = r; });
      return showSolved(p);
    }
    hooks.led(DAILY.ledMiss);
    const miss = outcome ? shortfallLine(p.goal, outcome) : '';
    if (!day.over) {
      return paint({
        title: DAILY.missTitle, kicker: DAILY.key(p.no), goal: goalLine(p.goal), tries: day.tries,
        body: miss, lock: true,
        buttons: [{ label: DAILY.tryAgain, kind: 'primary', run: startTry }, backToGames],
      });
    }
    paint({
      title: DAILY.overTitle, kicker: DAILY.key(p.no), goal: goalLine(p.goal), tries: TRIES,
      body: `${miss} ${countdown()}`.trim(), lock: true,
      buttons: [{ label: DAILY.showAnswer, kind: 'primary', run: () => void showAnswer(p) }, shareButton(p), backToGames],
    });
  };

  let lastSettle: SettleOutcome | null = null;

  const showSolved = (p: DailyPuzzle) => {
    const day = dayOf(record, p.no);
    const owed = record.toPlace.includes(p.no);
    const canPlace = owed && hooks.territory();
    paint({
      title: DAILY.solvedTitle, kicker: `${DAILY.key(p.no)} · ${p.title.toUpperCase()}`, goal: p.note, tries: day.tries,
      body: canPlace ? DAILY.earned : countdown(), lock: true,
      buttons: [
        ...(canPlace ? [{ label: DAILY.placeIt, kind: 'primary' as const, run: () => void placeIt() }] : []),
        shareButton(p),
        ...(canPlace ? [] : [backToGames]),
      ],
    });
  };

  /** Today is over (solved or out of tries): the result again, with the countdown. */
  const showDone = (p: DailyPuzzle) => {
    const day = dayOf(record, p.no);
    if (day.solved) return showSolved(p);
    paint({
      title: DAILY.overTitle, kicker: DAILY.key(p.no), goal: goalLine(p.goal), tries: TRIES,
      body: countdown(), lock: false,
      buttons: [{ label: DAILY.showAnswer, kind: 'primary', run: () => void showAnswer(p) }, shareButton(p), backToGames],
    });
  };

  const showAnswer = async (p: DailyPuzzle) => {
    const { prove } = await import('../../../src/daily/core.js');
    const proof = prove(p);
    if (!proof.ok) return;
    locked = false;
    hooks.sheet(null);
    playing = false;
    hooks.begin(p.start);
    showHud(p, TRIES);
    await hooks.playAnswer(p.start, proof.solution);
    paint({
      title: DAILY.overTitle, kicker: DAILY.key(p.no), goal: p.note, tries: TRIES, body: countdown(), lock: true,
      buttons: [shareButton(p), backToGames],
    });
  };

  // ---- the tile --------------------------------------------------------------------------------
  const placeIt = async () => {
    const no = record.toPlace[0];
    if (no === undefined) return leave();
    // The tile is paid by the server's receipt; ask (again) if it has not answered yet.
    if (lastSettle !== 'settled') lastSettle = await hooks.settle(no);
    if (lastSettle === 'refused') {
      save(recordPlaced(record));
      return paint({ title: DAILY.solvedTitle, kicker: DAILY.key(no), goal: '', tries: null, body: DAILY.refused, lock: false, buttons: [backToGames] });
    }
    if (lastSettle !== 'settled') {
      return paint({ title: DAILY.solvedTitle, kicker: DAILY.key(no), goal: '', tries: null, body: DAILY.waiting, lock: false, buttons: [backToGames] });
    }
    locked = false;
    hooks.sheet(null);
    leaveGame();
    placing = true;
    showPlaceStrip(false);
    hooks.openTerritory();
  };

  const showPlaceStrip = (done: boolean) => {
    const strip = document.getElementById('daily-place');
    if (!strip) return;
    strip.hidden = false;
    strip.classList.toggle('done', done);
    $('daily-place-title').textContent = done ? DAILY.placed : DAILY.placeTitle;
    $('daily-place-line').textContent = done ? '' : DAILY.placeLine;
    $('daily-place-line').hidden = done;
    $('daily-place-back').hidden = !done;
  };
  const hidePlaceStrip = () => {
    const strip = document.getElementById('daily-place');
    if (strip) strip.hidden = true;
  };
  document.addEventListener(WORLD_CLAIMED_EVENT, () => {
    if (!placing) return;
    placing = false;
    save(recordPlaced(record));
    showPlaceStrip(true);
    refreshMenu();
  });
  document.getElementById('daily-place-back')?.addEventListener('click', () => {
    hidePlaceStrip();
    $('online-world-back').click();
  });
  // Leaving the Territory any other way keeps the tile waiting: the strip simply goes.
  document.getElementById('online-world-back')?.addEventListener('click', () => {
    placing = false;
    hidePlaceStrip();
  });

  // ---- entering and leaving --------------------------------------------------------------------
  const leaveGame = () => {
    playing = false;
    hideHud();
    hooks.end();
  };
  const leave = () => {
    locked = false;
    hooks.sheet(null);
    leaveGame();
    current = null;
    hooks.toMenu();
    refreshMenu();
  };

  /** The PLAY submenu's DAILY key. */
  const open = async () => {
    // A tile still waiting comes first: it is the one thing the player owes the Territory.
    const no = today();
    if (record.toPlace.length && hooks.territory() && (no === null || dayOf(record, no).over)) {
      lastSettle = null;
      return void placeIt();
    }
    if (no === null) return;
    const p = await loadPuzzle(no);
    if (!p) return;
    current = p;
    const day = dayOf(record, no);
    if (day.over) {
      hooks.begin(p.start);
      showHud(p, day.tries);
      return showDone(p);
    }
    hooks.begin(p.start);
    showHud(p, day.tries);
    hooks.led(goalToken(p.goal));
    paint({
      title: DAILY.key(p.no), kicker: p.title.toUpperCase(), goal: goalLine(p.goal), tries: day.tries,
      body: DAILY.rules, lock: true,
      buttons: [{ label: day.tries ? DAILY.ledTry(day.tries + 1) : DAILY.start, kind: 'primary', run: startTry }, backToGames],
    });
  };

  // A result sheet has to be answered with one of its keys: the scrim does not close it.
  document.addEventListener('click', (e) => {
    if (locked && (e.target as Element | null)?.id === 'scrim') e.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (locked && e.key === 'Escape') e.stopImmediatePropagation();
  }, true);

  document.getElementById('menu-daily')?.addEventListener('click', () => void open());
  refreshMenu();

  return {
    refreshMenu,
    onTurnEnd,
    /** The match screen was left another way (the pause menu): puzzle mode ends with it. */
    left: () => {
      if (!current) return;
      playing = false;
      locked = false;
      current = null;
      hideHud();
      refreshMenu();
    },
  };
};

export type DailyController = ReturnType<typeof mountDaily>;
