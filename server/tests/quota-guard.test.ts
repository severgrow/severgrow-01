// Structural guard against spending the REAL Supabase project's quota by accident.
//
// Why this exists: the Free-plan allowance (5 GB egress) was used up in a day of automated runs
// with ZERO players — every byte was our own tooling. A guard that only relies on everyone
// remembering is not enough, so this suite makes the rule mechanical:
//
//   1. CONTRACT — server/scripts/real-project-guard.ts refuses with exit code 3 (never a false
//      PASS). Proved by actually running a guarded entry point and reading its exit code, so it
//      cannot drift.
//   2. CLASSIFICATION — every entry point under `web/e2e/` and `server/scripts/` that can reach the
//      real project (a real Supabase host, the deployed app whose bundle bakes that host, or a
//      real-database env read; transitively through the local helpers) must be explicitly
//      classified and its stated protection verified. A newly added real-capable file fails this
//      suite until someone classifies it.
//   3. DATABASES — the real-database integration suites connect only with REQUIRE_DATABASE=1.
//      Proved behaviourally: run them with an unreachable URL and no opt-in; they must SKIP and
//      pass (they never open a socket). This is the cheap, zero-quota proof.
//
// It parses actual constructs (imports, env reads, guard calls, literals) — never source layout or
// character distances — so inserting unrelated code nearby cannot break it, and local-only suites
// (which never mention the real host or a real-database env var) are never flagged.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { REAL_PROJECT_ENV, isLocalTarget, realProjectAllowed, requireRealProjectOptIn } from '../scripts/real-project-guard.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rel = (abs: string): string => relative(ROOT, abs).split('\\').join('/');

// ---------------------------------------------------------------------------- 1. the guard contract

const runNode = (args: string[], env: Record<string, string | undefined>): { status: number | null; output: string } => {
  const res = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: env as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
};

describe('real-project guard contract', () => {
  it('refuses a guarded entry point with exit code 3 and spends nothing', () => {
    const env = { ...process.env };
    delete env[REAL_PROJECT_ENV];
    // The suite exits at its first line (before any browser or request), so this costs no quota.
    const { status, output } = runNode(['--import', 'tsx', 'web/e2e/online-live-ping-latency.ts'], env);
    expect(status, `expected SKIPPED/exit 3, got:\n${output}`).toBe(3);
    expect(output).toContain('SKIPPED online-live-ping-latency');
  });

  it('is exactly the opt-in env var, and does not stop when the opt-in is set', () => {
    const previous = process.env[REAL_PROJECT_ENV];
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      delete process.env[REAL_PROJECT_ENV];
      expect(realProjectAllowed()).toBe(false);
      requireRealProjectOptIn('probe');
      expect(exit).toHaveBeenCalledWith(3);

      exit.mockClear();
      process.env[REAL_PROJECT_ENV] = '1';
      expect(realProjectAllowed()).toBe(true);
      requireRealProjectOptIn('probe'); // must return instead of stopping
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      error.mockRestore();
      if (previous === undefined) delete process.env[REAL_PROJECT_ENV];
      else process.env[REAL_PROJECT_ENV] = previous;
    }
  });

  it('treats only loopback targets as free of the real project', () => {
    expect(isLocalTarget('http://127.0.0.1:4207/')).toBe(true);
    expect(isLocalTarget('http://localhost:5199')).toBe(true);
    expect(isLocalTarget('http://[::1]:8080/')).toBe(true);
    expect(isLocalTarget('https://severgrow.github.io/severgrow-01/futa0.5/')).toBe(false);
    expect(isLocalTarget('https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel')).toBe(false);
  });
});

// ------------------------------------------------------------------- 2. entry-point classification

const TREES = ['web/e2e', 'server/scripts'];
const REAL_HOST = /[a-z0-9-]+\.supabase\.co/i; // the real Edge/Realtime host, directly
const DEPLOYED_APP = /severgrow\.github\.io/i; // the deployed app whose bundle bakes that host
const DB_ENV = /\b(DATABASE_URL|LIVE_DATABASE_URL)\b/; // the real Postgres

const inTrees = (abs: string): boolean => TREES.some((t) => abs.startsWith(join(ROOT, t) + '/'));

const entryPoints = (): string[] =>
  TREES.flatMap((t) =>
    readdirSync(join(ROOT, t))
      .filter((f) => f.endsWith('.ts') && f !== 'real-project-guard.ts')
      .map((f) => join(ROOT, t, f)),
  );

const sources = new Map<string, string>();
const source = (abs: string): string => {
  const hit = sources.get(abs);
  if (hit !== undefined) return hit;
  const src = readFileSync(abs, 'utf8');
  sources.set(abs, src);
  return src;
};

const relativeImports = (src: string): string[] => {
  const out: string[] = [];
  for (const re of [/from\s+['"](\.[^'"]+)['"]/g, /import\(\s*['"](\.[^'"]+)['"]\s*\)/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]!);
  }
  return out;
};

const resolveRelative = (fromFile: string, spec: string): string | null => {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
};

/** True when this entry point can reach the real project with no env var, flag or arg — including
 *  via a local helper it imports (e.g. `helpers/online-matrix.ts`, which pins the real host). */
const reachesRealByDefault = (abs: string, seen = new Set<string>()): boolean => {
  if (seen.has(abs)) return false;
  seen.add(abs);
  let src: string;
  try {
    src = source(abs);
  } catch {
    return false;
  }
  if (REAL_HOST.test(src) || DEPLOYED_APP.test(src) || DB_ENV.test(src)) return true;
  return relativeImports(src).some((spec) => {
    const target = resolveRelative(abs, spec);
    return target !== null && inTrees(target) && reachesRealByDefault(target, seen);
  });
};

