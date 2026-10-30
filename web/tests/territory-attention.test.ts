// "Is anything waiting for ME in Territory?" (owner, 2026-10-30).
//
// The owner's rule, verbatim: "notifcations for territory and in territory submenu should show up
// only when its OUR turn to do something - respond to challenge or do our turn, notifcation dont
// show if we dont have any move waiting for us there".
//
// This file is the gate for that rule, twice over:
//   1. the predicate itself, table-driven over every state a challenge can be in;
//   2. that every badge surface actually READS it — the source of each painter is checked, so a
//      later edit cannot quietly put a wider count back on a lamp.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';
import {
  needsMyAction,
  waitingActionCount,
  waitingChallenges,
} from '../src/online/territory-attention.js';

type Wire = WorldChallengeWire;
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const challenge = (over: Partial<Wire> = {}): Wire => ({
  id: 'c1',
  cellId: '0,0',
  challengerId: 'them',
  defenderId: 'me',
  challengerName: 'RYK',
  defenderName: 'BloomHeron',
  fromMe: false,
  status: 'pending',
  stake: 0,
  stakeCellId: null,
  createdAt: 0,
  expiresAt: 24 * 60 * 60 * 1000,
  respondedAt: null,
  matchId: null,
  matchFinished: false,
  matchWaitingForMe: false,
  matchWinnerId: null,
  winnerId: null,
  resolvedAt: null,
  remainingMs: 24 * 60 * 60 * 1000,
  serverNow: 0,
  ...over,
});

describe('the one decision: does this challenge wait for my move?', () => {
  it('an INCOMING pending challenge waits for my answer', () => {
    expect(needsMyAction(challenge({ fromMe: false, status: 'pending' }))).toBe(true);
  });

  it('a challenge I SENT does not badge, however long it waits', () => {
    expect(needsMyAction(challenge({ fromMe: true, status: 'pending' }))).toBe(false);
  });

  it('an accepted duel badges only on MY turn', () => {
    const live = { status: 'accepted' as const, matchId: 'm1', fromMe: true, matchFinished: false };
    expect(needsMyAction(challenge({ ...live, matchWaitingForMe: true }))).toBe(true);
    expect(needsMyAction(challenge({ ...live, matchWaitingForMe: false }))).toBe(false);
  });

  it('a finished match never badges, even if the turn field is contradictory', () => {
    expect(needsMyAction(challenge({
      status: 'accepted', matchId: 'm1', matchFinished: true, matchWaitingForMe: true,
    }))).toBe(false);
    // ...and a finished duel with no waiting turn, the normal shape, is quiet too.
    expect(needsMyAction(challenge({
      status: 'accepted', matchId: 'm1', matchFinished: true, matchWaitingForMe: false,
    }))).toBe(false);
  });

  it('closed states are history: declined, expired, resolved, stale never badge', () => {
    for (const status of ['declined', 'expired', 'resolved', 'stale'] as const) {
      expect(needsMyAction(challenge({ status, matchWaitingForMe: true }))).toBe(false);
    }
  });

  it('a live duel where it is THEIR turn does not badge', () => {
    // The defender's own challenge, accepted, opponent to move.
    expect(needsMyAction(challenge({
      status: 'accepted', fromMe: false, matchId: 'm1', matchFinished: false, matchWaitingForMe: false,
    }))).toBe(false);
  });

  it('nothing at all is nothing: an empty or missing payload is 0', () => {
    expect(waitingActionCount({ incoming: [], outgoing: [] })).toBe(0);
    expect(waitingActionCount(null)).toBe(0);
    expect(waitingActionCount(undefined)).toBe(0);
  });

  it('counts exactly the waiting rows across both lists, and nothing else', () => {
    const payload = {
      incoming: [
        challenge({ id: 'in-pending', fromMe: false, status: 'pending' }),
        challenge({ id: 'in-duel-mine', fromMe: false, status: 'accepted', matchWaitingForMe: true, matchId: 'm1' }),
        challenge({ id: 'in-duel-theirs', fromMe: false, status: 'accepted', matchWaitingForMe: false, matchId: 'm2' }),
      ],
      outgoing: [
        challenge({ id: 'out-pending', fromMe: true, status: 'pending' }),
        challenge({ id: 'out-duel-mine', fromMe: true, status: 'accepted', matchWaitingForMe: true, matchId: 'm3' }),
        challenge({ id: 'out-finished', fromMe: true, status: 'accepted', matchFinished: true, matchWaitingForMe: true, matchId: 'm4' }),
        challenge({ id: 'out-resolved', fromMe: true, status: 'resolved' }),
      ],
    };
    expect(waitingActionCount(payload)).toBe(3);
    expect(waitingChallenges(payload).map((c) => c.id)).toEqual(['in-pending', 'in-duel-mine', 'out-duel-mine']);
  });
});

describe('every badge surface reads that ONE predicate', () => {
  const view = read('../src/online/world-view.ts');
  const menu = read('../src/online/menu-territory.ts');
  const lobbyUi = read('../src/online/lobby-ui.ts');

  it('the map\'s CHALLENGES key counts waiting actions, not every open challenge', () => {
    expect(view).toContain('waitingActionCount(this.challenges)');
    // The old, wider lamp count must be gone: it counted outgoing challenges and their-turn duels.
    const paintPanel = view.slice(view.indexOf('private paintPanel()'), view.indexOf('private async loadAchievements'));
    expect(paintPanel).not.toContain('count.hidden = open.length');
    expect(paintPanel).not.toContain('String(open.length)');
    expect(paintPanel).not.toContain('open.length + ready');
  });

  it('the map\'s MENU key takes its challenge part from the same count', () => {
    const paintPanel = view.slice(view.indexOf('private paintPanel()'), view.indexOf('private async loadAchievements'));
    expect(paintPanel).toMatch(/menuCount\.textContent = String\(waiting \+ ready\)/);
    expect(paintPanel).toMatch(/menuCount\.hidden = waiting \+ ready === 0/);
  });

  it('the main menu\'s Territory lamp is painted from the same count, not from incoming.length', () => {
    expect(lobbyUi).toContain('waitingActionCount(challenges)');
    expect(lobbyUi).not.toMatch(/incoming = challenges\?\.incoming\?\.length/);
    // One all-or-nothing paint, and nothing here polls.
    expect(menu).toContain('counts.waiting');
  });
});
