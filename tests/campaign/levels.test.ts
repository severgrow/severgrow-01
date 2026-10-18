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
  it('the whole campaign validates (no throw): five chapters of ten, levels 1-50', () => {
    expect(() => validateCampaign()).not.toThrow();
    expect(CAMPAIGN_LEVELS).toHaveLength(50);
    expect(CAMPAIGN_LEVELS.map((l) => l.number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    // Chapters are contiguous and each holds exactly its ten levels.
    expect(CAMPAIGN_CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3, 4, 5]);
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
    // 31-50 now exist (chapters IV and V), so 50 is the last built level.
    expect(nextCampaignLevel(30)).toBe(campaignLevelByNumber(31));
    expect(nextCampaignLevel(40)).toBe(campaignLevelByNumber(41));
    expect(nextCampaignLevel(50)).toBeNull();
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
      // The small tutorial map (19 hexes) cannot hold 20 open; its floor is that minus the four
      // hexes it may lose to rock. Levels 4-30 keep the product board's original floor of 20.
      expect(c.openCells, id).toBeGreaterThanOrEqual(number <= 3 ? 15 : 20);
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

  it('the authored boards match the design rock counts exactly', () => {
    const rocks = new Map(CAMPAIGN_LEVELS.map((l) => [l.number, l.config.board!.rock.length]));
    expect([...rocks.entries()]).toEqual([
      // Chapter I (design pack): 0,0,1,0,2,1,2,0,3,3
      [1, 0], [2, 0], [3, 1], [4, 0], [5, 2],
      [6, 1], [7, 2], [8, 0], [9, 3], [10, 3],
      // Chapter II (design pack): 2,3,4,1,4,4,5,2,5,5
      [11, 2], [12, 3], [13, 4], [14, 1], [15, 4],
      [16, 4], [17, 5], [18, 2], [19, 5], [20, 5],
      // Chapter III (design pack): 4,5,4,5,6,4,6,2,6,6
      [21, 4], [22, 5], [23, 4], [24, 5], [25, 6],
      [26, 4], [27, 6], [28, 2], [29, 6], [30, 6],
      // Chapter IV (2026-10-18): authored here, so the counts are pinned like the design pack.
      // Mirror symmetry gives even rock counts; gold is centre + pairs, so it stays odd.
      [31, 4], [32, 4], [33, 6], [34, 6], [35, 6],
      [36, 8], [37, 8], [38, 4], [39, 8], [40, 10],
      // Chapter V (2026-10-18): gold-led, so stone stays light (2-8) and gold carries 7-9.
      [41, 2], [42, 2], [43, 6], [44, 4], [45, 6],
      [46, 2], [47, 6], [48, 6], [49, 8], [50, 8],
    ]);
  });

  it('chapter V stays gold-led: every board carries more gold than stone, and 7-9 gold', () => {
    // The chapter's whole premise is "value, not space". If a later edit adds stone and drops gold,
    // the chapter stops being Gold Country even though every board might still be legal.
    const chapter = CAMPAIGN_LEVELS.filter((l) => l.chapter === 5);
    expect(chapter).toHaveLength(10);
    const gold = chapter.map((l) => l.config.board!.gold.length);
    expect(gold).toEqual([9, 9, 7, 9, 7, 9, 9, 9, 9, 9]);
    for (const level of chapter) {
      const b = level.config.board!;
      expect(b.gold.length, level.id).toBeGreaterThan(b.rock.length);
      expect(b.gold.length, level.id).toBeGreaterThanOrEqual(7);
      expect(b.gold.length, level.id).toBeLessThanOrEqual(9);
      // Gold is centre + pairs, so the count is odd, exactly like chapters II-IV.
      expect(b.gold.length % 2, level.id).toBe(1);
    }
    // The finale is the richest board in the campaign.
    const finale = chapter.at(-1)!;
    const richest = Math.max(...CAMPAIGN_LEVELS.map((l) => l.config.board!.gold.length));
    expect(finale.config.board!.gold.length).toBe(richest);
  });

  it('uses gold as well as rocks across the whole campaign (every level but the first has gold off the centre)', () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(level.config.board!.gold.length, level.id).toBeGreaterThanOrEqual(1);
      expect(level.config.board!.gold, level.id).toContain('0,0');
    }
    // The refinement: every level from 2 on rewards growth on gold beyond the bare centre.
    for (const level of CAMPAIGN_LEVELS.filter((l) => l.number > 1)) {
      expect(level.config.board!.gold.length, level.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the difficulty ramp NON-DECREASING for 1-30: the teaching ladder never slips', () => {
    const teaching = CAMPAIGN_LEVELS.filter((l) => l.number <= 30).map((l) => l.botLevel);
    // The conceptual guard. The old curve rose to bot 5 at level 20 and then dropped back to bot 4
    // at level 21 — a silently descending difficulty curve, invisible in code and obvious to a
    // player, which nothing pinned. Through the teaching levels, a bot level may never fall.
    for (let i = 1; i < teaching.length; i++) {
      expect(
        teaching[i]!,
        `level ${i + 1} (bot ${teaching[i]}) is easier than level ${i} (bot ${teaching[i - 1]})`,
      ).toBeGreaterThanOrEqual(teaching[i - 1]!);
    }
    // Anchored at both ends: the campaign opens on the easiest bot and tops out on the hardest.
    expect(teaching[0]).toBe(1);
    expect(teaching.at(-1)).toBe(9);
  });

  it('from 31 the bot repeats at the top, and may dip only on a flagged breather', () => {
    // There is no AI above 9, so 31+ carries difficulty in the BOARD. The owner allows an
    // occasional bot 8 as a breather. That is a design decision, so it is explicit in the data
    // (`breather: true`) instead of an invisible curve — and the rules below are stricter than
    // "it may drop": a dip must be declared, can never be consecutive, and is capped.
    const late = CAMPAIGN_LEVELS.filter((l) => l.number >= 31);
    expect(late.length).toBeGreaterThan(0);
    let breathers = 0;
    for (const [i, level] of late.entries()) {
      expect(level.botLevel, level.id).toBeGreaterThanOrEqual(8);
      expect(level.botLevel, level.id).toBeLessThanOrEqual(9);
      if (level.botLevel === 8) {
        expect(level.breather, `${level.id} uses bot 8 without being a breather`).toBe(true);
        breathers++;
      } else {
        expect(!!level.breather, `${level.id} is flagged a breather but uses bot ${level.botLevel}`).toBe(false);
      }
      if (i > 0) expect(!!level.breather && !!late[i - 1]!.breather, `${level.id} follows a breather`).toBe(false);
    }
    // Never a quarter of the extension: a breather is punctuation, not the rule.
    expect(breathers).toBeLessThanOrEqual(Math.floor(late.length / 4));
  });

  it('ships the approved bot ladder exactly, so the rebalance cannot be quietly undone', () => {
    // Owner-approved 2026-10-16: L1-3 the deliberately easy intro, then short rungs of 2-6 levels,
    // each step worth roughly 63-72% to the stronger bot, up to bot 9 at the top.
    expect(CAMPAIGN_LEVELS.filter((l) => l.number <= 30).map((l) => l.botLevel)).toEqual([
      1, 1, 1,
      2, 2,
      3, 3, 3,
      4, 4, 4,
      5, 5, 5,
      6, 6, 6,
      7, 7, 7,
      8, 8, 8, 8,
      9, 9, 9, 9, 9, 9,
    ]);
    // Chapters IV and V (2026-10-18): bot 9 throughout, with breathers at 31 (re-entry after the
    // finale), 38 (gold-heavy) and 46 (the open board). Pinned so a later edit is a decision.
    expect(CAMPAIGN_LEVELS.filter((l) => l.number >= 31).map((l) => l.botLevel)).toEqual([
      8, 9, 9, 9, 9, 9, 9, 8, 9, 9,
      9, 9, 9, 9, 9, 8, 9, 9, 9, 9,
    ]);
  });

  it('levels 1-3 use the tutorial small map (radius 2); levels 4+ the product hexagon (radius 3)', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const board = level.config.board!;
      // Owner direction 2026-10-16: the first three levels are played on the SAME map the tutorial
      // teaches on. This is a deliberate narrowing, not a range: the split is exact per level.
      // 31-40 stay on the product hexagon (a bigger map was considered and set aside: 61 hexes at
      // 360 px gives ~36 px hexes, under the 44 px tap target the cockpit uses).
      const small = level.number <= 3;
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
  it('raises terrain pressure chapter by chapter, so the late game is not more of the same', () => {
    // 31+ carries difficulty in the board (there is no bot above 9), so the chapters must actually
    // escalate. Measured as mean rocks + gold per chapter: IV is rock-led, V gold-led, VI rock-heavy
    // and gold-light, VII both — different compositions, non-decreasing pressure. This test covers
    // whatever chapters exist, so it keeps holding as V-VII are added.
    const pressure = CAMPAIGN_CHAPTERS.map((chapter) => {
      const total = chapter.levels.reduce((n, l) => n + l.config.board!.rock.length + l.config.board!.gold.length, 0);
      return { chapter: chapter.number, mean: total / chapter.levels.length };
    });
    for (let i = 1; i < pressure.length; i++) {
      expect(
        pressure[i]!.mean,
        `chapter ${pressure[i]!.chapter} (${pressure[i]!.mean.toFixed(1)}) is lighter than chapter ${pressure[i - 1]!.chapter} (${pressure[i - 1]!.mean.toFixed(1)})`,
      ).toBeGreaterThanOrEqual(pressure[i - 1]!.mean);
    }
    // And the extension really is denser than the teaching chapters: 31+ averages more terrain.
    const early = CAMPAIGN_LEVELS.filter((l) => l.number <= 30);
    const late = CAMPAIGN_LEVELS.filter((l) => l.number >= 31);
    const mean = (ls: typeof early) => ls.reduce((n, l) => n + l.config.board!.rock.length + l.config.board!.gold.length, 0) / ls.length;
    expect(mean(late)).toBeGreaterThan(mean(early));
  });
});

describe('campaign levels: the validation layer fails loudly and specifically', () => {
  // A product-board (radius 3) level as the base: these checks are about OTHER rules, so the board
  // must not trip the radius/hexagon check first.
  const base = CAMPAIGN_LEVELS[3]!; // level 4, the product hexagon
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
    const level = CAMPAIGN_LEVELS[6]!; // First Obstacle, two rocks
    const s = campaignOpening(level);
    expect(s.config.board!.rock).toEqual(['-3,0', '-3,1']);
    expect(s.terrain['-3,0']).toBe('rock');
    expect(s.terrain['0,0']).toBe('rich');
    for (const home of CAMPAIGN_HOMES) {
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

  it('lists progress after a full campaign run (every chapter built)', () => {
    let p = freshProgress();
    for (const level of CAMPAIGN_LEVELS) p = recordCampaignResult(p, level, { won: true, score: 10, turns: 10 });
    const last = CAMPAIGN_LEVELS.at(-1)!.number;
    expect(p.completed).toHaveLength(CAMPAIGN_LEVELS.length);
    expect(p.unlocked).toBe(last + 1);
    // The campaign as built is finished: Continue sits on the last level.
    expect(currentLevel(p).number).toBe(last);
  });
});
