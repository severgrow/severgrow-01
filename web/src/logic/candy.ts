// Eye candy (UI overhaul, Part 3): the small decisions behind the decorations, kept pure so a
// test can check them. Every piece sits behind the "Eye candy" setting and also respects Reduce
// motion and Effects.
/** B. The splash: once per visit, short, and a still picture with Reduce motion. */
export const splashPlan = (o: { reduceMotion: boolean; on: boolean; shownThisVisit: boolean }): { show: boolean; ms: number; animated: boolean } => {
  if (!o.on || o.shownThisVisit) return { show: false, ms: 0, animated: false };
  return o.reduceMotion ? { show: true, ms: 700, animated: false } : { show: true, ms: 1600, animated: true };
};

/** C. The last-card moment: when the deck goes from 2+ to 1, and when it empties. */
export const deckMoment = (before: number, after: number): 'last' | 'out' | null => (after === 1 && before > 1 ? 'last' : after === 0 && before > 0 ? 'out' : null);

/** D. Spores returning to my root from tiles I just grew (at most 6, nearest the root first). */
export const sporesHome = (grown: readonly string[], root: string, max = 6): { from: string; delay: number }[] => {
  const d = (k: string) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    const [a, b] = root.split(',').map(Number) as [number, number];
    return Math.max(Math.abs(q - a), Math.abs(r - b), Math.abs(q + r - a - b));
  };
  return [...grown]
    .sort((x, y) => d(x) - d(y) || (x < y ? -1 : 1))
    .slice(0, max)
    .map((from, i) => ({ from, delay: i * 90 }));
};
