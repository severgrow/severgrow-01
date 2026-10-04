// Records the deals (hands, deck, discard, terrain) of seeds 1-20 on the current rules, so the
// fairness test can check that a separate, earlier run produced exactly the same deals.
//   npx tsx tests/fixtures/make-deals.ts
import { writeFileSync } from 'node:fs';
import { CURRENT_RULES_VERSION, newGame } from '../../src/engine/index.js';
import { stateHash } from '../hash.js';

const deals = Array.from({ length: 20 }, (_, i) => {
  const g = newGame(i + 1);
  return stateHash({ hands: g.hands, deck: g.deck, discard: g.discard, terrain: g.terrain });
});
if (process.argv.includes('--print')) console.log(JSON.stringify(deals));
else {
  writeFileSync(new URL('./deals.json', import.meta.url), JSON.stringify({ rules: CURRENT_RULES_VERSION, deals }, null, 1) + '\n');
  console.log('wrote', deals.length, 'deals');
}
