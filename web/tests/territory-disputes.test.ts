// THE DISPUTE LAYER (owner, 2026-10-29): "have that icon on EVERY players tile that is in duel
// challenge right now, but also, other people challenges -- clear distinction between my tiles that
// are challenged -- and challenges other people have over tiles".
//
// Two sources of truth meet on the map:
//   * MY rows (`/v1/world/challenges`): names, and the only ones that can open a sheet;
//   * the PUBLIC disputes on `GET /v1/world`: the same tiles for everybody else, minus everything
//     private. This file pins how the two become exactly ONE marker per disputed cell — the DOM
//     layer is keyed by that list, so a duplicate here is a duplicate node on every poll.
import { describe, expect, it } from 'vitest';
import type { WorldChallengeWire, WorldDispute } from '../../server/src/seeds/types.js';
import { disputeMarkersFor } from '../src/online/challenge-view.js';

const HOUR = 60 * 60 * 1000;
const TTL = 24 * HOUR;

const challenge = (over: Partial<WorldChallengeWire> = {}): WorldChallengeWire => ({
  id: 'c1',
  cellId: '0,0',
  challengerId: 'a',
  defenderId: 'b',
  challengerName: 'BloomHeron',
  defenderName: 'RYK',
  fromMe: true,
  status: 'pending',
  stake: 0,
  stakeCellId: '3,-10',
  createdAt: 0,
  expiresAt: TTL,
  respondedAt: null,
  matchId: null,
  matchFinished: false,
  matchWinnerId: null,
  matchWaitingForMe: false,
  winnerId: null,
  resolvedAt: null,
  remainingMs: TTL,
  serverNow: 0,
  ...over,
});

const dispute = (over: Partial<WorldDispute> = {}): WorldDispute => ({
  cellId: '0,0', challengerId: 'player-x', defenderId: 'player-y', live: false, ...over,
});

/** The viewer ('a') is the CHALLENGER in `challenge()` and neither side of `dispute()`. */
const VIEWER = 'a';

describe('mine vs another pair’s dispute', () => {
  it('draws my own open challenge as mine, with its side and its name', () => {
    const markers = disputeMarkersFor([challenge({ id: 'out' })], [], VIEWER);
    expect(markers).toEqual([{
      key: 'out',
      challengeId: 'out',
      cellId: '0,0',
      mine: true,
      side: 'outgoing',
      name: 'RYK',
      label: 'Challenge on this tile. You challenged RYK.',
    }]);
    // The defender's view of the same tile is `incoming` — the same mark, the other side.
    const defended = disputeMarkersFor([challenge({ id: 'in', fromMe: false, cellId: '5,0' })], [], 'b');
    expect(defended[0]).toMatchObject({ side: 'incoming', mine: true, name: 'BloomHeron' });
  });

  it('draws a dispute between two others as quiet, side `others`, with no name and no sheet', () => {
    const markers = disputeMarkersFor([], [dispute({ cellId: '7,0', challengerId: 'x', defenderId: 'y' })], VIEWER);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      key: 'others:7,0', challengeId: null, cellId: '7,0', mine: false, side: 'others', name: null,
    });
    // No id and no coordinate in the spoken line: the map publishes names, but this mark is about
    // the TILE being in dispute, and it must read the same whoever is holding it.
    expect(markers[0]!.label).not.toContain('7,0');
    expect(markers[0]!.label).not.toContain('player-x');
    expect(markers[0]!.label).not.toContain('player-y');
  });

  it('says whether the other pair is still waiting or already fighting', () => {
    const waiting = disputeMarkersFor([], [dispute({ cellId: '7,0' })], VIEWER)[0]!;
    const live = disputeMarkersFor([], [dispute({ cellId: '7,0', live: true })], VIEWER)[0]!;
    expect(live.label).not.toBe(waiting.label);
    expect(live.label).toMatch(/duel/i);
    expect(waiting.label).toMatch(/challenged/i);
  });

  it('a dispute that involves ME is never drawn as somebody else’s', () => {
    // My public dispute and my private row disagree for one poll (the list has not landed yet):
    // the layer must not relabel my own ground as background news. It waits for the row.
    const asChallenger = disputeMarkersFor([], [dispute({ challengerId: VIEWER, defenderId: 'b' })], VIEWER);
    const asDefender = disputeMarkersFor([], [dispute({ challengerId: 'x', defenderId: VIEWER })], VIEWER);
    expect(asChallenger).toEqual([]);
    expect(asDefender).toEqual([]);
    // A guest has no id: every dispute is somebody else's, and that is still safe to show.
    expect(disputeMarkersFor([], [dispute()], null)).toHaveLength(1);
  });
});

describe('one marker per cell, however the data overlaps', () => {
  it('my open row outranks the public entry for the same cell — one marker, and it is mine', () => {
    const markers = disputeMarkersFor(
      [challenge({ id: 'mine', cellId: '0,0' })],
      [dispute({ cellId: '0,0', challengerId: VIEWER, defenderId: 'b' }), dispute({ cellId: '0,0', challengerId: 'x', defenderId: 'y' })],
      VIEWER,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ key: 'mine', mine: true });
  });

  it('two open rows on one cell still draw one marker, deterministically', () => {
    const a = challenge({ id: 'a', cellId: '0,0', fromMe: false, expiresAt: TTL - HOUR });
    const b = challenge({ id: 'b', cellId: '0,0', status: 'accepted', fromMe: false });
    expect(disputeMarkersFor([a, b], [], VIEWER)).toHaveLength(1);
    expect(disputeMarkersFor([a, b], [], VIEWER)[0]!.challengeId).toBe('a');
    expect(disputeMarkersFor([b, a], [], VIEWER)[0]!.challengeId).toBe('a');
  });

  it('does not explode or duplicate at 100 disputes: one entry per cell, unique keys', () => {
    const many: WorldDispute[] = Array.from({ length: 100 }, (_, i) =>
      dispute({ cellId: `${i},0`, challengerId: `x${i}`, defenderId: `y${i}`, live: i % 2 === 0 }));
    const markers = disputeMarkersFor([], many, VIEWER);
    expect(markers).toHaveLength(100);
    expect(new Set(markers.map((m) => m.key)).size).toBe(100);
    expect(new Set(markers.map((m) => m.cellId)).size).toBe(100);
    // Sorted by cell, so the DOM order cannot shimmer between polls.
    expect(markers.map((m) => m.cellId)).toEqual([...markers.map((m) => m.cellId)].sort());
  });

  it('a closed row and a resolved row never mark anything, in either source', () => {
    const closed = ['declined', 'expired', 'stale', 'resolved'] as const;
    const rows = closed.map((status) => challenge({ id: status, cellId: `${status.length},0`, status }));
    expect(disputeMarkersFor(rows, [], VIEWER)).toEqual([]);
    expect(disputeMarkersFor([], [], VIEWER)).toEqual([]);
  });
});
