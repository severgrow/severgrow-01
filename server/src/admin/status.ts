// LIVE STATUS (launch readiness, 2026-11-12): the owner's monitoring, inside /admin.
//
// The store gathers FACTS (a database round trip, the connection count, the database size, the last
// run of every scheduled job, crash and report counts). `statusChecks` turns them into one line each,
// green / amber / red, with the reason in words. It is pure, so every threshold is tested.
//
// What it is not: an alerting system. It answers when the page asks (the Status screen refreshes it
// every minute while it is open). A fact the server cannot read is shown as "unknown", never green.

export type StatusLevel = 'ok' | 'warn' | 'bad' | 'unknown';

export type StatusJob = { name: string; lastRunAt: number | null; lastStatus: string | null };

export type StatusFacts = {
  db: { ok: boolean; ms: number | null };
  /** Postgres backends in use and the server's max_connections; null when they cannot be read. */
  connections: { used: number; max: number } | null;
  /** pg_database_size; null when it cannot be read. */
  sizeBytes: number | null;
  /** The pg_cron jobs and their last run; null when the scheduler cannot be read (or there is none). */
  jobs: StatusJob[] | null;
  crashes: { last24h: number; dailyAverage7d: number };
  /** Player reports nobody has triaged yet. */
  reports: { waiting: number; oldestWaitingAt: number | null };
};

export type StatusCheck = { id: string; label: string; level: StatusLevel; value: string; note: string };

/** The plan's included database size (Supabase Pro: 8 GB). Amber from 75%, red from 90%. */
export const STATUS_DB_BUDGET_BYTES = 8 * 1024 ** 3;

const HOUR = 3_600_000;
/** How long each known job may go without a successful run before it is red. */
const JOB_MAX_AGE: Record<string, { maxAgeMs: number; what: string }> = {
  'futasaku-keepalive': { maxAgeMs: 26 * HOUR, what: 'daily keep-alive and sweeper (finishes expired matches, settles Territory, keeps the project awake)' },
  'futasaku-rate-limit-cleanup': { maxAgeMs: 26 * HOUR, what: 'daily cleanup of old rate-limit counters' },
  'futasaku-chat-retention': { maxAgeMs: 2 * HOUR, what: 'hourly removal of duel chat older than 90 days' },
};
/** A job the server must have, even when the scheduler does not list it. */
const REQUIRED_JOBS = ['futasaku-keepalive'];

const ago = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};
const mb = (bytes: number): string => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

export const statusChecks = (facts: StatusFacts, now: number): StatusCheck[] => {
  const out: StatusCheck[] = [];

  out.push(!facts.db.ok
    ? { id: 'database', label: 'Server and database', level: 'bad', value: 'not answering', note: 'The API answered, but a database round trip failed. Players cannot play online.' }
    : {
        id: 'database', label: 'Server and database', level: (facts.db.ms ?? 0) > 800 ? 'warn' : 'ok', value: `${facts.db.ms ?? '?'} ms`,
        note: (facts.db.ms ?? 0) > 800 ? 'Answering, but slowly (over 800 ms for one round trip).' : 'Answering. One database round trip from the Edge function.',
      });

  if (!facts.connections) {
    out.push({ id: 'connections', label: 'Database connections', level: 'unknown', value: '—', note: 'Could not be read.' });
  } else {
    const share = facts.connections.used / Math.max(1, facts.connections.max);
    out.push({
      id: 'connections', label: 'Database connections', level: share >= 0.9 ? 'bad' : share >= 0.7 ? 'warn' : 'ok',
      value: `${facts.connections.used} of ${facts.connections.max}`,
      note: share >= 0.7 ? 'Close to the limit: new requests start failing when it is reached. Consider a larger compute size.' : 'Plenty of room.',
    });
  }

  if (facts.sizeBytes === null) {
    out.push({ id: 'size', label: 'Database size', level: 'unknown', value: '—', note: 'Could not be read.' });
  } else {
    const share = facts.sizeBytes / STATUS_DB_BUDGET_BYTES;
    out.push({
      id: 'size', label: 'Database size', level: share >= 0.9 ? 'bad' : share >= 0.75 ? 'warn' : 'ok',
      value: `${mb(facts.sizeBytes)} of ${mb(STATUS_DB_BUDGET_BYTES)}`,
      note: share >= 0.75 ? 'Approaching the plan’s included size: finished matches are never pruned.' : 'Within the plan’s included size.',
    });
  }

  if (facts.jobs === null) {
    out.push({ id: 'jobs', label: 'Scheduled jobs', level: 'unknown', value: '—', note: 'The scheduler (pg_cron) could not be read, so the keep-alive and sweeper cannot be confirmed.' });
  } else {
    const names = new Set([...REQUIRED_JOBS, ...facts.jobs.map((j) => j.name)]);
    for (const name of names) {
      const job = facts.jobs.find((j) => j.name === name) ?? { name, lastRunAt: null, lastStatus: null };
      const known = JOB_MAX_AGE[name] ?? { maxAgeMs: 26 * HOUR, what: 'scheduled job' };
      const failed = job.lastStatus !== null && job.lastStatus !== 'succeeded';
      const stale = job.lastRunAt === null || now - job.lastRunAt > known.maxAgeMs;
      out.push({
        id: `job:${name}`, label: name, level: failed || stale ? 'bad' : 'ok',
        value: job.lastRunAt === null ? 'never ran' : `${failed ? job.lastStatus : 'ran'} ${ago(job.lastRunAt, now)}`,
        note: failed ? `The last run failed. This is the ${known.what}.`
          : stale ? `Has not run when it should have. This is the ${known.what}.`
          : `The ${known.what}.`,
      });
    }
  }

  const { last24h, dailyAverage7d } = facts.crashes;
  const crashLevel: StatusLevel = last24h > Math.max(20, dailyAverage7d * 10) ? 'bad' : last24h > Math.max(5, dailyAverage7d * 3) ? 'warn' : 'ok';
  out.push({
    id: 'crashes', label: 'Crashes (24 h)', level: crashLevel, value: String(last24h),
    note: `${dailyAverage7d.toFixed(1)} a day over the 7 days before. ${crashLevel === 'ok' ? 'Normal.' : 'A spike: open Reports, filter crashes, and check the newest build.'}`,
  });

  const waiting = facts.reports.waiting;
  const oldest = facts.reports.oldestWaitingAt;
  out.push({
    id: 'reports', label: 'Reports waiting for you', level: waiting === 0 ? 'ok' : oldest !== null && now - oldest > 72 * HOUR ? 'bad' : 'warn',
    value: String(waiting),
    note: waiting === 0 ? 'Every player report has been looked at.' : `Oldest waiting since ${ago(oldest ?? now, now)}. Chat reports name the player they are about.`,
  });

  return out;
};
