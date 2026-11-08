// NO PURE WHITE (owner, 2026-11-08): see web/src/logic/off-white.ts. This test keeps it that way for every
// future change: it scans the game's own source (CSS, TS, HTML) for pure white.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OFF_WHITE, OFF_WHITE_RGB } from '../src/logic/off-white.js';

const web = fileURLToPath(new URL('..', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.(ts|css|html)$/.test(n) ? [p] : [];
});
/** Masks: white there means "fully shown", not a colour the player sees. */
const MASKS: Array<[string, RegExp]> = [
  ['player/atmosphere.ts', /m\.fillStyle = m\.strokeStyle = '#fff'/],
  ['player/glass-surface.ts', /<rect x="0" y="0" width="100%" height="100%" fill="white"\/>/],
  // the replay film's colour-burn grade: a computed level (`white` is a variable), not a colour
  ['replay/poster.ts', /rgb\(\$\{white\} \$\{white\} \$\{white\}\)/],
];
const WHITE = /#fff(?![0-9a-f])|#ffffff(?![0-9a-f])|rgba?\(\s*255\s*,\s*255\s*,\s*255\b|(?<![-\w])white(?=\s*[;),!}'"]|\s+\d+%)|['"]white['"]/i;

describe('no pure white anywhere in the game', () => {
  it('the off-white is a warm, near-white cream', () => {
    expect(OFF_WHITE).toBe('#f2ede4');
    expect(OFF_WHITE_RGB).toBe('242, 237, 228');
  });
  it('no source file paints pure white (masks aside)', () => {
    const hits: string[] = [];
    for (const f of [...files(join(web, 'src')), join(web, 'index.html')]) {
      const rel = f.slice(join(web, 'src').length + 1);
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (/^\s*(\*|\/\*)/.test(line) || /white-space/.test(code)) return;
        if (!WHITE.test(code)) return;
        if (MASKS.some(([file, re]) => rel === file && re.test(code))) return;
        hits.push(`${rel || f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
