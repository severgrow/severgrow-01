// Part 1.4 (v0.5): measure, don't control. How many top-rank cards an opening hand holds,
// on the real deal, compared with the exact (hypergeometric) chance.
//   npx tsx src/sim/deal-stats.ts --deals=200000
import { newGame } from '../engine/index.js';

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const deals = Number(opt('deals') ?? 200_000);

/** C(n, k) as a float. */
const choose = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** Exact chance that a hand of h from a deck of N with K top cards holds at least m of them. */
const atLeast = (N: number, K: number, h: number, m: number) => {
  let p = 0;
  for (let k = m; k <= Math.min(K, h); k++) p += (choose(K, k) * choose(N - K, h - k)) / choose(N, h);
  return p;
};

for (const maxRank of [7, 9]) {
  const N = 4 * maxRank * 2;
  const K = 8;
  const counts = new Array<number>(9).fill(0);
  for (let seed = 1; seed <= deals; seed++) {
    const g = newGame(seed, { maxRank });
    for (const h of g.hands) counts[h.filter((c) => c.rank === maxRank).length]!++;
  }
  const hands = 2 * deals;
  const three = counts.slice(3).reduce((a, b) => a + b, 0) / hands;
  const zero = counts[0]! / hands;
  console.log(
    `${N}-card deck (ranks 1-${maxRank}): ${hands} opening hands. 3+ top cards: ${(100 * three).toFixed(2)}% (exact ${(100 * atLeast(N, K, 7, 3)).toFixed(2)}%); none: ${(100 * zero).toFixed(2)}% (exact ${(100 * (1 - atLeast(N, K, 7, 1))).toFixed(2)}%); mean ${(counts.reduce((a, c, i) => a + c * i, 0) / hands).toFixed(3)} (exact ${((7 * K) / N).toFixed(3)}); distribution ${counts.map((c) => (100 * c / hands).toFixed(2)).join(' / ')}`,
  );
}
