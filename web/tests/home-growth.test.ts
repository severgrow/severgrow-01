// The home grows: the ladder, the one-time record, and the precedence of the in-match states.
// Pure, table-driven: no DOM, no timers, no storage.
import { describe, expect, it } from 'vitest';
import {
  GROWTH_MOMENT_MS,
  GROWTH_SEEN_KEY,
  HOME_GROWTH_STAGES,
  STAGE_MIN_SCORE,
  clampStage,
  growthHistoryFrom,
  growthMomentAllowed,
  growthRecord,
  growthScore,
  growthVisit,
  homeClasses,
  homePresentation,
  homeState,
  parseGrowthSeen,
  serializeGrowthSeen,
  stageFor,
} from '../src/logic/home-growth.js';
import type { GrowthHistory } from '../src/logic/home-growth.js';

const h = (campaignLevels: number, gamesPlayed: number, growMoves: number): GrowthHistory => ({
  campaignLevels,
  gamesPlayed,
  growMoves,
});

describe('the stage ladder', () => {
  it('a new player is stage 1 immediately, before any game', () => {
    expect(stageFor(h(0, 0, 0))).toBe(1);
    expect(growthVisit(stageFor(h(0, 0, 0)), null, true)).toEqual({ from: 1, to: 1, grows: false, record: true });
  });

  it('the score and the stage are deterministic: the same history always gives the same stage', () => {
    for (const x of [h(0, 0, 0), h(1, 0, 0), h(2, 3, 17), h(5, 0, 0), h(0, 14, 0), h(10, 2, 40), h(70, 400, 9999)]) {
      expect(stageFor(x)).toBe(stageFor({ ...x }));
      expect(growthScore(x)).toBe(growthScore({ ...x }));
    }
  });

  it('the documented thresholds map to the four stages', () => {
    const at = (n: number) => stageFor(h(0, n, 0));
    expect(at(STAGE_MIN_SCORE[2] - 1)).toBe(1);
    expect(at(STAGE_MIN_SCORE[2])).toBe(2);
    expect(at(STAGE_MIN_SCORE[3] - 1)).toBe(2);
    expect(at(STAGE_MIN_SCORE[3])).toBe(3);
    expect(at(STAGE_MIN_SCORE[4] - 1)).toBe(3);
    expect(at(STAGE_MIN_SCORE[4])).toBe(4);
    expect(STAGE_MIN_SCORE[1]).toBe(0);
  });

  it('a campaign level is worth three finished games, and a hundred moves one point', () => {
    expect(growthScore(h(1, 0, 0))).toBe(3);
    expect(growthScore(h(0, 3, 0))).toBe(3);
    expect(growthScore(h(0, 0, 9))).toBe(0);
    expect(growthScore(h(0, 0, 10))).toBe(1);
  });

  it('changing play never lowers an earned stage (monotone in every input)', () => {
    for (let a = 0; a <= 2; a++) {
      for (let b = 0; b <= 2; b++) {
        for (let c = 0; c <= 2; c++) {
          const base = h(a * 4, b * 8, c * 20);
          for (const d of [h(a * 4 + 1, b * 8, c * 20), h(a * 4, b * 8 + 1, c * 20), h(a * 4, b * 8, c * 20 + 10)]) {
            expect(stageFor(d)).toBeGreaterThanOrEqual(stageFor(base));
          }
        }
      }
    }
  });

  it('junk counts are clamped, never NaN and never negative', () => {
    const junk = { campaignLevels: -4, gamesPlayed: Number.NaN, growMoves: 3.9 } as unknown as GrowthHistory;
    expect(growthScore(junk)).toBe(0);
    expect(stageFor(junk)).toBe(1);
    expect(clampStage(-9)).toBe(1);
    expect(clampStage(99)).toBe(4);
    expect(clampStage(Number.NaN)).toBe(1);
  });

  it('reads the visible history from the app stores; a missing record is zero', () => {
    expect(growthHistoryFrom({ campaign: null, stats: null, play: null })).toEqual({ campaignLevels: 0, gamesPlayed: 0, growMoves: 0 });
    expect(
      growthHistoryFrom({ campaign: { completed: ['a', 'b'] }, stats: { played: 7 }, play: { grow: 31 } }),
    ).toEqual({ campaignLevels: 2, gamesPlayed: 7, growMoves: 31 });
  });
});

