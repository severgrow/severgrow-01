// Read the beta feedback that players send us: "Report a problem" and silent crash reports.
//
//   npm run feedback:recent                 newest 20
//   npm run feedback:recent -- --limit=50   more
//   npm run feedback:recent -- --kind=crash crashes only
//   npm run feedback:recent -- --json       raw records, for scripting
//
// Until now these went into a database table that nothing ever showed you, so a report could sit
// unread indefinitely. This prints them, newest first, and says how many arrived since you last
// looked (a timestamp in ~/.futasaku-feedback-last-seen — no schema change, and it never writes to
// the report rows).
//
// WHEN THE ADMIN DASHBOARD LANDS (futasaku.com/admin), reuse `postgresFeedbackStore(pool).recent()`
// rather than copying this query: it is already the one reader. The dashboard is also the right
// home for a DB-backed "seen" flag, since that should work from any machine, not just this one.
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import { postgresFeedbackStore } from '../src/feedback/feedback.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const asJson = process.argv.includes('--json');
const kind = arg('kind');
const limit = Number.parseInt(arg('limit') ?? '20', 10);

if (kind && kind !== 'report' && kind !== 'crash') {
  console.error('--kind must be "report" or "crash".');
  process.exit(2);
}
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  console.error('--limit must be a whole number between 1 and 500.');
  process.exit(2);
}

const url = databaseUrlFromEnv();
if (!url) {
  console.error('DATABASE_URL is not set (put it in .env).');
  process.exit(2);
}

const MARKER = join(homedir(), '.futasaku-feedback-last-seen');
const readMarker = (): number => {
  try {
    return Number.parseInt(readFileSync(MARKER, 'utf8').trim(), 10) || 0;
  } catch {
    return 0;
  }
};
const lastSeen = readMarker();
const startedAt = Date.now();

const pool = poolFromUrl(url, { max: 1 });
const store = postgresFeedbackStore(pool);

// Read more than we print when filtering, so a --kind run still shows `limit` rows.
const rows = (await store.recent(kind ? Math.min(limit * 5, 500) : limit)).filter(
  (r) => !kind || r.kind === kind,
);
const shown = rows.slice(0, limit);

if (asJson) {
  console.log(JSON.stringify(shown, null, 1));
} else if (shown.length === 0) {
  console.log(kind ? `No ${kind} reports.` : 'No feedback reports yet.');
} else {
  const fresh = shown.filter((r) => r.createdAt > lastSeen).length;
  const header = kind ? `${shown.length} ${kind} report(s)` : `${shown.length} report(s)`;
  console.log(`${header} · ${fresh} new since you last looked\n`);
  for (const r of shown) {
    const when = new Date(r.createdAt).toISOString().replace('T', ' ').slice(0, 16);
    const isNew = r.createdAt > lastSeen ? ' • NEW' : '';
    console.log(`  ${when}  ${r.kind.toUpperCase().padEnd(6)}  ${r.build ?? '(no build)'}${isNew}`);
    console.log(`    ${r.message.trim() || '(no message)'}`);
    const ctx = r.context as Record<string, unknown>;
    const where = typeof ctx.step === 'string' || typeof ctx.step === 'number' ? ` · step ${String(ctx.step)}` : '';
    const screen = typeof ctx.screen === 'string' ? ` · ${ctx.screen}` : '';
    const view = typeof ctx.viewport === 'string' ? ` · ${ctx.viewport}` : '';
    if (where || screen || view) console.log(`    context:${screen}${view}${where}`);
    console.log('');
  }
  if (fresh > 0 && !kind) console.log('Open the dashboard for the full context of each report:');
  if (fresh > 0 && !kind) console.log('  Supabase → Table Editor → feedback_reports');
}

// Mark everything we just showed as seen, so the next run's "new" count means something.
// Only when we actually read the newest rows (an unfiltered run), so a --kind=crash glance cannot
// silently hide fresh bug reports.
if (!kind && rows.length > 0) {
  try {
    writeFileSync(MARKER, String(startedAt));
  } catch {
    /* a read-only home is not worth failing over */
  }
}

await (pool as unknown as { end?: () => Promise<void> }).end?.();
console.log(`\n(source: ${redactUrl(url)})`);
