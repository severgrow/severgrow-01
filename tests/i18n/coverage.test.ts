// Localisation coverage is a build-time guarantee, not a promise in a document.
//
// These tests fail when a message is added without a translation, when a placeholder drifts, when
// a dictionary value is empty, or when a stale key survives after its English source is deleted.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as S from '../../src/strings.js';
import { PL } from '../../src/i18n/pl.js';
import { ES } from '../../src/i18n/es.js';
import { JA } from '../../src/i18n/ja.js';
import { READY_LOCALES } from '../../src/i18n/core.js';
import type { Dictionary, Locale, Message } from '../../src/i18n/core.js';

const dictionaries: Record<Exclude<Locale, 'en'>, Dictionary> = { pl: PL, es: ES, ja: JA };

type Leaf = { path: string; english: string | ((...args: never[]) => string) };

const groups: Record<string, unknown> = {
  opp: S.OPP,
  online: S.ONLINE,
  header: S.HEADER,
  result: S.RESULT,
  sprout: S.SPROUT,
  piles: S.PILES,
  welcome: S.WELCOME,
  home: S.HOME,
  bloom: S.BLOOM,
  fruit: S.FRUIT,
  blast: S.BLAST,
  stepCue: S.STEP_CUE,
  tapWhy: S.TAP_WHY,
  onboard: S.ONBOARD,
  help: S.HELP,
  menu: S.MENU,
  tutorial: S.TUTORIAL,
  install: S.INSTALL,
  live: S.LIVE,
  feedback: S.FEEDBACK,
  betaGuide: S.BETA_GUIDE,
  settings: S.SETTINGS,
  account: S.ACCOUNT,
  privacy: S.PRIVACY,
  campaign: S.CAMPAIGN,
  lesson: S.LESSON,
  profile: S.PROFILE,
};

const leaves: Leaf[] = [];
const walk = (value: unknown, path: string): void => {
  if (typeof value === 'string' || typeof value === 'function') {
    leaves.push({ path, english: value as Leaf['english'] });
    return;
  }
  if (Array.isArray(value)) { value.forEach((child, index) => walk(child, `${path}.${index}`)); return; }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  }
};
for (const [group, value] of Object.entries(groups)) walk(value, group);
for (const path of ['inviteCodeFormatHint', 'linkCodeHelpText', 'turnsLeftText']) {
  leaves.push({ path, english: (S as unknown as Record<string, Leaf['english']>)[path]! });
}

