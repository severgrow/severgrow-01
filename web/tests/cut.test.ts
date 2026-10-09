// UI overhaul Part 2: the cinematic cut. Every limit in the brief, checked on the pure plan.
import { describe, expect, it } from 'vitest';
import { CUT_CAP_MS, CUT_TIERS, FLASH_MAX_ALPHA, FLASH_MAX_MS, HITSTOP_MS, RIPPLE_CAP_MS, RIPPLE_STEP_MS, cutPlan, cutTier, cutTimeline } from '../src/logic/cut.js';
import type { CutInput, CutOptions } from '../src/logic/cut.js';
import { buildSteps } from '../src/logic/anim.js';
import { playGame } from './ui-helpers.js';

const NORMAL: CutOptions = { speed: 1, reduceMotion: false, effects: 'normal' };
/** n tiles in a line going right from the origin (rings 1..n) */
const line = (n: number): string[] => Array.from({ length: n }, (_, i) => `${i + 1},0`);
const cut = (n: number, o: Partial<CutInput> = {}): CutInput => ({ origin: '0,0', keys: line(n), victimTiles: 30, mine: false, ...o });

/** Real cuts from real games (built from engine events). */
const realCuts = (): CutInput[] => {
  const out: CutInput[] = [];
  for (const seed of [2, 5, 9, 14]) {
    playGame(seed, ({ before, action, after }) => {
      for (const s of buildSteps(before, action, after, 0)) {
        if (s.k !== 'sever') continue;
        const victim = Object.values(before.board).filter((t) => t && t.owner === s.player && !t.root).length;
        out.push({ origin: s.origin, keys: s.keys, victimTiles: victim, mine: s.player === 0 });
      }
    });
  }
  return out;
};

describe('tiers', () => {
  it('Small 1-2, Medium 3-4, Big 5-7, Huge 8+ (thresholds are config values)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => cutTier(n, 40))).toEqual(['small', 'small', 'medium', 'medium', 'big', 'big', 'big', 'huge', 'huge']);
    expect(cutTier(3, 40, { ...CUT_TIERS, medium: 4 })).toBe('small');
  });
  it('Huge also when it takes at least half of the victim’s tiles', () => {
    expect(cutTier(3, 6)).toBe('huge');
    expect(cutTier(3, 7)).toBe('medium');
    expect(cutTier(1, 1)).toBe('small'); // one tile is never Huge
  });
});

describe('the timeline limits', () => {
  const all = [...[1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 20].map((n) => cut(n)), ...realCuts()];

  it(`every cut lasts at most ${CUT_CAP_MS}ms at Normal speed (also in a chain)`, () => {
    expect(all.length).toBeGreaterThan(15);
    for (const c of all) {
      for (const mine of [false, true]) expect(cutPlan({ ...c, mine }, NORMAL).total).toBeLessThanOrEqual(CUT_CAP_MS);
    }
    const chain = cutTimeline([cut(8), cut(6), cut(5)], NORMAL);
    const end = Math.max(...chain.map((x) => x.start + x.plan.total));
    expect(end).toBeLessThanOrEqual(CUT_CAP_MS);
    for (let i = 1; i < chain.length; i++) expect(chain[i]!.start).toBeGreaterThan(chain[i - 1]!.start);
  });

  it(`the flash: at most ${FLASH_MAX_MS}ms, at most ${FLASH_MAX_ALPHA * 100}% white, local (a few hexes), never at Slow speed either`, () => {
    for (const c of all)
      for (const speed of [0.5, 1, 1.6]) {
        const p = cutPlan(c, { ...NORMAL, speed });
        expect(p.flash.ms).toBeLessThanOrEqual(FLASH_MAX_MS);
        expect(p.flash.alpha).toBeLessThanOrEqual(FLASH_MAX_ALPHA);
        expect(p.flash.radius).toBeLessThanOrEqual(3);
        for (const s of p.stages.filter((x) => x.name === 'flash')) expect(s.dur).toBeLessThanOrEqual(FLASH_MAX_MS);
      }
  });

  it('the impact hit-stop is about 100ms for Medium and bigger', () => {
    for (const n of [3, 5, 8]) {
      const h = cutPlan(cut(n), NORMAL).stages.find((s) => s.name === 'hitstop')!;
      expect(h.dur).toBeGreaterThanOrEqual(HITSTOP_MS - 10);
      expect(h.dur).toBeLessThanOrEqual(HITSTOP_MS + 30);
    }
  });

  it('only large cuts give the board one short shake', () => {
    const px = [1, 3, 5, 8].map((n) => cutPlan(cut(n), NORMAL).shakePx);
    expect(px.slice(0,2)).toEqual([0,0]);
    for (const p of px.slice(2)) {
      expect(p).toBeGreaterThanOrEqual(2);
      expect(p).toBeLessThanOrEqual(6);
    }
    expect(px[3]).toBeGreaterThan(px[2]!);
    expect(cutPlan(cut(8), { ...NORMAL, effects: 'high' }).shakePx).toBeLessThanOrEqual(6);
  });

  it(`the ripple: one ring every ${RIPPLE_STEP_MS}ms outward from the cut, all started within ${RIPPLE_CAP_MS}ms`, () => {
    const p = cutPlan(cut(6), NORMAL);
    const starts = p.tiles.map((t) => t.at);
    for (let i = 1; i < p.tiles.length; i++) {
      expect(p.tiles[i]!.ring).toBeGreaterThanOrEqual(p.tiles[i - 1]!.ring);
      expect(starts[i]! - starts[i - 1]!).toBe(RIPPLE_STEP_MS);
    }
    for (const c of all) {
      const q = cutPlan(c, NORMAL);
      const span = Math.max(...q.tiles.map((t) => t.at)) - Math.min(...q.tiles.map((t) => t.at));
      expect(span).toBeLessThanOrEqual(RIPPLE_CAP_MS);
      expect(q.tiles.map((t) => t.key).sort()).toEqual([...c.keys].sort()); // every cut tile dies, once
    }
  });

  it('stages come in order: anticipation, hit-stop, pulse, snap, ripple, crumble, payoff', () => {
    const p = cutPlan(cut(6), NORMAL);
    const at = (n: string) => p.stages.find((s) => s.name === n)!.at;
    const order = ['anticipation', 'hitstop', 'pulse', 'snap', 'ripple', 'crumble'];
    for (let i = 1; i < order.length; i++) expect(at(order[i]!)).toBeGreaterThanOrEqual(at(order[i - 1]!));
    expect(at('flash')).toBeGreaterThanOrEqual(at('pulse'));
    expect(at('payoff')).toBeGreaterThanOrEqual(Math.max(...p.tiles.map(tile=>tile.at+tile.dur)));
    expect(p.banner).toBe('Cut off 6!');
    expect(p.float).toBe('−6');
    expect(p.haptic).toBe('cutBig');
    expect(p.duckMs).toBe(p.total);
  });
});

