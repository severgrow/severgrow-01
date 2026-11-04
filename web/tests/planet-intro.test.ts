// THE PLANET'S lesson window over the won level 10 card (owner, 2026-11-04: "at the end of the level
// 10, over the end of game screen there should be a lesson window popped up explaining THE PLANET ...
// and a button that takes you to the planet").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLANET_INTRO } from '../src/online/seed-icon.js';
import { PLANET_INTRO_DELAY_MS } from '../src/player/planet-intro.js';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const intro = read('../src/player/planet-intro.ts');

describe('the Planet introduces itself after the last lesson', () => {
  it('says what it is, what Seeds do there and why land matters, in three short lines', () => {
    expect(PLANET_INTRO.title).toBe('THE PLANET');
    expect(PLANET_INTRO.lines).toHaveLength(3);
    expect(PLANET_INTRO.lines.join(' ')).toMatch(/season/);
    expect(PLANET_INTRO.lines.join(' ')).toMatch(/Seeds/);
    expect(PLANET_INTRO.lines.join(' ')).toMatch(/prizes/);
    for (const line of PLANET_INTRO.lines) expect(line.length).toBeLessThanOrEqual(60);
    expect(PLANET_INTRO.open).toBe('Open The Planet');
    expect(PLANET_INTRO.later).toBe('Later');
  });

  it('opens only over a WON level 10, only where the Territory is THE PLANET, once per game', () => {
    expect(main).toMatch(/const planetWindow = territoryIntro && FEATURES\.planet;/);
    expect(main).toMatch(/if \(planetWindow && !planetIntroAsked\) \{ planetIntroAsked = true; planetIntroOf\(\)\.show\(\); \}/);
    // A new game may ask again; the card's own repaint may not.
    expect(main).toMatch(/goCounted = false;\n  planetIntroAsked = false;/);
  });

  it('Open goes to the Planet the way the card key does; the card keeps its key after Later', () => {
    expect(main).toMatch(/onOpen: \(\) => \{\n      hideGameOver\(\);\n      showScreen\('menu'\);\n      onlineLobbyCtl\?\.openWorld\('menu'\);/);
    expect(main).toMatch(/\$\('go-territory-open'\)\.hidden = !territoryIntro;/);
    expect(main).toMatch(/\$\('go-territory'\)\.hidden = !territoryIntro \|\| planetWindow;/);
  });

  it('lives inside the finish dialog, takes focus, closes on Escape, and is gone with the card', () => {
    expect(intro).toMatch(/host\.append\(root\)/);
    expect(intro).toMatch(/openKey\.focus\(/);
    expect(intro).toMatch(/e\.key === 'Escape'/);
    expect(main).toMatch(/function hideGameOver\(\): void \{\n  planetIntro\?\.hide\(\);/);
    expect(PLANET_INTRO_DELAY_MS).toBeGreaterThan(0);
    expect(PLANET_INTRO_DELAY_MS).toBeLessThanOrEqual(1200);
    // No loop: the shared finite surface motion only.
    expect(intro).not.toMatch(/requestAnimationFrame|setInterval/);
  });
});
