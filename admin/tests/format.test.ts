// The dashboard's pure logic. These run in `npm run check`, so a formatting or replay bug is caught
// without a browser.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CSV_MAX_ROWS,
  claimsUpToDay,
  completionShare,
  formatAgo,
  formatDelta,
  formatDay,
  formatDuration,
  formatNumber,
  formatRatio,
  formatShare,
  modeLabel,
  normalizeBuild,
  parseHash,
  percentOf,
  queryString,
  seriesMax,
  shortId,
} from '../src/format.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('formatting never invents a number', () => {
  it('an absent value is an em dash, not a zero', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('a delta carries its sign', () => {
    expect(formatDelta(30)).toBe('+30');
    expect(formatDelta(-100)).toBe('-100');
    expect(formatDelta(0)).toBe('0');
  });

  it('days are read in UTC, because every stored day is a UTC day', () => {
    expect(formatDay('2026-10-15')).toBe('15 Oct');
    expect(formatDay('not-a-day')).toBe('not-a-day');
  });

  it('windows read as durations a person recognises', () => {
    expect(formatDuration(24 * 3_600_000)).toBe('24h');
    expect(formatDuration(48 * 3_600_000)).toBe('2d');
    expect(formatDuration(30 * 86_400_000)).toBe('30d');
    expect(formatDuration(90_000)).toBe('2m');
  });

  it('relative times stop at a date rather than claiming precision', () => {
    const now = 1_760_000_000_000;
    expect(formatAgo(now - 5_000, now)).toBe('just now');
    expect(formatAgo(now - 12 * 60_000, now)).toBe('12m ago');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatAgo(now - 6 * 86_400_000, now)).toBe('6d ago');
    expect(formatAgo(null, now)).toBe('—');
    expect(formatAgo(now + 1_000, now)).toBe('in the future');
  });

  it('a ratio with no denominator is absent, and a share of nothing is not 0%', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(1.234)).toBe('1.23');
    expect(formatShare(0, 0)).toBeNull();
    expect(formatShare(1, 4)).toBe('25%');
  });

  it('bars are scaled to the largest value and clamped', () => {
    expect(seriesMax([0, 3, 9, 2])).toBe(9);
    expect(seriesMax([])).toBe(0);
    expect(percentOf(5, 10)).toBe(50);
    expect(percentOf(50, 10)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
  });

  it('mode labels match the modes the match table can actually distinguish', () => {
    expect(modeLabel('queue')).toBe('Find opponent');
    expect(modeLabel('friend')).toBe('Invite a friend');
    expect(modeLabel('live')).toBe('Live duel');
    expect(modeLabel('something-else')).toBe('something-else');
  });

  it('a short id is only shortened when there is something to shorten', () => {
    expect(shortId('abcdefgh-1234')).toBe('abcdefgh…');
    expect(shortId('abc')).toBe('abc');
  });
});

describe('the world-growth replay is cumulative', () => {
  const claims = [
    { cellId: '0,0', ownerId: 'a', claimedAt: Date.parse('2026-10-10T09:00:00Z') },
    { cellId: '1,0', ownerId: 'a', claimedAt: Date.parse('2026-10-12T09:00:00Z') },
    { cellId: '0,1', ownerId: 'b', claimedAt: Date.parse('2026-10-14T09:00:00Z') },
  ];

  it('a later day never shows fewer tiles than an earlier one', () => {
    const day10 = claimsUpToDay(claims, '2026-10-10');
    const day12 = claimsUpToDay(claims, '2026-10-12');
    const day14 = claimsUpToDay(claims, '2026-10-14');
    expect(day10.map((c) => c.cellId)).toEqual(['0,0']);
    expect(day12.map((c) => c.cellId)).toEqual(['0,0', '1,0']);
    expect(day14).toHaveLength(3);
    expect(day12.length).toBeGreaterThanOrEqual(day10.length);
    expect(day14.length).toBeGreaterThanOrEqual(day12.length);
  });

  it('the whole of the named day is included, and an unparseable day yields nothing', () => {
    expect(claimsUpToDay(claims, '2026-10-10').every((c) => c.claimedAt <= Date.parse('2026-10-10T23:59:59.999Z'))).toBe(true);
    expect(claimsUpToDay(claims, 'nonsense')).toEqual([]);
  });

  it('completion share is null when nothing has been cleared', () => {
    expect(completionShare(0, 0)).toBeNull();
    expect(completionShare(5, 10)).toBe(50);
  });
});

