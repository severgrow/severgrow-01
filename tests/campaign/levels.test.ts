// CAMPAIGN MODE — Phase A: every level's board is legal and playable, the campaign is well formed,
// and a level is REPRODUCIBLE (same id → identical terrain, homes and opening deal).
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_CELLS,
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_HOMES,
  CAMPAIGN_LEVELS,
  CAMPAIGN_SMALL_CELLS,
  CAMPAIGN_SMALL_HOMES,
  CampaignError,
  campaignChecks,
  campaignLevelById,
  campaignLevelByNumber,
  campaignOpening,
  currentLevel,
  freshProgress,
  nextCampaignLevel,
  recordCampaignResult,
  validateCampaign,
  validateLevel,
} from '../../src/campaign/index.js';
import { TUTORIAL_BOARD_RADIUS } from '../../web/src/logic/tutorial-script.js';

describe('campaign levels: the definition is well formed', () => {
  it('the whole campaign validates (no throw): three chapters of ten, levels 1-30', () => {
    expect(() => validateCampaign()).not.toThrow();
    expect(CAMPAIGN_LEVELS).toHaveLength(30);
    expect(CAMPAIGN_LEVELS.map((l) => l.number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    // Chapters are contiguous and each holds exactly its ten levels.
    expect(CAMPAIGN_CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3]);
    for (const chapter of CAMPAIGN_CHAPTERS) expect(chapter.levels).toHaveLength(10);
    for (const level of CAMPAIGN_LEVELS) {
      expect(CAMPAIGN_CHAPTERS[level.chapter - 1]!.levels).toContain(level);
    }
  });

  it('ids are stable, unique and ordered; lookups agree', () => {
    const ids = CAMPAIGN_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const level of CAMPAIGN_LEVELS) {
      expect(campaignLevelById(level.id)).toBe(level);
      expect(campaignLevelByNumber(level.number)).toBe(level);
    }
    expect(campaignLevelById('c1-99')).toBeNull();
    expect(nextCampaignLevel(30)).toBeNull();
    expect(nextCampaignLevel(1)).toBe(CAMPAIGN_LEVELS[1]);
  });

  it('every level uses the existing bot levels and a non-negative integer seed', () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(level.botLevel).toBeGreaterThanOrEqual(1);
      expect(level.botLevel).toBeLessThanOrEqual(9);
      expect(Number.isSafeInteger(level.seed)).toBe(true);
      expect(level.seed).toBeGreaterThanOrEqual(0);
      expect(level.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('every level board passes the validation layer', () => {
    const checks = campaignChecks();
    expect([...checks.keys()]).toEqual(CAMPAIGN_LEVELS.map((l) => l.id));
    for (const [id, c] of checks) {
      const number = CAMPAIGN_LEVELS.find((l) => l.id === id)!.number;
      expect(c.openCells, id).toBeGreaterThanOrEqual(number <= 10 ? 15 : 20);
      expect(c.minHomeOpenNeighbours, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('no authored board draws rock or gold inside a root zone (the generator eligibility rule)', () => {
    const checks = campaignChecks();
    for (const level of CAMPAIGN_LEVELS) {
      expect(checks.get(level.id)!.terrainInRootZone, level.id).toEqual([]);
    }
  });

  it('no level has a single hex that decides the game (no chokepoint between the homes)', () => {
    // The design rule for Chapter III in particular: a board must never leave one hex whose removal
    // alone cuts the two homes apart. Removing any single open hex, the homes stay connected.
    const checks = campaignChecks();
    for (const level of CAMPAIGN_LEVELS) {
      expect(checks.get(level.id)!.singleHexChokepoints, level.id).toEqual([]);
    }
  });

  it('holds back rocks until level 10 and then introduces obstacles gradually', () => {
    const rocks = new Map(CAMPAIGN_LEVELS.map((l) => [l.number, l.config.board!.rock.length]));
    expect([...rocks.entries()]).toEqual([
      [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
      [6, 0], [7, 0], [8, 0], [9, 0], [10, 1],
      [11, 0], [12, 1], [13, 2], [14, 1], [15, 3],
      [16, 4], [17, 5], [18, 2], [19, 5], [20, 5],
      // Chapter III (design pack): 4,5,4,5,6,4,6,2,6,6
      [21, 4], [22, 5], [23, 4], [24, 5], [25, 6],
      [26, 4], [27, 6], [28, 2], [29, 6], [30, 6],
    ]);
  });

  it('introduces gold at level 10 after the basic and special lessons', () => {
    for (const level of CAMPAIGN_LEVELS.slice(0, 9)) expect(level.config.board!.gold).toEqual([]);
    for (const level of CAMPAIGN_LEVELS.slice(9)) {
      expect(level.config.board!.gold.length, level.id).toBeGreaterThanOrEqual(1);
      expect(level.config.board!.gold, level.id).toContain('0,0');
    }
    expect(CAMPAIGN_LEVELS[9]!.config.board!.gold.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the difficulty ramp NON-DECREASING: the bot only ever gets stronger as levels rise', () => {
    const bots = CAMPAIGN_LEVELS.map((l) => l.botLevel);
    // The conceptual guard. The old curve rose to bot 5 at level 20 and then dropped back to bot 4
    // at level 21 — a silently descending difficulty curve, invisible in code and obvious to a
    // player, which nothing pinned. A campaign bot level may never fall as the level number rises.
    for (let i = 1; i < bots.length; i++) {
      expect(
        bots[i]!,
        `level ${i + 1} (bot ${bots[i]}) is easier than level ${i} (bot ${bots[i - 1]})`,
      ).toBeGreaterThanOrEqual(bots[i - 1]!);
    }
    // Anchored at both ends: the campaign opens on the easiest bot and tops out on the hardest.
    expect(bots[0]).toBe(1);
    expect(bots.at(-1)).toBe(9);
  });

  it('ships the approved bot ladder exactly, so the rebalance cannot be quietly undone', () => {
    // The first ten teach on the smaller board; the larger map arrives without an AI spike.
    expect(CAMPAIGN_LEVELS.map((l) => l.botLevel)).toEqual([
      1, 1, 1, 1, 1,
      2, 2, 2, 2, 2, 2,
      3, 3,
      4, 4,
      5, 5,
      6, 6,
      7,
      8, 8, 8, 8,
      9, 9, 9, 9, 9, 9,
    ]);
  });

  it('levels 1-10 use 19 hexes; levels 11-30 use the 37-hex board', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const board = level.config.board!;
      const small = level.number <= 10;
      const expectedRadius = small ? TUTORIAL_BOARD_RADIUS : 3;
      const expectedCells = small ? CAMPAIGN_SMALL_CELLS : CAMPAIGN_CELLS;
      const expectedHomes = small ? CAMPAIGN_SMALL_HOMES : CAMPAIGN_HOMES;
      expect(level.config.boardRadius, level.id).toBe(expectedRadius);
      expect(level.config.rootStyle, level.id).toBe('ring2');
      expect([...board.cells].sort(), level.id).toEqual([...expectedCells].sort());
      expect(board.homes, level.id).toEqual([...expectedHomes]);
    }
    // The tutorial map really is the smaller board (19 hexes vs 37) — the point of the change.
    expect(CAMPAIGN_SMALL_CELLS).toHaveLength(19);
    expect(CAMPAIGN_CELLS).toHaveLength(37);
    expect(TUTORIAL_BOARD_RADIUS).toBe(2);
  });
});

describe('campaign levels: the validation layer fails loudly and specifically', () => {
  // A product-board (radius 3) level as the base: these checks are about OTHER rules, so the board
  // must not trip the radius/hexagon check first.
  const base = CAMPAIGN_LEVELS[10]!; // level 11, the product hexagon
  const withBoard = (rock: string[], gold: string[] = ['0,0'], homes = [...CAMPAIGN_HOMES] as [string, string]) => ({
    ...base,
    id: 'broken',
    config: { ...base.config, boardRadius: 3, board: { cells: [...CAMPAIGN_CELLS], rock, gold, homes } },
  });

  it('names the level and the problem on an impossible config', () => {
    const bad = { ...base, id: 'bad-seed', seed: 1.5 };
    expect(() => validateLevel(bad)).toThrow(CampaignError);
    expect(() => validateLevel(bad)).toThrow(/campaign level bad-seed/);
  });

  it('rejects a hex that is both rock and gold', () => {
    expect(() => validateLevel(withBoard(['0,1'], ['0,1']))).toThrow(/both rock and gold/);
  });

  it('rejects a rock on a home (the engine refuses it first, and the level is named)', () => {
    expect(() => validateLevel(withBoard([CAMPAIGN_HOMES[0]]))).toThrow(CampaignError);
    expect(() => validateLevel(withBoard([CAMPAIGN_HOMES[0]]))).toThrow(/campaign level broken/);
    expect(() => validateLevel(withBoard([CAMPAIGN_HOMES[0]]))).toThrow(/INVALID_BOARD|is terrain/);
  });

  it('rejects a hex walled off from both homes', () => {
    // Three rocks close every approach to the edge hex 3,0: it is on the board but unreachable.
    expect(() => validateLevel(withBoard(['3,-1', '2,0', '2,1']))).toThrow(/3,0 is walled off/);
  });

  it('rejects a board whose cells do not match its declared radius', () => {
    // A radius-3 cell list on a level declared as the tutorial's radius-2 map: caught up front.
    const bad = {
      ...CAMPAIGN_LEVELS[0]!,
      id: 'wrong-radius',
      config: { ...CAMPAIGN_LEVELS[0]!.config, board: { cells: [...CAMPAIGN_CELLS], rock: [], gold: ['0,0'], homes: [...CAMPAIGN_HOMES] as [string, string] } },
    };
    expect(() => validateLevel(bad)).toThrow(/is not the 2-ring hexagon/);
  });

  it('rejects a board so full of rock that too little is left to play', () => {
    // The tutorial map minus its two homes and the centre, filled with rock: 3 open hexes, far below
    // the small map's floor of 15. The level is refused loudly, and named.
    const rock = CAMPAIGN_SMALL_CELLS.filter((k) => k !== '0,0' && !CAMPAIGN_SMALL_HOMES.includes(k));
    const bad = {
      ...CAMPAIGN_LEVELS[0]!,
      id: 'cramped',
      config: { ...CAMPAIGN_LEVELS[0]!.config, board: { cells: [...CAMPAIGN_SMALL_CELLS], rock: [...rock], gold: ['0,0'], homes: [...CAMPAIGN_SMALL_HOMES] as [string, string] } },
    };
    expect(() => validateLevel(bad)).toThrow(CampaignError);
    expect(() => validateLevel(bad)).toThrow(/campaign level cramped/);
    expect(() => validateLevel(bad)).toThrow(/too cramped to play/);
  });

  it('rejects a level whose config the engine refuses (a bad board)', () => {
    const bad = {
      ...base,
      id: 'engine-refuses',
      config: { ...base.config, board: { cells: [...CAMPAIGN_CELLS], rock: [], gold: [], homes: [CAMPAIGN_HOMES[0], CAMPAIGN_HOMES[0]] as [string, string] } },
    };
    expect(() => validateLevel(bad)).toThrow(/INVALID_BOARD/);
  });

});

describe('campaign levels: reproducible', () => {
  it('the same level id always yields the same seed, terrain, homes and opening hands', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const a = campaignOpening(level);
      const b = campaignOpening(campaignLevelById(level.id)!);
      expect(b.seed).toBe(a.seed);
      expect(b.terrain).toEqual(a.terrain);
      expect(b.board).toEqual(a.board);
      expect(b.hands).toEqual(a.hands);
      expect(b.deck).toEqual(a.deck);
      expect(b.discard).toEqual(a.discard);
      expect(b.startingPlayer).toBe(a.startingPlayer);
      expect(b.turnPlayer).toBe(a.turnPlayer);
      expect(b.config).toEqual(a.config);
    }
  });

  it('every campaign level differs from at least one other level (seeds and boards are not copies)', () => {
    const signatures = new Set(
      CAMPAIGN_LEVELS.map((l) => `${l.seed}|${JSON.stringify(l.config.board!.rock)}|${l.botLevel}`),
    );
    expect(signatures.size).toBe(CAMPAIGN_LEVELS.length);
  });

  it('the opening is on the authored board (homes are the authored homes, rock is rock)', () => {
    const level = CAMPAIGN_LEVELS[9]!; // Gold and the first rock
    const s = campaignOpening(level);
    expect(s.config.board!.rock).toEqual(['-2,0']);
    expect(s.terrain['-2,0']).toBe('rock');
    expect(s.terrain['0,0']).toBe('rich');
    for (const home of CAMPAIGN_SMALL_HOMES) {
      expect(s.board[home]?.root).toBe(true);
      expect(s.terrain[home]).toBe('normal');
    }
  });
});

describe('campaign progress: the unlock rule', () => {
  it('level 1 is open by default and nothing else is', () => {
    const p = freshProgress();
    expect(p.unlocked).toBe(1);
    expect(currentLevel(p).number).toBe(1);
  });

  it('a win unlocks the next level and marks this one completed; a loss removes nothing', () => {
    const l1 = CAMPAIGN_LEVELS[0]!;
    const l2 = CAMPAIGN_LEVELS[1]!;
    let p = freshProgress();
    p = recordCampaignResult(p, l1, { won: true, score: 7, turns: 12 });
    expect(p.unlocked).toBe(2);
    expect(p.completed).toContain(l1.id);
    expect(currentLevel(p).number).toBe(2);

    // A loss at level 2 changes nothing about progress.
    const afterLoss = recordCampaignResult(p, l2, { won: false, score: 9, turns: 31 });
    expect(afterLoss.unlocked).toBe(2);
    expect(afterLoss.completed).toEqual(p.completed);
    expect(afterLoss.best[l2.id]).toEqual({ won: false, score: 9, turns: 31 });
    // The best result keeps a win over a loss, and the higher score over the lower.
    const back = recordCampaignResult(afterLoss, l2, { won: true, score: 4, turns: 20 });
    expect(back.best[l2.id]!.won).toBe(true);
    expect(back.best[l2.id]!.score).toBe(4);
  });

  it('a completed level stays replayable and does not move the unlock pointer backwards', () => {
    let p = freshProgress();
    p = recordCampaignResult(p, CAMPAIGN_LEVELS[0]!, { won: true, score: 5, turns: 8 });
    p = recordCampaignResult(p, CAMPAIGN_LEVELS[1]!, { won: true, score: 5, turns: 8 });
    p = recordCampaignResult(p, CAMPAIGN_LEVELS[2]!, { won: true, score: 5, turns: 8 });
    // Replay an earlier level and lose: unlocked stays at 4, completed keeps all three.
    const replay = recordCampaignResult(p, CAMPAIGN_LEVELS[0]!, { won: false, score: 1, turns: 30 });
    expect(replay.unlocked).toBe(4);
    expect(replay.completed).toEqual(p.completed);
  });

  it('lists progress after a full campaign run (all three chapters)', () => {
    let p = freshProgress();
    for (const level of CAMPAIGN_LEVELS) p = recordCampaignResult(p, level, { won: true, score: 10, turns: 10 });
    expect(p.completed).toHaveLength(30);
    expect(p.unlocked).toBe(31);
    // The campaign as built is finished: Continue sits on the last level.
    expect(currentLevel(p).number).toBe(30);
  });
});
