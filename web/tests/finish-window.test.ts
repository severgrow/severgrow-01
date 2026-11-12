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

  it('with no final board to show, the card keeps the planet as before', () => {
    expect(finishWindowFor({ won: false, balance: 0, hasBoard: false })).toBe('planet');
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
    expect(main).toMatch(/finishWindowFor\(/);
    expect(html).toMatch(/id="go-boardview"/);
    expect(html).toMatch(/id="go-boardview-board"/);
  });
});