describe('the hash router and the query string', () => {
  it('routes a plain view', () => {
    const { route, rest, params } = parseHash('#/reports?kind=crash&status=new');
    expect(route).toBe('reports');
    expect(rest).toBe('');
    expect(params.get('kind')).toBe('crash');
    expect(params.get('status')).toBe('new');
  });

  it('routes a view with an id in the path, and tolerates a missing hash', () => {
    expect(parseHash('#/match/abc-123')).toMatchObject({ route: 'match', rest: 'abc-123' });
    expect(parseHash('#/match/abc-123?x=1').params.get('x')).toBe('1');
    expect(parseHash('').route).toBe('overview');
    expect(parseHash('#/').route).toBe('overview');
    expect(parseHash('#/seeds/').route).toBe('seeds');
  });

  it('drops empty values from a query string', () => {
    expect(queryString({ a: 1, b: '', c: null, d: undefined, e: 'x' })).toBe('?a=1&e=x');
    expect(queryString({})).toBe('');
  });
});

describe('build grouping agrees with the server', () => {
  it('splits the compound build string on its separators', () => {
    const parsed = normalizeBuild('index-DYGB0cL9.js · 0.5.0 · futasaku0.4-strength-draw');
    expect(parsed.key).toBe('index-DYGB0cL9.js · 0.5.0');
    expect(parsed.asset).toBe('index-DYGB0cL9.js');
    expect(parsed.version).toBe('0.5.0');
    expect(parsed.label).toBe('futasaku0.4-strength-draw');
    expect(normalizeBuild('').key).toBe('(no build)');
    expect(normalizeBuild(null).key).toBe('(no build)');
  });

  it('the export cap is a real, positive number the UI can state', () => {
    expect(CSV_MAX_ROWS).toBeGreaterThan(0);
    expect(Number.isInteger(CSV_MAX_ROWS)).toBe(true);
  });
});

describe('the dashboard is a separate build, not part of the game', () => {
  const files = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(`${root}${dir}`)) {
      const path = `${dir}/${entry}`;
      if (statSync(`${root}${path}`).isDirectory()) out.push(...files(path));
      else if (/\.(ts|css)$/.test(entry)) out.push(path);
    }
    return out;
  };

  it('no game source imports anything from admin/', () => {
    for (const dir of ['/web/src', '/src']) {
      for (const file of files(dir)) {
        const source = readFileSync(`${root}${file}`, 'utf8');
        expect(source.includes('admin/src'), `${file} must not reach into the dashboard`).toBe(false);
        expect(source.includes("/admin/"), `${file} must not link the dashboard`).toBe(false);
      }
    }
  });

  it('the built dashboard cannot carry a service-role key or a database credential', () => {
    // The claim is structural: the dashboard only ever speaks to the duel API with the player's own
    // bearer token. Any of these strings appearing in its sources would mean a secret path exists.
    for (const file of files('/admin/src')) {
      const source = readFileSync(`${root}${file}`, 'utf8');
      for (const forbidden of ['service_role', 'SERVICE_ROLE', 'DATABASE_URL', 'postgres://', 'postgresql://', 'supabase.co']) {
        expect(source.includes(forbidden), `${file} must not reference ${forbidden}`).toBe(false);
      }
    }
  });

  it('the dashboard keeps its own Vite root and its own output directory', () => {
    const config = readFileSync(`${root}/admin/vite.config.ts`, 'utf8');
    expect(config).toContain('web/dist-admin');
    // It must never write into the game's own output.
    expect(config).not.toMatch(/outDir:\s*['"`].*\bweb\/dist['"`]/);
  });

  it('the stylesheet introduces no colour, radius or shadow outside the app tokens', () => {
    // The brief: dark, precise, restrained — and NO new colour, radius or shadow. Everything is a
    // literal that already exists in web/src/style.css.
    const css = readFileSync(`${root}/admin/src/admin.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const allowedColours = new Set([
      'currentcolor',
      'transparent',
      'inherit',
    ]);
    const colourTokens = new Set([
      '--c-bg', '--c-surface', '--c-text', '--c-muted', '--c-line', '--c-gold', '--c-you', '--c-bot',
      '--c-accent', '--c-danger', '--fu-cream', '--fu-ink', '--radius', '--pill',
    ]);
    for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const value = match[0].toLowerCase();
      // The single allow-list: the app's own hex values, exactly as web/src/style.css declares them.
      expect(
        ['#18191a', '#232425', '#eeebe4', '#aaa8a3', '#46474a', '#f2c14e', '#7fcf8d', '#ff6b4a', '#efe5cb', '#e8ddc5', '#17181a'].includes(value),
        `${value} is not one of the app's own colours`,
      ).toBe(true);
    }
    // A comparison helper proving no hsl()/rgba() literal slipped in either.
    for (const match of css.matchAll(/(?:hsla?|rgba?)\(/g)) {
      expect(allowedColours.has(match[0]), `${match[0]} is a raw colour function`).toBe(true);
    }
    // `var(--token)` is the only way a colour may be referenced.
    for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(colourTokens.has(match[1]!) || match[1]!.startsWith('--font') || ['--pad', '--gap', '--row', '--dur-quick', '--ease-out', '--w-text', '--w-num'].includes(match[1]!), `${match[1]} is not a token from the app`).toBe(true);
    }
    // No box-shadow at all: the app has none on this surface, so neither does the dashboard.
    expect(css).not.toMatch(/box-shadow/);
  });
});
