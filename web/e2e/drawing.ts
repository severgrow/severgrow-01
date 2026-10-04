// Browser-test helper (v0.7): paints a Bloom the way a person would. The Bloom's button must
// already be chosen. A run's numbers follow the paint order (lowest first), so its hexes are
// painted in card order, or (if that order does not grow as one shape) reversed with the
// Reverse toggle. A set is painted from its first hex outward. Each new hex is reached by
// dragging from a hex of the shape that touches it (lifting and starting a new stroke when the
// last one does not).
import type { Page } from 'playwright-core';
import { coordKey, hexDistance, parseKey } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';

export const hexCenter = async (page: Page, key: string) => {
  const b = (await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const adjacent = (a: string, b: string) => hexDistance(parseKey(a), parseKey(b)) === 1;
const grows = (order: readonly string[]) => order.every((k, i) => i === 0 || order.slice(0, i).some((x) => adjacent(x, k)));

/** The paint order for a Bloom (and whether Reverse is needed), or null if it cannot be painted. */
export const paintPlan = (a: Action, ranks: readonly number[]): { order: string[]; reverse: boolean } | null => {
  if (a.t !== 'Bloom') return null;
  const hexes = a.hexes.map(coordKey);
  const isSet = ranks.every((r) => r === ranks[0]);
  if (isSet) {
    const out = [hexes[0]!];
    while (out.length < hexes.length) out.push(hexes.find((k) => !out.includes(k) && out.some((x) => adjacent(x, k)))!);
    return { order: out, reverse: false };
  }
  if (grows(hexes)) return { order: hexes, reverse: false };
  const back = [...hexes].reverse();
  return grows(back) ? { order: back, reverse: true } : null;
};

/** Paints `a` on the board with the mouse (or a touch-like drag). Returns false if it cannot be painted. */
export const drawMeld = async (page: Page, a: Action): Promise<boolean> => {
  if (a.t !== 'Bloom') throw new Error('not a Bloom');
  const ranks = (await page.evaluate(
    `(() => { const s = window.__severgrow.state(); const h = s.hands[s.actor]; return ${JSON.stringify(a.cards)}.map((id) => h.find((c) => c.id === id).rank); })()`,
  )) as number[];
  const plan = paintPlan(a, ranks);
  if (!plan) return false;
  if (plan.reverse) await page.click('#moves .draw-reverse');
  const order = plan.order;
  const shape = [order[0]!];
  let cur = order[0]!;
  let p = await hexCenter(page, cur);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (const next of order.slice(1)) {
    if (!adjacent(cur, next)) {
      const from = shape.find((s) => adjacent(next, s))!;
      await page.mouse.up();
      p = await hexCenter(page, from);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      cur = from;
    }
    const q = await hexCenter(page, next);
    await page.mouse.move(q.x, q.y, { steps: 6 });
    shape.push(next);
    cur = next;
  }
  await page.mouse.up();
  return true;
};

/** Picks the exact card group of a Bloom: its family's button, then (if the button chose another group of that family) the test hook. */
export const chooseBloom = async (page: Page, a: Action) => {
  if (a.t !== 'Bloom') return;
  const kind = `bloom-${a.cards.length}-${[...a.cards].sort((x, y) => x - y).join('.')}`;
  const btn = page.locator(`#moves [data-kinds~="${kind}"]`);
  if (await btn.count()) await btn.first().click();
  await page.evaluate(`window.__severgrow.pickKind(${JSON.stringify(kind)})`);
};
