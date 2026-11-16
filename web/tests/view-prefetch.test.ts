// OPENING A MATCH FROM THE LIST IS INSTANT (owner, 2026-11-16: "opening match from play online/your
// matches when its our turn - takes long ... make that instant"). See online/view-prefetch.ts.
import { describe, expect, it } from 'vitest';
import { PREFETCH_FRESH_MS, PREFETCH_MAX, createViewPrefetch } from '../src/online/view-prefetch.js';

type Row = { matchId: string; status: 'active' | 'finished' | 'waiting'; mySeat: 0 | 1; turnPlayer: 0 | 1 | null; revision: number };
const mine = (matchId: string, revision = 5): Row => ({ matchId, status: 'active', mySeat: 0, turnPlayer: 0, revision });

const harness = () => {
  let clock = 0;
  const asked: string[] = [];
  const answers = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  let seen: number | undefined = 3;
  const prefetch = createViewPrefetch<string>({
    fetch: (id) => { asked.push(id); return new Promise((resolve, reject) => answers.set(id, { resolve, reject })); },
    seen: () => seen,
    now: () => clock,
  });
  return {
    prefetch, asked, answers,
    advance: (ms: number) => { clock += ms; },
    setSeen: (n: number | undefined) => { seen = n; },
  };
};

describe('the list fetches the matches waiting for my move', () => {
  it('asks once for each match where it is my turn, and for nothing else', () => {
    const h = harness();
    h.prefetch.warm([mine('a'), { ...mine('b'), turnPlayer: 1 }, { ...mine('c'), status: 'finished' }, { ...mine('d'), status: 'waiting' }]);
    expect(h.asked).toEqual(['a']);
  });

  it('a poll that shows the same list asks for nothing more', () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    h.prefetch.warm([mine('a')]);
    h.advance(10_000);
    h.prefetch.warm([mine('a')]);
    expect(h.asked).toEqual(['a']);
  });

  it('a new move in that match asks again', () => {
    const h = harness();
    h.prefetch.warm([mine('a', 5)]);
    h.prefetch.warm([mine('a', 6)]);
    expect(h.asked).toEqual(['a', 'a']);
  });

  it(`never more than ${PREFETCH_MAX} at a time, so a long list costs a few small reads`, () => {
    const h = harness();
    h.prefetch.warm(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => mine(id)));
    expect(h.asked.length).toBe(PREFETCH_MAX);
  });
});

describe('a tap uses what was fetched', () => {
  it('hands over the answer for the same match, revision and device view, once', async () => {
    const h = harness();
    h.prefetch.warm([mine('a', 5)]);
    h.answers.get('a')!.resolve('view-a');
    const taken = h.prefetch.take('a');
    expect(await taken).toBe('view-a');
    expect(h.prefetch.take('a'), 'used once').toBeNull();
  });

  it('a read still on its way is handed over too: the tap waits only for the rest of it', async () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    const taken = h.prefetch.take('a');
    expect(taken).not.toBeNull();
    h.answers.get('a')!.resolve('late');
    expect(await taken).toBe('late');
  });

  it(`an answer older than ${PREFETCH_FRESH_MS / 1000} s is not used`, () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    h.answers.get('a')!.resolve('old');
    h.advance(PREFETCH_FRESH_MS + 1);
    expect(h.prefetch.take('a')).toBeNull();
  });

  it('an answer from before this device saw more of the match is not used (it would replay the wrong turns)', () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    h.setSeen(4);
    expect(h.prefetch.take('a')).toBeNull();
  });

  it('a failed read is forgotten: the tap reads for itself, and the next list asks again', async () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    h.answers.get('a')!.reject(new Error('offline'));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.prefetch.take('a')).toBeNull();
    h.prefetch.warm([mine('a')]);
    expect(h.asked).toEqual(['a', 'a']);
  });

  it('a match that left the list is dropped', () => {
    const h = harness();
    h.prefetch.warm([mine('a')]);
    h.prefetch.warm([{ ...mine('a'), turnPlayer: 1 }]);
    expect(h.prefetch.take('a')).toBeNull();
  });
});