/**
 * The reviewed classification of every real-capable entry point. `reachesRealByDefault` must equal
 * exactly this key set (verified below): the detector is a superset check, so a new real-capable
 * file cannot slip in unclassified, and a stale entry cannot survive its file becoming local-only.
 */
type Protection = 'guard' | 'local-default' | 'explicit-command';
const CLASSIFIED: Record<string, Protection> = {
  // Opt-in guard: refuse (exit 3) unless FUTASAKU_REAL_PROJECT=1.
  'server/scripts/load-test.ts': 'guard',
  'server/scripts/online-soak.ts': 'guard',
  'web/e2e/offline-vs-online-audit.ts': 'guard',
  'web/e2e/online-device-matrix.ts': 'guard',
  'web/e2e/online-live-ping-latency.ts': 'guard',
  'web/e2e/online-live-smoothness.ts': 'guard',
  'web/e2e/online-live-proof.ts': 'guard',
  'web/e2e/online-lobby-overlay.ts': 'guard',
  'web/e2e/online-ux-walk.ts': 'guard',
  // Pinned local: points its own target (BASE_URL) at loopback before importing the walk.
  'web/e2e/online-ux-local.ts': 'local-default',
  // Explicit command only: needs DATABASE_URL (and exits non-zero without it) or the `--live` flag;
  // not reachable from any default npm script (checked below).
  'server/scripts/migrate.ts': 'explicit-command',
  'server/scripts/verify.ts': 'explicit-command',
  'server/scripts/verify-security.ts': 'explicit-command',
  'server/scripts/online-simulation.ts': 'explicit-command',
};

describe('entry points cannot reach the real project by default', () => {
  it('classifies every real-capable entry point, and only those (the registry cannot rot)', () => {
    const flagged = entryPoints()
      .filter((p) => reachesRealByDefault(p))
      .map(rel)
      .sort();
    expect(flagged).toEqual(Object.keys(CLASSIFIED).sort());
  });

  it('every guard-classified entry point imports the guard and calls it', () => {
    const offenders = Object.entries(CLASSIFIED)
      .filter(([, kind]) => kind === 'guard')
      .map(([file]) => file)
      .filter((file) => {
        const src = source(join(ROOT, file));
        return !/from\s+['"][^'"]*real-project-guard\.js['"]/.test(src) || !/require(?:LocalOrRealProjectOptIn|RealProjectOptIn)\s*\(/.test(src);
      });
    expect(offenders, 'these must import + call requireRealProjectOptIn').toEqual([]);
  });

  it('every local-default entry point pins its target to loopback', () => {
    const offenders = Object.entries(CLASSIFIED)
      .filter(([, kind]) => kind === 'local-default')
      .map(([file]) => file)
      .filter((file) => !/process\.env\.BASE_URL\s*=\s*[`'"]http:\/\/127\.0\.0\.1/.test(source(join(ROOT, file))));
    expect(offenders, 'these must set process.env.BASE_URL to a 127.0.0.1 target').toEqual([]);
  });

  it('explicit-command entry points need a real signal and are absent from default npm scripts', () => {
    const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    const isDefault = (name: string): boolean => name === 'check' || name === 'test' || name === 'test:watch' || name.startsWith('e2e');
    const defaultCommands = Object.entries(scripts)
      .filter(([name]) => isDefault(name))
      .map(([, command]) => command)
      .join('\n');
    const offenders = Object.entries(CLASSIFIED)
      .filter(([, kind]) => kind === 'explicit-command')
      .map(([file]) => file)
      .filter((file) => {
        const src = source(join(ROOT, file));
        const hasSignal = /(DATABASE_URL|LIVE_DATABASE_URL|--live|hasFlag\('live'\))/.test(src);
        return !hasSignal || defaultCommands.includes(file);
      });
    expect(offenders, 'these must require DATABASE_URL/--live and stay out of default npm scripts').toEqual([]);
  });
});

// ------------------------------------------------------------------- 3. the databases are opt-in too

describe('real-database integration suites are opt-in', () => {
  const DB_SUITES = [
    'server/tests/postgres.integration.test.ts',
    'server/tests/invite-code-retry.test.ts',
    'server/tests/live-postgres.integration.test.ts',
    'server/tests/accounts-postgres.integration.test.ts',
  ];

  it('each gates its connection on REQUIRE_DATABASE', () => {
    const offenders = DB_SUITES.filter((file) => !/REQUIRE_DATABASE/.test(source(join(ROOT, file))));
    expect(offenders, 'each real-DB suite must read REQUIRE_DATABASE').toEqual([]);
  });

  it('a poisoned URL with no opt-in makes them SKIP and pass (they never open a socket)', () => {
    const env = { ...process.env };
    delete env.REQUIRE_DATABASE;
    // A guaranteed-dead loopback endpoint: if a suite did connect, every test would fail. Passing
    // here proves the default opens no connection — the cheapest possible proof, with no real quota.
    const dead = 'postgresql://poison:poison@127.0.0.1:1/none';
    env.DATABASE_URL = dead;
    env.LIVE_DATABASE_URL = dead;
    const { status, output } = runNode(['./node_modules/vitest/vitest.mjs', 'run', ...DB_SUITES], env);
    if (status !== 0) throw new Error(`expected a green skipped run, got ${status}:\n${output}`);
    expect(output).toMatch(/skipped/i);
  }, 180_000);
});
