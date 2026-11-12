// Cockpit-sign flavour: short asides that stay out of the way of the facts. Presentation
// only. The engine's RNG is never read and no game state or rule depends on any of this.
//
// Two rules keep it feeling like one instrument instead of a quote machine:
//   1. It is rare: roughly FLAVOUR_RATE percent of eligible moments show a line at all.
//   2. It never repeats: a line cannot come back until its whole pool has been seen, a kind
//      never speaks twice in a row, and a refilled pool keeps its last line out of the first slot.
import type { LedMotif, LedTone } from './led-cells.js';

export type FlavourPool = { lines: readonly string[]; tone: LedTone; motif?: LedMotif; rival?: true };

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

/**
 * THE OPPONENT'S VOICE (owner, 2026-11-11): in offline free play (practice, level 10+, Blitz) the sign
 * is the opponent, commentator and judge in one — dry, exact, with a punchline, never overused. Same
 * moments as the neutral sign (kind names read from the player's side: 'cut-theirs' = you cut the
 * opponent), plus the end of a game. Online games and levels 1-9 keep the neutral pools above.
 * The owner's own lines are kept exactly as given (the sign shows capitals).
 */
export const RIVAL_POOLS = {
  'cut-theirs': { tone: 'green', motif: 'stars', rival: true, lines: ['Auch!', 'damn!', 'RUDE.', 'NOTED.', 'I SAW THAT', 'OK. WAR.', 'WHY THO', 'FILED: RUDE'] },
  'cut-mine': { tone: 'red', motif: 'scatter', rival: true, lines: ['GOT U', 'hehehe', 'SNIP.', 'MINE NOW', 'AS PREDICTED', 'TEXTBOOK.', 'YOINK'] },
  'loss': { tone: 'red', motif: 'scatter', rival: true, lines: ['GOT U', 'hehehe', 'TIDY.', 'NOTHING PERSONAL', 'EXPECTED.'] },
  'mega': { tone: 'green', motif: 'shock', rival: true, lines: ['Heeey easy girl', 'Auch!', 'damn!', 'EXCESSIVE.', 'OK THAT HURT'] },
  'mega-hit': { tone: 'red', motif: 'shock', rival: true, lines: ['hehehe', 'GOT U', 'BOOM. SORRY.', 'NOT SORRY', 'PHYSICS.'] },
  'bloom': { tone: 'green', motif: 'stars', rival: true, lines: ['SHOW-OFF', 'PRETTY. ANNOYING.', 'OK FLORIST', 'NOTED.'] },
  'comeback': { tone: 'pink', motif: 'heart', rival: true, lines: ['damn!', 'PLOT TWIST', 'WAIT WHAT', 'RECALCULATING'] },
  'lead-you': { tone: 'green', rival: true, lines: ['TEMPORARY.', 'I ALLOW IT', 'STILL FINE', 'ENJOY IT. BRIEFLY.'] },
  'lead-them': { tone: 'red', rival: true, lines: ['hehehe', 'COMFY.', 'AS EXPECTED', 'SCORE: CORRECT'] },
  'win': { tone: 'green', motif: 'stars', rival: true, lines: ['GG. RESPECT.', 'damn!', 'REMATCH. NOW.', 'I LET YOU. NO.'] },
  'lose': { tone: 'red', motif: 'scatter', rival: true, lines: ['GOT U', 'GG. NEXT.', 'hehehe', 'AS CALCULATED'] },
} as const satisfies Record<string, FlavourPool>;

export type RivalKind = keyof typeof RIVAL_POOLS;

/** The opponent speaks at most this many times in one game (on top of the rare gate). */
export const RIVAL_GAME_CAP = 3;
/**
 * The sign OPENS UP as the player plays (owner, 2026-11-11: "he'd get more personality as player plays
 * more games but capped - keep it"): the opponent's lines a game grow with finished games, to the cap.
 */
export const rivalCapFor = (gamesPlayed: number) =>
  gamesPlayed < 2 ? 1 : gamesPlayed < 6 ? 2 : RIVAL_GAME_CAP;

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

  /** Opponent lines shown this game (capped by RIVAL_GAME_CAP). */
  private rivalShown = 0;
  private rivalCap = RIVAL_GAME_CAP;
  /** How many opponent lines this player has earned per game (rivalCapFor). */
  setRivalCap(cap: number) { this.rivalCap = Math.max(0, Math.min(RIVAL_GAME_CAP, Math.floor(cap))); }

  reset() { this.bags.clear(); this.lastLine = ''; this.lastKind = ''; this.salt = 1; this.rivalShown = 0; }

  /** A flavour line for this eligible moment, or null to stay on the plain token. */
  draw(kind: string, pool: FlavourPool, key: string): string | null {
    if (pool.lines.length === 0) return null;
    const backToBack = kind === this.lastKind;
    this.lastKind = kind;
    if (backToBack || !flavourGate(key)) return null;
    if (pool.rival && this.rivalShown >= this.rivalCap) return null;
    const line = this.next(kind, pool.lines);
    if (line && pool.rival) this.rivalShown++;
    return line;
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
