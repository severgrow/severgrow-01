// UI overhaul item 16: ambient life is deterministic, capped, and off when asked.
import { describe, expect, it } from 'vitest';
import { connectedKeys } from '../../src/engine/index.js';
import { AMBIENT_CAP, AMBIENT_LIMITS, GLINT_PERIOD, ambientCount, ambientPlan } from '../src/logic/ambient.js';
import type { AmbientInput } from '../src/logic/ambient.js';
import { playGame } from './ui-helpers.js';

const positions = (): AmbientInput[] => {
  const out: AmbientInput[] = [];
  for (const seed of [1, 7]) {
    let i = 0;
    playGame(seed, ({ after }) => {
      if (i++ % 9 === 0) out.push({ board: after.board, terrain: after.terrain, config: after.config, me: 0, effects: 'normal', reduceMotion: false });
    });
  }
  return out;
};

describe('ambient life', () => {
  const ps = positions();

  it('the same board always moves the same way (no randomness)', () => {
    for (const p of ps.slice(0, 10)) expect(ambientPlan(p)).toEqual(ambientPlan({ ...p }));
  });

  it(`never more than ${AMBIENT_CAP} moving things, and each kind within its own limit`, () => {
    for (const p of ps) {
      const plan = ambientPlan({ ...p, effects: 'high' });
      expect(ambientCount(plan)).toBeLessThanOrEqual(AMBIENT_CAP);
      for (const k of ['glints', 'pulses', 'bubbles', 'embers'] as const) expect(plan[k].length).toBeLessThanOrEqual(AMBIENT_LIMITS[k]);
    }
  });

  it('nothing moves with Effects Low or Reduce motion', () => {
    for (const p of ps.slice(0, 5)) {
      for (const q of [{ ...p, effects: 'low' as const }, { ...p, reduceMotion: true }]) {
        const plan = ambientPlan(q);
        expect(ambientCount(plan)).toBe(0);
        expect(plan.sway).toBe(false);
      }
    }
  });

  it('gold glints only on gold hexes, each at its own moment in the cycle', () => {
    for (const p of ps.slice(0, 5)) {
      const plan = ambientPlan(p);
      for (const g of plan.glints) {
        expect(p.terrain[g.key]).toBe('rich');
        expect(g.delay).toBeGreaterThanOrEqual(0);
        expect(g.delay).toBeLessThan(GLINT_PERIOD);
      }
      if (plan.glints.length > 1) expect(new Set(plan.glints.map((g) => g.delay)).size).toBeGreaterThan(1);
    }
  });

  it('nutrient pulses run only along my connected veins, outward from the root (later further out)', () => {
    let seen = 0;
    for (const p of ps) {
      const joined = connectedKeys(p.board, p.config, 0);
      const plan = ambientPlan(p);
      for (const v of plan.pulses) {
        expect(joined.has(v.from) && joined.has(v.to)).toBe(true);
        seen++;
      }
      for (let i = 1; i < plan.pulses.length; i++) expect(plan.pulses[i]!.delay).toBeGreaterThanOrEqual(plan.pulses[i - 1]!.delay);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("lava bubbles and embers only on the opponent's tiles", () => {
    for (const p of ps) {
      const plan = ambientPlan(p);
      for (const b of [...plan.bubbles, ...plan.embers]) expect(p.board[b.key]?.owner).toBe(1);
    }
  });
});
