// NO RUNTIME IMPORT CYCLES (hygiene pass, 2026-10-26).
//
// A cycle between two modules that both run code at load time makes one of them see the other
// half-initialised — an `undefined` import that only shows up in some load orders. Several agents
// add modules to this codebase in parallel, so this is pinned rather than left to review: the
// game's source (web/src, src, and the server client code the web app imports) has NO runtime
// cycle today, and this keeps it that way.
//
// Type-only imports are erased by the compiler, so they cannot cycle at runtime and are ignored:
// `import type …`, `export type …`, and `import { type A, type B }` where every name is a type.
// Dynamic `import()` is ignored too: it runs after both modules have loaded.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN = ['web/src', 'src', 'server/src'];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
};

/** The runtime (value) imports of one source file, as absolute .ts paths that exist. */
export const runtimeImports = (file: string, text: string, exists: (p: string) => boolean): string[] => {
  const found: string[] = [];
  // static import/export … from '…' (multi-line specifier lists included)
  const re = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    const clause = m[2]!.trim();
    if (/^type\b/.test(clause)) continue; // import type … / export type …
    const named = clause.match(/\{([\s\S]*)\}/);
    const bare = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (named && !bare) {
      const names = named[1]!.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length && names.every((n) => /^type\s/.test(n))) continue;
    }
    found.push(m[3]!);
  }
  // side-effect imports: import '…';
  for (const m of text.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) found.push(m[1]!);
  return found
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => resolve(dirname(file), spec.replace(/\.js$/, '.ts')))
    .filter(exists);
};

/** Every strongly connected component of size > 1 (or a self-import): Tarjan's algorithm. */
export const cyclesOf = (graph: Map<string, string[]>): string[][] => {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) out.push(comp);
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) visit(v);
  return out;
};

describe('import cycles', () => {
  it('the detector finds a real cycle and ignores type-only and dynamic imports', () => {
    const files: Record<string, string> = {
      '/x/a.ts': "import { b } from './b.js';\nexport const a = 1;",
      '/x/b.ts': "import { a } from './a.js';\nexport const b = 2;",
      '/x/c.ts': "import type { D } from './d.js';\nexport const c = 3;",
      '/x/d.ts': "import { type C } from './c.js';\nexport type D = 1;\nconst later = () => import('./c.js');",
    };
    const exists = (p: string) => p in files;
    const graph = new Map(Object.entries(files).map(([f, t]) => [f, runtimeImports(f, t, exists)]));
    expect(cyclesOf(graph).map((c) => c.sort())).toEqual([['/x/a.ts', '/x/b.ts']]);
  });

  it('the game has no runtime import cycle', () => {
    const files = SCAN.flatMap((d) => walk(join(ROOT, d)));
    const known = new Set(files);
    const exists = (p: string) => known.has(p);
    const graph = new Map(files.map((f) => [f, runtimeImports(f, readFileSync(f, 'utf8'), exists)]));
    // not a vacuous pass: the scan really saw the game's modules and their imports
    const edges = [...graph.values()].reduce((n, list) => n + list.length, 0);
    expect(files.length).toBeGreaterThan(300);
    expect(edges).toBeGreaterThan(800);
    expect(graph.get(join(ROOT, 'web/src/main.ts'))!.length).toBeGreaterThan(100);
    const cycles = cyclesOf(graph).map((c) => c.map((f) => relative(ROOT, f)).sort());
    expect(cycles).toEqual([]);
  });
});
