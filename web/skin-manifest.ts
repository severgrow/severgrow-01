// Writes the runtime manifest of every skin folder in web/public (design-v3, ...): the files each
// tier really has, so the game never requests a missing one.   npm run skin:manifest
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const pub = join(import.meta.dirname, 'public');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const skin of ['design-v3']) {
  const root = join(pub, skin);
  const tiers: Record<string, string[]> = {};
  for (const t of ['lo', 'hi']) tiers[t] = existsSync(join(root, t)) ? walk(join(root, t)).map((f) => relative(join(root, t), f).split('\\').join('/')).filter((f) => !f.endsWith('.md')).sort() : [];
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({ version: '3.0', generated: 'npm run skin:manifest', tiers }, null, 1)}\n`);
  console.log(`${skin}: lo ${tiers.lo!.length} files, hi ${tiers.hi!.length} files`);
}
