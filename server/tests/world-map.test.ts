import { describe, expect, it } from 'vitest';
import { WORLD_CELLS, WORLD_CELL_IDS, legacyWorldCell, worldNeighbours } from '../src/world.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { SEED_ECONOMY, campaignLevelOfSourceKey, campaignSeedReward } from '../src/seeds/config.js';

const grant = (store: MemoryWorldEconomyStore, playerId: string, sourceKey: string, now = Date.UTC(2026, 9, 15)) =>
  store.settle({ playerId, sourceKey, mode: 'campaign', outcome: 'win', opponentId: null, campaignLevel: 1, now });

describe('frozen shared hex world', () => {
  it('is 274 unique connected cells with no one-cell tails (v2)', () => {
    expect(WORLD_CELLS).toHaveLength(274);
    expect(WORLD_CELL_IDS.size).toBe(274);
    const seen = new Set<string>([WORLD_CELLS[0]!.id]);
    const queue = [WORLD_CELLS[0]!.id];
    while (queue.length) for (const id of worldNeighbours(queue.shift()!)) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    expect(seen.size).toBe(274);
    expect(WORLD_CELLS.every((c) => worldNeighbours(c.id).length >= 2)).toBe(true);
  });

  it('keeps EVERY v1 cell: an existing claim can never be orphaned by the expansion', () => {
    // The v1 geometry, reproduced here so the test fails if a v1 id is ever dropped.
    const WIDTHS = [6, 8, 10, 11, 12, 13, 13, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6];
    const SHIFT = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
    const v1: string[] = [];
    for (let index = 0; index < WIDTHS.length; index++) {
      const r = index - 8;
      const first = Math.floor(-r / 2 - WIDTHS[index]! / 2) + SHIFT[index]!;
      for (let offset = 0; offset < WIDTHS[index]!; offset++) v1.push(`${first + offset},${r}`);
    }
    expect(v1).toHaveLength(183);
    for (const id of v1) expect(WORLD_CELL_IDS.has(id), id).toBe(true);
  });

  it('grew by about half, along a coastline: smooth runs with a few bays and points', () => {
    expect(WORLD_CELLS.length).toBeGreaterThan(183 * 1.4);
    expect(WORLD_CELLS.length).toBeLessThan(183 * 1.6);
    // The shape is FROZEN: this is its row profile, top to bottom. The previous v2 was
    // 3 10 11 13 14 16 17 17 17 18 18 17 16 16 16 14 13 12 11 6 — a rounded lozenge with a 3-hex
    // crown and one separated bottom tooth (owner, 2026-10-21). A change here means the generator was
    // re-run: regenerate the table from its output, never by hand.
    const widths = new Map<number, number>();
    for (const c of WORLD_CELLS) widths.set(c.r, (widths.get(c.r) ?? 0) + 1);
    const profile = [...widths.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
    expect(profile).toEqual([6, 7, 9, 13, 14, 16, 17, 17, 18, 18, 18, 17, 17, 16, 11, 10, 10, 11, 11, 10, 8]);

    // A bigger hexagon (or any ring-grown shape) has an edge that moves by at most one cell per row.
    // A coastline does not: it takes a 2-4 cell step where a bay cuts in or a point runs out. Measure
    // both edges and require at least two such steps — but require the change to be LOCAL: most row
    // steps are still 0 or 1, so the step is a bay, not a sawtooth.
    const rows = new Map<number, { lo: number; hi: number }>();
    for (const c of WORLD_CELLS) {
      const row = rows.get(c.r);
      if (!row) rows.set(c.r, { lo: c.q, hi: c.q });
      else { row.lo = Math.min(row.lo, c.q); row.hi = Math.max(row.hi, c.q); }
    }
    const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
    const steps: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      steps.push(Math.abs(ordered[i]!.lo - ordered[i - 1]!.lo));
      steps.push(Math.abs(ordered[i]!.hi - ordered[i - 1]!.hi));
    }
    expect(steps.filter((step) => step >= 2).length, 'a coastline has bays and points, not one ring')
      .toBeGreaterThanOrEqual(2);
    expect(steps.filter((step) => step >= 2).length, 'and it is not a sawtooth either')
      .toBeLessThan(steps.length / 3);
    expect(steps.filter((step) => step <= 1).length / steps.length, 'the shore grows in smooth runs')
      .toBeGreaterThan(0.7);
  });

  it('has NO lone tooth: no cell alone in its row with land hanging off it', () => {
    // The owner's definition, checked in BOTH directions: a cell whose row-neighbours on both sides
    // are outside the map while it has a cell below it is a comb tooth — and the same cell hanging
    // UNDER a bay's lip is the same pimple pointing up. v1 has none (its rows are contiguous), and
    // the growth rule refuses any candidate that would leave one.
    const has = (q: number, r: number) => WORLD_CELL_IDS.has(`${q},${r}`);
    const teeth = WORLD_CELLS.filter((c) => !has(c.q - 1, c.r) && !has(c.q + 1, c.r) &&
      (has(c.q, c.r + 1) || has(c.q - 1, c.r + 1) || has(c.q, c.r - 1) || has(c.q + 1, c.r - 1)))
      .map((c) => c.id);
    expect(teeth, `lone teeth: ${teeth.join(' ') || '(none)'}`).toEqual([]);
  });

  it('keeps all 64 historical tile coordinates in the expanded map', () => {
    for (let oldCell = 0; oldCell < 64; oldCell++) expect(WORLD_CELL_IDS.has(legacyWorldCell(oldCell))).toBe(true);
  });

  it('every id matches its own q,r and no cell points at a missing neighbour', () => {
    for (const c of WORLD_CELLS) {
      expect(c.id).toBe(`${c.q},${c.r}`);
      for (const id of worldNeighbours(c.id)) expect(WORLD_CELL_IDS.has(id)).toBe(true);
    }
  });
});

