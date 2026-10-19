// "YOU CAN WIN" must be TRUE when it appears: it is the one line that promises a winning move, and
// a false promise is worse than silence. These tests drive real positions through the engine and
// check the guide's own condition against the outcome the engine actually gives.
import { describe, expect, it } from 'vitest';
import { apply, isStrangled, legalActions, viewFor } from '../../src/engine/index.js';
import { placedHexKeys } from '../src/logic/tap-why.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CAMPAIGN_LEVELS, campaignOpening } from '../../src/campaign/index.js';

/** The same rule the page uses: a PLACEMENT that the ENGINE says strangles their home. */
const winNow = (state: State, legal: readonly Action[]): boolean =>
  legal.some((a) => placedHexKeys(a).length > 0 && isStrangled(apply(state, a), 1));

/** Walk a level with a strong player and return the first position where the hint fires. */
const firstWinMoment = (levelNumber: number) => {
  const level = CAMPAIGN_LEVELS[levelNumber - 1]!;
  let s = campaignOpening(level);
  for (let guard = 0; guard < 400 && s.phase !== 'GAME_OVER'; guard++) {
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    if (!legal.length) break;
    if (s.actor === 0 && winNow(s, legal)) return { state: s, legal };
    const lv = (s.actor === 1 ? level.botLevel : 9) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    s = apply(s, chooseLevelAction(v, lv, botSeed(s.seed, lv, s.turnNumber, s.history?.length ?? 0)));
  }
  return null;
};

describe('YOU CAN WIN is never a false promise', () => {
  it('fires on the levels where a strangle is reachable, and every time it fires the move really wins', () => {
    const fired: number[] = [];
    for (let n = 1; n <= 10; n++) {
      const moment = firstWinMoment(n);
      if (!moment) continue; // this level's win came by score, not by surrounding the home
      fired.push(n);
      const { state, legal } = moment;
      const winning = legal.find((a) => placedHexKeys(a).length > 0 && isStrangled(apply(state, a), 1));
      expect(winning, `L${n}: the hint fired without a winning move`).toBeTruthy();
      // Play it and finish the turn: the engine resolves sever + strangle at end of turn, so the
      // promise is "this turn", and that is exactly what must hold.
      let after = apply(state, winning!);
      for (let step = 0; step < 6 && after.phase !== 'GAME_OVER'; step++) {
        const next = legalActions(viewFor(after, after.actor));
        const end = next.find((a) => a.t === 'EndAct') ?? next.find((a) => a.t === 'Discard');
        if (!end) break;
        after = apply(after, end);
      }
      expect(after.phase, `L${n}`).toBe('GAME_OVER');
      expect(after.result?.reason, `L${n}`).toBe('strangle');
      expect(after.result?.winner, `L${n}`).toBe(0);
    }
    // It is a general teaching moment, not a one-off: a strong player meets it on almost every level.
    expect(fired.length, `only fired on ${fired.join(', ')}`).toBeGreaterThanOrEqual(8);
  }, 120_000);

  it('does not fire on an untouched opening, where no move can win yet', () => {
    for (const level of CAMPAIGN_LEVELS.slice(0, 10)) {
      const s = campaignOpening(level);
      expect(winNow(s, legalActions(viewFor(s, s.actor))), level.id).toBe(false);
    }
  });
});
