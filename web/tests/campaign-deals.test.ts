// Random campaign deals and the restart rest (owner, 2026-11-01).
import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import { CAMPAIGN_LEVELS, RANDOM_DEALS_FEATURE } from '../../src/campaign/index.js';
import {
  CAMPAIGN_REST_KEY,
  RANDOM_DEALS_KEY,
  REST_MS,
  RESTART_LIMIT,
  dealFor,
  emptyRest,
  finishDeal,
  markMoved,
  parseRest,
  randomDealsEnabled,
  refreshRandomDeals,
  restLeftMs,
  startDeal,
  type RestState,
} from '../src/logic/campaign-deals.js';

const storage = (): KeyValue => {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); }, remove: (k) => { data.delete(k); } };
};
const lesson = CAMPAIGN_LEVELS.find((l) => l.number === 7)!;
const eleven = CAMPAIGN_LEVELS.find((l) => l.number === 11)!;

describe('which deal a campaign attempt gets', () => {
  it('level 11+ shuffles a new deal each time once the server checks random deals', () => {
    let n = 0;
    const rng = () => [11, 22, 33][n++]!;
    expect(dealFor(eleven, true, rng)).toEqual({ seed: 11, random: true });
    expect(dealFor(eleven, true, rng)).toEqual({ seed: 22, random: true });
  });
  it('until the server is updated, level 11+ keeps its fixed deal (no Seeds can be lost)', () => {
    expect(dealFor(eleven, false, () => 5)).toEqual({ seed: eleven.seed, random: false });
  });
  it('a lesson always keeps its one authored opening', () => {
    expect(dealFor(lesson, true, () => 5)).toEqual({ seed: lesson.seed, random: false });
  });
});

describe('knowing whether the server checks random deals', () => {
  it('turns on when the server lists the feature, and is remembered for offline play', async () => {
    const kv = storage();
    expect(randomDealsEnabled(kv)).toBe(false);
    expect(await refreshRandomDeals(kv, async () => ['other', RANDOM_DEALS_FEATURE])).toBe(true);
    expect(kv.get(RANDOM_DEALS_KEY)).toBe('1');
    expect(randomDealsEnabled(kv)).toBe(true);
  });
  it('an older server (no list) turns it off again', async () => {
    const kv = storage();
    kv.set(RANDOM_DEALS_KEY, '1');
    expect(await refreshRandomDeals(kv, async () => [])).toBe(false);
    expect(randomDealsEnabled(kv)).toBe(false);
  });
  it('offline keeps the last answer', async () => {
    const kv = storage();
    kv.set(RANDOM_DEALS_KEY, '1');
    expect(await refreshRandomDeals(kv, async () => { throw new Error('offline'); })).toBe(true);
  });
  it('blocked storage reads as off and never throws', async () => {
    const broken: KeyValue = { get: () => { throw new Error('x'); }, set: () => { throw new Error('x'); }, remove: () => undefined };
    expect(randomDealsEnabled(broken)).toBe(false);
    expect(await refreshRandomDeals(broken, async () => [RANDOM_DEALS_FEATURE])).toBe(true);
  });
});

describe('the restart rest: 5 new deals in a row without a move rests the campaign for an hour', () => {
  const T = 1_800_000_000_000;
  const abandonInARow = (count: number, from: RestState = emptyRest()) => {
    let state = startDeal(from, T).state;
    for (let i = 0; i < count; i++) state = startDeal(state, T + i).state;
    return state;
  };

  it('is five restarts and one hour', () => {
    expect(RESTART_LIMIT).toBe(5);
    expect(REST_MS).toBe(3_600_000);
  });

  it('four restarts without a move are fine; the fifth starts the rest and no deal', () => {
    const four = abandonInARow(4);
    expect(four.abandons).toBe(4);
    expect(restLeftMs(four, T)).toBe(0);
    const fifth = startDeal(four, T + 10);
    expect(fifth.allowed).toBe(false);
    expect(restLeftMs(fifth.state, T + 10)).toBe(REST_MS);
  });

  it('while resting no deal starts; after the hour the count begins again from zero', () => {
    const rested = startDeal(abandonInARow(4), T).state;
    expect(startDeal(rested, T + REST_MS - 1).allowed).toBe(false);
    const after = startDeal(rested, T + REST_MS);
    expect(after.allowed).toBe(true);
    expect(after.state.abandons).toBe(0);
  });

  it('a single real move resets the count', () => {
    let state = abandonInARow(4);
    state = markMoved(state);
    const next = startDeal(state, T);
    expect(next.allowed).toBe(true);
    expect(next.state.abandons).toBe(0);
  });

  it('a finished match (won or lost) resets the count', () => {
    const state = finishDeal(abandonInARow(4));
    expect(startDeal(state, T).state.abandons).toBe(0);
  });

  it('the first deal ever is never an abandon', () => {
    expect(startDeal(emptyRest(), T).state.abandons).toBe(0);
  });

  it('a stored record survives a reload, and junk reads as a clean slate', () => {
    const state = abandonInARow(3);
    expect(parseRest(JSON.stringify(state))).toEqual(state);
    for (const junk of [null, '', '{', '[]', '{"v":1,"abandons":"x"}', '{"v":2}']) expect(parseRest(junk)).toEqual(emptyRest());
    expect(CAMPAIGN_REST_KEY).toMatch(/^severgrow\./);
  });

  it('a clock moved far back cannot make the rest last longer than an hour', () => {
    const rested = startDeal(abandonInARow(4), T).state;
    expect(restLeftMs(rested, T - 10 * REST_MS)).toBe(REST_MS);
  });
});
