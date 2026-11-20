/**
 * The demo monitor has to be trusted the first time it is used: during the demo its alert is the
 * only signal that separates "a tester's phone is broken" from "the server is down".
 *
 * These tests cover the decisions that can be wrong without a network: how a health body is read,
 * how a page is read, and the debounce/alert state machine. The timer loop and `fetch` are not
 * exercised here — no test makes a real request or sleeps.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  describeFailure,
  interpretHealth,
  interpretPage,
  newTargetState,
  observe,
  parseOptions,
  type TargetState,
} from '../scripts/demo-alert.js';

const HEALTHY = { ok: true, rulesVersion: 'r', serverNow: 1, db: { ok: true, ms: 12, pooler: 'transaction', port: 6543 } };

const fold = (verdicts: Array<'up' | 'degraded' | 'down'>, policy = DEFAULT_POLICY): Array<string | null> => {
  let state: TargetState = newTargetState();
  return verdicts.map((verdict) => {
    const step = observe(state, verdict, policy);
    state = step.state;
    return step.transition;
  });
};

describe('reading /v1/health?db=1', () => {
  it('is UP only when the body proves the database round trip', () => {
    expect(interpretHealth(200, HEALTHY)).toEqual({ verdict: 'up', detail: 'db 12ms' });
  });

  it('is UP when an older server omits db.ms but says the round trip was ok', () => {
    expect(interpretHealth(200, { ok: true, db: { ok: true } })).toEqual({ verdict: 'up', detail: 'db ok' });
  });

  it('is DEGRADED when the function answers but does not report a database round trip', () => {
    expect(interpretHealth(200, { ok: true, rulesVersion: 'r' })).toEqual({
      verdict: 'degraded',
      detail: 'database round trip not confirmed',
    });
  });

  it('is DEGRADED when the database round trip reports not-ok', () => {
    expect(interpretHealth(200, { ok: true, db: { ok: false, ms: 5 } }).verdict).toBe('degraded');
  });

  it('is DEGRADED when the body is not the health contract at all', () => {
    expect(interpretHealth(200, '<html>proxy</html>').verdict).toBe('degraded');
    expect(interpretHealth(200, { ok: false }).verdict).toBe('degraded');
  });

  it('is DOWN with the public error code of a failed Edge response', () => {
    expect(interpretHealth(503, { ok: false, code: 'DB_UNAVAILABLE', message: 'busy' })).toEqual({
      verdict: 'down',
      detail: 'HTTP 503 DB_UNAVAILABLE',
    });
    expect(interpretHealth(500, { ok: false, code: 'EDGE_BOOT_ERROR' }).detail).toBe('HTTP 500 EDGE_BOOT_ERROR');
  });

  it('is DOWN for any non-2xx, even with no readable body', () => {
    expect(interpretHealth(503, null)).toEqual({ verdict: 'down', detail: 'HTTP 503' });
    expect(interpretHealth(429, 'slow down').verdict).toBe('down');
  });
});

describe('reading the site checks', () => {
  it('is UP for a 2xx HTML page', () => {
    expect(interpretPage(200, 'text/html; charset=utf-8')).toEqual({ verdict: 'up', detail: 'HTTP 200' });
  });

  it('is UP when the host omits a content type', () => {
    expect(interpretPage(200, null).verdict).toBe('up');
  });

  it('is DEGRADED when the answer is not the page', () => {
    expect(interpretPage(200, 'application/json')).toEqual({ verdict: 'degraded', detail: 'unexpected content type: application/json' });
  });

  it('is DOWN for a non-2xx answer', () => {
    expect(interpretPage(404, 'text/html')).toEqual({ verdict: 'down', detail: 'HTTP 404' });
    expect(interpretPage(503, null).verdict).toBe('down');
  });
});

describe('failure reasons', () => {
  it('names a timeout as a timeout, not as a generic failure', () => {
    expect(describeFailure(new DOMException('The operation was aborted', 'TimeoutError'), 10_000)).toBe('timed out after 10000ms');
  });

  it('keeps a DNS/connection failure short and safe', () => {
    const error = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    expect(describeFailure(error, 10_000)).toBe('request failed: ENOTFOUND');
  });
});

describe('debounce and up/down transitions', () => {
  it('stays silent on a single failed check', () => {
    expect(fold(['down'])).toEqual([null]);
  });

  it('alerts once on the second consecutive failure, never on every check', () => {
    expect(fold(['down', 'down', 'down', 'down'])).toEqual([null, 'failed', null, null]);
  });

  it('treats DEGRADED as a failure, and still alerts only once', () => {
    expect(fold(['degraded', 'down', 'degraded'])).toEqual([null, 'failed', null]);
  });

  it('a single good check breaks the failure streak', () => {
    expect(fold(['down', 'up', 'down', 'down'])).toEqual([null, null, null, 'failed']);
  });

  it('announces recovery once, after two good checks, and then stays quiet', () => {
    expect(fold(['down', 'down', 'up', 'up', 'up'])).toEqual([null, 'failed', null, 'recovered', null]);
  });

  it('does not announce recovery on a target that never alerted', () => {
    expect(fold(['down', 'up', 'up'])).toEqual([null, null, null]);
  });

  it('a short wobble after recovery starts a new episode', () => {
    expect(fold(['down', 'down', 'up', 'up', 'down', 'down'])).toEqual([null, 'failed', null, 'recovered', null, 'failed']);
  });

  it('a slow-but-successful check is not a failure', () => {
    expect(fold(['up', 'up', 'up'])).toEqual([null, null, null]);
  });

  it('honours a custom policy', () => {
    expect(fold(['down'], { failAfter: 1, recoverAfter: 1 })).toEqual(['failed']);
    expect(fold(['down', 'up'], { failAfter: 1, recoverAfter: 1 })).toEqual(['failed', 'recovered']);
    expect(fold(['down', 'down', 'up'], { failAfter: 2, recoverAfter: 1 })).toEqual([null, 'failed', 'recovered']);
  });
});

describe('command line', () => {
  it('uses the live API, root and /test/ by default', () => {
    const options = parseOptions([]);
    expect(options.targets.map((target) => target.id)).toEqual(['api', 'site', 'test']);
    expect(options.targets[0]?.url).toContain('/functions/v1/duel/v1/health?db=1');
    expect(options.targets[1]?.url).toBe('https://www.futasaku.com/');
    expect(options.targets[2]?.url).toBe('https://www.futasaku.com/test/');
    expect(options.intervalMs).toBe(15_000);
    expect(options.timeoutMs).toBe(10_000);
    expect(options.once).toBe(false);
  });

  it('accepts overrides for a deliberately wrong target', () => {
    const options = parseOptions(['--test=https://futasaku.invalid/', '--interval=3000', '--once']);
    expect(options.targets[2]?.url).toBe('https://futasaku.invalid/');
    expect(options.intervalMs).toBe(3_000);
    expect(options.once).toBe(true);
  });

  it('refuses an unusable URL or interval instead of monitoring the wrong thing', () => {
    expect(() => parseOptions(['--api=not-a-url'])).toThrow(/not a valid URL/);
    expect(() => parseOptions(['--site=ftp://example.com/'])).toThrow(/http\(s\)/);
    expect(() => parseOptions(['--interval=10'])).toThrow(/>= 1000/);
    expect(() => parseOptions(['--nope=1'])).toThrow(/unknown option/);
  });
});
