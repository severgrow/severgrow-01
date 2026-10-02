// Records the deals (hands, deck, discard, terrain) of seeds 1-20 on the v0.5 rules, so the
// fairness test can check that a separate, earlier run produced exactly the same deals.
//   npx tsx tests/fixtures/make-deals-v05.ts
import { writeFileSync } from 'node:fs';
import { newGame } from '../../src/engine/index.js';
import { stateHash } from '../hash.js';

const deals = Array.from({ length: 20 }, (_, i) => {
  const g = newGame(i + 1);
  return stateHash({ hands: g.hands, deck: g.deck, discard: g.discard, terrain: g.terrain });
});
writeFileSync(new URL('./deals-v05.json', import.meta.url), JSON.stringify({ rules: 'v0.5-fruit-strengthen', deals }, null, 1) + '\n');
console.log('wrote', deals.length, 'deals');
