// Personal head-to-head (owner, v0.84): one line such as "YOU 4 — 3 MAPLEFOX". Count only finished
// authoritative duels; each viewer's wins sit on the left; ties stay honest; duplicates never stack.
import { describe, expect, it } from 'vitest';
import type { HeadToHead } from '../../server/src/protocol.js';
import {
  aggregateRivalry,
  formatRivalryLine,
  rivalryDisplayName,
  type RivalryDuel,
} from '../src/logic/rivalry.js';

const duel = (over: Partial<RivalryDuel> & Pick<RivalryDuel, 'matchId' | 'mySeat'>): RivalryDuel => ({
  winner: null,
  ...over,
});

describe('aggregateRivalry', () => {
  it('counts only completed duels and attributes wins from the viewer seat', () => {
    const record = aggregateRivalry([
      duel({ matchId: 'a', mySeat: 0, winner: 0 }),
      duel({ matchId: 'b', mySeat: 0, winner: 1 }),
      duel({ matchId: 'c', mySeat: 0, winner: null }),
    ]);
    expect(record).toEqual({ games: 3, youWins: 1, themWins: 1, draws: 1 } satisfies HeadToHead);
  });

  it('swaps perspective when the viewer sat in the other chair', () => {
    const asSeat0 = aggregateRivalry([duel({ matchId: 'a', mySeat: 0, winner: 0 })]);
    const asSeat1 = aggregateRivalry([duel({ matchId: 'a', mySeat: 1, winner: 0 })]);
    expect(asSeat0.youWins).toBe(1);
    expect(asSeat0.themWins).toBe(0);
    expect(asSeat1.youWins).toBe(0);
    expect(asSeat1.themWins).toBe(1);
  });

  it('never double-counts the same match id', () => {
    const dupes = [
      duel({ matchId: 'same', mySeat: 0, winner: 0 }),
      duel({ matchId: 'same', mySeat: 0, winner: 1 }),
    ];
    expect(aggregateRivalry(dupes).games).toBe(1);
  });

  it('an empty list is zero games, not an invented record', () => {
    expect(aggregateRivalry([])).toEqual({ games: 0, youWins: 0, themWins: 0, draws: 0 });
  });
});

describe('formatRivalryLine', () => {
  const base: HeadToHead = { games: 7, youWins: 4, themWins: 3, draws: 0 };

  it('shapes the owner brief: YOU on the left, an em dash, then their wins and display name', () => {
    expect(formatRivalryLine(base, 'MapleFox')).toBe('YOU 4 — 3 MAPLEFOX');
  });

  it('shows a tied rivalry without pretending someone leads', () => {
    expect(formatRivalryLine({ games: 2, youWins: 1, themWins: 1, draws: 0 }, 'RYK')).toBe('YOU 1 — 1 RYK');
  });

  it('names the draws when there are any (review, 0.84), and only then', () => {
    expect(formatRivalryLine({ games: 8, youWins: 4, themWins: 3, draws: 1 }, 'RYK')).toBe('YOU 4 — 3 RYK · 1 DRAW');
    expect(formatRivalryLine({ games: 9, youWins: 4, themWins: 3, draws: 2 }, 'RYK')).toBe('YOU 4 — 3 RYK · 2 DRAWS');
  });

  it('stays silent when there is no history yet', () => {
    expect(formatRivalryLine({ games: 0, youWins: 0, themWins: 0, draws: 0 }, 'RYK')).toBeNull();
  });

  it('stays silent when the opponent has no display name to print', () => {
    expect(formatRivalryLine(base, null)).toBeNull();
    expect(formatRivalryLine(base, '   ')).toBeNull();
  });
});

describe('rivalryDisplayName', () => {
  it('uses the public display name only — never a tag suffix', () => {
    expect(rivalryDisplayName('MapleFox')).toBe('MAPLEFOX');
    expect(rivalryDisplayName(null)).toBeNull();
  });
});
