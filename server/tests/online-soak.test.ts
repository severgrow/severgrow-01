// Regression test for the online soak harness (server/scripts/online-soak.ts).
//
// The full 200-duel soak runs against Postgres and the live Edge API (see docs/ONLINE-SOAK-200.md).
// This is the fast, hermetic version: a handful of games over MemoryStorage with a fake clock, so
// the turn protocol, the hidden-information audit, the deadline rules and the foul injections stay
// green in `npm run check` without a database.
import { describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import {
  Report,
  createClock,
  emptyIds,
  makeInprocRuntime,
  playGame,
  runOneOffChecks,
  type GameSpec,
  type InprocEnv,
} from '../scripts/online-soak.js';

const soakConfig = (): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  rateLimits: {
    guestPerIpPerHour: 1_000,
    joinPerPlayerPerHour: 1_000,
    joinPerIpPerHour: 1_000,
    createPerPlayerPerHour: 1_000,
    createPerIpPerHour: 1_000,
    linkCodePerPlayerPerHour: 1_000,
    linkRedeemPerIpPerHour: 1_000,
    actionsPerPlayerPerMinute: 10_000,
    sweepPerIpPerHour: 1_000,
    worldPerIpPerHour: 1_000,
  },
});

const makeHarness = (): { env: InprocEnv; report: Report } => {
  const storage = new MemoryStorage();
  const clock = createClock(1_700_000_000_000);
  const broadcaster = new RecordingBroadcaster();
  const config = soakConfig();
  const service = new MatchService({ storage, config, now: () => clock.now(), broadcaster });
  return { env: { service, storage, clock, config, broadcaster }, report: new Report() };
};

describe('online soak harness', () => {
  it('plays core, fouls, deadline, resign and async duels to correct finishes with no failing checks', async () => {
    const { env, report } = makeHarness();
    const ids = emptyIds();
    const rt = makeInprocRuntime(env, report, ids, () => undefined);

    await runOneOffChecks(env, report, ids);
    expect(env.service.rulesVersion).toBe(CURRENT_RULES_VERSION);

    const specs: GameSpec[] = [
      { index: 0, scenario: 'core', style: 'full' },
      { index: 1, scenario: 'fouls', style: 'full' },
      { index: 2, scenario: 'deadline', style: 'one' },
      { index: 3, scenario: 'resign', style: 'full' },
      { index: 4, scenario: 'async', style: 'skip' },
    ];
    for (const spec of specs) await playGame(spec, rt);

    expect(report.games).toHaveLength(specs.length);
    for (const game of report.games) expect(game.status).toBe('finished');
    // Every category this mini-run touches must be green.
    expect(report.failures.map((f) => `${f.game} ${f.check} ${f.detail}`)).toEqual([]);

    const hidden = [...report.checks].filter(([name]) => name.startsWith('hidden.'));
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every(([, stat]) => stat.fail === 0)).toBe(true);

    const deadline = [...report.checks].filter(([name]) => name.startsWith('deadline.'));
    expect(deadline.length).toBeGreaterThan(0);
    expect(deadline.every(([, stat]) => stat.fail === 0)).toBe(true);
  }, 180_000);

  it('a deadline duel ends with a timeout owned by the seat that had to act', async () => {
    const { env, report } = makeHarness();
    const ids = emptyIds();
    const rt = makeInprocRuntime(env, report, ids, () => undefined);
    const outcome = await playGame({ index: 2, scenario: 'deadline', style: 'full' }, rt);
    expect(outcome.completed).toBe(true);
    expect(outcome.result?.reason).toBe('timeout');
    expect(report.failures).toEqual([]);
  }, 180_000);
});
