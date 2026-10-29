// PROMOTE: put what futasaku.com/test/ shows live at futasaku.com (docs/RELEASE-FLOW.md).
//
//   npm run promote              promote the exact commit /test/ is serving
//   npm run promote -- <sha>     promote (or roll back to) a specific commit on futa0.5-online
//   npm run promote -- --status  show what is live and what is on /test/, change nothing
//
// It moves ONE git branch, `live`, and nothing else; the publish workflow then rebuilds the site
// (about 20 minutes: it waits for CI on the commit, which already passed when /test/ got it).
// Works from any terminal or agent with push access: Claude, Codex, Cursor, DeepSeek, a laptop.
import { execFileSync } from 'node:child_process';

const SITE = 'https://severgrow.github.io/severgrow-01';
const args = process.argv.slice(2);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
// curl first: it honours HTTPS_PROXY (Node's fetch does not), which many agent sandboxes need.
const fetchJson = async (path) => {
  const url = `${SITE}${path}?promote=${Date.now()}`;
  try {
    return JSON.parse(execFileSync('curl', ['-fsSL', '--retry', '2', '-H', 'Cache-Control: no-cache', url], { encoding: 'utf8' }));
  } catch {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }
};
const short = (sha) => (sha ? sha.slice(0, 7) : '(none)');
const subject = (sha) => { try { return git('log', '-1', '--format=%s', sha); } catch { return ''; } };

git('fetch', '--quiet', 'origin', 'futa0.5-online');
try { git('fetch', '--quiet', 'origin', 'live'); } catch {
  console.error('There is no `live` branch yet. Create it once at the commit that is live today:\n  git push origin <sha>:refs/heads/live');
  process.exit(1);
}
const liveSha = git('rev-parse', 'origin/live');
const headSha = git('rev-parse', 'origin/futa0.5-online');
let testSha = null;
try { testSha = (await fetchJson('/test/release.json')).commit ?? null; } catch (error) { console.warn(`Could not read /test/: ${error.message}`); }

console.log(`live (futasaku.com)        ${short(liveSha)}  ${subject(liveSha)}`);
console.log(`test (futasaku.com/test)   ${short(testSha)}  ${testSha ? subject(testSha) : ''}`);
console.log(`futa0.5-online head        ${short(headSha)}  ${subject(headSha)}${headSha !== testSha ? '  (not on /test/ yet: CI or the deploy is still running)' : ''}`);
if (args.includes('--status')) process.exit(0);

const target = args.find((a) => /^[0-9a-f]{7,40}$/.test(a)) ?? testSha;
if (!target) { console.error('Nothing to promote: /test/ did not name a commit. Pass a sha: npm run promote -- <sha>'); process.exit(1); }
const sha = git('rev-parse', `${target}^{commit}`);
try { git('merge-base', '--is-ancestor', sha, 'origin/futa0.5-online'); } catch {
  console.error(`${short(sha)} is not on futa0.5-online: only tested commits can go live.`); process.exit(1);
}
if (sha === liveSha) { console.log(`${short(sha)} is already live. Nothing to do.`); process.exit(0); }
let rollback = false;
try { git('merge-base', '--is-ancestor', liveSha, sha); } catch { rollback = true; }
// A forward promote is a fast-forward; a rollback (an older commit) has to move the branch back.
git('push', ...(rollback ? ['--force-with-lease=live:' + liveSha] : []), 'origin', `${sha}:refs/heads/live`);
console.log(`${rollback ? 'Rolled back' : 'Promoted'} live to ${short(sha)} — ${subject(sha)}`);
console.log('futasaku.com updates in about 20 minutes (Actions: "Publish futasaku.com (live + /test)").');
