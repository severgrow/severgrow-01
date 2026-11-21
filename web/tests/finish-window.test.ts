import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANET_TILE_PRICE, finishWindowFor, parseBalance } from '../src/logic/finish-window.js';
import { SEED_ECONOMY } from '../../server/src/seeds/config.js';

describe('the finish card shows the planet only when the player can grow there (owner, 2026-11-12)', () => {
  it('a win with a tile\'s price in the wallet shows the planet', () => {
    expect(finishWindowFor({ won: true, balance: 100, hasBoard: true })).toBe('planet');
    expect(finishWindowFor({ won: true, balance: 2400, hasBoard: true })).toBe('planet');
  });

  it('a loss, a draw, a win short of the price, or an unknown wallet shows the final board', () => {
    expect(finishWindowFor({ won: false, balance: 5000, hasBoard: true })).toBe('board');
    expect(finishWindowFor({ won: true, balance: 99, hasBoard: true })).toBe('board');
    expect(finishWindowFor({ won: true, balance: null, hasBoard: true })).toBe('board');
  });

  it('level 10 teaches the planet: its win always shows it, whatever the wallet says', () => {
    expect(finishWindowFor({ won: true, teach: true, balance: null, hasBoard: true })).toBe('planet');
    expect(finishWindowFor({ won: true, teach: true, balance: 0, hasBoard: true })).toBe('planet');
    expect(finishWindowFor({ won: false, teach: true, balance: 500, hasBoard: true })).toBe('board');
  });

  it('a loss or a draw NEVER shows the planet, even with no final board figure (owner, 2026-11-12)', () => {
    expect(finishWindowFor({ won: false, balance: 0, hasBoard: false })).toBe('board');
    expect(finishWindowFor({ won: false, balance: 5000, hasBoard: false })).toBe('board');
    expect(finishWindowFor({ won: false, balance: 5000, hasBoard: true, teach: true })).toBe('board');
  });

  it('a win with no final board figure keeps the planet only with a tile\'s price', () => {
    expect(finishWindowFor({ won: true, balance: 100, hasBoard: false })).toBe('planet');
    expect(finishWindowFor({ won: true, balance: 99, hasBoard: false })).toBe('board');
  });

  it('the price is the economy\'s tile cost', () => {
    expect(PLANET_TILE_PRICE).toBe(SEED_ECONOMY.tileCost);
  });

  it('reads a remembered balance safely', () => {
    expect(parseBalance(null)).toBeNull();
    expect(parseBalance('')).toBeNull();
    expect(parseBalance('abc')).toBeNull();
    expect(parseBalance('-4')).toBeNull();
    expect(parseBalance('120')).toBe(120);
  });

  it('the card chooses its window through it, and the board window is in the page', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    // Through the pure rule: finishWindowPlan (known at once) or decideFinishWindow (-> finishWindowFor).
    expect(main).toMatch(/finishWindowPlan\(/);
    expect(main).toMatch(/decideFinishWindow\(/);
    expect(html).toMatch(/id="go-boardview"/);
    expect(html).toMatch(/id="go-boardview-board"/);
  });
});

// ONE WINDOW, CHOSEN ONCE (owner, 2026-11-13: "make sure it's not like both the planet view and board
// view load up - only the correct one should show up ... if needs loading, do 1s fade in"). A loss
// or a draw knows its window at once (the board). A win waits for the balance AFTER this game's
// payout (the settled proof, or a fresh wallet read), at most FINISH_DECIDE_MS, then shows the one
// right window with a 1 s fade. It never switches afterwards.
import { FINISH_DECIDE_MS, FINISH_FADE_MS, finishWindowPlan } from '../src/logic/finish-window.js';

describe('the finish window is chosen once', () => {
  it('a loss or a draw shows the board at once; the teaching win shows the planet at once', () => {
    expect(finishWindowPlan({ won: false, hasBoard: true })).toEqual({ kind: 'now', view: 'board' });
    expect(finishWindowPlan({ won: true, teach: true, hasBoard: true })).toEqual({ kind: 'now', view: 'planet' });
  });

  it('any other win waits for the balance after its payout', () => {
    expect(finishWindowPlan({ won: true, hasBoard: true })).toEqual({ kind: 'wait' });
  });

  it('the wait is bounded and the fade is one second', () => {
    expect(FINISH_DECIDE_MS).toBeLessThanOrEqual(4_000);
    expect(FINISH_FADE_MS).toBe(1_000);
  });

  it('main.ts never re-chooses a decided window, and the wallet is read ahead during the last turns', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/function refreshFinishWindow/);
    expect(main).toMatch(/if \(!w \|\| w\.decided\) return;/);
    expect(main).toMatch(/prefetchFinishBalance\(\)/);
  });
});

import { decideFinishWindow, FINISH_INSTANT_MS } from '../src/logic/finish-window.js';