describe('the growth-seen record', () => {
  it('round-trips a stage and refuses junk', () => {
    for (const s of HOME_GROWTH_STAGES) expect(parseGrowthSeen(serializeGrowthSeen(s))).toBe(s);
    expect(parseGrowthSeen(null)).toBeNull();
    expect(parseGrowthSeen('')).toBeNull();
    expect(parseGrowthSeen('{')).toBeNull();
    expect(parseGrowthSeen(JSON.stringify({ v: 2, stage: 3 }))).toBeNull();
    expect(parseGrowthSeen(JSON.stringify({ v: 1, stage: 0 }))).toBeNull();
    expect(parseGrowthSeen(JSON.stringify({ v: 1, stage: '3' }))).toBeNull();
    expect(GROWTH_SEEN_KEY).toBe('severgrow.homes.growth.v1');
  });

  it('persists the earned stage exactly once: the second visit grows nothing and writes nothing', () => {
    const earned = stageFor(h(5, 0, 0));
    expect(earned).toBe(3);
    let raw: string | null = null;

    const first = growthVisit(earned, parseGrowthSeen(raw), true);
    expect(first).toEqual({ from: 1, to: 3, grows: true, record: true });
    raw = growthRecord(first);
    expect(raw).not.toBeNull();

    for (let i = 0; i < 5; i++) {
      const later = growthVisit(earned, parseGrowthSeen(raw), true);
      expect(later).toEqual({ from: 3, to: 3, grows: false, record: false });
      expect(growthRecord(later)).toBeNull();
      raw = growthRecord(later) ?? raw; // a null write leaves the record untouched
    }
    expect(parseGrowthSeen(raw)).toBe(3);
  });

  it('a single jump across two thresholds plays once and settles on the earned stage', () => {
    const earned = stageFor(h(70, 400, 9999));
    expect(earned).toBe(4);
    const visit = growthVisit(earned, 1, true);
    expect(visit.grows).toBe(true);
    expect(visit.to).toBe(4);
    expect(growthVisit(earned, 4, true).grows).toBe(false);
  });

  it('a seen stage ahead of a reset history never shows more than is earned now', () => {
    const visit = growthVisit(2, 4, true);
    expect(visit.to).toBe(2);
    expect(visit.from).toBeLessThanOrEqual(visit.to);
    expect(visit.grows).toBe(false);
  });
});

describe('Reduce motion and Speed Off select the settled stage', () => {
  it('motion is allowed only with motion on and a running clock', () => {
    expect(growthMomentAllowed(false, 1)).toBe(true);
    expect(growthMomentAllowed(false, 0.5)).toBe(true);
    expect(growthMomentAllowed(true, 1)).toBe(false);
    expect(growthMomentAllowed(false, 0)).toBe(false);
    expect(growthMomentAllowed(true, 0)).toBe(false);
  });

  it('with motion off the visit settles onto the earned stage (and still records it once)', () => {
    const earned = stageFor(h(11, 1, 0));
    expect(earned).toBe(4);
    for (const timeScale of [0, 0]) {
      const visit = growthVisit(earned, null, growthMomentAllowed(timeScale === 0, timeScale));
      expect(visit.grows).toBe(false);
      expect(visit.from).toBe(visit.to);
      expect(visit.record).toBe(true);
    }
    expect(growthVisit(earned, 1, growthMomentAllowed(true, 1)).grows).toBe(false);
  });

  it('the moment has a finite length the UI can schedule a cleanup on', () => {
    expect(Number.isFinite(GROWTH_MOMENT_MS)).toBe(true);
    expect(GROWTH_MOMENT_MS).toBeGreaterThan(0);
    expect(GROWTH_MOMENT_MS).toBeLessThan(2000);
  });
});

describe('precedence: an in-match state is never masked by the growth stage', () => {
  const cases: { danger: boolean; won: boolean; strangled: boolean; state: 'healthy' | 'danger' | 'withered' | 'smothered' | 'won' }[] = [];
  for (const danger of [false, true]) {
    for (const won of [false, true]) {
      for (const strangled of [false, true]) {
        cases.push({
          danger,
          won,
          strangled,
          state: strangled ? 'withered' : won ? 'won' : danger ? 'danger' : 'healthy',
        });
      }
    }
  }

  it('table: the tree state is decided by the match, identically at every stage', () => {
    for (const stage of HOME_GROWTH_STAGES) {
      for (const c of cases) {
        const p = homePresentation('tree', stage, c);
        expect(p.stage, `stage must survive state ${c.state}`).toBe(stage);
        expect(p.state).toBe(c.state);
        const cls = homeClasses(p);
        expect(cls.strangled).toBe(c.strangled);
        expect(cls.danger).toBe(c.state === 'danger');
        expect(cls.won).toBe(c.state === 'won');
      }
    }
  });

  it('a strangled mature tree is still withered (dying beats data), and the stage stays known', () => {
    const dying = homePresentation('tree', 4, { danger: true, won: false, strangled: true });
    expect(dying.state).toBe('withered');
    expect(dying.stage).toBe(4);
    expect(homeClasses(dying).strangled).toBe(true);
  });

  it('the opponent keeps its fixed art: no stage is ever attached to the volcano, but states still apply', () => {
    for (const stage of HOME_GROWTH_STAGES) {
      expect(homePresentation('volcano', stage, { danger: false, won: false, strangled: false }).stage).toBeNull();
      expect(homePresentation('volcano', stage, { danger: false, won: false, strangled: true }).state).toBe('smothered');
    }
    expect(homeState('volcano', { danger: true, won: false, strangled: false })).toBe('danger');
    expect(homeState('volcano', { danger: true, won: true, strangled: false })).toBe('won');
  });

  it('winning and danger compose by priority, not by whichever class was applied last', () => {
    expect(homeState('tree', { danger: true, won: true, strangled: false })).toBe('won');
    expect(homeState('tree', { danger: true, won: false, strangled: false })).toBe('danger');
    expect(homeState('tree', { danger: false, won: false, strangled: false })).toBe('healthy');
  });
});
