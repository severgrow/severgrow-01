// FUTASAKU demo monitor: one screen, three checks, a loud alert when something breaks.
//
// Why this exists: during the 21 November demo nobody can tell "their phone is broken" from
// "the server is down" — the backend has only one log line per request and no metrics or alerts.
// This script watches the things that can fail independently:
//
//   API   the public health endpoint WITH its database round trip (`/v1/health?db=1`)
//   SITE  the live game root
//   TEST  the /test/ preview copy
//
// It is deliberately small, dependency-free, and read-only: GET requests, no tokens, no writes.
// See docs/DEMO-ALERTING.md for what each alert means, what to do, and what this cannot see.
//
// Run it:  npm run demo:monitor
//
import { pathToFileURL } from 'node:url';

export type Verdict = 'up' | 'degraded' | 'down';

/** The result of one check: a verdict, how long it took, and one short human-readable reason. */
export interface CheckResult {
  verdict: Verdict;
  ms: number;
  detail: string;
}

export interface AlertPolicy {
  /** Consecutive non-up checks before a target alerts. Two means one slow request cannot scream. */
  failAfter: number;
  /** Consecutive up checks before a recovery is announced. */
  recoverAfter: number;
}

export interface TargetState {
  /** True while this target is in an announced failure (so it never alerts twice). */
  alarm: boolean;
  failStreak: number;
  upStreak: number;
}

export const DEFAULT_POLICY: AlertPolicy = { failAfter: 2, recoverAfter: 2 };

export const newTargetState = (): TargetState => ({ alarm: false, failStreak: 0, upStreak: 0 });

/**
 * Fold one check into a target's state. Pure: returns the next state and, at most once per episode,
 * a transition. A single failed check is recorded but stays silent.
 */
export const observe = (
  state: TargetState,
  verdict: Verdict,
  policy: AlertPolicy = DEFAULT_POLICY,
): { state: TargetState; transition: 'failed' | 'recovered' | null } => {
  if (verdict === 'up') {
    const upStreak = state.upStreak + 1;
    const next: TargetState = { alarm: state.alarm, failStreak: 0, upStreak };
    if (state.alarm && upStreak >= policy.recoverAfter) {
      return { state: { ...next, alarm: false }, transition: 'recovered' };
    }
    return { state: next, transition: null };
  }
  const failStreak = state.failStreak + 1;
  const next: TargetState = { alarm: state.alarm, failStreak, upStreak: 0 };
  if (!state.alarm && failStreak >= policy.failAfter) {
    return { state: { ...next, alarm: true }, transition: 'failed' };
  }
  return { state: next, transition: null };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Read the body of `GET /v1/health?db=1`.
 *
 * Healthy is a 2xx whose body says `ok: true` AND `db.ok: true` — the second half is the point:
 * the Edge function can be up while the free-tier database is paused or its pooler is exhausted.
 * A 2xx without that proof is `degraded` (reachable, not healthy). A non-2xx is `down` (the Edge
 * entry returns 503 `DB_UNAVAILABLE` / `DB_SECRET_MISSING` or 500 `EDGE_BOOT_ERROR`).
 */
export const interpretHealth = (status: number, body: unknown): { verdict: Verdict; detail: string } => {
  const record = asRecord(body);
  if (status < 200 || status > 299) {
    const code = typeof record?.code === 'string' ? ` ${record.code}` : '';
    return { verdict: 'down', detail: `HTTP ${status}${code}` };
  }
  if (record?.ok !== true) {
    return { verdict: 'degraded', detail: `HTTP ${status}, health body is not ok` };
  }
  const db = asRecord(record.db);
  if (db?.ok !== true) {
    return { verdict: 'degraded', detail: 'database round trip not confirmed' };
  }
  const ms = typeof db.ms === 'number' && Number.isFinite(db.ms) ? `db ${db.ms}ms` : 'db ok';
  return { verdict: 'up', detail: ms };
};

/**
 * Read a page check. A 2xx with an HTML content type is up; a 2xx serving something else is
 * degraded (a proxy or error page answered instead of the game).
 */
export const interpretPage = (status: number, contentType: string | null): { verdict: Verdict; detail: string } => {
  if (status < 200 || status > 299) return { verdict: 'down', detail: `HTTP ${status}` };
  if (contentType !== null && !contentType.toLowerCase().includes('text/html')) {
    return { verdict: 'degraded', detail: `unexpected content type: ${contentType.split(';')[0]?.trim() ?? ''}` };
  }
  return { verdict: 'up', detail: `HTTP ${status}` };
};

/** A short, safe reason for a failed request. Never includes headers, tokens or a response body. */
export const describeFailure = (error: unknown, timeoutMs: number): string => {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'TimeoutError' || name === 'AbortError' || /aborted|timed? out/i.test(message)) {
    return `timed out after ${timeoutMs}ms`;
  }
  const cause = error instanceof Error ? asRecord(error.cause) : null;
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  if (causeCode !== '') return `request failed: ${causeCode}`;
  return `request failed: ${message.replace(/\s+/g, ' ').slice(0, 80)}`;
};

