// The Seed A/B test on the page: every word the player reads comes from the active ruleset.
// In the Seed version the word "sprout" never appears; in the Sprout version every message is
// exactly what it was before. Written before the code.
import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { RULESETS, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Event, Player, RulesConfig } from '../../src/engine/index.js';
import { GAME_TITLE, MOVE_WORDS, moveWords, versionLabel } from '../../src/strings.js';
import { TIP_ORDER, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import { moveSentence } from '../../src/playtest/names.js';
import { describe } from '../src/logic/log.js';
import { buildSteps, captionFor } from '../src/logic/anim.js';
import { gameHighlights } from '../src/logic/highlights.js';
import { previewMove } from '../src/logic/preview.js';
import { tipText } from '../src/logic/tips.js';
import { playGame } from './ui-helpers.js';

const SPROUT = /sprout/i;

/** Every message the game builds while three real games are played under `config`. */
const messages = (config: Partial<RulesConfig>): string[] => {
  const seen = new Set<string>();
  const add = (t: string | null | undefined) => {
    if (t) seen.add(t);
  };
  for (const seed of [3, 11, 27]) {
    let i = 0;
    let history: readonly Event[] = [];
    playGame(
      seed,
      ({ before, action, after }) => {
        i++;
        for (const me of [0, 1] as Player[]) {
          add(describe(before, action, after, me));
          for (const st of buildSteps(before, action, after, me)) add(captionFor(st, me));
        }
        if (after.phase === 'ACT' && i % 3 === 0) {
          const v = viewFor(after, after.actor);
          for (const a of legalActions(v).slice(0, 20)) {
            add(moveSentence(v, a));
            const pv = previewMove(v, a);
            add(pv?.chip);
            add(pv?.warning);
            add(pv?.note);
          }
          for (let step = 0; step < 15; step += 3) {
            const adv = coachAdvice({ view: v, step, enabled: true, taught: [], known: [] });
            if (adv) {
              for (const t of Object.values(adv).flat()) if (typeof t === 'string') add(t);
              add(adv.tip?.text);
            }
          }
        }
        history = after.history ?? history;
      },
      5000,
      config,
    );
    for (const me of [0, 1] as Player[]) for (const h of gameHighlights(history, me)) add(h.text);
  }
  const cfg = newGame(1, config).config;
  const s = coachSummary(TIP_ORDER, cfg);
  add(s.title);
  s.bullets.forEach(add);
  add(tipText('strengthen', cfg));
  return [...seen];
};

group('the version names and the words for the one-card move', () => {
  it('the game is called SEVEROR; the versions are "Sprout version" and "Seed version"', () => {
    expect(GAME_TITLE).toBe('Severor');
    expect(versionLabel(newGame(1).config)).toBe('Sprout version');
    expect(versionLabel(newGame(1, RULESETS.sprout).config)).toBe('Sprout version');
    expect(versionLabel(newGame(1, RULESETS.seed).config)).toBe('Seed version');
  });

  it('the page shows the new name (static HTML and the app manifest) and offers both versions', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain(`<title>${GAME_TITLE}</title>`);
    expect(html).toContain(`>${GAME_TITLE}</h1>`);
    expect(html.replace(/<script[\s\S]*?<\/script>/g, '')).not.toMatch(/Severgrow/);
    expect(html).toContain('id="menu-sprout"');
    expect(html).toContain('>Sprout version<');
    expect(html).toContain('id="menu-seed"');
    expect(html).toContain('>Seed version<');
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')) as { name: string; short_name: string };
    expect([manifest.name, manifest.short_name]).toEqual([GAME_TITLE, GAME_TITLE]);
  });

  it('Sprout keeps its exact old words', () => {
    const w = moveWords(newGame(1).config);
    expect(w).toBe(MOVE_WORDS.sprout);
    expect(w.youDid('C4')).toBe('You sprouted one tile at C4');
    expect(w.pick).toBe('Pick a card to sprout');
    expect(w.skip).toBe('Skip sprout');
    expect(w.suggest('C4', 'Moss 7')).toBe('Sprout one tile at C4 with the Moss 7');
  });

  it('no Seed word or sentence says "sprout"', () => {
    const w = MOVE_WORDS.seed;
    for (const [k, v] of Object.entries(w)) {
      const text = typeof v === 'function' ? (v as (...a: string[]) => string)('C4', 'Moss 7') : String(v);
      expect(SPROUT.test(text), `${k}: ${text}`).toBe(false);
    }
    expect(w.youDid('C4')).toBe('You planted a seed at C4');
    expect(w.Name).toBe('Seed');
  });

  it('the Strengthen tip names the right move', () => {
    expect(tipText('strengthen', newGame(1).config)).toContain('It uses your sprout for the turn');
    expect(tipText('strengthen', newGame(1, RULESETS.seed).config)).toContain('It uses your seed for the turn');
  });
});

group('every message in real games', () => {
  it('Seed games: the word "sprout" never reaches the player, and seeds are named', () => {
    const all = messages(RULESETS.seed);
    expect(all.length).toBeGreaterThan(150);
    expect(all.filter((t) => SPROUT.test(t))).toEqual([]);
    expect(all.some((t) => /seed/i.test(t))).toBe(true);
  });

  it('Sprout games: still say "sprout" as before, never "seed"', () => {
    const all = messages({});
    expect(all.some((t) => /You sprouted one tile at/.test(t))).toBe(true);
    expect(all.filter((t) => /\bseeds?\b/i.test(t))).toEqual([]);
  });
});
