// Match Intel attribution. The engine's Sever and Strangle events name the seat that was
// AFFECTED (the player whose tiles were cut, or whose home was surrounded) — not the attacker.
// Match Intel must show the beat from the attacker's point of view, and keep the statistics on
// the right side, for both seats.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Event, GameResult, State } from '../../src/engine/index.js';
import { matchIntel, publicIntelMoves } from '../src/logic/match-intel.js';

/** A few full games of seeded random legal play, with their event history. */
const games = (n: number, maxActions = 2000): State[] => {
  const out: State[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const rand = mulberry32(seed ^ 0x1234);
    let s = newGame(seed);
    for (let i = 0; i < maxActions && s.phase !== 'GAME_OVER'; i++) {
      const acts = legalActions(viewFor(s, s.actor));
      s = apply(s, acts[Math.floor(rand() * acts.length)]!);
    }
    out.push(s);
  }
  return out;
};

describe('Match Intel attribution', () => {
  it('a Sever names the victim, so the CUT beat belongs to the attacker — from both seats', () => {
    const s = newGame(7);
    const history: Event[] = [{ t: 'Sever', player: 1, coords: [{ q: 0, r: -1 }, { q: 1, r: -1 }] }];
    expect(publicIntelMoves(viewFor(s, 0), history, 0).at(-1)).toEqual({ who: 'you', verb: 'CUT', detail: '2' });
    expect(publicIntelMoves(viewFor(s, 1), history, 1).at(-1)).toEqual({ who: 'opp', verb: 'CUT', detail: '2' });
    // The statistics credit the attacker (player 0), never the victim.
    expect(matchIntel(viewFor(s, 0), history, []).cuts).toEqual([2, 0]);
    expect(matchIntel(viewFor(s, 1), history, []).cuts).toEqual([2, 0]);
  });

  it('a Strangle names the loser, so the WIN beat belongs to the winner — from both seats', () => {
    const s = newGame(7);
    const result: GameResult = { winner: 0, reason: 'strangle', scores: [4, 2] };
    const winner0 = { ...viewFor(s, 0), result };
    const winner1 = { ...viewFor(s, 1), result };
    const history: Event[] = [{ t: 'Strangle', player: 1 }, { t: 'GameEnd', result }];
    expect(publicIntelMoves(winner0, history, 0).at(-1)).toEqual({ who: 'you', verb: 'WIN', detail: 'HOME' });
    expect(publicIntelMoves(winner1, history, 1).at(-1)).toEqual({ who: 'opp', verb: 'WIN', detail: 'HOME' });
  });

  it('a double Strangle is a draw, so no WIN beat is shown', () => {
    const s = newGame(7);
    const result: GameResult = { winner: null, reason: 'double_strangle', scores: [2, 2] };
    const view = { ...viewFor(s, 0), result };
    const history: Event[] = [{ t: 'Strangle', player: 0 }, { t: 'Strangle', player: 1 }, { t: 'GameEnd', result }];
    expect(publicIntelMoves(view, history, 0)).toEqual([]);
  });

  it('real engine games: every CUT beat credits the attacker, and the cuts meter matches', () => {
    let severSeen = 0;
    for (const end of games(24)) {
      const history = end.history ?? [];
      for (const me of [0, 1] as const) {
        const view = viewFor(end, me);
        for (const e of history) {
          if (e.t !== 'Sever') continue;
          severSeen++;
          // The event names the cut player; the beat belongs to the attacker.
          const attacker = e.player === 0 ? 1 : 0;
          const beats = publicIntelMoves(view, history, me).filter((m) => m.verb === 'CUT');
          expect(beats.some((m) => m.who === (attacker === me ? 'you' : 'opp') && m.detail === String(e.coords.length))).toBe(true);
        }
        const expected: [number, number] = [0, 0];
        for (const e of history) if (e.t === 'Sever') expected[(1 - e.player) as 0 | 1] += e.coords.length;
        expect(matchIntel(view, history, []).cuts).toEqual(expected);
      }
    }
    expect(severSeen).toBeGreaterThan(0);
  });
});
