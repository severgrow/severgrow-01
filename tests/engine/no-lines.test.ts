// v0.7: Bloom is the only combo. Nothing may still name the old run action ("MeldRun",
// "Hypha"), its set twin ("MeldSet"), or the line-only code and config. The one place they
// may appear is the "Retired rules" appendix of docs/SPEC.md (descriptions only).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'scratch', 'screens', 'coverage']);
const EXT = /\.(ts|md|html|css|json|sh|yml|mjs|js)$/;
const OLD = /MeldRun|MeldSet|\bhyphae?\b|planRun|planSet|runLine|allowHyphaOneBend|lineGhost|lineArrows|snapDir/i;
const SELF = 'no-lines.test.ts';
// The player-facing word scans must name the old words to ban them (allowlisted, the scanners only).
const SCANNERS = new Set(['bloom-words.test.ts', 'align.ts']); // align.ts: the positioning pass's browser word scan
const SCANNER_LINE = /grow a line/;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : EXT.test(n) && n !== SELF && !SCANNERS.has(n) && n !== 'package-lock.json' ? [p] : [];
  });

describe('no old line or run action anywhere (v0.7)', () => {
  it('outside the Retired rules appendix of docs/SPEC.md', () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      let text = readFileSync(f, 'utf8');
      if (f.endsWith(join('docs', 'SPEC.md'))) text = text.slice(0, text.indexOf('## Retired rules'));
      text.split('\n').forEach((line, i) => {
        if (OLD.test(line) && !SCANNER_LINE.test(line)) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
