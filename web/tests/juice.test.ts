import { describe, expect, it } from 'vitest';
import type { Step } from '../src/logic/anim.js';
import { buildSteps } from '../src/logic/anim.js';
import { ParticleBudget, effectBudget, idleTarget, moveTier, pitchLadder, tierBanner } from '../src/logic/juice.js';
import { playGame } from './ui-helpers.js';

const grow = (n: number, extra: Partial<{ replaced: number; player: 0 | 1; style: 'line' | 'bloom' | 'sprout' }> = {}): Step => ({
  k: 'grow',
  style: extra.style ?? (n === 1 ? 'sprout' : 'line'),
  player: extra.player ?? 0,
  tiles: Array.from({ length: n }, (_, i) => ({ key: `${i},0`, strength: 3, replaced: i < (extra.replaced ?? 0) })),
});
const sever = (n: number): Step => ({ k: 'sever', player: 1, by: 0, keys: Array.from({ length: n }, (_, i) => `${i},1`), origin: '0,1' });
const noGold = () => false;

describe('move size tiers (the juice budget)', () => {
  it('small: a sprout or 1-2 tiles', () => {
    expect(moveTier([grow(1)], noGold)).toBe('small');
    expect(moveTier([grow(2)], noGold)).toBe('small');
  });

  it('medium: 3-4 tiles, a gold hex, replacing a bot tile, or a cut of 1-3', () => {
    expect(moveTier([grow(3)], noGold)).toBe('medium');
    expect(moveTier([grow(4)], noGold)).toBe('medium');
    expect(moveTier([grow(1)], (k) => k === '0,0')).toBe('medium');
    expect(moveTier([grow(2, { replaced: 1 })], noGold)).toBe('medium');
    expect(moveTier([sever(3)], noGold)).toBe('medium');
  });

  it('big: 5+ tiles, a cut of 4+, or a Strangle', () => {
    expect(moveTier([grow(5)], noGold)).toBe('big');
    expect(moveTier([grow(2), sever(4)], noGold)).toBe('big');
    expect(moveTier([{ k: 'strangle', loser: 1 }], noGold)).toBe('big');
  });

  it('nothing to celebrate: a draw or a throw', () => {
    expect(moveTier([{ k: 'draw', player: 0, from: 'deck' }], noGold)).toBe('none');
  });

  it('every real move gets a tier, and it never shrinks when more happens', () => {
    const order = ['none', 'small', 'medium', 'big'];
    playGame(3, ({ before, action, after }) => {
      const steps = buildSteps(before, action, after, 0);
      const t = moveTier(steps, (k) => before.terrain[k] === 'rich');
      expect(order).toContain(t);
      const more = moveTier([...steps, sever(4)], () => false);
      expect(more).toBe('big');
    });
  });

  it('a banner only for big moments, in plain words', () => {
    expect(tierBanner([grow(6)])).toBe('Big grow!');
    expect(tierBanner([grow(2), sever(5)])).toBe('Cut off 5!');
    expect(tierBanner([{ k: 'strangle', loser: 1 }])).toBe('Strangled!');
    expect(tierBanner([grow(3)])).toBeNull();
  });
});

describe('effect budget per tier and intensity', () => {
  it('bigger moments get bigger effects, but stay capped', () => {
    const s = effectBudget('small', 'normal', false);
    const m = effectBudget('medium', 'normal', false);
    const b = effectBudget('big', 'normal', false);
    expect(s.particles).toBeLessThan(m.particles);
    expect(m.particles).toBeLessThan(b.particles);
    expect(b.particles).toBeLessThanOrEqual(60);
    expect(s.shake).toBe(0);
    expect(m.shake).toBe(0);
    expect(b.shake).toBeGreaterThan(0);
    expect(b.hitStopMs).toBeGreaterThanOrEqual(80);
    expect(b.hitStopMs).toBeLessThanOrEqual(120);
    expect(b.banner && b.vibrate !== null && b.thud).toBe(true);
    expect(s.banner || s.thud || s.vibrate !== null).toBe(false);
  });

  it('Low < Normal < High; Low has no shake or hit-stop', () => {
    const [lo, no, hi] = (['low', 'normal', 'high'] as const).map((i) => effectBudget('big', i, false));
    expect(lo!.particles).toBeLessThan(no!.particles);
    expect(no!.particles).toBeLessThan(hi!.particles);
    expect(lo!.shake).toBe(0);
    expect(lo!.hitStopMs).toBe(0);
    expect(hi!.particles).toBeLessThanOrEqual(60);
  });

  it('Reduce motion: no shake and no flying particles; quick fades instead', () => {
    const b = effectBudget('big', 'high', true);
    expect(b.shake).toBe(0);
    expect(b.particles).toBe(0);
    expect(b.fadeOnly).toBe(true);
    expect(b.banner).toBe(true); // still told what happened
  });
});

describe('pitch ladder: growth plays a little rising scale', () => {
  it('each tile is higher than the last', () => {
    const p = pitchLadder(6, 0);
    expect(p).toHaveLength(6);
    expect(p[0]).toBe(1);
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!);
  });

  it('the second effect in a chain (place, then cut) is a little higher', () => {
    const first = pitchLadder(3, 0);
    const second = pitchLadder(3, 1);
    for (let i = 0; i < 3; i++) expect(second[i]!).toBeGreaterThan(first[i]!);
    expect(second[0]! / first[0]!).toBeLessThan(1.2); // slightly, not an octave
  });

  it('long lines stay in a pleasant range (under two octaves)', () => {
    expect(Math.max(...pitchLadder(12, 1))).toBeLessThan(4);
  });
});

describe('particle cap', () => {
  it('never more than 60 particles alive at once; finished ones free their slots', () => {
    const b = new ParticleBudget(60);
    expect(b.take(40)).toBe(40);
    expect(b.take(40)).toBe(20);
    expect(b.alive).toBe(60);
    expect(b.take(5)).toBe(0);
    b.free(30);
    expect(b.take(50)).toBe(30);
    expect(b.peak).toBe(60);
    b.free(1000);
    expect(b.alive).toBe(0);
  });
});

describe('idle hint (after about 8 seconds, a quiet pulse on the next control)', () => {
  it('points at the deck, the cards to throw, or Confirm; never on the bot\'s turn', () => {
    expect(idleTarget('DRAW', true, false)).toBe('deck');
    expect(idleTarget('DISCARD', true, false)).toBe('hand');
    expect(idleTarget('ACT', true, true)).toBe('confirm');
    expect(idleTarget('ACT', true, false)).toBe('hand');
    expect(idleTarget('DRAW', false, false)).toBeNull();
    expect(idleTarget('GAME_OVER', true, false)).toBeNull();
  });
});
