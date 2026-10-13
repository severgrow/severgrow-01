// Phase 5 — duel HUD + bridge (perspective + turn labels).
import { describe, expect, it } from 'vitest';
import { legalActions, newGame, viewFor, CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import { createOnlineDriver, deadlineTone, deadlineUrgency, duelUiFromSnapshot, presenceWord, turnWord } from '../src/online/index.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

describe('duel HUD helpers', () => {
  it('labels presence and deadline tones without colour alone', () => {
    expect(presenceWord('online')).toBe('Online');
    expect(presenceWord('away')).toBe('Away');
    expect(deadlineTone(null)).toBe('none');
    expect(deadlineTone(3 * 3_600_000)).toBe('ok');
    expect(deadlineTone(90 * 60_000)).toBe('amber');
    expect(deadlineTone(10 * 60_000)).toBe('red');
    expect(turnWord(true, false)).toBe('Your turn');
    expect(turnWord(false, false)).toBe("Opponent's turn");
  });

  it('urgency is hidden with a full day left, amber under 2h, red under 15m (text, never colour alone)', () => {
    expect(deadlineUrgency(null)).toEqual({ tone: null, label: '', sr: '' });
    expect(deadlineUrgency(24 * 3_600_000).tone).toBeNull();
    expect(deadlineUrgency(3 * 3_600_000).tone).toBeNull();
    const amber = deadlineUrgency(90 * 60_000);
    expect(amber.tone).toBe('amber');
    expect(amber.label.length).toBeGreaterThan(0);
    expect(amber.sr.length).toBeGreaterThan(0);
    const red = deadlineUrgency(10 * 60_000);
    expect(red.tone).toBe('red');
    expect(red.label.length).toBeGreaterThan(0);
    expect(red.label).not.toBe(amber.label);
  });
});

describe('duelUiFromSnapshot', () => {
  it('exposes screen view, Me scores, coach off for seat 1', () => {
    const state = newGame(9);
    const view = viewFor(state, 1);
    const payload: MatchViewPayload = {
      matchId: 'm',
      seat: 1,
      status: 'active',
      revision: 1,
      turnStartRevision: 1,
      startingPlayer: view.turnPlayer,
      view,
      legalActions: legalActions(view),
      events: [],
      turnDeadlineAt: Date.now() + 3_600_000,
      graceUsed: [0, 0],
      gracePeriods: 1,
      result: null,
      opponent: { seat: 0, displayName: 'Ash', playerId: 'p0' },
      rulesVersion: CURRENT_RULES_VERSION,
      serverNow: Date.now(),
      actor: view.actor,
      turnPlayer: view.turnPlayer,
    };
    const fetchImpl: FetchLike = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, player: payload, serverNow: Date.now() }),
    });
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 't',
      matchId: 'm',
      initial: payload,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const ui = duelUiFromSnapshot(driver.snapshot(), driver.draft().canUndo());
    expect(ui.coachOff).toBe(true);
    expect(ui.hiddenDeckHintsOff).toBe(true);
    expect(ui.scoreLabel).toBe('You:Opponent');
    expect(ui.hud.opponentName).toBe('Ash');
    expect(ui.seat).toBe(1);
    expect(driver.perspective().rotated).toBe(true);
    // Seat 1's engine home paints as Me (display owner 0) after map.
    const engHome = Object.entries(ui.view.board).find(([, t]) => t?.root && t.owner === 1)?.[0];
    expect(engHome).toBeTruthy();
    const screenHome = driver.perspective().mapKey(engHome!);
    expect(ui.screenView.board[screenHome]?.owner).toBe(0);
    expect(ui.screenView.board[screenHome]?.root).toBe(true);
  });

  it('does not announce "Your turn" while the opponent turn is still replaying', () => {
    const state = newGame(9);
    const view = viewFor(state, 0);
    const payload: MatchViewPayload = {
      matchId: 'm',
      seat: 0,
      status: 'active',
      revision: 2,
      turnStartRevision: 2,
      startingPlayer: 0,
      view: { ...view, actor: 0, turnPlayer: 0 },
      legalActions: legalActions({ ...view, actor: 0, turnPlayer: 0 }),
      events: [],
      turnDeadlineAt: Date.now() + 3_600_000,
      graceUsed: [0, 0],
      gracePeriods: 1,
      result: null,
      opponent: { seat: 1, displayName: 'Ash', playerId: 'p1' },
      rulesVersion: CURRENT_RULES_VERSION,
      serverNow: Date.now(),
      actor: 0,
      turnPlayer: 0,
    };
    const fetchImpl: FetchLike = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, player: payload, serverNow: Date.now() }),
    });
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 't',
      matchId: 'm',
      initial: payload,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const snap = driver.snapshot();
    expect(duelUiFromSnapshot(snap, false, false).hud.myTurn).toBe(true);
    const revealing = duelUiFromSnapshot(snap, false, true);
    expect(revealing.hud.myTurn, 'mid-replay the HUD still shows the opponent turn').toBe(false);
    expect(turnWord(revealing.hud.myTurn, revealing.hud.finished)).toBe("Opponent's turn");
  });
});