// The owner's checklist (2026-11-13): fresh guest, signed-in, account switch, offline/failed
// connection, win/loss/draw, exactly 100 Seeds, and a payout crossing from below to above 100.
describe('the finish window decision, case by case', () => {
  const win = { won: true, hasBoard: true };
  it('a payout that crosses from below 100 to above shows the planet', () => {
    expect(decideFinishWindow({ ...win, payout: 120, remembered: 90 })).toBe('planet');
  });
  it('exactly 100 Seeds shows the planet; 99 shows the board', () => {
    expect(decideFinishWindow({ ...win, payout: 100, remembered: null })).toBe('planet');
    expect(decideFinishWindow({ ...win, payout: 99, remembered: 500 })).toBe('board');
  });
  it('offline or a failed settle uses the last balance this device saw', () => {
    expect(decideFinishWindow({ ...win, payout: null, remembered: 140 })).toBe('planet');
    expect(decideFinishWindow({ ...win, payout: null, remembered: 40 })).toBe('board');
  });
  it('a fresh guest (no balance known anywhere) shows the board', () => {
    expect(decideFinishWindow({ ...win, payout: null, remembered: null })).toBe('board');
  });
  it('a loss or a draw shows the board whatever the wallet; level 10 teaches the planet on a win', () => {
    expect(decideFinishWindow({ won: false, hasBoard: true, payout: 900, remembered: 900 })).toBe('board');
    expect(decideFinishWindow({ won: true, teach: true, hasBoard: true, payout: null, remembered: null })).toBe('planet');
  });
  it('a ready window is instant (no fade); account changes clear the remembered balance', () => {
    expect(FINISH_INSTANT_MS).toBeLessThanOrEqual(200);
    const reset = readFileSync(new URL('../src/accounts/signout-reset.ts', import.meta.url), 'utf8');
    expect(reset).toContain("'severgrow.seeds.balance.v1'");
  });
});

// NO THREE PLANETS IN A ROW (owner, 2026-11-20: "never show the planet view and the end of the game 3
// times in a row ... if player keeps winning, show the winning board view result every 2 planet views
// to alternate"). The reading chosen is PLANET, PLANET, BOARD, PLANET, PLANET, BOARD ... — two planet
// views, then the winning board — because the owner's first clause forbids three in a row and his
// second names the board as what follows TWO planet views. The run is persisted per player by main.ts
// (FINISH_PLANET_RUN_KEY); the rule and its store helpers here stay pure.
import {
  FINISH_PLANET_RUN_KEY,
  PLANET_RUN_CYCLE,
  PLANET_RUN_PLANETS,
  decidePlanetRunAfter,
  finishChoice,
  normalizePlanetRun,
  planetRunOf,
  withPlanetRun,
} from '../src/logic/finish-window.js';

/** Play `n` consecutive QUALIFYING wins from an initial run; the views and the final run. */
const qualifyingWins = (start: number, n: number, balance = 150) => {
  let planetRun = start;
  const views: string[] = [];
  for (let i = 0; i < n; i++) {
    const choice = finishChoice({ won: true, balance, hasBoard: true, planetRun });
    views.push(choice.view);
    planetRun = choice.planetRun;
  }
  return { views, planetRun };
};

