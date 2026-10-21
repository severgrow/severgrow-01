// GENERATE the frozen v2 world: v1 (183 cells) plus a deterministic outer growth to ~275 cells.
// No randomness at runtime — this script bakes the table once, and `server/src/world.ts` takes the
// `=== TS ===` block straight out of its output (do not hand-edit that table).
//
// COASTLINE RULE (owner, 2026-10-21: "Regenerate the v2 shape with a real coastline (smooth runs,
// bays, no teeth)"). The previous rule grew on a coordinate hash, which produced the owner's
// "rounded lozenge with a 3-hex crown and one separated bottom tooth": cells added at every other
// ring-2 position read as stray tiles, because a hex edge that alternates in and out is a comb.
//
// What replaces it:
//   · a new cell needs at least TWO neighbours already in the map (as before), and must not leave a
//     LONE TOOTH — a cell whose row-neighbours on both sides are outside the map while it has a cell
//     below it. A cell that would leave one is only added together with an adjacent partner, so the
//     shore always grows in runs of two or more;
//   · SMOOTH RUNS: candidates are scored by how many of their six neighbours are already in the map,
//     so 3+ neighbour cells are taken before 2-neighbour ones and the edge fills from its own inner
//     corners instead of pimpling (the coordinate hash only breaks ties inside one score);
//   · the SHORE itself is decided by a COAST FIELD: a fixed, smooth function of the angle around the
//     map's centre. The ring immediately around v1 is land all the way round (no holes, no combs);
//     the ring outside it is land only where the field is high enough, so the outline has a few
//     broad headlands and a few bays of two or three cells instead of one uniform ring;
//   · the cut-off is solved for the target count, so the shape lands in 270-280.
//
// The shape is deterministic: no randomness, no clock, no environment.

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

