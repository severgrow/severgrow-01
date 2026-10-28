import { describe, expect, it } from 'vitest';
import { WORLD_CELLS, WORLD_CELL_IDS, WORLD_LIMIT, WORLD_REACH, hexDistance, legacyWorldCell, parseWorldCell, seenCellIds, seenWorld, worldAround, worldNeighbours } from '../src/world.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { SEED_ECONOMY, BETA_PAYOUT_MULTIPLIER, campaignLevelOfSourceKey, campaignSeedReward } from '../src/seeds/config.js';

/**
 * The BETA multiplier scales every award at the settlement decision (`planSeedReward`), so a test
 * that pins a credited amount must scale with it - otherwise reverting the beta would break the
 * suite, and leaving the beta on would silently under-test the real figure. `campaignSeedReward`
 * itself is the BASE price list and stays unscaled (the "matches all first-clear and chapter reward
 * values" case below still pins the owner's numbers).
 */
const M = BETA_PAYOUT_MULTIPLIER;
/** What ONE level-1 clear actually credits: base (50) plus its chapter bonus (0), doubled. */
const CLEAR_1 = (campaignSeedReward(1)!.firstWin + campaignSeedReward(1)!.chapter) * M;

const grant = (store: MemoryWorldEconomyStore, playerId: string, sourceKey: string, now = Date.UTC(2026, 9, 15)) =>
  store.settle({ playerId, sourceKey, mode: 'campaign', outcome: 'win', opponentId: null, campaignLevel: 1, now });

describe('frozen shared hex world', () => {
  it('is 274 unique connected cells with no one-cell tails (v2)', () => {
    expect(WORLD_CELLS).toHaveLength(274);
    expect(WORLD_CELL_IDS.size).toBe(274);
    // The v2 coastline's own shape: neighbours WITHIN it (v3's neighbours reach past the coast).
    const inside = (id: string) => worldNeighbours(id).filter((n) => WORLD_CELL_IDS.has(n));
    const seen = new Set<string>([WORLD_CELLS[0]!.id]);
    const queue = [WORLD_CELLS[0]!.id];
    while (queue.length) for (const id of inside(queue.shift()!)) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    expect(seen.size).toBe(274);
    expect(WORLD_CELLS.every((c) => inside(c.id).length >= 2)).toBe(true);
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
      // v3: a neighbour may lie beyond the v2 coast — it is still land in the world underneath.
      for (const id of worldNeighbours(c.id)) expect(parseWorldCell(id)).not.toBeNull();
    }
  });
});