describe('no three planet views in a row (owner, 2026-11-20)', () => {
  it('is the cycle PLANET, PLANET, BOARD, from every starting run', () => {
    expect(qualifyingWins(0, 7).views).toEqual(['planet', 'planet', 'board', 'planet', 'planet', 'board', 'planet']);
    expect(qualifyingWins(1, 6).views).toEqual(['planet', 'board', 'planet', 'planet', 'board', 'planet']);
    expect(qualifyingWins(2, 5).views).toEqual(['board', 'planet', 'planet', 'board', 'planet']);
  });

  it('never shows three planets in a row, however long the winning run is', () => {
    for (let start = 0; start < PLANET_RUN_CYCLE; start++) {
      const { views } = qualifyingWins(start, 31);
      for (let i = 2; i < views.length; i++) {
        expect(views.slice(i - 2, i + 1)).not.toEqual(['planet', 'planet', 'planet']);
      }
      // ... and the board is only ever the third after two planets, so the run is never starved.
      expect(views.filter((v) => v === 'planet').length).toBeGreaterThan(views.filter((v) => v === 'board').length);
    }
  });

  it('keeps the count inside the cycle (it never grows without bound)', () => {
    for (let start = 0; start < PLANET_RUN_CYCLE; start++) {
      let run = start;
      for (let i = 0; i < 50; i++) {
        run = finishChoice({ won: true, balance: 150, hasBoard: true, planetRun: run }).planetRun;
        expect(run).toBeGreaterThanOrEqual(0);
        expect(run).toBeLessThan(PLANET_RUN_CYCLE);
      }
    }
    expect(PLANET_RUN_PLANETS).toBe(2);
    expect(PLANET_RUN_CYCLE).toBe(PLANET_RUN_PLANETS + 1);
    expect(normalizePlanetRun(PLANET_RUN_CYCLE)).toBe(0);
    expect(normalizePlanetRun(-1)).toBe(0);
    expect(normalizePlanetRun(1.5)).toBe(0);
    expect(normalizePlanetRun(Number.NaN)).toBe(0);
  });

  it('a loss or a draw shows the board and starts the winning run over', () => {
    expect(finishChoice({ won: false, balance: 5_000, hasBoard: true, planetRun: 2 })).toEqual({ view: 'board', planetRun: 0 });
    expect(finishChoice({ won: false, balance: null, hasBoard: false, planetRun: 1 })).toEqual({ view: 'board', planetRun: 0 });
    // A loss with the teaching flag is still a loss: the board, and the run is over.
    expect(finishChoice({ won: false, teach: true, balance: 500, hasBoard: true, planetRun: 1 })).toEqual({ view: 'board', planetRun: 0 });
  });

  it('level 10\'s teaching win always shows the planet and never consumes a slot', () => {
    // Even on the last slot of the cycle: the teaching window is an explained exception, not boredom.
    expect(finishChoice({ won: true, teach: true, balance: null, hasBoard: true, planetRun: 2 })).toEqual({ view: 'planet', planetRun: 2 });
    expect(finishChoice({ won: true, teach: true, balance: 0, hasBoard: true, planetRun: 1 })).toEqual({ view: 'planet', planetRun: 1 });
    // And because it spent no slot, the next real win still alternates as if it never happened.
    expect(qualifyingWins(2, 2).views).toEqual(['board', 'planet']);
  });

  it('a win that cannot afford a tile shows the board and spends no slot', () => {
    expect(finishChoice({ won: true, balance: 99, hasBoard: true, planetRun: 1 })).toEqual({ view: 'board', planetRun: 1 });
    expect(finishChoice({ won: true, balance: null, hasBoard: true, planetRun: 2 })).toEqual({ view: 'board', planetRun: 2 });
    // The planet that was due is still due on the next affordable win.
    expect(finishChoice({ won: true, balance: 100, hasBoard: true, planetRun: 1 })).toEqual({ view: 'planet', planetRun: 2 });
    expect(finishChoice({ won: true, balance: 100, hasBoard: true, planetRun: 2 })).toEqual({ view: 'board', planetRun: 0 });
  });

  it('the decided window and the run it records come from the same rule', () => {
    const win = { won: true, hasBoard: true } as const;
    for (let planetRun = 0; planetRun < PLANET_RUN_CYCLE; planetRun++) {
      const args = { ...win, payout: 120, remembered: 90, planetRun };
      const expected = finishChoice({ won: true, balance: 120, hasBoard: true, planetRun });
      expect(decideFinishWindow(args)).toBe(expected.view);
      expect(decidePlanetRunAfter(args)).toBe(expected.planetRun);
    }
    // A loss is the board and a fresh run, whatever the wallet and the run were.
    expect(decidePlanetRunAfter({ won: false, hasBoard: true, payout: 900, remembered: 900, planetRun: 2 })).toBe(0);
    expect(decidePlanetRunAfter({ won: true, teach: true, hasBoard: true, payout: null, remembered: null, planetRun: 2 })).toBe(2);
  });

  it('keeps the run in the store, per player, and reads a damaged value as 0', () => {
    // The key is a `severgrow.*` key: the channel's storage prefix is applied below the app.
    expect(FINISH_PLANET_RUN_KEY).toBe('severgrow.finish.planet-run.v1');
    const saved = withPlanetRun(null, 'player-a', 1);
    expect(planetRunOf(saved, 'player-a')).toBe(1);
    // Another account on this device never inherits it.
    expect(planetRunOf(saved, 'player-b')).toBe(0);
    expect(planetRunOf(saved, null)).toBe(0);
    expect(planetRunOf(withPlanetRun(saved, 'player-a', 2), 'player-a')).toBe(2);
    // 0 removes the entry (bounded storage: nothing to prune, and absence reads as 0).
    const cleared = withPlanetRun(saved, 'player-a', 0);
    expect(JSON.parse(cleared).players['player-a']).toBeUndefined();
    expect(planetRunOf(cleared, 'player-a')).toBe(0);
    // A reload reads back what was written (the same string is the whole store).
    expect(planetRunOf(JSON.parse(JSON.stringify(cleared)), 'player-a')).toBe(0);
    // Corrupt, absent or out-of-cycle values fall back to 0, never to a stuck planet/board.
    for (const bad of [null, '', 'nonsense', '{}', '[]', '{"v":2,"players":{"player-a":1}}',
      '{"v":1,"players":{"player-a":9}}', '{"v":1,"players":{"player-a":-1}}', '{"v":1,"players":[]}']) {
      expect(planetRunOf(bad, 'player-a')).toBe(0);
    }
  });

  it('main.ts reads and writes the run through these helpers, and sign-out clears it', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/planetRunOf\(store\.get\(FINISH_PLANET_RUN_KEY\)/);
    expect(main).toMatch(/withPlanetRun\(store\.get\(FINISH_PLANET_RUN_KEY\)/);
    expect(main).toMatch(/decidePlanetRunAfter\(args\)/);
    const reset = readFileSync(new URL('../src/accounts/signout-reset.ts', import.meta.url), 'utf8');
    expect(reset).toContain("'severgrow.finish.planet-run.v1'");
  });
});