describe('Seed purchases', () => {
  it('first claim can be anywhere, then requires adjacency and charges exactly 100', async () => {
    const store = new MemoryWorldEconomyStore();
    await grant(store, 'a', 'campaign:1');
    await grant(store, 'a', 'campaign:2');
    const first = await store.claim('a', '0,0', 'request-0001', 1);
    expect(first).toMatchObject({ ok: true, cellId: '0,0', replayed: false, wallet: { balance: 0 } });
    expect((await store.claim('a', '0,0', 'request-0001', 2))).toMatchObject({ ok: true, replayed: true, wallet: { balance: 0 } });
    await grant(store, 'a', 'campaign:3');
    await grant(store, 'a', 'campaign:4');
    expect(await store.claim('a', '4,0', 'request-0002', 2)).toMatchObject({ ok: false, code: 'NOT_ADJACENT' });
    expect(await store.claim('a', '1,0', 'request-0003', 2)).toMatchObject({ ok: true, wallet: { balance: 0 } });
    expect(store.ledger.filter((x) => x.delta < 0)).toHaveLength(2);
  });
  it('two buyers cannot acquire the same tile and rejected claims never debit', async () => {
    const store = new MemoryWorldEconomyStore();
    await grant(store, 'a', 'a1'); await grant(store, 'a', 'a2');
    await grant(store, 'b', 'b1'); await grant(store, 'b', 'b2');
    const [a, b] = await Promise.all([
      store.claim('a', '0,0', 'request-a000', 1), store.claim('b', '0,0', 'request-b000', 1),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await store.wallet(a.ok ? 'b' : 'a')).balance).toBe(100);
  });
});

describe('economy schedule and caps', () => {
  it('matches all first-clear and chapter reward values', () => {
    expect(campaignSeedReward(1)).toEqual({ firstWin: 50, chapter: 0 });
    expect(campaignSeedReward(3)).toEqual({ firstWin: 50, chapter: 0 });
    expect(campaignSeedReward(10)).toEqual({ firstWin: 15, chapter: 50 });
    expect(campaignSeedReward(20)).toEqual({ firstWin: 15, chapter: 60 });
    expect(campaignSeedReward(30)).toEqual({ firstWin: 20, chapter: 75 });
    expect(campaignSeedReward(40)).toEqual({ firstWin: 20, chapter: 90 });
    expect(campaignSeedReward(50)).toEqual({ firstWin: 25, chapter: 125 });
    // 31-70 (added 2026-10-18): a level past the old cap of 50 used to return null, which reads as
    // "no reward" rather than an error. The cap and the two new chapter bonuses are pinned here.
    expect(campaignSeedReward(41)).toEqual({ firstWin: 25, chapter: 0 });
    expect(campaignSeedReward(60)).toEqual({ firstWin: 25, chapter: 150 });
    expect(campaignSeedReward(69)).toEqual({ firstWin: 25, chapter: 0 });
    expect(campaignSeedReward(70)).toEqual({ firstWin: 25, chapter: 200 });
    // Past the last authored level it is honestly "no reward", not silently zero.
    expect(campaignSeedReward(71)).toBeNull();
    expect(campaignSeedReward(0)).toBeNull();
  });
  it('caps queue matches and resets at the server UTC boundary', async () => {
    const store = new MemoryWorldEconomyStore();
    const day = Date.UTC(2026, 9, 15, 23, 59);
    for (let i = 0; i < 25; i++) {
      const reward = await store.settle({ playerId: 'a', sourceKey: `duel:${i}`, mode: 'queue', outcome: 'win',
        opponentId: `opponent:${i}`, now: day });
      expect(reward.awarded).toBe(i < 20 ? 30 : 0);
    }
    expect((await store.wallet('a')).balance).toBe(SEED_ECONOMY.utcDailyRepeatableCap);
    expect((await store.settle({ playerId: 'a', sourceKey: 'duel:next', mode: 'queue', outcome: 'loss',
      opponentId: 'new', now: day + 60_000 })).awarded).toBe(8);
  });
  it('never pays repeated results or an excessive friend pair', async () => {
    const store = new MemoryWorldEconomyStore();
    const input = { playerId: 'a', sourceKey: 'duel:one', mode: 'friend' as const,
      outcome: 'win' as const, opponentId: 'b', now: 1_000_000 };
    expect((await store.settle(input)).awarded).toBe(15);
    expect((await store.settle(input)).replayed).toBe(true);
    for (let i = 2; i <= 4; i++) {
      const reward = await store.settle({ ...input, sourceKey: `duel:${i}` });
      expect(reward.awarded).toBe(i < 4 ? 15 : 0);
    }
  });
});

