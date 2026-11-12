// Builds the hidden Art Lab (futasaku.com/art) after the game, for the live game's channel only.
// Separate on purpose: the game's own build is untouched by the lab (web/vite.art.config.ts).
import { execFileSync } from 'node:child_process';
if ((process.env.CHANNEL ?? '') !== 'futa05') {
  console.log(`art lab: skipped (CHANNEL=${process.env.CHANNEL ?? ''}; the lab ships with the live game only)`);
  process.exit(0);
}
execFileSync(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.art.config.ts'], { stdio: 'inherit' });
