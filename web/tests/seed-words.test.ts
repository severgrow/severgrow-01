// Seed mode is gone. The player never sees the whole words "seed", "seeds", "seeded", "plant"
// or "planted": not in the strings file, the page's HTML (text, aria-labels, alt and title
// text), nor any message built while real games are played. The game's random number (the
// "seed" of the deal) shows only on the hidden ?debug=1 page: that page is the one allowlisted
// place. (The browser test scans the live page in every state too: web/e2e/smoke.ts.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as STRINGS from '../../src/strings.js';
import { SPROUT } from '../../src/strings.js';
import { DEBUG_ALLOWLIST, debugLines, isDebug } from '../src/logic/debug.js';
import { playerMessages } from './player-text.js';

const SEED = /\b(?:seeds?|seeded|plant|planted)\b/i;
const clean = (t: string) => !SEED.test(t);

/** Every string reachable from a value: strings, arrays, objects, and functions called with samples. */
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    try {
      strings(v('a 9', 'D4', 'combo'), out);
    } catch {
      /* not a text builder */
    }
  } else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

describe('the words "seed" and "plant" never reach the player', () => {
  it('the pattern matches whole words only', () => {
    for (const bad of ['seed', 'Seeds', 'SEEDED', 'plant', 'Planted', 'Plant a seed']) expect(clean(bad), bad).toBe(false);
    for (const ok of ['seedling', 'plants', 'planting', 'Sprout', 'implanted']) expect(clean(ok), ok).toBe(true);
  });

  it('one name for the one-card move: "Sprout", in one constant', () => {
    expect(SPROUT.Name).toBe('Sprout');
    expect(SPROUT.pick).toBe('Pick a card to sprout');
    expect(SPROUT.skip).toBe('Skip sprout');
    expect(SPROUT.suggest('D4', 'a 9')).toMatch(/^Sprout one tile/);
  });

  it('the strings file', () => {
    const all = strings(STRINGS);
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((t) => !clean(t))).toEqual([]);
  });

  it("the page's HTML: visible text, aria-labels, alt and title text, the description", () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' ');
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]!);
    expect([text, ...attrs].filter((t) => !clean(t)).map((t) => t.match(SEED)![0])).toEqual([]);
  });

  it('every message built while real games are played', () => {
    expect(playerMessages().filter((t) => !clean(t))).toEqual([]);
  });

  it('the ?debug=1 page is the only place the seed shows, and only when asked for', () => {
    expect(isDebug('')).toBe(false);
    expect(isDebug('?seed=5')).toBe(false);
    expect(isDebug('?debug=0')).toBe(false);
    expect(isDebug('?debug=1')).toBe(true);
    expect(isDebug('?seed=5&debug=1')).toBe(true);
    const lines = debugLines({ seed: 1234, turnNumber: 7, level: 5 });
    expect(lines.join(' ')).toContain('1234');
    expect(lines.some((l) => !clean(l))).toBe(true); // it may say "seed": it is allowlisted
    expect(DEBUG_ALLOWLIST).toEqual(['?debug=1 page']);
  });
});
