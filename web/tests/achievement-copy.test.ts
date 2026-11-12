// ACHIEVEMENT COPY — the owner's rules for the surface (2026-10-30): "keep it clean lean and
// elegant", no intro/reward teaser, and names in the game's own voice rather than generic trophies.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../server/src/seeds/achievements.js';
import { ACHIEVEMENT_COPY, ACHIEVEMENT_GROUP_TITLES, ACHIEVEMENTS_UI } from '../src/online/achievement-copy.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = (path: string): string => readFileSync(`${root}${path}`, 'utf8');
const BANNED = /\b(champion|legend|master|elite)\b/i;

describe('the copy', () => {
  it('names every achievement exactly once', () => {
    expect(Object.keys(ACHIEVEMENT_COPY).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    expect(Object.keys(ACHIEVEMENT_GROUP_TITLES).sort()).toEqual(['campaign', 'company', 'craft', 'duels', 'territory']);
  });

  it('is one sentence each, with no exclamation and no generic trophy word', () => {
    for (const achievement of ACHIEVEMENTS) {
      const copy = ACHIEVEMENT_COPY[achievement.id];
      expect(copy.title.trim()).not.toBe('');
      expect(copy.detail.trim()).not.toBe('');
      for (const line of [copy.title, copy.detail]) {
        expect(line).not.toContain('!');
        expect(line).not.toMatch(BANNED);
        // One sentence: no internal sentence break and no trailing full stop. Commas and the
        // game's own terms (Bloom, cut, throw pile) are allowed.
        expect(line).not.toMatch(/[.!?]/);
      }
    }
  });

  it('keeps the surface lean: no intro, no reward teaser', () => {
    expect('intro' in ACHIEVEMENTS_UI).toBe(false);
    expect('reward' in ACHIEVEMENTS_UI).toBe(false);
    expect(JSON.stringify(ACHIEVEMENTS_UI)).not.toMatch(/seeds for your first/i);
    const page = text('/web/index.html');
    expect(page).not.toContain('world-achievements-intro');
    expect(page).not.toMatch(/seeds for your first/i);
  });

  it('does not reference the Daily module', () => {
    for (const path of ['/server/src/seeds/achievements.ts', '/web/src/online/achievement-copy.ts']) {
      expect(text(path)).not.toMatch(/\bdaily\b|\binquest\b/i);
      expect(text(path)).not.toContain('src/daily');
    }
  });
});
