// SIGN-IN FIRST (owner, 2026-11-18: "Login through Google still takes about 5 or 6 seconds and then
// page refreshes ... before it was actually instant"). Back from Google, the page used to start every
// online read as the OLD guest (a dozen requests) beside the sign-in hand-over, which then queued
// behind them on the server. On a return from Google the
// online start-up now waits for the sign-in; on any other visit it starts at once, as before.
import { describe, expect, it } from 'vitest';
import { createSignInGate } from '../src/accounts/sign-in-gate.js';

const flushed = async (p: Promise<void>) => {
  let done = false;
  void p.then(() => { done = true; });
  await Promise.resolve(); await Promise.resolve();
  return done;
};

describe('the sign-in gate', () => {
  it('an ordinary visit starts at once', async () => {
    const gate = createSignInGate({ search: '', hash: '', resumePending: false });
    expect(gate.holding).toBe(false);
    expect(await flushed(gate.settled)).toBe(true);
  });
  it('a return from Google waits until the sign-in says it is done', async () => {
    const gate = createSignInGate({ search: '?code=abcdefgh1234', hash: '', resumePending: false });
    expect(gate.holding).toBe(true);
    expect(await flushed(gate.settled)).toBe(false);
    gate.settle();
    expect(await flushed(gate.settled)).toBe(true);
  });
  it('a sign-in resumed after a reload waits too', () => {
    expect(createSignInGate({ search: '', hash: '', resumePending: true }).holding).toBe(true);
  });
  it('a Google error page in the address waits for the sign-in code to show its message, then starts', async () => {
    const gate = createSignInGate({ search: '?error=access_denied', hash: '', resumePending: false });
    expect(gate.holding).toBe(true);
    gate.settle();
    expect(await flushed(gate.settled)).toBe(true);
  });
  it('never holds for ever: the start-up goes on after the safety limit', async () => {
    let fire: () => void = () => undefined;
    const gate = createSignInGate({ search: '?code=abcdefgh1234', hash: '', resumePending: false, setTimer: (f) => { fire = f; } });
    expect(await flushed(gate.settled)).toBe(false);
    fire();
    expect(await flushed(gate.settled)).toBe(true);
  });
});
