// CAMPAIGN MODE — the HARD SEPARATION between the campaign and online play. A campaign level's
// authored config must never reach online board generation or the shared multiplayer rules. This is
// pinned two ways: behaviourally (the online opening is built with no campaign config and the shared
// rules version carries no board) and structurally (the online match core never reads a Campaign
// board; only the isolated Seeds proof verifier may reconstruct one to validate an offline win).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, matchSetup, newMatch, rulesConfig } from '../../src/engine/index.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(`${root}${dir}`)) {
    const path = `${dir}/${entry}`;
    if (statSync(`${root}${path}`).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mjs)$/.test(entry)) out.push(path);
  }
  return out;
};

describe('the shared rules version never carries a campaign board', () => {
  it('the online/current rules config has no board and the classic terrain counts', () => {
    const config = rulesConfig(CURRENT_RULES_VERSION)!;
    expect(config.board).toBeNull();
    expect(config.rockCount).toBe(4);
  });

  it('an opening built without campaign config is the classic generated board', () => {
    const onlineLike = matchSetup(42, CURRENT_RULES_VERSION, {});
    expect(onlineLike.config.board).toBeNull();
    const plain = newMatch(42);
    expect(plain.board).toEqual(newMatch(42, {}).board);
    // The campaign's authored boards are never the plain opening: they only appear when passed.
    for (const level of CAMPAIGN_LEVELS) {
      expect(level.config.board).not.toBeNull();
      expect(level.config.board).not.toEqual(plain.config.board);
    }
  });

  it('the engine default config exposes no board for the campaign to mutate', () => {
    const before = JSON.stringify(rulesConfig(CURRENT_RULES_VERSION));
    for (const level of CAMPAIGN_LEVELS) void level.config;
    expect(JSON.stringify(rulesConfig(CURRENT_RULES_VERSION))).toBe(before);
  });
});

describe('Campaign boards stay outside the shared match rules and online renderer', () => {
  const forbidden = /(campaignLevelById|campaignOpening|CAMPAIGN_LEVELS|src\/campaign)/;

  it('src/engine/ is untouched by the campaign', () => {
    for (const file of sourceFiles('/src/engine')) {
      expect(readFileSync(`${root}${file}`, 'utf8'), file).not.toMatch(forbidden);
    }
  });

  it('the online server core never reads a Campaign board', () => {
    for (const file of sourceFiles('/server/src').filter((file) => !file.startsWith('/server/src/seeds/'))) {
      expect(readFileSync(`${root}${file}`, 'utf8'), file).not.toMatch(forbidden);
    }
  });

  it('the online client never reads authored Campaign boards', () => {
    for (const file of sourceFiles('/web/src/online')) {
      expect(readFileSync(`${root}${file}`, 'utf8'), file).not.toMatch(forbidden);
    }
  });
});
