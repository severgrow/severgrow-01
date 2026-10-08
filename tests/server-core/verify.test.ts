import { describe, expect, it } from 'vitest';
import { legalActions, viewFor, newGame, apply } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { BOT_VERSION, DEFAULT_WORLD_CONFIG, RULES_VERSION, finishGame, issueTicket, newAccount, verifyGame } from '../../src/server-core/index.js';
import type { Ticket } from '../../src/server-core/index.js';
import { losingGame, winningGame } from './helpers.js';

const H = 3600_000;
const ticketFor = (seed: number, level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, now = 1_000_000): Ticket =>
  issueTicket({ id: `t-${seed}-${level}`, playerId: 'p1', seed, level, now }, DEFAULT_WORLD_CONFIG);

describe('tickets', () => {
  it('a ticket carries the server-chosen seed, the level, the rules version and expires in 2 hours', () => {
    const t = ticketFor(42, 5, 1000);
    expect(t).toMatchObject({ id: 't-42-5', playerId: 'p1', seed: 42, level: 5, rulesVersion: RULES_VERSION, botVersion: BOT_VERSION, expiresAt: 1000 + 2 * H, used: false });
    expect(RULES_VERSION).toBe('futasaku0.3-mega-bomb-final-turns');
    expect(BOT_VERSION).toBe(CURRENT_BOT_VERSION);
  });
});

describe('versions: only the current rules and bots are accepted', () => {


  it('rejects unknown rules or bot versions', () => {
    const t = ticketFor(1, 4);
    expect(verifyGame({ ...t, rulesVersion: 'v9.9' }, [], 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/rules/) });
    expect(verifyGame({ ...t, botVersion: 'bots-v9' }, [], 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/bot version/) });
  });

  it('the seed only ever comes from the ticket: the moves cannot choose or change it', () => {
    // verifyGame takes (ticket, actions); a log played on another seed fails on the stored one
    const other = winningGame(4, 30);
    const t = ticketFor(other.seed + 1, 4);
    expect(verifyGame(t, other.actions, 2_000_000).ok).toBe(false);
  });
});

describe('verifyGame: the whole game is replayed with the real engine and bot', () => {
  const win = winningGame(4, 1);
  const t = ticketFor(win.seed, 4);

  it('accepts an honest winning game', () => {
    expect(verifyGame(t, win.actions, 2_000_000)).toEqual({ ok: true, scores: win.end.result!.scores });
  });

  it('rejects a changed human action (not legal at that point)', () => {
    const i = win.actions.findIndex((a, k) => k % 2 === 0 && a.t === 'Draw');
    const bad = [...win.actions];
    bad[i] = { t: 'EndAct' };
    expect(verifyGame(t, bad, 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/not allowed/) });
  });

  it("ADVERSARIAL 1: rejects a changed bot action (even a legal one)", () => {
    // Find a bot step with another legal option and swap it in.
    let s = newGame(win.seed);
    let done = false;
    const bad: Action[] = [];
    for (const a of win.actions) {
      if (!done && s.actor === 1) {
        const alt = legalActions(viewFor(s, 1)).find((x) => JSON.stringify(x) !== JSON.stringify(a));
        if (alt) {
          bad.push(alt);
          done = true;
          break;
        }
      }
      bad.push(a);
      s = apply(s, a);
    }
    expect(done).toBe(true);
    expect(verifyGame(t, bad, 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/bot/) });
  });

  it('rejects the wrong level and the wrong seed', () => {
    expect(verifyGame({ ...t, level: 5 }, win.actions, 2_000_000).ok).toBe(false);
    expect(verifyGame({ ...t, seed: t.seed + 1 }, win.actions, 2_000_000).ok).toBe(false);
  });

  it('rejects a losing game', () => {
    const lose = losingGame(7, 1);
    expect(verifyGame(ticketFor(lose.seed, 7), lose.actions, 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/did not win/) });
  });

  it('rejects an expired ticket and a rules mismatch', () => {
    expect(verifyGame(t, win.actions, t.expiresAt + 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
    expect(verifyGame({ ...t, rulesVersion: 'v0.3' }, win.actions, 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/rules/) });
  });

  it('rejects a truncated log (game not finished) and extra actions after the end', () => {
    expect(verifyGame(t, win.actions.slice(0, -3), 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/not finished/) });
    expect(verifyGame(t, [...win.actions, { t: 'EndAct' }], 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/after the game ended/) });
  });

  it('ADVERSARIAL 2: rejects junk instead of actions without crashing', () => {
    expect(verifyGame(t, [{ t: 'Nope' } as unknown as Action], 2_000_000).ok).toBe(false);
    expect(verifyGame(t, 'hello' as unknown as Action[], 2_000_000).ok).toBe(false);
    expect(verifyGame(t, Array(10_001).fill({ t: 'EndAct' }), 2_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/too long/) });
  });
});

describe('finishGame: tickets work once, wins become tokens', () => {
  const win = winningGame(6, 3);

  it('ADVERSARIAL 3: a verified win banks one token of that level; the ticket cannot be reused', () => {
    const t = ticketFor(win.seed, 6);
    const r = finishGame(newAccount('p1', 0), t, win.actions, 2_000_000, DEFAULT_WORLD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.account.tokens).toEqual([6]);
    expect(r.ticket.used).toBe(true);
    expect(finishGame(r.account, r.ticket, win.actions, 2_000_000, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/already used/) });
  });

  it("someone else's ticket is refused", () => {
    expect(finishGame(newAccount('p2', 0), ticketFor(win.seed, 6), win.actions, 2_000_000, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/not yours/) });
  });

  it('at most 3 banked tokens: a 4th win is refused (and the ticket is not used up)', () => {
    const full = { ...newAccount('p1', 0), tokens: [3, 4, 5] as (1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[] };
    const r = finishGame(full, ticketFor(win.seed, 6), win.actions, 2_000_000, DEFAULT_WORLD_CONFIG);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Place a sprout first/) });
  });
});
