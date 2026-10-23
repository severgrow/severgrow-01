// SETTINGS ARE ESSENTIALS ON THE FUTASAKU CHANNELS (owner, 2026-10-23: "settings is just
// essentials ... I want it to be minimal"). There the sheet is Sound, Vibration (only where the phone
// can vibrate), Reduce motion, Large text, Hand side and the Account group; every other option is a
// FIXED default, so a value saved before this change can never leave a player stuck on an option they
// can no longer reach. The classic line, which shares this page, keeps its own full Settings.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ESSENTIAL_SETTINGS, parseSettings } from '../src/logic/settings.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const sheet = html.slice(html.indexOf('<section id="sheet-settings"'), html.indexOf('</section>', html.indexOf('<section id="sheet-settings"')));
const style = read('../src/style.css');
const main = read('../src/main.ts');

/** The sheet as the Futasaku channels show it: every top-level node marked data-only="classic" removed. */
const essentialSheet = (() => {
  const doc = sheet.split('\n');
  const out: string[] = [];
  let skipping: string | null = null;
  for (const line of doc) {
    if (skipping) { if (line.includes(skipping)) skipping = null; continue; }
    const open = /^\s*<(details|div|h3|p|label)\b[^>]*data-only="classic"/.exec(line);
    if (open) {
      const tag = open[1]!;
      // A node that opens and closes on its own line goes; a multi-line one goes to its closing line.
      if (!line.includes(`</${tag}>`)) skipping = `</${tag}>`;
      if (tag === 'div' && /online-link-block/.test(line)) skipping = '        </div>';
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
})();

describe('the Futasaku Settings sheet holds the essentials only', () => {
  it('its own switches are Sound, Vibration, Reduce motion and Large text', () => {
    const keys = [...essentialSheet.matchAll(/data-setting="([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['sound', 'vibration', 'reduceMotion', 'largeText']);
  });

  it('colours, music, the playing options, the folded groups, the link code and the Lab are classic-only', () => {
    for (const gone of ['palette-seg', 'data-setting="music"', 'confirm-seg', 'data-setting="autoSkip"', '<details',
      'settings-lab', 'online-link-make', 'online-storage-note', 'test-sound', 'restart-tutorial', 'data-volume']) {
      expect(essentialSheet, gone).not.toContain(gone);
    }
    // ...and the classic line still has every one of them.
    for (const kept of ['palette-seg', 'confirm-seg', 'settings-look', 'settings-help', 'settings-lab', 'online-link-block']) {
      expect(sheet, kept).toContain(kept);
    }
  });

  it('the product channels hide the classic nodes and the report key, and say so in one class', () => {
    expect(main).toMatch(/if \(IS_FUTA04\) document\.documentElement\.classList\.add\('settings-essentials'/);
    expect(style).toMatch(/html\.settings-essentials #sheet-settings \[data-only="classic"\],\s*html\.settings-essentials #settings-report \{\s*display: none !important;/);
  });

  it('the injected rows: Hand side only (no Thumb layout), no challenges switch, guidance always Full', () => {
    const thumb = read('../src/player/thumb.ts');
    expect(thumb).toMatch(/if \(IS_FUTA04\) \{[\s\S]{0,260}box\.append\(h3, handSide\)/);
    expect(thumb).toMatch(/thumb: IS_FUTA04 \|\| x\.thumb !== false/);
    expect(read('../src/player/guide.ts')).toMatch(/if \(IS_FUTA04\) return 'full';/);
    expect(read('../src/online/live/mount.ts')).not.toMatch(/mountSettingsSwitch\(/);
  });

  it('Vibration is hidden, not disabled, on a phone that cannot vibrate', () => {
    expect(sheet).toContain('id="vibration-row"');
    expect(main).toMatch(/\$\('vibration-row'\)\.hidden = IS_FUTA04 && vib\.disabled;/);
  });

  it('the account keeps its own group in Settings (sign-in, sign-out, delete, privacy)', () => {
    expect(read('../src/accounts/mount.ts')).toMatch(/el\('h3', '', ACCOUNT\.settingsTitle\)/);
  });
});

describe('every retired option is a fixed default on the Futasaku channels', () => {
  const saved = JSON.stringify({
    palette: 'ink', music: true, confirmPolicy: 'always', autoSkip: false, speed: 'fast', effects: 'high',
    materialDetail: 'low', topGlow: 'off', eyeCandy: false, placementList: true, weakSpots: true, weakPulse: false,
    sfxVolume: 10, musicVolume: 0, bloomHints: false,
    // ...and the ones a player still sets:
    sound: false, vibration: false, reduceMotion: true, largeText: true, handSort: 'number', level: 4,
  });

  it('a value saved before the change falls back to the default', () => {
    const s = parseSettings(saved, false, true);
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      if ((ESSENTIAL_SETTINGS as readonly string[]).includes(k)) continue;
      expect(s[k], k).toEqual(DEFAULT_SETTINGS[k]);
    }
  });

  it('the essentials, the level and the hand order are kept', () => {
    expect(parseSettings(saved, false, true)).toMatchObject({
      sound: false, vibration: false, reduceMotion: true, largeText: true, handSort: 'number', level: 4,
    });
    expect(parseSettings(null, true, true).reduceMotion, 'nothing saved: the device decides').toBe(true);
  });

  it('the classic line keeps every saved option', () => {
    expect(parseSettings(saved)).toMatchObject({ palette: 'ink', confirmPolicy: 'always', autoSkip: false, speed: 'fast' });
  });

  it('the main page parses with essentialsOnly on the Futasaku channels', () => {
    expect(main).toMatch(/parseSettings\(store\.get\(SETTINGS_KEY\), systemReduce\(\), IS_FUTA04\)/);
  });

  it('the defaults are the ones the owner named', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      palette: 'soil', music: false, confirmPolicy: 'smart', autoSkip: true, speed: 'normal', effects: 'normal',
    });
  });
});
