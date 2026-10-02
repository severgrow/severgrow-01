// Browser-test helper (polish pass 3): makes a line or clump the way a person would, by
// drawing it on the board with the mouse. A line: click its start, then click its far end.
// A clump: press on a hex and drag through the others (lifting and starting again from the
// shape whenever the next hex does not touch the last one).
import type { Page } from 'playwright-core';
import { DIRECTIONS, coordKey, hexDistance, parseKey } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';

export const hexCenter = async (page: Page, key: string) => {
  const b = (await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const adjacent = (a: string, b: string) => hexDistance(parseKey(a), parseKey(b)) === 1;

/** Draws `a` (a MeldRun or MeldSet) on the board; the line or clump button must already be chosen. */
export const drawMeld = async (page: Page, a: Action) => {
  if (a.t === 'MeldRun') {
    const d = DIRECTIONS[a.dir]!;
    const n = a.cards.length - 1;
    const s = await hexCenter(page, coordKey(a.start));
    const e = await hexCenter(page, coordKey({ q: a.start.q + d.q * n, r: a.start.r + d.r * n }));
    await page.mouse.click(s.x, s.y);
    await page.mouse.move(e.x, e.y, { steps: 4 });
    await page.mouse.click(e.x, e.y);
    return;
  }
  if (a.t !== 'MeldSet') throw new Error('not a line or clump');
  const left = a.hexes.map(coordKey);
  const shape = [left.shift()!];
  let cur = shape[0]!;
  let p = await hexCenter(page, cur);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  while (left.length) {
    let i = left.findIndex((k) => adjacent(k, cur));
    if (i < 0) {
      // start a new stroke from a hex of the shape that touches one still to add
      i = left.findIndex((k) => shape.some((s) => adjacent(k, s)));
      const from = shape.find((s) => adjacent(left[i]!, s))!;
      await page.mouse.up();
      p = await hexCenter(page, from);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      cur = from;
    }
    const next = left.splice(i, 1)[0]!;
    const q = await hexCenter(page, next);
    await page.mouse.move(q.x, q.y, { steps: 6 });
    shape.push(next);
    cur = next;
  }
  await page.mouse.up();
};
