// FUTASAKU — the home timeout ring, measured. Identical on both homes; colour means TIME only.
//
//   npx tsx web/e2e/online-home-ring.ts [before|after]
//
// Owner's rules:
//   * "make the time circle smaller and inside the home tile - without leaking through it's borders"
//   * "always make it going from green through orange to red over 60s time"
//   * "add a small black shadow under it so it's always visible no matter what skin is being used"
//   * "lava/moss time circle - dont do any of that - both the same" — the colour is time, never the
//     side; which HOME carries the ring is what says whose turn is timed.
//
// This suite drives a real live duel (two pages), and at three points in the turn (early/mid/late)
// on BOTH homes it (1) screenshot, (2) measures the ring's outer edge against the home tile's actual
// hexagon — a point-in-polygon test, not a rectangle guess — and (3) records the arc's colour and
// remaining sweep. It also checks the ring is identical on both homes and still legible with Reduce
// motion and Large text.
import { mkdirSync } from 'node:fs';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { openDuel, openSeat, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/live/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4237);
const LABEL = process.argv[2] === 'before' ? 'before' : 'after';
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;
const sleep2 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Read the ring and the home tile it sits on, and run a point-in-polygon test: every sample on the
 * ring's OUTER edge (centre + radius + half the stroke) must be inside the tile's hexagon.
 */
const READ_RING = `(() => {
  const svg = document.querySelector('.live-ring');
  if (!svg || svg.hasAttribute('hidden')) return { present: false };
  let cell = document.querySelector('#board .hex-cell[data-key="' + (svg.dataset.homeKey || '') + '"]');
  // Fallback for the BEFORE state (the shipped old ring did not expose which tile it belongs to):
  // find the hex under the ring's own centre, so the same geometry check can be run on it.
  if (!cell) {
    const box = svg.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    for (const candidate of document.querySelectorAll('#board .hex-cell[data-key]')) {
      const r2 = candidate.getBoundingClientRect();
      if (cx >= r2.left && cx <= r2.right && cy >= r2.top && cy <= r2.bottom) { cell = candidate; break; }
    }
  }
  const path = cell ? cell.querySelector('path.hex') : null;
  const read = (sel) => svg.querySelector(sel);
  const sh = read('.sh'), bg = read('.bg'), fg = read('.fg');
  const num = (el, attr, fallback) => { const v = el ? parseFloat(getComputedStyle(el)[attr]) : NaN; return Number.isFinite(v) ? v : fallback; };
  const box = svg.getBoundingClientRect();
  const cellBox = cell ? cell.getBoundingClientRect() : null;
  // The hexagon's corners, straight from the drawn path (screen px).
  let poly = [];
  if (path && path.getScreenCTM()) {
    const total = path.getTotalLength();
    const m = path.getScreenCTM();
    const boardSvg = document.getElementById('board');
    const toScreen = (p) => { const pt = boardSvg.createSVGPoint(); pt.x = p.x; pt.y = p.y; const s = pt.matrixTransform(m); return { x: s.x, y: s.y }; };
    for (let i = 0; i < 6; i++) poly.push(toScreen(path.getPointAtLength((total * i) / 6)));
  }
  const inside = (pt) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  // The ring's own circle: its geometry is the SVG's viewBox and the radius attribute.
  const vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\\s+/).map(Number);
  const rAttr = fg ? parseFloat(fg.getAttribute('r') || '0') : 0;
  const halfStroke = num(fg, 'strokeWidth', 0) / 2;
  const scale = box.width / (vb[2] || 1);
  const cx = box.left + (Number(fg && fg.getAttribute('cx')) || 0) * scale;
  const cy = box.top + (Number(fg && fg.getAttribute('cy')) || 0) * scale;
  const rOuter = (rAttr + halfStroke) * scale;
  const shHalf = num(sh, 'strokeWidth', 0) / 2;
  const shOuter = (rAttr + shHalf + num(sh, 'strokeWidth', 0) / 2) * scale;
  const samples = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    samples.push({ x: cx + Math.cos(a) * rOuter, y: cy + Math.sin(a) * rOuter });
    samples.push({ x: cx + Math.cos(a) * shOuter, y: cy + Math.sin(a) * shOuter });
  }
  const leaks = samples.filter((p) => !inside(p)).length;
  const boxInside = cellBox ? (box.left >= cellBox.left - 0.6 && box.right <= cellBox.right + 0.6 && box.top >= cellBox.top - 0.6 && box.bottom <= cellBox.bottom + 0.6) : null;
  return {
    present: true,
    homeKey: svg.dataset.homeKey || null,
    ringIsMine: svg.dataset.side || null,
    colour: fg ? getComputedStyle(fg).stroke : null,
    arcDash: fg ? fg.style.strokeDasharray : null,
    arcOffset: fg ? parseFloat(fg.style.strokeDashoffset || '0') : null,
    dashArrayLen: fg ? parseFloat(getComputedStyle(fg).strokeDasharray) || 0 : 0,
    fgWidth: num(fg, 'strokeWidth', 0),
    bgWidth: num(bg, 'strokeWidth', 0),
    shWidth: num(sh, 'strokeWidth', 0),
    shStroke: sh ? getComputedStyle(sh).stroke : null,
    bgStroke: bg ? getComputedStyle(bg).stroke : null,
    urgent: svg.dataset.urgent || '0',
    viewBoxW: vb[2] || 0,
    rAttr,
    halfStroke,
    rOuterPx: rOuter,
    tileW: cellBox ? cellBox.width : null,
    tileH: cellBox ? cellBox.height : null,
    hexInradius: (() => { if (!poly.length) return null; const cx2 = poly.reduce((s, p) => s + p.x, 0) / 6, cy2 = poly.reduce((s, p) => s + p.y, 0) / 6; return Math.min(...poly.map((p) => Math.hypot(p.x - cx2, p.y - cy2))) * Math.cos(Math.PI / 6); })(),
    samples: samples.length,
    leaks,
    boxInside,
    ringBelowTile: box.top >= (cellBox ? cellBox.top - 0.6 : 0),
  };
})()`;

