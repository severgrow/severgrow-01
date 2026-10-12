// Phase 6 — leak audit, turn-gate proof, two-device 409 recovery, and in-process load.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { MatchViewPayload } from '../src/protocol.js';
import { ApiError } from '../src/errors.js';
import type { Action } from '../../src/engine/index.js';

const HIDDEN_VIEW_KEYS = ['seed', 'deck', 'hands', 'history', 'fruitKnown', 'log'] as const;
const HIDDEN_TOP_KEYS = ['state', 'deckOrder', 'seed'] as const;

const assertNoHiddenShape = (payload: MatchViewPayload) => {
  for (const key of HIDDEN_TOP_KEYS) expect(Object.keys(payload)).not.toContain(key);
  for (const key of HIDDEN_VIEW_KEYS) expect(Object.keys(payload.view)).not.toContain(key);
  expect(payload.view.hand).toBeDefined();
  expect(typeof payload.view.opponentHandCount).toBe('number');
  expect(typeof payload.view.deckCount).toBe('number');
};

const twoPlayers = async (service: MatchService) => {
  const a = await service.createGuest('Moss');
  const pa = await service.authenticate(a.token);
  const created = await service.createMatch(pa);
  const b = await service.createGuest('Lava');
  const pb = await service.authenticate(b.token);
  await service.joinMatch(pb, created.match.inviteCode);
  return { service, tokenA: a.token, tokenB: b.token, pa, pb, matchId: created.match.matchId };
};

const actorOf = async (service: MatchService, pa: Awaited<ReturnType<MatchService['authenticate']>>, pb: Awaited<ReturnType<MatchService['authenticate']>>, matchId: string) => {
  const va = await service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, view: va };
  const vb = await service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, view: vb };
  return null;
};

describe('Phase 6 leak audit', () => {
  it('player views and list entries never expose seed, deck, or opponent cards', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const h = await twoPlayers(service);
    const viewA = await service.viewPayload(h.pa, h.matchId);
    const viewB = await service.viewPayload(h.pb, h.matchId);
    assertNoHiddenShape(viewA);
    assertNoHiddenShape(viewB);

    // Collect object keys only (Draw events may legitimately say from:"deck").
    const keysOf = (value: unknown, out: string[] = []): string[] => {
      if (Array.isArray(value)) for (const item of value) keysOf(item, out);
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out.push(k);
          keysOf(v, out);
        }
      }
      return out;
    };
    const keys = [...keysOf(viewA), ...keysOf(viewB)];
    expect(keys.filter((k) => k === 'seed')).toHaveLength(0);
    expect(keys.filter((k) => k === 'hands')).toHaveLength(0);
    expect(keys.filter((k) => k === 'state')).toHaveLength(0);
    expect(keys.filter((k) => k === 'deck')).toHaveLength(0);
    expect(keys).toContain('deckCount');

    const list = await service.listMyMatches(h.pa);
    expect(list).toHaveLength(1);
    const listKeys = keysOf(list[0]);
    expect(listKeys).not.toContain('hand');
    expect(listKeys).not.toContain('deck');
    expect(listKeys).not.toContain('seed');
  });

  it('keeps mid-turn Draw private until Throw (turn gate)', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const h = await twoPlayers(service);
    const next = (await actorOf(service, h.pa, h.pb, h.matchId))!;
    const waiting = next.player.id === h.pa.id ? h.pb : h.pa;
    const before = await service.viewPayload(waiting, h.matchId);
    const draw = next.view.legalActions.find((a) => a.t === 'Draw');
    expect(draw).toBeTruthy();
    await service.submitAction(next.player, h.matchId, {
      expectedRevision: next.view.revision,
      requestId: 'p6-draw',
      action: draw!,
    });
    const midOpp = await service.viewPayload(waiting, h.matchId);
    expect(midOpp.revision).toBe(before.revision);
    expect(midOpp.events).toEqual(before.events);
    expect(midOpp.view.deckCount).toBe(before.view.deckCount);
  });
});

describe('Phase 6 two-device / 409 recovery', () => {
  it('second concurrent submit with stale revision fails cleanly; refetch recovers', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const h = await twoPlayers(service);
    const next = (await actorOf(service, h.pa, h.pb, h.matchId))!;
    const action = next.view.legalActions[0]!;
    const first = service.submitAction(next.player, h.matchId, {
      expectedRevision: next.view.revision,
      requestId: 'p6-tab-a',
      action,
    });
    const second = service.submitAction(next.player, h.matchId, {
      expectedRevision: next.view.revision,
      requestId: 'p6-tab-b',
      action,
    });
    const results = await Promise.allSettled([first, second]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
    expect((bad[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect(((bad[0] as PromiseRejectedResult).reason as ApiError).code).toBe('STALE_REVISION');

    const recovered = await service.viewPayload(next.player, h.matchId);
    expect(recovered.revision).toBeGreaterThan(next.view.revision);
  });
});

describe('Phase 6 in-process load', () => {
  it('handles 40 concurrent viewPayload calls under 300ms p95 wall (memory)', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const h = await twoPlayers(service);
    const samples: number[] = [];
    for (let round = 0; round < 40; round++) {
      const t0 = performance.now();
      await Promise.all([
        service.viewPayload(h.pa, h.matchId),
        service.viewPayload(h.pb, h.matchId),
      ]);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    expect(p95, `viewPayload pair p95=${p95.toFixed(1)}ms`).toBeLessThan(300);
  });

  it('commits a short burst of legal actions without hanging', async () => {
    const service = new MatchService({
      storage: new MemoryStorage(),
      config: { ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 },
    });
    const h = await twoPlayers(service);
    for (let i = 0; i < 12; i++) {
      const next = await actorOf(service, h.pa, h.pb, h.matchId);
      if (!next) break;
      const action: Action =
        next.view.legalActions.find((a) => a.t === 'Draw') ??
        next.view.legalActions.find((a) => a.t === 'EndAct') ??
        next.view.legalActions[0]!;
      await service.submitAction(next.player, h.matchId, {
        expectedRevision: next.view.revision,
        requestId: `p6-burst-${i}`,
        action,
      });
    }
    const view = await service.viewPayload(h.pa, h.matchId);
    expect(['active', 'finished']).toContain(view.status);
  });
});
