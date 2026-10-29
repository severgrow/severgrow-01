// Put the STAGING copy of the game at /test/ (owner, 2026-10-29: "let's do futasaku.com/test and use
// promote word"). docs/RELEASE-FLOW.md has the whole flow.
//
//   node scripts/compose-test-route.mjs <site> <dist> <full-commit-sha>
//
// /test/ shows futa0.5-online's head; the root shows the `live` branch. It runs LAST in the publish
// workflow, after the parity guard, because /test/ is expected to change on every push (it replaced
// the retired dev copy of Main that used to live here).
//
// The test copy is the same build as the live game (same channel, same API, same saves and account,
// so your own Territory land is there), with three differences added here:
//   - a small "TEST · <sha>" badge, so nobody mistakes it for the live game;
//   - `noindex`, so search engines never list it;
//   - its release.json names the commit, which is exactly what `npm run promote` moves live.
// Its service worker keeps its own cache because web/public/futa04-sw.js gives the /test/ scope its
// own prefix.
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [site, dist, commit] = process.argv.slice(2);
assert(site && dist && /^[0-9a-f]{40}$/.test(commit ?? ''), 'Usage: site dist fullCommitSha');
const source = resolve(dist);
assert(existsSync(join(source, 'index.html')), `missing ${dist}/index.html`);

const target = join(site, 'test');
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

const indexPath = join(target, 'index.html');
const html = readFileSync(indexPath, 'utf8');
assert(html.includes('./assets/'), 'the test build must use relative asset paths to work at /test/');
assert(html.includes('</head>') && html.includes('</body>'), 'unexpected index.html shape');
const short = commit.slice(0, 7);
const badge =
  `<div id="staging-badge" aria-hidden="true" style="position:fixed;z-index:2147483647;right:max(6px,env(safe-area-inset-right));` +
  `bottom:max(4px,env(safe-area-inset-bottom));padding:2px 6px;border-radius:6px;background:#e07a5fd9;color:#160b08;` +
  `font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.08em;pointer-events:none;opacity:.85">TEST · ${short}</div>`;
writeFileSync(
  indexPath,
  html
    .replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>')
    .replace(/<title>([^<]*)<\/title>/, (_m, title) => `<title>TEST · ${title}</title>`)
    .replace('</body>', `  ${badge}\n  </body>`),
);
writeFileSync(
  join(target, 'release.json'),
  JSON.stringify({ channel: 'FUTASAKU test copy (promote to go live)', commit }, null, 2) + '\n',
);
console.log(`/test/   = the test copy (${short}); promote it with \`npm run promote\``);