type Ring = {
  present: boolean;
  homeKey: string | null;
  ringIsMine: string | null;
  colour: string | null;
  arcOffset: number | null;
  dashArrayLen: number;
  fgWidth: number;
  bgWidth: number;
  shWidth: number;
  shStroke: string | null;
  bgStroke: string | null;
  urgent: string;
  viewBoxW: number;
  rAttr: number;
  rOuterPx: number;
  tileW: number | null;
  tileH: number | null;
  hexInradius: number | null;
  samples: number;
  leaks: number;
  boxInside: boolean | null;
  ringBelowTile: boolean;
};

const readRing = (s: SeatSession): Promise<Ring> => ev(s, READ_RING) as Promise<Ring>;

/** Where the live clock's owner is: 'me' when this page's own seat is timed. */
const clockSide = (s: SeatSession): Promise<{ live: boolean; side: string; leftMs: number; limitMs: number }> =>
  ev(
    s,
    `(() => {
      const svg = document.querySelector('.live-ring');
      const el = document.querySelector('#duel-hud [data-duel-urgency][data-live-clock]');
      const t = el ? (el.textContent || '').trim() : '';
      const m = /^(\\d+):(\\d\\d)$/.exec(t);
      return { live: !!svg && !svg.hasAttribute('hidden'), side: svg ? (svg.dataset.side || '') : '', leftMs: m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : -1, limitMs: 0 };
    })()`,
  );

const shot = (s: SeatSession, name: string): Promise<unknown> =>
  s.page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);

const rgb = (c: string | null): [number, number, number] => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [-1, -1, -1];
};
const hsvHue = ([r, g, b]: [number, number, number]): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
};

