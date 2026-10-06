// Writes the runtime manifest of every skin folder in web/public (design-v3, ...): the files each
// tier really has, so the game never requests a missing one, and a short content hash of each
// (the game asks for `file?v=<hash>`, so a changed picture is a new address: no browser or
// offline cache can ever serve an old copy of it).   npm run skin:manifest
// With --check it writes nothing and fails when the manifest on disk is out of date (CI guard).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const pub = join(import.meta.dirname, 'public');
const check = process.argv.includes('--check');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const skin of ['design-v3']) {
  const root = join(pub, skin);
  const tiers: Record<string, string[]> = {};
  for (const t of ['lo', 'hi']) tiers[t] = existsSync(join(root, t)) ? walk(join(root, t)).map((f) => relative(join(root, t), f).split('\\').join('/')).filter((f) => !f.endsWith('.md')).sort() : [];
  const hash: Record<string, Record<string, string>> = {};
  for (const t of Object.keys(tiers)) hash[t] = Object.fromEntries(tiers[t]!.map((f) => [f, createHash('sha1').update(readFileSync(join(root, t, f))).digest('hex').slice(0, 10)]));
  const version = createHash('sha1').update(JSON.stringify(hash)).digest('hex').slice(0, 10);
  const text = `${JSON.stringify({ version, generated: 'npm run skin:manifest', tiers, hash }, null, 1)}\n`;
  if (check) {
    const now = existsSync(join(root, 'manifest.json')) ? readFileSync(join(root, 'manifest.json'), 'utf8') : '';
    if (now !== text) {
      console.error(`${skin}/manifest.json is out of date: run npm run skin:manifest (a changed picture would keep its old address and could be served stale)`);
      process.exit(1);
    }
    console.log(`${skin}: manifest up to date (${version})`);
    continue;
  }
  writeFileSync(join(root, 'manifest.json'), text);
  console.log(`${skin}: lo ${tiers.lo!.length} files, hi ${tiers.hi!.length} files (${version})`);
}
