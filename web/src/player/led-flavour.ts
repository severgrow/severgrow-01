// Cockpit-sign flavour: short asides that stay out of the way of the facts. Presentation
// only. The engine's RNG is never read and no game state or rule depends on any of this.
//
// Two rules keep it feeling like one instrument instead of a quote machine:
//   1. It is rare: roughly FLAVOUR_RATE percent of eligible moments show a line at all.
//   2. It never repeats: a line cannot come back until its whole pool has been seen, a kind
//      never speaks twice in a row, and a refilled pool keeps its last line out of the first slot.
import type { LedMotif, LedTone } from './led-cells.js';

export type FlavourPool = { lines: readonly string[]; tone: LedTone; motif?: LedMotif };

/** Share of eligible moments that may show a flavour line instead of the plain token (%). */
export const FLAVOUR_RATE = 14;

/** Short pools (1-6 characters) for every kind of moment that can earn an aside. */
export const FLAVOUR_POOLS = {
  'cut-theirs': { tone: 'green', motif: 'stars', lines: ['NICE', 'CLEAN', 'SNAP', 'CLIP', 'ZAP', 'NIP', 'SWISH', 'GOOD', 'YES', 'HA.'] },
  'cut-mine': { tone: 'red', motif: 'scatter', lines: ['OUCH', 'RIP', 'RUDE.', 'OOF', 'YIKES', 'HURT', 'UGH', 'NOPE', 'CREAK', 'OW.'] },
  'loss': { tone: 'red', motif: 'scatter', lines: ['OUCH', 'RIP', 'OOF', 'UGH', 'NOPE', 'YIKES', 'HURT', 'OW.'] },
  'mega': { tone: 'green', motif: 'shock', lines: ['BOOM', 'OH.', 'BOOM!', 'BIG', 'WOW', 'CRASH', 'HA.', 'YES', 'WHOOM', 'YEAH'] },
  'mega-hit': { tone: 'red', motif: 'shock', lines: ['RUDE.', 'OH.', 'YIKES', 'OOF', 'NO.', 'UGH', 'WHY.', 'OW.', 'HEY.', 'WOW'] },
  'bloom': { tone: 'green', motif: 'stars', lines: ['NICE', 'OOOH', 'CLEAN', 'LUSH', 'POP', 'SNAP', 'YES', 'OH.', 'GROW', 'WOW'] },
  'comeback': { tone: 'pink', motif: 'heart', lines: ['BACK', 'HELLO', '♥', 'PHEW', 'YES', 'UP', 'CLIMB', 'HOLD', 'NICE', 'GOOD'] },
  'lead-you': { tone: 'green', lines: ['BOLD', 'AHEAD', 'UP', 'YES', 'NICE', 'OOOH', 'LEAD', 'GOOD', 'PUSH', 'MOVE'] },
  'lead-them': { tone: 'red', lines: ['UH OH', 'TRAIL', 'DOWN', 'NO.', 'OOF', 'WATCH', 'FALL', 'HMM', 'LOST', 'HOLD'] },
} as const satisfies Record<string, FlavourPool>;

export type FlavourKind = keyof typeof FLAVOUR_POOLS;

const fnv = (text: string) => {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};

/** The reproducible probability gate: the same event key always makes the same call. */
export const flavourGate = (key: string) => fnv(key) % 100 < FLAVOUR_RATE;

/**
 * A shuffled bag per event kind. A line cannot repeat until every other line of its pool has
 * been seen, and the kind that just spoke is muted for the next moment of the same kind.
 */
export class FlavourDeck {
  private bags = new Map<string, { order: number[]; pos: number }>();
  private lastLine = '';
  private lastKind = '';
  private salt = 1;

  reset() { this.bags.clear(); this.lastLine = ''; this.lastKind = ''; this.salt = 1; }

  /** A flavour line for this eligible moment, or null to stay on the plain token. */
  draw(kind: string, pool: FlavourPool, key: string): string | null {
    if (pool.lines.length === 0) return null;
    const backToBack = kind === this.lastKind;
    this.lastKind = kind;
    if (backToBack || !flavourGate(key)) return null;
    return this.next(kind, pool.lines);
  }

  /** Raw bag draw (no gate). Returns a line, refilling a fresh shuffled bag when spent. */
  pick(kind: string, pool: FlavourPool): string | null {
    return this.next(kind, pool.lines);
  }

  private next(kind: string, lines: readonly string[]): string | null {
    let bag = this.bags.get(kind);
    if (!bag || bag.pos >= bag.order.length) {
      const salt = this.salt++;
      const order = [...lines.keys()].sort(
        (a, b) => (fnv(`${kind}:${salt}:${a}`) - fnv(`${kind}:${salt}:${b}`)) || a - b);
      // Keep the line just shown out of the first slot after a refill.
      if (order.length > 1 && lines[order[0]!] === this.lastLine) order.push(order.shift()!);
      bag = { order, pos: 0 };
      this.bags.set(kind, bag);
    }
    const line = lines[bag.order[bag.pos++]!] ?? null;
    if (line) this.lastLine = line;
    return line;
  }
}
