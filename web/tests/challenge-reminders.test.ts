// The reminder skeleton (owner, 2026-11-10): planned, not wired. Pins the plan so it is right when it is.
import { describe, expect, it } from 'vitest';
import { reminderPlan, setIconCount } from '../src/online/challenge-reminders';

const H = 60 * 60 * 1000;
const row = (over: Record<string, unknown>) => ({ id: 'c', cellId: '0,0', fromMe: false, status: 'pending', expiresAt: 48 * H, ...over }) as never;

describe('challenge reminders (skeleton)', () => {
  it('plans 12 h and 1 h before each answer I owe, soonest first, never late', () => {
    const plan = reminderPlan([row({ id: 'a', expiresAt: 48 * H }), row({ id: 'b', cellId: '1,1', expiresAt: 6 * H })], 0);
    expect(plan.map((p) => `${p.challengeId}:${p.kind}:${p.at / H}`)).toEqual(['b:1h:5', 'a:12h:36', 'a:1h:47']);
  });
  it('nothing for my own challenge, a running duel or a closed window', () => {
    expect(reminderPlan([row({ fromMe: true }), row({ status: 'accepted' }), row({ expiresAt: -1 })], 0)).toEqual([]);
  });
  it('the icon count is silent where the platform has none', async () => {
    expect(await setIconCount(2, {} as Navigator)).toBe(false);
    const seen: unknown[] = [];
    const nav = { setAppBadge: async (n?: number) => { seen.push(n); }, clearAppBadge: async () => { seen.push('clear'); } } as unknown as Navigator;
    expect(await setIconCount(3, nav)).toBe(true);
    expect(await setIconCount(0, nav)).toBe(true);
    expect(seen).toEqual([3, 'clear']);
  });
});
