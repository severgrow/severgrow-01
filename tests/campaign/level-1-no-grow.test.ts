// LEVEL 1 — taking the opponent's ground is withheld until level 2 explains it.
//
// The owner (2026-10-24): level 1's opponent is the gentlest one, and a player could quietly take
// its tile before the game ever showed what taking a tile is. The level now withholds Overgrow in
// its DATA (`config.allowOvergrow: false`); this suite pins that, proves the level is still won,
// and guards every other campaign level against the flag leaking into it.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CAMPAIGN_LEVELS, campaignLevelById, campaignOpening } from '../../src/campaign/index.js';

const L1 = campaignLevelById('c1-01')!;

/** Growth (Sprout or Bloom) whose target is an opponent-owned tile. */
const growthOnTheirGround = (s: State): Action[] =>
  legalActions(viewFor(s, 0)).filter((a) =>
    a.t === 'Sprout' ? s.board[coordKey(a.coord)]?.owner === 1
    : a.t === 'Bloom' ? a.hexes.some((h) => s.board[coordKey(h)]?.owner === 1)
    : false,
  );

/** A full deterministic game: the human side plays as level 9, the bot as the level's own bot. */
const play = (level = L1) => {
  let s = campaignOpening(level);
  const actions: Action[] = [];
  let enumerated = 0;
  while (s.phase !== 'GAME_OVER' && actions.length < 1600) {
    // The opening, then every 8th of my acting positions: never a legal growth onto their ground.
    if (s.phase === 'ACT' && s.actor === 0 && (actions.length === 0 || enumerated++ % 8 === 0)) {
      expect(growthOnTheirGround(s), `level 1 turn ${s.turnNumber}`).toHaveLength(0);
    }
    const seatLevel = s.actor === 1 ? level.botLevel : 9;
    const action = chooseLevelAction(
      viewFor(s, s.actor),
      seatLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      botSeed(s.seed, seatLevel, s.turnNumber, s.history?.length ?? 0),
    );
    actions.push(action);
    s = apply(s, action);
  }
  return { end: s, actions };
};

describe('level 1 withholds taking the opponent’s ground', () => {
  it('names the level and the one rule it withholds', () => {
    expect(L1.id).toBe('c1-01');
    expect(L1.number).toBe(1);
    expect(L1.seed).toBe(95001);
    expect(L1.botLevel).toBe(1);
    expect(L1.config.allowOvergrow).toBe(false);
    // Nothing else about level 1 moved: same board, same terrain, same bot, same seed.
    expect(L1.config.boardRadius).toBe(2);
    expect(L1.config.board!.rock).toEqual([]);
    expect(L1.config.board!.gold).toEqual(['0,0']);
    expect(L1.intent).toContain('open');
  });

  it('offers no growth onto an opponent-owned tile, from the opening onward', () => {
    const opening = campaignOpening(L1);
    expect(growthOnTheirGround(opening)).toHaveLength(0);
    const game = play();
    expect(game.actions.length).toBeGreaterThan(3);
    expect(game.end.phase).toBe('GAME_OVER');
  });

  it('is still winnable from its own seed with its own bot', () => {
    const { end } = play();
    expect(end.result?.winner, JSON.stringify(end.result)).toBe(0);
    expect(end.phase).toBe('GAME_OVER');
  });

  it('leaves every other campaign level byte-for-byte on the old rule', () => {
    // Not one other level may carry the key: absent config → resolveConfig's default true, which is
    // the rule that has always applied. This is the guard that stops the fix leaking into 2-70.
    for (const level of CAMPAIGN_LEVELS.filter((l) => l.number !== 1)) {
      expect('allowOvergrow' in level.config, level.id).toBe(false);
    }
  });
});
