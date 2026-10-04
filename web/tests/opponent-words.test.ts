// UI polish pass 3, Part 3: the player never sees the word "bot". Everything the page says
// about the other side comes from OPPONENT_LABEL (src/strings.ts). This test scans the
// strings file, the page's HTML (text, aria-labels, alt and title text, the description),
// and every message the game builds while real games are played: the move log, the board
// captions, the highlights, move descriptions, warnings, previews, the coach and the tips.
// (The browser test also scans the live page in every state: web/e2e/smoke.ts.)
import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { OPP, OPPONENT_LABEL } from '../../src/strings.js';
import { COACH_STEPS } from '../../src/playtest/coach.js';
import { playerMessages } from './player-text.js';

/** The one rule: no whole word "bot" or "bots", in any case. */
const BOT = /\bbots?\b/i;
/** Intentional exceptions (none so far). */
export const ALLOWLIST: readonly string[] = [];
const clean = (text: string) => !BOT.test(text) || ALLOWLIST.some((a) => text.includes(a));

group('the word "bot" never reaches the player', () => {
  it('the strings file: one label, every phrase built from it, none says "bot"', () => {
    expect(OPPONENT_LABEL).toBe('Opponent');
    for (const [k, v] of Object.entries(OPP)) {
      expect(clean(v), k).toBe(true);
      expect(v.toLowerCase(), k).toContain(OPPONENT_LABEL.toLowerCase());
    }
  });

  it("the page's HTML: visible text, aria-labels, alt and title text, the description", () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]*>/g, ' ');
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]!);
    for (const t of [text, ...attrs]) expect(clean(t), t.slice(0, 80)).toBe(true);
    // the HTML uses the same words as OPPONENT_LABEL (static text cannot import it)
    expect(html).toContain(`>${OPP.label}<`);
    expect(html).toContain(`${OPP.label} score`);
  });

  it('every message built while real games are played (log, captions, highlights, moves, warnings, previews, coach)', () => {
    const seen = playerMessages();
    expect(COACH_STEPS).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(200);
    const bad = seen.filter((t) => !clean(t));
    expect(bad).toEqual([]);
    // and the other side is named in plenty of them
    expect(seen.filter((t) => t.includes(OPP.noun) || t.includes(OPP.label)).length).toBeGreaterThan(20);
  });
});