interface CheckOptions {
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const readBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const checkHealth = async (url: string, options: CheckOptions): Promise<CheckResult> => {
  const started = Date.now();
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { 'cache-control': 'no-cache' },
    });
    const body = await readBody(response);
    const reading = interpretHealth(response.status, body);
    return { ...reading, ms: Date.now() - started };
  } catch (error: unknown) {
    return { verdict: 'down', ms: Date.now() - started, detail: describeFailure(error, options.timeoutMs) };
  }
};

export const checkPage = async (url: string, options: CheckOptions): Promise<CheckResult> => {
  const started = Date.now();
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { 'cache-control': 'no-cache' },
    });
    // Read the body so a host that sends headers and then hangs is still caught by the timeout.
    await response.text();
    const reading = interpretPage(response.status, response.headers.get('content-type'));
    return { ...reading, ms: Date.now() - started };
  } catch (error: unknown) {
    return { verdict: 'down', ms: Date.now() - started, detail: describeFailure(error, options.timeoutMs) };
  }
};

// ---------------------------------------------------------------------------------------------
// Terminal side. Kept below the pure part so the tests never start a timer or ring a bell.
// ---------------------------------------------------------------------------------------------

type TargetKind = 'api' | 'site';

interface Target {
  id: string;
  label: string;
  url: string;
  kind: TargetKind;
}

export interface MonitorOptions {
  targets: Target[];
  intervalMs: number;
  timeoutMs: number;
  slowMs: number;
  policy: AlertPolicy;
  once: boolean;
}

const DEFAULTS = {
  api: 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1',
  site: 'https://www.futasaku.com/',
  test: 'https://www.futasaku.com/test/',
  intervalMs: 15_000,
  timeoutMs: 10_000,
  slowMs: 3_000,
};

const USAGE = `FUTASAKU demo monitor

  npm run demo:monitor [options]

Options
  --interval=<ms>   wait between rounds (default ${DEFAULTS.intervalMs})
  --timeout=<ms>    a check slower than this counts as DOWN (default ${DEFAULTS.timeoutMs})
  --api=<url>       health URL, including ?db=1 (default: the live Edge function)
  --site=<url>      live site root (default ${DEFAULTS.site})
  --test=<url>      test copy (default ${DEFAULTS.test})
  --once            run one round and exit
  --help            show this text

Ctrl+C stops it. Alerts ring the terminal bell; see docs/DEMO-ALERTING.md.`;

const parseMs = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1_000) throw new Error(`${name} must be a number of milliseconds (>= 1000).`);
  return Math.round(value);
};

const parseUrl = (raw: string | undefined, fallback: string, name: string): string => {
  const value = raw ?? fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`${name} must be http(s).`);
  return url.toString();
};

const defaultTargets = (): Target[] => [
  { id: 'api', label: 'API ', url: DEFAULTS.api, kind: 'api' },
  { id: 'site', label: 'SITE', url: DEFAULTS.site, kind: 'site' },
  { id: 'test', label: 'TEST', url: DEFAULTS.test, kind: 'site' },
];