describe('Seed purchases', () => {
  // OWNER EXPERIMENT (2026-10-27): "remove the rule of having to place a tile next to yours. So
  // player can place a tile anywhere in the territory." Replaces the old adjacency rule.
  it('a tile can be grown anywhere on the seen map, and charges exactly 100', async () => {
    const store = new MemoryWorldEconomyStore();
    for (let i = 1; i <= 4; i++) await grant(store, 'a', `campaign:${i}`);
    const first = await store.claim('a', '0,0', 'request-0001', 1);
    expect(first).toMatchObject({ ok: true, cellId: '0,0', replayed: false, wallet: { balance: 4 * CLEAR_1 - SEED_ECONOMY.tileCost } });
    expect((await store.claim('a', '0,0', 'request-0001', 2))).toMatchObject({ ok: true, replayed: true });
    // far from the first tile: no longer refused
    expect(await store.claim('a', '6,-4', 'request-0002', 2)).toMatchObject({ ok: true, cellId: '6,-4' });
    expect(store.ledger.filter((x) => x.delta < 0)).toHaveLength(2);
  });
  it('land nobody can see yet cannot be grown, nor anything outside the world', async () => {
    const store = new MemoryWorldEconomyStore();
    for (let i = 1; i <= 4; i++) await grant(store, 'a', `campaign:${i}`);
    expect(await store.claim('a', '20,0', 'request-0003', 1)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(await store.claim('a', 'nope', 'request-0004', 1)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(await store.claim('a', `${WORLD_LIMIT + 1},0`, 'request-0005', 1)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
    expect(store.ledger.filter((x) => x.delta < 0)).toHaveLength(0);
  });
  it('a tile at the coast uncovers the land around it, and the next tile can go there', async () => {
    const store = new MemoryWorldEconomyStore();
    for (let i = 1; i <= 4; i++) await grant(store, 'a', `campaign:${i}`);
    expect(WORLD_CELL_IDS.has('8,0')).toBe(true);
    expect(WORLD_CELL_IDS.has('10,0')).toBe(false);
    expect(await store.claim('a', '8,0', 'request-0006', 1)).toMatchObject({ ok: true });
    expect(await store.claim('a', '10,0', 'request-0007', 2)).toMatchObject({ ok: true });
    const world = await store.world();
    const seen = seenCellIds(world.claims.map((c) => c.cellId));
    expect(seen.has('12,0')).toBe(true);
    expect(seen.has('13,0')).toBe(false);
  });
});

describe('the growing map (v3)', () => {
  it('keeps every v2 cell, so no claim is ever orphaned', () => {
    const seen = seenCellIds([]);
    for (const id of WORLD_CELL_IDS) expect(seen.has(id)).toBe(true);
    expect(seen.size).toBe(WORLD_CELLS.length);
  });
  it('uncovers every hex within two of a tile, and no more', () => {
    expect(WORLD_REACH).toBe(2);
    expect(worldAround('0,0')).toHaveLength(19);
    const seen = seenCellIds(['8,0']);
    for (const id of ['9,0', '10,0', '10,-1', '9,1', '8,2']) expect(seen.has(id)).toBe(true);
    expect(seen.has('11,0')).toBe(false);
  });
  it('a tile is never at the edge: every tile has two rings of seen land around it', () => {
    const claims = ['8,0', '10,0', '-10,8', '3,-10'];
    const seen = seenCellIds(claims);
    for (const c of claims) for (const id of worldAround(c)) expect(seen.has(id)).toBe(true);
  });
  it('the seen map is deterministic and ordered top row first', () => {
    const a = seenWorld(['10,0', '8,0']).map((c) => c.id);
    const b = seenWorld(['8,0', '10,0']).map((c) => c.id);
    expect(a).toEqual(b);
    const cells = seenWorld(['8,0']);
    for (let i = 1; i < cells.length; i++) {
      const p = cells[i - 1]!, c = cells[i]!;
      expect(p.r < c.r || (p.r === c.r && p.q < c.q)).toBe(true);
    }
  });
  it('names only real land: ids are canonical, inside the world underneath', () => {
    expect(parseWorldCell('3,-2')).toEqual({ id: '3,-2', q: 3, r: -2 });
    for (const bad of ['03,1', '1, 2', '1,2,3', '', 'a,b', `${WORLD_LIMIT},${WORLD_LIMIT}`]) expect(parseWorldCell(bad)).toBeNull();
    expect(hexDistance(3, -2)).toBe(3);
  });
});

describe('Seed purchases, two buyers', () => {
  it('two buyers cannot acquire the same tile and rejected claims never debit', async () => {
    const store = new MemoryWorldEconomyStore();
    await grant(store, 'a', 'a1'); await grant(store, 'a', 'a2');
    await grant(store, 'b', 'b1'); await grant(store, 'b', 'b2');
    const [a, b] = await Promise.all([
      store.claim('a', '0,0', 'request-a000', 1), store.claim('b', '0,0', 'request-b000', 1),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    // The loser spent nothing: two clears, minus nothing.
    expect((await store.wallet(a.ok ? 'b' : 'a')).balance).toBe(2 * CLEAR_1);
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
      expect(reward.awarded).toBe(i < 20 ? SEED_ECONOMY.online.queue.win * M : 0);
    }
    expect((await store.wallet('a')).balance).toBe(SEED_ECONOMY.utcDailyRepeatableCap * M);
    expect((await store.settle({ playerId: 'a', sourceKey: 'duel:next', mode: 'queue', outcome: 'loss',
      opponentId: 'new', now: day + 60_000 })).awarded).toBe(SEED_ECONOMY.online.queue.loss * M);
  });
  it('never pays repeated results or an excessive friend pair', async () => {
    const store = new MemoryWorldEconomyStore();
    const input = { playerId: 'a', sourceKey: 'duel:one', mode: 'friend' as const,
      outcome: 'win' as const, opponentId: 'b', now: 1_000_000 };
    expect((await store.settle(input)).awarded).toBe(SEED_ECONOMY.online.friend.win * M);
    expect((await store.settle(input)).replayed).toBe(true);
    for (let i = 2; i <= 4; i++) {
      const reward = await store.settle({ ...input, sourceKey: `duel:${i}` });
      expect(reward.awarded).toBe(i < 4 ? SEED_ECONOMY.online.friend.win * M : 0);
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

// SELLING A TILE (owner, 2026-10-27: "add option of selling your tile for 100 seeds").
describe('selling a tile', () => {
  const funded = async () => {
    const store = new MemoryWorldEconomyStore();
    for (let i = 1; i <= 4; i++) await grant(store, 'a', `campaign:${i}`);
    await store.claim('a', '0,0', 'request-buy-1', 1);
    return store;
  };
  it('gives back exactly the tile price and frees the tile', async () => {
    const store = await funded();
    const before = (await store.wallet('a')).balance;
    const sold = await store.sell('a', '0,0', 'request-sell-1', 2);
    expect(sold).toMatchObject({ ok: true, cellId: '0,0', replayed: false, wallet: { balance: before + SEED_ECONOMY.tileSaleReturn } });
    expect(SEED_ECONOMY.tileSaleReturn).toBe(SEED_ECONOMY.tileCost);
    expect((await store.world()).claims.some((c) => c.cellId === '0,0')).toBe(false);
    // the same request again pays nothing more
    expect(await store.sell('a', '0,0', 'request-sell-1', 3)).toMatchObject({ ok: true, replayed: true, wallet: { balance: before + SEED_ECONOMY.tileSaleReturn } });
    // and the tile can be grown again
    expect(await store.claim('a', '0,0', 'request-buy-2', 4)).toMatchObject({ ok: true });
  });
  it('only the owner can sell, and only a tile that is held', async () => {
    const store = await funded();
    expect(await store.sell('b', '0,0', 'request-sell-2', 2)).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(await store.sell('a', '1,0', 'request-sell-3', 2)).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(await store.sell('a', 'nope', 'request-sell-4', 2)).toMatchObject({ ok: false, code: 'INVALID_CELL' });
  });
  it('a tile under an open challenge cannot be sold', async () => {
    const store = await funded();
    for (let i = 1; i <= 4; i++) await grant(store, 'b', `campaign:${i}`);
    await store.claim('b', '1,0', 'request-buy-b', 2);
    const sent = await store.sendChallenge({ challengerId: 'b', cellId: '0,0', requestId: 'challenge-1', stake: SEED_ECONOMY.challengeStake, now: 3 });
    expect(sent.ok).toBe(true);
    expect(await store.sell('a', '0,0', 'request-sell-5', 4)).toMatchObject({ ok: false, code: 'CELL_BUSY' });
  });
});