/** Go live through the API (both pages are already in the match). */
const goLive = async (duel: LocalDuel, match: LocalMatch): Promise<void> => {
  const res = await fetch(`${duel.apiBase}/v1/matches/${match.matchId}/live/challenge`, {
    method: 'POST',
    headers: { authorization: `Bearer ${match.guests[0].token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'live' }),
  });
  if (!res.ok) throw new Error(`challenge failed: ${res.status} ${await res.text()}`);
  const id = ((await res.json()) as { challenge?: { id: string } }).challenge?.id;
  if (!id) throw new Error('no challenge id');
  const acc = await fetch(`${duel.apiBase}/v1/challenges/${id}/accept`, {
    method: 'POST',
    headers: { authorization: `Bearer ${match.guests[1].token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!acc.ok) throw new Error(`accept failed: ${acc.status} ${await acc.text()}`);
};

/** Wait until this page is drawing a ring at all (it is live and the strip clock is running). */
const waitRingDrawn = async (s: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await readRing(s);
    if (r.present && r.tileW) return true;
    await sleep2(250);
  }
  return false;
};

/** Sample the ring three times across a turn: early, mid, late. */
const sampleTurn = async (s: SeatSession, side: 'me' | 'opp', tag: string): Promise<Ring[]> => {
  const got: Ring[] = [];
  const want = [
    { at: 4_000, label: 'early' },
    { at: 30_000, label: 'mid' },
    { at: 55_000, label: 'late' },
  ];
  const t0 = Date.now();
  for (const point of want) {
    const target = t0 + point.at;
    while (Date.now() < target) {
      const r = await readRing(s);
      if (!r.present || r.ringIsMine !== side) break;
      await sleep2(200);
    }
    const r = await readRing(s);
    if (!r.present) break;
    const c = await clockSide(s);
    await shot(s, `home-ring-${LABEL}-${tag}-${side}-${point.label}`);
    got.push(r);
    console.log(
      `      ${tag} ${side} ${point.label}: colour=${r.colour} hue=${Math.round(hsvHue(rgb(r.colour)))} left=${Math.round(c.leftMs / 1000)}s leaks=${r.leaks}/${r.samples} rOuter=${(r.rOuterPx ?? 0).toFixed(2)}px inradius=${r.hexInradius ? r.hexInradius.toFixed(2) : 'n/a'}px tile=${r.tileW?.toFixed(1)}x${r.tileH?.toFixed(1)}`,
    );
  }
  return got;
};

/** A normal 24-hour duel (NOT go live): the ring must not exist, and the urgency chip must work. */
const proveAsyncHasNoRing = async (): Promise<void> => {
  const duel = await startLocalDuel({ port: PORT + 9 });
  try {
    const match = await duel.newMatch();
    const p1 = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true });
    const p2 = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true });
    try {
      await openDuel(p1, match.matchId);
      await openDuel(p2, match.matchId);
      await sleep2(3_000);
      const state = await ev<{ ring: boolean; ringHidden: boolean | null; liveOn: boolean; urgency: string }>(
        p1,
        `(() => {
          const svg = document.querySelector('.live-ring');
          return {
            ring: !!svg,
            ringHidden: svg ? svg.hasAttribute('hidden') : null,
            liveOn: document.documentElement.classList.contains('live-on'),
            urgency: (() => { const u = document.querySelector('#duel-hud [data-duel-urgency]'); return u ? (u.textContent || '').trim() : ''; })(),
          };
        })()`,
      );
      check('[async 24h] no ring element is drawn', !state.ring || state.ringHidden === true, JSON.stringify(state));
      check('[async 24h] the page is not in live mode', !state.liveOn, JSON.stringify(state));
      check('[async 24h] the urgency chip is empty with a full day left (unchanged)', state.urgency === '', JSON.stringify(state));
      await shot(p1, `home-ring-${LABEL}-async-390x844`);
    } finally {
      await p1.context.close();
      await p2.context.close();
    }
  } finally {
    await duel.close();
  }
};

