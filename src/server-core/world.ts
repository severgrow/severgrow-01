// The shared world map: where a sprout may go, placing one (with a race-safe commit),
// the starting wild sprouts, the activity feed and the leaderboards.
import { mulberry32 } from '../engine/index.js';
import type { Level } from '../bots/levels.js';
import { DAY, DEFAULT_WORLD_CONFIG } from './config.js';
import type { WorldConfig } from './config.js';
import type { Account, Cell, Fail, WorldEvent } from './types.js';

export const NEIGHBOURS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
export type CellAt = (q: number, r: number) => Cell | null;

/** Can a sprout of this level go on (q, r)? */
export const canPlaceAt = (at: CellAt, q: number, r: number, level: Level): { ok: true } | Fail => {
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) return { ok: false, reason: 'That is not a spot on the map.' };
  const here = at(q, r);
  if (here) {
    if (here.level === 9) return { ok: false, reason: 'A level 9 sprout can never be replaced.' };
    if (level <= here.level) return { ok: false, reason: `You need a stronger sprout than ${here.level} to take this spot.` };
    return { ok: true };
  }
  if (!NEIGHBOURS.some(([dq, dr]) => at(q + dq, r + dr))) return { ok: false, reason: 'A new sprout must grow next to another sprout.' };
  return { ok: true };
};

export type Placement = { ok: true; account: Account; cell: Cell; expected: Cell | null; event: WorldEvent };

/** Plans a placement from a snapshot of the map. Commit it with a compare-and-set. */
export const planPlacement = (
  account: Account,
  at: CellAt,
  req: { token: number; q: number; r: number },
  now: number,
  cfg: WorldConfig = DEFAULT_WORLD_CONFIG,
): Placement | Fail => {
  const level = account.tokens[req.token];
  if (level === undefined) return { ok: false, reason: 'You have no sprout to place.' };
  const day = Math.floor(now / DAY);
  const today = account.placementsDay === day ? account.placementsToday : 0;
  if (today >= cfg.maxPlacementsPerDay) return { ok: false, reason: `You can place ${cfg.maxPlacementsPerDay} sprouts a day. Your sprout is saved for tomorrow.` };
  const can = canPlaceAt(at, req.q, req.r, level);
  if (!can.ok) return can;
  const prev = at(req.q, req.r);
  const cell: Cell = { q: req.q, r: req.r, level, owner: account.id, placedAt: now, replacedCount: prev ? prev.replacedCount + 1 : 0 };
  const tokens = account.tokens.filter((_, i) => i !== req.token);
  return {
    ok: true,
    account: { ...account, tokens, placementsDay: day, placementsToday: today + 1 },
    cell,
    expected: prev,
    event: { at: now, kind: prev ? 'overgrow' : 'place', q: req.q, r: req.r, level, by: account.id, prevOwner: prev?.owner ?? null, prevLevel: prev?.level ?? null },
  };
};

const key = (q: number, r: number) => `${q},${r}`;
const sameCell = (a: Cell | null, b: Cell | null) => (a === null || b === null ? a === b : a.level === b.level && a.owner === b.owner && a.placedAt === b.placedAt);

/** An in-memory map (for tests and offline play). `commit` is atomic: compare, then set. */
export class InMemoryWorld {
  private cells = new Map<string, Cell>();
  readonly events: WorldEvent[] = [];
  constructor(cells: Cell[] = []) {
    for (const c of cells) this.cells.set(key(c.q, c.r), c);
  }
  get(q: number, r: number): Cell | null {
    return this.cells.get(key(q, r)) ?? null;
  }
  all(): Cell[] {
    return [...this.cells.values()];
  }
  commit(p: Placement): { ok: true } | Fail {
    if (!sameCell(this.get(p.cell.q, p.cell.r), p.expected)) return { ok: false, reason: 'Someone just took that spot' };
    this.cells.set(key(p.cell.q, p.cell.r), p.cell);
    this.events.push(p.event);
    return { ok: true };
  }
}

/** About 60 unowned "wild" sprouts (levels 1-6) in an organic clump around the origin. */
export const seedWorld = (seed: number, count = 60): Cell[] => {
  const rng = mulberry32(seed);
  const cells = new Map<string, Cell>([[key(0, 0), { q: 0, r: 0, level: 3, owner: null, placedAt: 0, replacedCount: 0 }]]);
  const frontier: [number, number][] = [[0, 0]];
  while (cells.size < count) {
    const [q, r] = frontier[Math.floor(rng() * frontier.length)]!;
    const [dq, dr] = NEIGHBOURS[Math.floor(rng() * 6)]!;
    const nq = q + dq;
    const nr = r + dr;
    if (cells.has(key(nq, nr))) continue;
    // Weaker sprouts at the edge, a few stronger ones near the middle.
    const dist = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
    const level = Math.max(1, Math.min(6, 1 + Math.floor(rng() * 4) + (dist <= 2 ? 2 : 0))) as Level;
    cells.set(key(nq, nr), { q: nq, r: nr, level, owner: null, placedAt: 0, replacedCount: 0 });
    frontier.push([nq, nr]);
  }
  return [...cells.values()].sort((a, b) => a.r - b.r || a.q - b.q);
};

/** The last 30 events, newest first, as short sentences. */
export const recentFeed = (events: readonly WorldEvent[], nameOf: (id: string | null) => string, n = 30) =>
  [...events]
    .sort((a, b) => b.at - a.at)
    .slice(0, n)
    .map((e) => ({
      ...e,
      text:
        e.kind === 'place'
          ? `${nameOf(e.by)} placed a ${e.level}`
          : e.prevOwner === null
            ? `${nameOf(e.by)} overgrew a wild ${e.prevLevel} with a ${e.level}`
            : `${nameOf(e.by)} overgrew ${nameOf(e.prevOwner)}'s ${e.prevLevel} with a ${e.level}`,
    }));

type Row = { owner: string; value: number; rank: number };
const ranked = (m: Map<string, number>): Row[] => {
  const rows = [...m].map(([owner, value]) => ({ owner, value })).sort((a, b) => b.value - a.value || a.owner.localeCompare(b.owner));
  let rank = 0;
  let last = Number.NaN;
  return rows.map((r, i) => {
    if (r.value !== last) rank = i + 1;
    last = r.value;
    return { ...r, rank };
  });
};

/** Most sprouts, and highest total of levels; plus where `me` stands. */
export const leaderboards = (cells: readonly Cell[], me: string | null) => {
  const count = new Map<string, number>();
  const total = new Map<string, number>();
  for (const c of cells) {
    if (!c.owner) continue;
    count.set(c.owner, (count.get(c.owner) ?? 0) + 1);
    total.set(c.owner, (total.get(c.owner) ?? 0) + c.level);
  }
  const mostSprouts = ranked(count);
  const highestTotal = ranked(total);
  const pick = (rows: Row[]) => {
    const r = rows.find((x) => x.owner === me);
    return r ? { value: r.value, rank: r.rank } : null;
  };
  return { mostSprouts, highestTotal, mine: me ? { mostSprouts: pick(mostSprouts), highestTotal: pick(highestTotal) } : null };
};
