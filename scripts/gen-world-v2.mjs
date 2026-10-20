// GENERATE the frozen v2 world: v1 (183 cells) plus a deterministic, irregular outer growth
// to ~275 cells. No randomness at runtime — this script bakes the table once.
//
// Growth rule (deterministic, no tails by construction):
//   · candidates are cells outside v1 but within two steps of it;
//   · they are ranked by a fixed integer hash of their own coordinate;
//   · a candidate is added only when it already touches at least TWO cells of the map, so the
//     map can never grow a one-cell spur, and every added cell is connected by construction;
//   · passes repeat until no more candidates qualify or the target is reached.
// The result is therefore always connected and always tail-free, and the silhouette is irregular
// because the order comes from a hash, not from a ring.

const WIDTHS = [6, 8, 10, 11, 12, 13, 13, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6];
const SHIFT = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (q, r) => `${q},${r}`;

const v1 = [];
for (let index = 0; index < WIDTHS.length; index++) {
  const r = index - 8;
  const width = WIDTHS[index];
  const first = Math.floor(-r / 2 - width / 2) + SHIFT[index];
  for (let offset = 0; offset < width; offset++) v1.push({ q: first + offset, r });
}
const v1Keys = new Set(v1.map((c) => key(c.q, c.r)));

const hashCell = (q, r) => {
  let h = 2166136261;
  for (const ch of `${q},${r}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
};

const neighbours = (q, r) => DIRS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

// Candidates: two steps outside v1.
const candidates = new Map();
let frontier = v1.map((c) => ({ ...c }));
for (let step = 0; step < 2; step++) {
  const next = [];
  for (const c of frontier) {
    for (const n of neighbours(c.q, c.r)) {
      const k = key(n.q, n.r);
      if (v1Keys.has(k)) continue;
      if (!candidates.has(k)) {
        candidates.set(k, n);
        next.push(n);
      }
    }
  }
  frontier = next;
}

const ranked = [...candidates.entries()]
  .map(([k, c]) => ({ k, c, h: hashCell(c.q, c.r) }))
  .sort((a, b) => a.h - b.h || a.k.localeCompare(b.k));

const all = new Map(v1.map((c) => [key(c.q, c.r), c]));
const TARGET = 275;
const touch = (q, r) => neighbours(q, r).filter((n) => all.has(key(n.q, n.r))).length;

// The map must stay nearly SQUARE: the Territory view sizes itself from this ratio, and a lopsided
// map wastes phone height. So a candidate is also refused if it would push the bounding box's
// width/height ratio below this floor.
const R = 10;
const X = Math.sqrt(3);
const extents = () => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of all.values()) {
    const x = X * (c.q + c.r / 2) * R;
    const y = 1.5 * c.r * R;
    minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R);
    minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R);
  }
  return { minX, minY, maxX, maxY };
};
const ratioWith = (c) => {
  const before = all.has(key(c.q, c.r));
  if (!before) all.set(key(c.q, c.r), c);
  const e = extents();
  if (!before) all.delete(key(c.q, c.r));
  return (e.maxX - e.minX + 12) / (e.maxY - e.minY + 12);
};
const RATIO_FLOOR = 0.995;

let progressed = true;
while (progressed && all.size < TARGET) {
  progressed = false;
  for (const item of ranked) {
    if (all.size >= TARGET) break;
    if (all.has(item.k)) continue;
    if (touch(item.c.q, item.c.r) < 2) continue;
    if (ratioWith(item.c) < RATIO_FLOOR) continue;
    all.set(item.k, item.c);
    progressed = true;
  }
}

const cells = [...all.values()].sort((a, b) => (a.r - b.r) || (a.q - b.q));
const rows = new Map();
for (const c of cells) rows.set(c.r, (rows.get(c.r) ?? 0) + 1);
const widths = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);

console.log('v1 cells      :', v1.length);
console.log('v2 cells      :', cells.length);
console.log('added         :', cells.length - v1.length);
console.log('row widths    :', widths.join(' '));
console.log('min/max width :', Math.min(...widths), '/', Math.max(...widths));
console.log('v1 subset     :', v1.every((c) => all.has(key(c.q, c.r))));
console.log('min neighbours:', Math.min(...cells.map((c) => neighbours(c.q, c.r).filter((n) => all.has(key(n.q, n.r))).length)));

const minQ = Math.min(...cells.map((c) => c.q));
const maxQ = Math.max(...cells.map((c) => c.q));
const minR = Math.min(...cells.map((c) => c.r));
const maxR = Math.max(...cells.map((c) => c.r));
let art = '';
for (let r = minR; r <= maxR; r++) {
  let line = '';
  for (let q = minQ; q <= maxQ; q++) {
    const k = key(q, r);
    line += all.has(k) ? (v1Keys.has(k) ? '#' : '+') : ' ';
  }
  art += line + '\n';
}
console.log(art);

const byRow = new Map();
for (const c of cells) {
  if (!byRow.has(c.r)) byRow.set(c.r, []);
  byRow.get(c.r).push(c.q);
}
const rowsOut = [...byRow.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([r, qs]) => `  [${r}, [${qs.sort((a, b) => a - b).join(',')}]],`)
  .join('\n');
console.log('=== TS ===');
console.log(rowsOut);