/** Parse the small CLI. Exported so the flags can be tested without starting the loop. */
export const parseOptions = (argv: string[]): MonitorOptions => {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error(`unknown argument: ${arg}`);
    const [name = '', value] = arg.slice(2).split('=', 2);
    if (name !== 'once' && name !== 'interval' && name !== 'timeout' && name !== 'api' && name !== 'site' && name !== 'test') {
      throw new Error(`unknown option: --${name}`);
    }
    if (name === 'once') {
      flags.set(name, true);
      continue;
    }
    if (value === undefined || value === '') throw new Error(`--${name} needs a value.`);
    flags.set(name, value);
  }

  const targets = defaultTargets();
  targets[0] = { id: 'api', label: 'API ', url: parseUrl(flags.get('api') as string | undefined, DEFAULTS.api, '--api'), kind: 'api' };
  targets[1] = { id: 'site', label: 'SITE', url: parseUrl(flags.get('site') as string | undefined, DEFAULTS.site, '--site'), kind: 'site' };
  targets[2] = { id: 'test', label: 'TEST', url: parseUrl(flags.get('test') as string | undefined, DEFAULTS.test, '--test'), kind: 'site' };
  return {
    targets,
    intervalMs: parseMs(flags.get('interval') as string | undefined, DEFAULTS.intervalMs, '--interval'),
    timeoutMs: parseMs(flags.get('timeout') as string | undefined, DEFAULTS.timeoutMs, '--timeout'),
    slowMs: DEFAULTS.slowMs,
    policy: DEFAULT_POLICY,
    once: flags.get('once') === true,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const clock = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatLine = (target: Target, result: CheckResult, slowMs: number, now: Date): string => {
  const status =
    result.verdict === 'up' ? (result.ms >= slowMs ? 'UP-SLOW ' : 'UP      ') : result.verdict === 'degraded' ? 'DEGRADED' : 'DOWN    ';
  return `${clock(now)}  ${target.label}  ${status}  ${String(result.ms).padStart(6)}ms  ${result.detail}`;
};

const BELL = '\u0007';

/** Ring a few times with gaps: a distinct, repeating sound, not a once-per-second alarm. */
const ring = async (times: number, gapMs: number): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    process.stderr.write(BELL);
    if (i < times - 1) await sleep(gapMs);
  }
};

const alert = async (target: Target, result: CheckResult, policy: AlertPolicy): Promise<void> => {
  const what = result.verdict === 'degraded' ? 'DEGRADED' : 'DOWN';
  const border = '!'.repeat(72);
  process.stderr.write(
    `\n${border}\n` +
      `!!! ${clock(new Date())}  ALERT: ${target.label.trim()} is ${what} (${policy.failAfter} checks in a row)\n` +
      `!!! ${result.detail}  (${target.url})\n` +
      `!!! Check a phone on mobile data: if the site loads there, suspect this laptop or its network.\n` +
      `!!! What to do: docs/DEMO-ALERTING.md\n` +
      `${border}\n\n`,
  );
  await ring(5, 300);
};

const recovered = async (target: Target, result: CheckResult): Promise<void> => {
  process.stderr.write(`\n*** ${clock(new Date())}  RECOVERED: ${target.label.trim()} is answering again (${result.detail})\n\n`);
  await ring(2, 150);
};

export const runMonitor = async (options: MonitorOptions): Promise<void> => {
  const states = new Map(options.targets.map((target) => [target.id, newTargetState()]));
  process.stdout.write(
    `FUTASAKU demo monitor — ${options.targets.length} checks every ${options.intervalMs / 1000}s, ` +
      `timeout ${options.timeoutMs / 1000}s, slow over ${options.slowMs / 1000}s\n`,
  );
  for (const target of options.targets) process.stdout.write(`  ${target.label}  ${target.url}\n`);
  process.stdout.write(
    `  Alerts need ${options.policy.failAfter} failed checks in a row; recovery needs ${options.policy.recoverAfter} good ones. Ctrl+C stops.\n\n`,
  );

  let stopping = false;
  const stop = (): void => {
    stopping = true;
    process.stdout.write('\nStopped.\n');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  do {
    for (const target of options.targets) {
      if (stopping) return;
      const result =
        target.kind === 'api'
          ? await checkHealth(target.url, { timeoutMs: options.timeoutMs })
          : await checkPage(target.url, { timeoutMs: options.timeoutMs });
      process.stdout.write(`${formatLine(target, result, options.slowMs, new Date())}\n`);

      const previous = states.get(target.id) ?? newTargetState();
      const { state, transition } = observe(previous, result.verdict, options.policy);
      states.set(target.id, state);
      if (transition === 'failed') await alert(target, result, options.policy);
      if (transition === 'recovered') await recovered(target, result);
    }
    if (!options.once && !stopping) await sleep(options.intervalMs);
  } while (!options.once && !stopping);
};

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      process.stdout.write(`${USAGE}\n`);
    } else {
      await runMonitor(parseOptions(process.argv.slice(2)));
    }
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
    process.exitCode = 2;
  }
}