describe('variants', () => {
  it('the opponent cutting me is calmer: no flash, no zoom, no anticipation, a small shake at most, its own haptic', () => {
    for (const n of [1, 3, 5, 8]) {
      const me = cutPlan(cut(n, { mine: true }), NORMAL);
      const them = cutPlan(cut(n), NORMAL);
      expect(me.flash.alpha).toBe(0);
      expect(me.zoom).toBe(1);
      expect(me.stages.some((s) => s.name === 'anticipation')).toBe(false);
      expect(me.shakePx).toBeLessThanOrEqual(2);
      expect(me.shakePx).toBeLessThanOrEqual(them.shakePx);
      expect(me.haptic).toBe('cutMe');
      expect(me.banner === null || !me.banner.includes('!')).toBe(true);
    }
  });

  it('Reduce motion: a fade only (no shake, flash, zoom or ripple)', () => {
    const p = cutPlan(cut(8), { ...NORMAL, reduceMotion: true });
    expect(p.stages.map((s) => s.name)).toEqual(['fade', 'payoff']);
    expect(p.shakePx).toBe(0);
    expect(p.flash.alpha).toBe(0);
    expect(p.zoom).toBe(1);
    expect(new Set(p.tiles.map((t) => t.at))).toEqual(new Set([0]));
  });

  it('Effects Low: no shake, flash or zoom', () => {
    const p = cutPlan(cut(8), { ...NORMAL, effects: 'low' });
    expect([p.shakePx, p.flash.alpha, p.zoom]).toEqual([0, 0, 1]);
  });

  it('a replay plays the very same sequence at half speed', () => {
    const live = cutPlan(cut(6), NORMAL);
    const rep = cutPlan(cut(6), { ...NORMAL, replay: true });
    expect(rep.tiles.map((t) => t.key)).toEqual(live.tiles.map((t) => t.key));
    expect(rep.total).toBeGreaterThanOrEqual(live.total * 2 - 2);
    expect(rep.total).toBeLessThanOrEqual(live.total * 2 + 2);
  });

  it('Fruit reuses the generator: my own tiles, calm, no banner', () => {
    const p = cutPlan(cut(3, { mine: true, kind: 'fruit' }), NORMAL);
    expect(p.calm).toBe(true);
    expect(p.banner).toBeNull();
    expect(p.tiles.length).toBe(3);
  });

  it('the same cut always gives the same plan (deterministic)', () => {
    for (const c of realCuts().slice(0, 10)) expect(cutPlan(c, NORMAL)).toEqual(cutPlan({ ...c, keys: [...c.keys] }, NORMAL));
  });
});
