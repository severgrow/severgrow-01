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
