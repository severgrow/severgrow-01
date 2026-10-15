// CAMPAIGN MODE — THE SEAM. `overridesForMatch` is the one place an offline match decides whether it
// carries terrain. These tests pin that only a campaign level produces overrides in production, and
// that the ONLINE client has no way to build a match from a config at all (its board comes from the
// server), so a campaign config cannot reach an online board.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { offlineSaveKey, overridesForMatch } from '../src/logic/campaign.js';
import { SAVE_KEY } from '../src/logic/persist.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(`${root}${dir}`)) {
    const path = `${dir}/${entry}`;
    if (statSync(`${root}${path}`).isDirectory()) out.push(...files(path));
    else if (/\.ts$/.test(entry)) out.push(path);
  }
  return out;
};

describe('the seam: only a campaign level passes overrides', () => {
  it('a classic match starts with no overrides at all, even with Lab experiments present', () => {
    expect(overridesForMatch(null, false)).toEqual({});
    expect(overridesForMatch(null, false, { rockCount: 0, board: CAMPAIGN_LEVELS[0]!.config.board! })).toEqual({});
  });

  it('the test copy keeps its Lab experiment when there is no campaign level', () => {
    expect(overridesForMatch(null, true, { rockCount: 0 })).toEqual({ rockCount: 0 });
    expect(overridesForMatch(null, true)).toEqual({});
  });

  it('a campaign level always passes ITS config, and wins over any Lab experiment', () => {
    const level = CAMPAIGN_LEVELS[6]!;
    expect(overridesForMatch(level, false)).toBe(level.config);
    expect(overridesForMatch(level, true, { rockCount: 0 })).toBe(level.config);
  });
});

describe('the online client cannot build a match from a config', () => {
  it('imports neither the campaign module nor an engine match constructor', () => {
    for (const file of files('/src/online')) {
      const source = readFileSync(`${root}${file}`, 'utf8');
      expect(source, file).not.toMatch(/logic\/campaign|src\/campaign/);
      expect(source, file).not.toMatch(/\b(newMatch|newGame|matchSetup|stateFromSetup|resolveConfig)\b/);
    }
  });

  it('main.ts reaches the campaign config through the seam only, for an offline match', () => {
    const main = readFileSync(`${root}/src/main.ts`, 'utf8');
    expect(main.match(/overridesForMatch\(/g) ?? []).toHaveLength(1);
    // The one match opening that takes overrides is the offline `startGame`, and the campaign level
    // is an argument of it — never a module the online layer has access to.
    expect(main).toMatch(/overridesForMatch\(campaign, IS_TEST/);
  });
});

describe('storage: the campaign never shares the classic save key', () => {
  it('classic saves use the classic key and campaign saves use the campaign key', () => {
    expect(offlineSaveKey(null)).toBe(SAVE_KEY);
    for (const level of CAMPAIGN_LEVELS) expect(offlineSaveKey(level)).not.toBe(SAVE_KEY);
  });
});
