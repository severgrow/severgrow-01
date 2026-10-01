import { describe, expect, it } from 'vitest';
import { hexDistance, isAdjacent, parseKey } from '../../src/engine/index.js';
import type { Tile } from '../../src/engine/index.js';
import { AnimQueue, applyStep, buildSteps, captionFor } from '../src/logic/anim.js';
import type { Step } from '../src/logic/anim.js';
import { playGame } from './ui-helpers.js';
import type { Played } from './ui-helpers.js';

const norm = (b: Record<string, Tile | null>) =>
  Object.fromEntries(Object.entries(b).filter(([, t]) => t).sort(([a], [c]) => a.localeCompare(c)).map(([k, t]) => [k, { owner: t!.owner, strength: t!.strength, root: !!t!.root }]));

const games = (seeds: number[]): Played[] => {
  const out: Played[] = [];
  for (const seed of seeds) playGame(seed, (p) => out.push(p));
  return out;
};

describe('animation queue from engine events', () => {
  const played = games([1, 2, 3, 4, 5, 6]);

  it('playing every step (without the final sync) rebuilds the exact board the engine made', () => {
    for (const p of played) {
      const steps = buildSteps(p.before, p.action, p.after, 0);
      expect(steps.at(-1)!.k).toBe('sync');
      const shown = steps.slice(0, -1).reduce(applyStep, p.before.board);
      expect(norm(shown)).toEqual(norm(p.after.board));
      expect(norm(steps.reduce(applyStep, p.before.board))).toEqual(norm(p.after.board));
    }
  });

  it("never reveals the bot's drawn cards to the player", () => {
    let mine = 0;
    for (const p of played) {
      for (const s of buildSteps(p.before, p.action, p.after, 0)) {
        if (s.k !== 'draw') continue;
        if (s.player === 1 && s.from === 'deck') expect(s.card).toBeUndefined();
        if (s.player === 0) {
          expect(s.card).toBeDefined();
          mine++;
        }
      }
    }
    expect(mine).toBeGreaterThan(0);
  });

  it('a line unrolls tile by tile from its start; clumps bloom; Sprout pops', () => {
    const styles = new Set<string>();
    for (const p of played) {
      for (const s of buildSteps(p.before, p.action, p.after, 0)) {
        if (s.k !== 'grow') continue;
        styles.add(s.style);
        if (p.action.t === 'MeldRun') {
          expect(s.style).toBe('line');
          for (let i = 1; i < s.tiles.length; i++) expect(isAdjacent(parseKey(s.tiles[i - 1]!.key), parseKey(s.tiles[i]!.key))).toBe(true);
        }
        if (p.action.t === 'MeldSet') expect(s.style).toBe('bloom');
        if (p.action.t === 'Sprout') expect(s.style).toBe('sprout');
      }
    }
    expect([...styles].sort()).toEqual(['bloom', 'line', 'sprout']);
  });

  it('a cut withers in a ripple outward from where it was cut, with a caption', () => {
    let cuts = 0;
    for (const p of played) {
      for (const s of buildSteps(p.before, p.action, p.after, 0)) {
        if (s.k !== 'sever') continue;
        cuts++;
        const d = s.keys.map((k) => hexDistance(parseKey(k), parseKey(s.origin)));
        for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]!);
        expect(captionFor(s, 0)).toBe(
          s.player === 1 ? `You cut off ${s.keys.length} bot tile${s.keys.length === 1 ? '' : 's'}!` : `The bot cut off ${s.keys.length} of your tiles`,
        );
      }
    }
    expect(cuts).toBeGreaterThan(0);
  });

  it('skipping or turning off animations at any point gives the identical board', () => {
    // A deterministic shuffle of push / next / skip calls.
    let x = 12345;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let trial = 0; trial < 20; trial++) {
      const q = new AnimQueue(played[0]!.before.board);
      let last = played[0]!.before;
      for (const p of played.slice(0, 200)) {
        if (p.before !== last) break;
        q.push(buildSteps(p.before, p.action, p.after, 0));
        last = p.after;
        const r = rnd();
        if (r < 0.4) q.next();
        else if (r < 0.5) q.skipAll();
      }
      while (rnd() < 0.7 && q.pending > 0) q.next();
      q.skipAll();
      expect(q.pending).toBe(0);
      expect(norm(q.board)).toEqual(norm(last.board));
    }
  });

  it('steps are plain data (safe to replay later)', () => {
    const p = played.find((x) => x.action.t === 'MeldRun')!;
    const steps: Step[] = buildSteps(p.before, p.action, p.after, 0);
    expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
  });

  it('peek shows the next step without changing the shown board', () => {
    const p = played.find((x) => x.action.t === 'MeldRun')!;
    const q = new AnimQueue(p.before.board);
    q.push(buildSteps(p.before, p.action, p.after, 0));
    const first = q.peek();
    expect(q.board).toBe(p.before.board);
    expect(q.next()).toBe(first);
  });
});