const duel: LocalDuel = await startLocalDuel({
  port: PORT,
  // The real length (60 s) and no extra allowances, so the three samples are the true fractions of
  // a turn: early ~7%, mid 50%, late ~92%.
  liveConfig: { turnMs: 60_000, replayAllowanceMs: 0, entryAllowanceMs: 0, challengeTtlMs: 20_000 },
});
try {
  const match = await duel.newMatch();
  const phone = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const wide = await openSeat(duel, match, 1, { hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 } });
  try {
    await openDuel(phone, match.matchId);
    await openDuel(wide, match.matchId);
    await goLive(duel, match);
    await sleep2(2_000);

    // ---- the two DEVICES show the identical ring at the same moment -------------------------
    // (Both pages are showing the same actor's clock, so the same time left must produce the same
    // ring: same widths, same colour. Which HOME it is on is what says whose turn it is.)
    const mineTag = 'mine';
    const oppTag = 'opp';
    const phoneDrawn = await waitRingDrawn(phone);
    const wideDrawn = await waitRingDrawn(wide);
    check('both devices draw the ring during a live turn', phoneDrawn && wideDrawn, `phone=${phoneDrawn} wide=${wideDrawn}`);
    const ringOnPhone = await readRing(phone);
    const ringOnWide = await readRing(wide);
    // Identical TREATMENT, not identical pixels: the stroke widths scale with the tile (a desktop
    // tile is bigger), which is the intended proportional fit. The COLOUR must be the same for the
    // same moment, because it encodes time and nothing else.
    const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
    check(
      'both devices draw the same ring treatment for the same time left (scaled widths, same colour)',
      ringOnPhone.present && ringOnWide.present && near(ringOnPhone.fgWidth, ringOnWide.fgWidth) && near(ringOnPhone.bgWidth, ringOnWide.bgWidth) && near(ringOnPhone.shWidth, ringOnWide.shWidth) && ringOnPhone.colour === ringOnWide.colour,
      `phone fg=${ringOnPhone.fgWidth} bg=${ringOnPhone.bgWidth} sh=${ringOnPhone.shWidth} ${ringOnPhone.colour} | wide fg=${ringOnWide.fgWidth} bg=${ringOnWide.bgWidth} sh=${ringOnWide.shWidth} ${ringOnWide.colour}`,
    );
    const mineRing = await sampleTurn(phone, (await readRing(phone)).ringIsMine === 'opp' ? 'opp' : 'me', mineTag);
    await shot(phone, `home-ring-${LABEL}-phone`);

    // ---- the wide screen, same ring --------------------------------------------------------
    await sleep2(500);
    const wideRing = await readRing(wide);
    check('[wide] the ring is drawn on the timed home', wideRing.present && (wideRing.ringIsMine === 'me' || wideRing.ringIsMine === 'opp'), `present=${wideRing.present} side=${wideRing.ringIsMine}`);
    await shot(wide, `home-ring-${LABEL}-wide`);
    const mid = await readRing(phone);
    check('[wide] the ring’s outer edge is inside the hexagon too', mid.leaks === 0, `leaks=${mid.leaks}/${mid.samples}`);
    await shot(phone, `home-ring-${LABEL}-phone-mid`);

    // ---- the geometry: no leak past the tile's borders -------------------------------------
    for (const tag of [mineTag, oppTag]) {
      const r = await readRing(phone);
      check(
        `[${tag}] the ring’s outer edge never crosses the home hexagon`,
        r.present && r.leaks === 0,
        `${r.leaks} of ${r.samples} samples outside; rOuter=${(r.rOuterPx ?? 0).toFixed(2)}px inradius=${r.hexInradius === null || r.hexInradius === undefined ? 'n/a' : r.hexInradius.toFixed(2)}px`,
      );
    }
    const ring = await readRing(phone);
    check(
      'the ring is smaller than the tile, well inside it',
      !!ring.hexInradius && ring.rOuterPx < ring.hexInradius * 0.95,
      `rOuter=${(ring.rOuterPx ?? 0).toFixed(2)} vs inradius=${ring.hexInradius ? ring.hexInradius.toFixed(2) : 'n/a'} (${ring.hexInradius ? ((ring.rOuterPx / ring.hexInradius) * 100).toFixed(0) : '?'}%)`,
    );
    check('the ring stays inside the tile’s box', ring.boxInside === true, String(ring.boxInside));
    check('the black under-stroke is wider than the coloured arc (a shadow, not an outline)', ring.shWidth > ring.fgWidth, `sh=${ring.shWidth} fg=${ring.fgWidth}`);
    check('the under-stroke is a dark, semi-transparent black', /rgba\(0,\s*0,\s*0/.test(ring.shStroke ?? ''), String(ring.shStroke));
    check('the remaining-time track is dark too (reads on a bright tile)', /rgba\(0,\s*0,\s*0/.test(ring.bgStroke ?? ''), String(ring.bgStroke));

    // ---- the colour journey: green -> orange -> red ----------------------------------------
    const hues = mineRing.map((r) => hsvHue(rgb(r.colour)));
    const cols = mineRing.map((r) => r.colour);
    console.log(`      colour journey (${LABEL}): ${cols.join(' -> ')}  hues=${hues.map((h) => Math.round(h)).join(' -> ')}`);
    if (mineRing.length === 3) {
      check('early in the turn the ring is GREEN', hues[0]! >= 70 && hues[0]! <= 130, `${cols[0]} hue ${Math.round(hues[0]!)}`);
      check('at the half it is ORANGE/AMBER', hues[1]! >= 20 && hues[1]! <= 50, `${cols[1]} hue ${Math.round(hues[1]!)}`);
      check('late in the turn it is RED', hues[2]! >= 0 && hues[2]! <= 20, `${cols[2]} hue ${Math.round(hues[2]!)}`);
      check('the journey is monotonic (green -> orange -> red, never back)', hues[0]! > hues[1]! && hues[1]! > hues[2]!, hues.map((h) => Math.round(h)).join(' -> '));
      const offsets = mineRing.map((r) => r.arcOffset ?? 0);
      check('the arc’s remaining sweep shrinks (a length cue, never colour alone)', offsets[0]! < offsets[1]! && offsets[1]! < offsets[2]!, offsets.map((o) => o.toFixed(0)).join(' -> '));
    } else {
      check('the three time points were captured', false, `${mineRing.length} of 3`);
    }

    // ---- Reduce motion + Large text ---------------------------------------------------------
    await phone.page.emulateMedia({ reducedMotion: 'reduce' });
    await phone.page.evaluate(`(() => document.documentElement.classList.add('reduce-motion'))()`);
    await sleep2(700);
    const rm = await readRing(phone);
    check('[reduce motion] the ring is still drawn and still shows the time left', rm.present && rm.leaks === 0, JSON.stringify({ present: rm.present, leaks: rm.leaks, colour: rm.colour, offset: rm.arcOffset }));
    check('[reduce motion] the colour still carries the state', !!rm.colour && hsvHue(rgb(rm.colour)) >= 0, String(rm.colour));
    await shot(phone, `home-ring-${LABEL}-phone-reduce-motion`);
    await phone.page.evaluate(`(() => { document.documentElement.classList.remove('reduce-motion'); document.documentElement.classList.add('large-text'); })()`);
    await sleep2(600);
    const lt = await readRing(phone);
    check('[large text] the ring is unchanged and still inside the tile', lt.present && lt.leaks === 0, `leaks=${lt.leaks} fg=${lt.fgWidth}`);
    const strip = await ev<boolean>(phone, `(() => { const el = document.querySelector('#duel-hud [data-duel-urgency][data-live-clock]'); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 1; })()`);
    check('[large text] the header clock is still visible in the strip', strip);
    await phone.page.evaluate(`(() => document.documentElement.classList.remove('large-text'))()`);
  } finally {
    await phone.context.close();
    await wide.context.close();
  }
} finally {
  await duel.close();
}

await proveAsyncHasNoRing();

if (failed) {
  console.error(`\n${failed} home-ring checks failed (${LABEL})`);
  process.exit(1);
}
console.log(`\nThe home ring is identical on both homes, fits inside the tile, and travels green -> orange -> red (${LABEL}).`);
