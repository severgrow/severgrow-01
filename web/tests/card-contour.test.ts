// Owner, 2026-11-14:
//   "Never do the contour frame when selected - and especially never double."
//   "All different color glows on the cards - can't do a contour around the cards, have to trace
//    the cards exactly and just add the glow, no contour."
//
// A card is a printed card with its own rounded corner (player/cards.ts: 5.9% / 4.2%, 15 of
// 256 x 356 px). Every interactive state must therefore be a GLOW that follows that silhouette,
// never a border or outline, and no one state may stack two edges (a hard line plus a halo, or a
// zero-spread ring inside a blur). Keyboards are the one deliberate exception: cards.ts keeps a
// 2px focus-visible outline because a focus indicator is a different affordance and removing it
// would hurt accessibility; this test only covers the guide/step card states.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INFORMATION_CSS } from '../src/player/information.js';
import { PLAYER_CSS } from '../src/player/player-css.js';
import { SMART_COCKPIT_CSS } from '../src/player/smart-cockpit.js';

const STYLE_CSS = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');

type Rule = { selector: string; body: string };
const rules = (src: string): Rule[] =>
  [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.replace(/\s+/g, ' ').trim(),
    body: match[2]!.replace(/\s+/g, ' ').trim(),
  }));

const SOURCES = [
  ['player-css', PLAYER_CSS],
  ['information', INFORMATION_CSS],
  ['smart-cockpit', SMART_COCKPIT_CSS],
  ['style.css', STYLE_CSS],
] as const;

/** A rule that can paint a hand card while the guide/step machinery is active. */
const handCardInGuideState = (rule: Rule): boolean =>
  rule.selector.includes('.card') && /(#hand|\.hand|data-step|data-guide)/.test(rule.selector);

/** A zero-spread shadow layer: `0 0 0 <n>px <colour>` paints a hard rectangle, not a falloff. */
const hasZeroSpreadLayer = (body: string): boolean => /box-shadow:[^;]*\b0 0 0 (?:[\d.]+px )?/.test(body);

describe('a hand card never wears a contour in any guide/step state', () => {
  it('no guide/step rule draws an outline on a hand card', () => {
    const offenders: string[] = [];
    for (const [name, src] of SOURCES) {
      for (const rule of rules(src)) {
        if (!handCardInGuideState(rule)) continue;
        if (/\boutline:\s*(?!none)/.test(rule.body) || /outline-color:\s*(?!transparent)/.test(rule.body)) {
          offenders.push(`${name}: ${rule.selector} { ${rule.body} }`);
        }
      }
    }
    // Throw used to add `outline: 1.5px solid ...` (player-css) and `outline-color: ... !important`
    // (information) beside the ember glow; both are gone as of 2026-11-14.
    expect(offenders).toEqual([]);
  });

  it('no card glow is a zero-spread ring (the "double" the owner forbids)', () => {
    const offenders: string[] = [];
    for (const [name, src] of SOURCES) {
      for (const rule of rules(src)) {
        if (!rule.selector.includes('.card') || !rule.body.includes('box-shadow')) continue;
        if (hasZeroSpreadLayer(rule.body)) offenders.push(`${name}: ${rule.selector} { ${rule.body} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Throw still lights the hand with an ember glow, just no line', () => {
    const throwRules = SOURCES.flatMap(([name, src]) =>
      rules(src)
        .filter((rule) => /data-step='throw'/.test(rule.selector) && rule.selector.includes('.card'))
        .map((rule) => ({ name, ...rule })),
    );
    expect(throwRules.length).toBeGreaterThan(0);
    const lights = throwRules.filter((rule) => rule.body.includes('box-shadow'));
    expect(lights.length).toBeGreaterThan(0);
    for (const rule of lights) {
      expect(rule.body, `${rule.name}: ${rule.selector}`).toMatch(/box-shadow:[^;]*(?:222, ?110, ?83|190, ?68, ?47)/);
    }
  });
});

describe('the advice and reduced-motion card lights are blurred halos', () => {
  it('the generic coach-glow is a soft outer glow, not a 2px ring', () => {
    const coach = rules(STYLE_CSS).filter((rule) => /\.coach-glow$/.test(rule.selector));
    expect(coach.length).toBeGreaterThan(0);
    for (const rule of coach) {
      expect(hasZeroSpreadLayer(rule.body), rule.body).toBe(false);
      expect(rule.body).toMatch(/box-shadow:[^;]*0 0 (?:12|14)px/);
    }
  });

  it('the coach-advised hand card is a cream halo that excludes the green Grow edge', () => {
    const coachCard = rules(INFORMATION_CSS).filter(
      (rule) => rule.selector.includes('#hand') && rule.selector.includes('.card.coach-glow'),
    );
    expect(coachCard.length).toBeGreaterThan(0);
    for (const rule of coachCard) expect(hasZeroSpreadLayer(rule.body), rule.body).toBe(false);
    // Every Grow-step playable shadow must opt out of a coach card (one card, one glow).
    for (const [name, src] of SOURCES) {
      const growShadows = rules(src).filter(
        (rule) => /data-step='grow'/.test(rule.selector) && rule.selector.includes('.card.playable') && rule.body.includes('box-shadow'),
      );
      for (const rule of growShadows) {
        expect(rule.selector, `${name}: ${rule.selector}`).toContain(':not(.coach-glow)');
        expect(rule.selector, `${name}: ${rule.selector}`).toContain(':not(.futa04-bloom-pick)');
      }
    }
  });

  it('the reduced-motion Fruit card keeps its depth and a blurred suit glow, never a ring', () => {
    const fruit = rules(STYLE_CSS).filter(
      (rule) => rule.selector.includes('.hand .card.fruit.fruit-ready') && rule.body.includes('box-shadow'),
    );
    expect(fruit.length).toBeGreaterThan(0);
    const reduced = fruit.filter((rule) => /0 0 12px 2px/.test(rule.body) || /0 0 10px 1px/.test(rule.body));
    expect(reduced.length).toBeGreaterThanOrEqual(2); // the normal rule and the reduced-motion rule
    for (const rule of fruit) {
      expect(hasZeroSpreadLayer(rule.body), rule.body).toBe(false);
      expect(rule.body, rule.body).toMatch(/color-mix\(in srgb, var\(--suit\)/);
    }
  });
});