describe('the world read carries each owner’s highest settled Campaign level', () => {
  // The exact keys the live settle path writes (`campaign:c3-22`), read back as OPAQUE strings —
  // nothing in the Seeds core imports the campaign definitions (tests/campaign/isolation.test.ts).
  const CAMPAIGN_KEYS = [
    ...Array.from({ length: 10 }, (_, i) => `campaign:c1-${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 10 }, (_, i) => `campaign:c2-${i + 11}`),
    ...Array.from({ length: 2 }, (_, i) => `campaign:c3-${i + 21}`),
  ];

  /** A store with one claim per owner and their campaign receipts recorded in the given order. */
  const storeWith = async (receipts: Record<string, string[]>): Promise<MemoryWorldEconomyStore> => {
    const store = new MemoryWorldEconomyStore();
    let index = 0;
    let now = Date.UTC(2026, 9, 15);
    for (const [ownerId, keys] of Object.entries(receipts)) {
      const cellId = `${index},0`;
      store.claims.set(cellId, { cellId, ownerId, ownerName: ownerId, ownerLevel: null, claimedAt: now });
      for (const key of keys) {
        await store.settle({ playerId: ownerId, sourceKey: key, mode: 'campaign', outcome: 'win', opponentId: null, campaignLevel: 1, now: now++ });
      }
      index += 1;
    }
    return store;
  };
  const levelOf = async (store: MemoryWorldEconomyStore, ownerId: string): Promise<number | null> => {
    const world = await store.world();
    return world.claims.find((claim) => claim.ownerId === ownerId)?.ownerLevel ?? null;
  };

  it('reads the ordinal out of the recorded key, and gives nothing for a key without a level', () => {
    expect(campaignLevelOfSourceKey('campaign:c3-22')).toBe(22);
    expect(campaignLevelOfSourceKey('campaign:c1-01')).toBe(1);
    expect(campaignLevelOfSourceKey('campaign:c10-50')).toBe(50);
    expect(campaignLevelOfSourceKey('campaign:1')).toBeNull(); // the old test fixture's plain number
    expect(campaignLevelOfSourceKey('training:abc')).toBeNull();
    expect(campaignLevelOfSourceKey('duel:xyz')).toBeNull();
  });

  it('reports the HIGHEST level settled, and a player with no receipts reports none', async () => {
    const store = await storeWith({ veteran: CAMPAIGN_KEYS, rookie: [] });
    expect(await levelOf(store, 'veteran')).toBe(22);
    // Never `LEVEL 1`: a player with no campaign receipts has no level to show.
    expect(await levelOf(store, 'rookie')).toBeNull();
  });

  it('does not depend on the order the receipts were recorded in', async () => {
    const forward = await storeWith({ veteran: CAMPAIGN_KEYS });
    const reverse = await storeWith({ veteran: [...CAMPAIGN_KEYS].reverse() });
    expect(await levelOf(forward, 'veteran')).toBe(22);
    // Highest, not last: recorded c3-22 first, the answer is still 22.
    expect(await levelOf(reverse, 'veteran')).toBe(22);
  });
});
