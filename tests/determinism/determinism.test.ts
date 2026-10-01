import { describe, expect, it } from 'vitest';
import { replay } from '../../src/engine/index.js';
import { runPropertyGame } from '../../src/sim/invariants.js';

/** Canonical JSON: object keys sorted, so equal data always prints the same. */
const canonical = (x: unknown): string =>
  JSON.stringify(x, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

describe('determinism (section 15)', () => {
  it('seed + action log gives byte-identical final state and events, twice', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { actions, state } = runPropertyGame(seed, {}, { checks: false });
      const a = replay(seed, actions);
      const b = replay(seed, actions);
      expect(canonical(a)).toBe(canonical(b));
      expect(canonical(a)).toBe(canonical(state));
      expect(canonical(a.history)).toBe(canonical(state.history));
    }
  }, 300_000);
});