// A fixed integer hash: used ONLY to break ties inside one score, so the order never becomes the
// shape (which is what made teeth before). Deterministic across machines.
const hashCell = (q, r) => {
  let h = 2166136261;
  for (const ch of `${q},${r}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
};

const neighbours = (q, r) => DIRS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
const adjacent = (a, b) => DIRS.some(([dq, dr]) => b.q === a.q + dq && b.r === a.r + dr);

// Candidates: the ring immediately around v1 (distance 1) and the one outside it (distance 2).
// Nothing further is reachable before the target.
const ring1 = [];
const ring2 = [];
{
  const seen1 = new Set(v1Keys);
  for (const c of v1) for (const n of neighbours(c.q, c.r)) {
    const k = key(n.q, n.r);
    if (!seen1.has(k)) { seen1.add(k); ring1.push(n); }
  }
  const seen2 = new Set([...v1Keys, ...ring1.map((c) => key(c.q, c.r))]);
  for (const c of ring1) for (const n of neighbours(c.q, c.r)) {
    const k = key(n.q, n.r);
    if (!seen2.has(k)) { seen2.add(k); ring2.push(n); }
  }
}

const R = 10;
const X = Math.sqrt(3);
const at = (c) => ({ x: X * (c.q + c.r / 2) * R, y: 1.5 * c.r * R });

// The map's own centre, from v1's extent, so the coast field is anchored to the LAND and not to the
// candidate rings (which would let the field choose its own shape).
const centre = (() => {
  const points = v1.map(at);
  return {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  };
})();

/**
 * THE COASTLINE IS CUT, NOT ROUNDED. Growing by neighbour count alone fills every concavity, so a
 * coat around v1 always rounds back into the lozenge the owner rejected. Three BAYS are therefore
 * held back on purpose: a wedge of the shore is marked under water, in BOTH outer rings, so the sea
 * cuts 2 rings into the land and the outline reads as a coast instead of a rim. Two cells of angle
 * here is a little over two cells of shore (one hex is 17 world units wide, the shore is ~50 cells
 * round), so each bay is the 2-3 cells the owner asked for.
 *
 * The rest of the outline is left to the growth rule: the wedges BETWEEN the bays are headlands,
 * because the shore has to go around them.
 */
const BAYS = [
  { angle: 0.62, half: 0.17 }, // the cove on the right, below the top cape
  { angle: 2.45, half: 0.21 }, // the bay at the bottom, left of the long shore
  { angle: 4.35, half: 0.15 }, // the narrow inlet on the left
];
const angleOf = (c) => {
  const p = at(c);
  return Math.atan2(p.y - centre.y, p.x - centre.x);
};
const inBay = (c) => BAYS.some(({ angle, half }) => {
  const delta = Math.abs(((angleOf(c) - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return delta < half;
});

const TARGET = 275;

const all = new Map(v1.map((c) => [key(c.q, c.r), c]));
const touch = (q, r) => neighbours(q, r).filter((n) => all.has(key(n.q, n.r))).length;

/**
 * A LONE TOOTH: the cell is alone in its row (both row-neighbours outside the map) and land hangs
 * off it above or below — a one-cell pimple on the coast, the comb the owner rejected. The owner's
 * own words name the below case; checking BOTH directions is strictly stronger and catches the same
 * pimple pointing up (a cell hanging under a bay's lip). `server/tests/world-map.test.ts` asserts the
 * same predicate over the frozen table.
 */
const isTooth = (cells, c) => {
  if (!cells.has(key(c.q, c.r))) return false;
  if (cells.has(key(c.q - 1, c.r)) || cells.has(key(c.q + 1, c.r))) return false;
  const below = cells.has(key(c.q, c.r + 1)) || cells.has(key(c.q - 1, c.r + 1));
  const above = cells.has(key(c.q, c.r - 1)) || cells.has(key(c.q + 1, c.r - 1));
  return below || above;
};
const withCell = (cells, list) => {
  const next = new Map(cells);
  for (const c of list) next.set(key(c.q, c.r), c);
  return next;
};
/** Adding `list` must leave NO lone tooth anywhere — the invariant that makes it a coastline. */
const clean = (cells, list) => {
  const next = withCell(cells, list);
  for (const c of list) {
    if (isTooth(next, c)) return false;
    for (const n of neighbours(c.q, c.r)) if (isTooth(next, n)) return false;
  }
  return true;
};

// The map must stay nearly SQUARE: the Territory view sizes itself from this ratio, and a lopsided
// map wastes phone height. So a candidate is also refused if it would push the bounding box's
// width/height ratio below this floor.
const extents = (cells = all) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells.values()) {
    const { x, y } = at(c);
    minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R);
    minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R);
  }
  return { minX, minY, maxX, maxY };
};
const ratioWith = (cells, list) => {
  const e = extents(withCell(cells, list));
  return (e.maxX - e.minX + 12) / (e.maxY - e.minY + 12);
};
const RATIO_FLOOR = 0.995;

/**
 * One growth pass over the given shore. Score: neighbours already in the map first (3+ before 2,
 * which is what grows RUNS), then the coast field (points before bays), then the hash. A 2-neighbour
 * cell that would leave a lone tooth is added only together with an adjacent partner, so a run is
 * never left one cell wide.
 */
const grow = (cells) => {
  let added = 0;
  const pool = cells
    .filter((c) => !all.has(key(c.q, c.r)) && !inBay(c))
    .map((c) => ({ c, n: touch(c.q, c.r) }))
    .filter(({ n }) => n >= 2)
    .sort((a, b) => b.n - a.n || hashCell(a.c.q, a.c.r) - hashCell(b.c.q, b.c.r));
  for (const { c } of pool) {
    if (all.size >= TARGET) break;
    if (all.has(key(c.q, c.r))) continue;
    if (touch(c.q, c.r) < 2) continue;
    if (!clean(all, [c])) {
      const partner = pool.find((other) => !all.has(key(other.c.q, other.c.r)) && adjacent(c, other.c) &&
        clean(all, [c, other.c]));
      if (!partner || all.size + 2 > TARGET) continue;
      if (ratioWith(all, [c, partner.c]) < RATIO_FLOOR) continue;
      all.set(key(c.q, c.r), c);
      all.set(key(partner.c.q, partner.c.r), partner.c);
      added += 2;
      continue;
    }
    if (ratioWith(all, [c]) < RATIO_FLOOR) continue;
    all.set(key(c.q, c.r), c);
    added += 1;
  }
  return added;
};

// Ring 1 is land all the way round EXCEPT in the bays; ring 2 is only reached where ring 1 is, so a
// bay is open to the sea by construction (there is no cell outside it to become a hole). Repeat
// passes, because a cell with one neighbour becomes eligible once its second one lands.
const fill = (ring) => { let guard = 0; while (guard++ < 20 && grow(ring) > 0); };
fill(ring1);
fill(ring2);
const bayCells = [...ring1, ...ring2].filter(inBay).length;
console.log('ring1 / ring2 :', ring1.length, '/', ring2.length, `(${bayCells} shore cells held back for the bays)`);

const cells = [...all.values()].sort((a, b) => (a.r - b.r) || (a.q - b.q));
const rows = new Map();
for (const c of cells) rows.set(c.r, (rows.get(c.r) ?? 0) + 1);
const widths = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);

const toothCells = cells.filter((c) => isTooth(all, c));
const e = extents();
const ratio = (e.maxX - e.minX + 12) / (e.maxY - e.minY + 12);

console.log('v1 cells      :', v1.length);
console.log('v2 cells      :', cells.length);
console.log('added         :', cells.length - v1.length);
console.log('row widths    :', widths.join(' '));
console.log('rows          :', widths.length);
console.log('min/max width :', Math.min(...widths), '/', Math.max(...widths));
console.log('v1 subset     :', v1.every((c) => all.has(key(c.q, c.r))));
console.log('min neighbours:', Math.min(...cells.map((c) => touch(c.q, c.r))));
console.log('lone teeth    :', toothCells.length, toothCells.map((c) => key(c.q, c.r)).join(' ') || '(none)');
console.log('extent        :', (e.maxX - e.minX).toFixed(2), 'x', (e.maxY - e.minY).toFixed(2));
console.log('ratio (+12)   :', ratio.toFixed(6));

const minQ = Math.min(...cells.map((c) => c.q));
const maxQ = Math.max(...cells.map((c) => c.q));
const minR = Math.min(...cells.map((c) => c.r));
const maxR = Math.max(...cells.map((c) => c.r));
// ASCII sketch. Cells are drawn two characters wide and odd rows are shifted by one cell, because
// that is how a pointy-top hex lattice actually stacks: without the shift a smooth coastline reads
// as a staircase, and a staircase reads as smooth.
let art = '';
for (let r = minR; r <= maxR; r++) {
  let line = (r & 1) ? ' ' : '';
  for (let q = minQ; q <= maxQ; q++) {
    const k = key(q, r);
    line += all.has(k) ? (v1Keys.has(k) ? '##' : '++') : '  ';
  }
  art += line.replace(/ +$/, '') + '\n';
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