/** Every `t('key', 'english')` / `tPlural('key', …)` in the shipped source. */
const sourceFiles = (root: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
};
const files = [...sourceFiles('src'), ...sourceFiles('web/src')];
const used = new Map<string, string | null>();
const usedKeys = new Set<string>();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // Every key, including plural calls whose second argument is an object.
  for (const match of text.matchAll(/\bt(?:Plural)?\(\s*(['"])([a-zA-Z][\w.-]+)\1/g)) {
    if (match[2]!.includes('.')) usedKeys.add(match[2]!);
  }
  const pattern = /\bt(?:Plural)?\(\s*(['"])([a-zA-Z][\w.-]+)\1\s*,\s*(['"])([\s\S]*?)\3/gu;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]!.includes('.')) continue;
    if (!used.has(match[2]!)) used.set(match[2]!, match[4]!);
  }
}
const html = readFileSync('web/index.html', 'utf8');
for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder|-html)?="([^"]+)"/g)) {
  if (!used.has(match[1]!)) used.set(match[1]!, null);
  usedKeys.add(match[1]!);
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

const englishFor = (key: string): Message | undefined => {
  const leaf = leaves.find((entry) => entry.path === key);
  if (leaf) return leaf.english;
  const fromSource = used.get(key);
  return fromSource ?? undefined;
};

describe('locale registry', () => {
  it('exposes exactly the four finished languages', () => {
    expect([...READY_LOCALES]).toEqual(['en', 'pl', 'es', 'ja']);
  });
});

describe.each(Object.entries(dictionaries))('%s dictionary', (locale, dictionary) => {
  void locale;
  it('translates every message in src/strings.ts', () => {
    const missing = leaves.map((leaf) => leaf.path).filter((path) => !(path in dictionary));
    expect(missing).toEqual([]);
  });

  it('translates every key the shipped code or static markup uses', () => {
    const missing = [...usedKeys].filter((key) => !(key in dictionary));
    expect(missing).toEqual([]);
  });

  it('has no empty values', () => {
    const empty = Object.entries(dictionary)
      .filter(([, value]) => typeof value === 'string' && value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keeps every English placeholder', () => {
    const problems: string[] = [];
    for (const [key, value] of Object.entries(dictionary)) {
      const english = englishFor(key);
      if (typeof value !== 'string' || typeof english !== 'string') continue;
      const wanted = placeholders(english);
      const got = placeholders(value);
      if (wanted.join('|') !== got.join('|')) {
        problems.push(`${key}: expected {${wanted.join('}, {')}} got {${got.join('}, {')}}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has no keys whose English source no longer exists', () => {
    const known = new Set([
      ...leaves.map((leaf) => leaf.path), ...usedKeys,
      'ui.count.tiles', 'ui.count.cards', 'ui.count.points', 'ui.count.spots',
      'ui.difficulty.easy', 'ui.difficulty.medium', 'ui.difficulty.hard',
      'ui.setting.speed.slow', 'ui.setting.speed.normal', 'ui.setting.speed.fast', 'ui.setting.speed.skip',
      'ui.setting.effects.low', 'ui.setting.effects.normal', 'ui.setting.effects.high',
      'ui.setting.detail.low', 'ui.setting.detail.normal',
      'ui.setting.glow.off', 'ui.setting.glow.subtle',
      'ui.setting.confirm.smart', 'ui.setting.confirm.always', 'ui.setting.confirm.never',
      'ui.theme.soil', 'ui.theme.moss', 'ui.theme.ink',
      'ui.suit.0', 'ui.suit.1', 'ui.suit.2', 'ui.suit.3',
      'ui.lab.cat.surface', 'ui.lab.cat.tempo', 'ui.lab.cat.sound', 'ui.lab.cat.focus',
      'uiTip.strengthen.title', 'uiTip.strengthen.text', 'uiTip.draw.title', 'uiTip.draw.text',
      'uiTip.fruit.title', 'uiTip.fruit.text',
    ]);
    const stale = Object.keys(dictionary).filter((key) => !known.has(key) && !key.startsWith('uiFlavour.'));
    expect(stale).toEqual([]);
  });

  it('has no unmistakably English sentences left untranslated', () => {
    // Brand names, proper nouns and established short labels may legitimately match English.
    const allowed = new Set([
      'online.brand', 'online.pageTitleBase', 'online.tagline',
      'ui.document.title', 'ui.common.and', 'ui.lab.title',
      'ui.intel.obsTwoBombs', 'ui.intel.obsGrowSkipped', 'ui.intel.obsDiscard',
      'ui.game.describeTile', 'ui.race.tilesLine', 'ui.race.totalLine',
      'ui.count.tiles', 'ui.count.cards', 'ui.count.points', 'ui.count.spots',
      'ui.difficulty.easy', 'ui.difficulty.medium', 'ui.difficulty.hard',
      'ui.setting.speed.slow', 'ui.setting.speed.normal', 'ui.setting.speed.fast', 'ui.setting.speed.skip',
      'ui.setting.effects.low', 'ui.setting.effects.normal', 'ui.setting.effects.high',
      'ui.setting.detail.low', 'ui.setting.detail.normal',
      'ui.setting.glow.off', 'ui.setting.glow.subtle',
      'ui.setting.confirm.smart', 'ui.setting.confirm.always', 'ui.setting.confirm.never',
      'ui.theme.soil', 'ui.theme.moss', 'ui.theme.ink',
      'ui.suit.0', 'ui.suit.1', 'ui.suit.2', 'ui.suit.3',
      'ui.lab.cat.surface', 'ui.lab.cat.tempo', 'ui.lab.cat.sound', 'ui.lab.cat.focus',
      'uiTip.strengthen.title', 'uiTip.strengthen.text', 'uiTip.draw.title', 'uiTip.draw.text',
      'uiTip.fruit.title', 'uiTip.fruit.text',
    ]);
    const suspects = Object.entries(dictionary)
      .filter(([key, value]) => {
        if (allowed.has(key) || typeof value !== 'string') return false;
        const english = englishFor(key);
        if (typeof english !== 'string' || english !== value) return false;
        return /\s/.test(english) && /[A-Za-z]{4}/.test(english);
      })
      .map(([key]) => key);
    expect(suspects).toEqual([]);
  });
});

describe('translation lookup', () => {
  it('falls back to English and records a missing key', async () => {
    const core = await import('../../src/i18n/core.js');
    core.setLocale('pl');
    expect(core.t('ui.test.notTranslated', 'English fallback')).toBe('English fallback');
    expect(core.missingKeys()).toContain('ui.test.notTranslated');
    core.setLocale('en');
    core.clearMissingKeys();
  });
});
