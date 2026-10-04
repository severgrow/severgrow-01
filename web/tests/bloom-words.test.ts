// v0.7 wording: the player never reads the old combo words ("clump", "hypha", "grow a line",
// "line of") nor the generic "root"/"roots" (it is "home", "your tree", "opponent's volcano").
// Scanned: the strings file, the page's HTML (text, aria-labels, alt, title), and every message
// built while real games are played. The browser test scans the live page in every state too
// (web/e2e/smoke.ts). "Numbers in a row" is fine. No allowlist.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as STRINGS from '../../src/strings.js';
import { BLOOM, HOME } from '../../src/strings.js';
import { kindLabel } from '../src/logic/interaction.js';
import { TIPS } from '../src/logic/tips.js';
import { playerMessages } from './player-text.js';

export const OLD_WORDS = /\b(?:clumps?|hyphae?|grow a line|line of|roots?)\b/i;
const clean = (t: string) => !OLD_WORDS.test(t);

const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    try {
      strings(v(3, 'D4', 'combo'), out);
    } catch {
      /* not a text builder */
    }
  } else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

describe('Bloom and home wording', () => {
  it('the pattern: whole words, case-insensitive; "numbers in a row" is allowed', () => {
    for (const bad of ['Clump', 'a hypha', 'Grow a line of 3', 'line of 4', 'ROOT', 'roots']) expect(clean(bad), bad).toBe(false);
    for (const ok of ['Numbers in a row', 'rooted', 'Bloom 3 tiles', 'outline', 'online']) expect(clean(ok), ok).toBe(true);
  });
  it('the Bloom button and the home names come from one strings constant each', () => {
    expect(BLOOM.button(3)).toBe('Bloom 3 tiles');
    expect(BLOOM.button(4)).toBe('Bloom 4 tiles');
    expect(BLOOM.buttonKeep(3, 1)).toBe('Bloom 3 tiles, keep the other');
    expect(kindLabel('bloom-4-1.2.3.4')).toBe('Bloom 4 tiles');
    expect(HOME.mine).toBe('Your tree');
    expect(HOME.theirs).toBe("Opponent's volcano");
    expect(HOME.tapTheirs(3)).toBe('Surround all 6 sides to win at once. 3 of 6 sides blocked.');
    expect(BLOOM.howto).toContain('can <b>bloom</b>');
    expect(BLOOM.hint).toBe('You can bloom with cards that match or follow on.');
  });
  it('the strings file and the tips', () => {
    const all = [...strings(STRINGS), ...strings(TIPS)];
    expect(all.filter((t) => !clean(t))).toEqual([]);
  });
  it("the page's HTML: visible text, aria-labels, alt and title text, the description", () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' ');
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]!);
    expect([text, ...attrs].filter((t) => !clean(t)).map((t) => t.match(OLD_WORDS)![0])).toEqual([]);
  });
  it('every message built while real games are played', () => {
    expect(playerMessages().filter((t) => !clean(t))).toEqual([]);
  });
});
