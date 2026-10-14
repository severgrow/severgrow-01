// FUTASAKU 0.5 — the header lane: ONE row, never a frame, never over the board.
//
//   npx tsx web/e2e/online-header-lane.ts
//
// Owner's cleanup (2026-10-14). Opens a real duel and proves, at every phone size the owner plays:
//   - the lane is a single row whose height never changes, even with a very long message;
//   - the lane's box never intersects the board's tiles, and the board's rectangle is IDENTICAL
//     with and without a message (the board may not shrink or move at all);
//   - the header text has no border, outline, shadow or fill of any kind;
//   - the ticker runs when the words overflow and is stopped when they fit;
//   - the two small circles (the live chip's lamp and the clock's dot) are gone, and the "Real
//     time" pill is text, not a chip.
import { mkdirSync } from 'node:fs';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, openDuel, openSeat, readOnline, sleep, startLocalDuel, touchTap } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4236);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** A message far wider than any phone lane, to force the ticker. */
const LONG = 'Opponent reconnecting and waiting for the server to answer with a very long status message';

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;

type Box = { x: number; y: number; width: number; height: number };
type Frame = { border: string; outline: string; shadow: string; background: string; bgImage: string };
type Snap = {
  board: Box | null;
  tiles: Box | null;
  hud: Box | null;
  lane: Box | null;
  msgScroll: number;
  msgClient: number;
  laneScroll: number;
  laneClient: number;
  scroll: string | undefined;
  anims: number;
};

const PROBE = (long: string) => `(() => {
  const q = (sel) => document.querySelector(sel);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const union = (els) => {
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return { x: Math.min(...rs.map((r) => r.left)), y: Math.min(...rs.map((r) => r.top)),
      width: Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left)),
      height: Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top)) };
  };
  const frame = (el) => { const s = getComputedStyle(el);
    return { border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join(' '),
      outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow,
      background: s.backgroundColor, bgImage: s.backgroundImage }; };
  const hud = document.getElementById('duel-hud');
  const lane = q('#duel-hud [data-duel-lane]');
  const msg = q('#duel-hud [data-duel-turn]');
  const track = q('#duel-hud [data-duel-track]');
  const board = document.getElementById('board-wrap');
  const tileEls = [...document.querySelectorAll('.l-tiles .tile[data-key]')];
  const snap = () => ({ board: rect(board), tiles: union(tileEls), hud: rect(hud), lane: rect(lane),
    msgScroll: msg.scrollHeight, msgClient: msg.clientHeight, laneScroll: lane.scrollHeight, laneClient: lane.clientHeight,
    scroll: msg.dataset.scroll, anims: track.getAnimations().length });
  const before = snap();
  window.__futasakuHeader.set(${JSON.stringify(long)});
  const after = snap();
  const overlap = (a, b) => { if (!a || !b) return 0; const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y); return w > 0.5 && h > 0.5 ? w * h : 0; };
  const pill = q('#duel-hud .live-pill');
  const chip = q('#duel-hud .live-chip');
  const dot = q('#duel-hud .live-clock-dot');
  return { before, after,
    hudTilesOverlap: overlap(after.hud, after.tiles), laneTilesOverlap: overlap(after.lane, after.tiles),
    msgFrame: frame(msg), trackFrame: frame(track), hudFrame: frame(hud), laneFrame: frame(lane),
    chipDisplay: chip ? getComputedStyle(chip).display : 'none-found',
    dotDisplay: dot ? getComputedStyle(dot).display : 'none-found',
    pillFrame: pill ? frame(pill) : null,
  };
})()`;

type Probe = {
  before: Snap;
  after: Snap;
  hudTilesOverlap: number;
  laneTilesOverlap: number;
  msgFrame: Frame;
  trackFrame: Frame;
  hudFrame: Frame;
  laneFrame: Frame;
  chipDisplay: string;
  dotDisplay: string;
  pillFrame: Frame | null;
};

const isFrameless = (f: Frame): boolean =>
  f.border.trim() === '0px 0px 0px 0px' &&
  f.outline.startsWith('none') && // outline-style none: no outline is drawn, whatever its width
  (f.shadow === 'none' || f.shadow === '') &&
  (f.background === 'rgba(0, 0, 0, 0)' || f.background === 'transparent') &&
  f.bgImage === 'none';

/** The waiting pill, as the narrow-phone proof needs it: the WORDS, the controls and the lane. */
type WaitSnap = {
  state: string | null;
  board: Box | null;
  lane: Box | null;
  laneH: number | null;
  rows: boolean | null;
  word: string | null;
  wordRendered: number;
  wordNatural: number;
  labelClipped: boolean | null;
  cancelVisible: boolean;
  dotsVisible: boolean;
  overlap: number;
};

/** Snapshot the waiting pill (before and after forcing a long lane message). */
const WAIT_PROBE = (long: string) => `(() => {
  const q = (s) => document.querySelector(s);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
  const hud = document.getElementById('duel-hud');
  const lane = q('#duel-hud [data-duel-lane]');
  const msg = q('#duel-hud [data-duel-turn]');
  const board = document.getElementById('board-wrap');
  const pill = q('#duel-hud .live-pill');
  const label = q('#duel-hud .live-pill .label');
  const spans = ['.full', '.short', '.tiny'].map((c) => q('#duel-hud .live-pill .label ' + c));
  const vis = spans.find((s) => s && getComputedStyle(s).display !== 'none') || null;
  const wordW = (() => { if (!vis) return 0; const range = document.createRange(); range.selectNodeContents(vis); return range.getBoundingClientRect().width; })();
  const cancel = q('#duel-hud .live-pill .cancel');
  const dots = q('#duel-hud .live-pill .futasaku-wait-dots');
  const tiles = [...document.querySelectorAll('.l-tiles .tile[data-key]')].map((e) => e.getBoundingClientRect());
  const union = () => { if (!tiles.length) return null;
    return { x: Math.min(...tiles.map((r) => r.left)), y: Math.min(...tiles.map((r) => r.top)),
      width: Math.max(...tiles.map((r) => r.right)) - Math.min(...tiles.map((r) => r.left)),
      height: Math.max(...tiles.map((r) => r.bottom)) - Math.min(...tiles.map((r) => r.top)) }; };
  const overlap = (a, b) => { if (!a || !b) return 0;
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0.5 && h > 0.5 ? w * h : 0; };
  const snap = () => ({
    state: pill ? pill.dataset.state : null,
    board: rect(board), lane: rect(lane),
    laneH: lane ? Math.round(lane.getBoundingClientRect().height) : null,
    rows: lane ? (lane.scrollHeight === lane.clientHeight && msg.scrollHeight === msg.clientHeight) : null,
    word: vis ? vis.textContent : null,
    wordRendered: vis ? Math.round(vis.getBoundingClientRect().width * 10) / 10 : 0,
    wordNatural: Math.round(wordW * 10) / 10,
    labelClipped: label ? label.scrollWidth > label.clientWidth : null,
    cancelVisible: !!cancel && cancel.offsetWidth > 0 && getComputedStyle(cancel).display !== 'none',
    dotsVisible: !!dots && !dots.hidden && getComputedStyle(dots).display !== 'none',
    overlap: overlap(rect(hud), union()) + overlap(rect(lane), union()),
  });
  const before = snap();
  window.__futasakuHeader.set(${JSON.stringify(long)});
  const after = snap();
  return { before, after };
})()`;

/** The word is fully shown: its rendered box is at least its natural text width, never ellipsised. */
const wordUnclipped = (w: WaitSnap): boolean =>
  w.wordNatural > 0 && w.labelClipped === false && w.wordRendered >= w.wordNatural - 0.5;

const pillState = (s: SeatSession): Promise<string | null> =>
  ev(s, `(() => { const p = document.querySelector('#duel-hud .live-pill'); return p ? p.dataset.state : null; })()`);

/**
 * The Cancel control's REAL hit box, found by walking `elementFromPoint` outward from its centre
 * until the topmost element is no longer the control. The word's own box is only ~55x13 px, so this
 * is the honest measure of what a finger can hit — `offsetWidth` would miss a transparent overlay.
 */
const CANCEL_BOX = `(() => {
  const cancel = document.querySelector('#duel-hud .live-pill .cancel');
  if (!cancel) return null;
  const own = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && (el === cancel || cancel.contains(el)); };
  const r = cancel.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  let left = cx, right = cx, top = cy, bottom = cy;
  for (let i = 1; i <= 40; i++) { if (own(cx - i, cy)) left = cx - i; else break; }
  for (let i = 1; i <= 40; i++) { if (own(cx + i, cy)) right = cx + i; else break; }
  for (let i = 1; i <= 40; i++) { if (own(cx, cy - i)) top = cy - i; else break; }
  for (let i = 1; i <= 40; i++) { if (own(cx, cy + i)) bottom = cy + i; else break; }
  return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, cx, cy,
    word: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
})()`;

type CancelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  word: { left: number; right: number; top: number; bottom: number; width: number; height: number };
};

/** Which control owns a pixel (its class name): proves the tap cannot land on the wrong thing. */
const ownerAt = (s: SeatSession, x: number, y: number): Promise<string | null> =>
  ev(s, `(() => { const el = document.elementFromPoint(${x}, ${y}); return el ? el.className : null; })()`);

/** A point on the pill's OWN body, clear of the Cancel control (the ready-state tap point). */
const PILL_TAP = `(() => {
  const pill = document.querySelector('#duel-hud .live-pill'); if (!pill) return null;
  const r = pill.getBoundingClientRect();
  const x = Math.round(r.left + 10), y = Math.round(r.top + r.height / 2);
  const el = document.elementFromPoint(x, y);
  return { x, y, owner: el ? el.className : null };
})()`;

/** Put the pill back into its waiting state (challenge again if it is currently ready). */
const ensureWaiting = async (duel: LocalDuel, match: LocalMatch, s: SeatSession): Promise<boolean> => {
  for (let i = 0; i < 30; i++) {
    if ((await pillState(s)) === 'waiting') return true;
    await sleep(200);
  }
  await challengeOnly(duel, match);
  for (let i = 0; i < 60; i++) {
    if ((await pillState(s)) === 'waiting') return true;
    await sleep(200);
  }
  return false;
};

/** Wait until the pill has left the waiting state (a cancel landed). */
const waitLeftWaiting = async (s: SeatSession): Promise<boolean> => {
  for (let i = 0; i < 25; i++) {
    if ((await pillState(s)) !== 'waiting') return true;
    await sleep(200);
  }
  return false;
};

/** The live-clock dot only exists while the live module has created it; either way it must be gone. */
const circleGone = (display: string): boolean => display === 'none' || display === 'none-found';

/** Stop the ticker: set a short message and read the lane back. */
const shortProbe = (s: SeatSession): Promise<{ scroll: string | undefined; anims: number }> =>
  ev(s, `(() => { window.__futasakuHeader.set('Your turn'); const m = document.querySelector('#duel-hud [data-duel-turn]'); const t = document.querySelector('#duel-hud [data-duel-track]'); return { scroll: m.dataset.scroll, anims: t.getAnimations().length }; })()`);

/** Put the match into real time: A challenges, B accepts (both pages already in the match). */
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

/** Put the match into the pill's WAITING state: A challenges, and nobody accepts. */
const challengeOnly = async (duel: LocalDuel, match: LocalMatch): Promise<void> => {
  const res = await fetch(`${duel.apiBase}/v1/matches/${match.matchId}/live/challenge`, {
    method: 'POST',
    headers: { authorization: `Bearer ${match.guests[0].token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'live' }),
  });
  if (!res.ok) throw new Error(`challenge failed: ${res.status} ${await res.text()}`);
};

const clockOn = (s: SeatSession): Promise<boolean> =>
  ev(s, `(() => { const el = document.querySelector('#duel-hud [data-duel-urgency][data-live-clock]'); return !!el && !el.hidden && el.getBoundingClientRect().width > 1; })()`);

const shot = (s: SeatSession, name: string): Promise<unknown> =>
  s.page.screenshot({ path: `${OUT}header-lane-${name}.jpg`, type: 'jpeg', quality: 82 });

const setStandalone = async (s: SeatSession, on: boolean): Promise<boolean> => {
  try {
    const client = await s.page.context().newCDPSession(s.page);
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: on ? 'standalone' : 'browser' }] });
    await client.detach();
    return true;
  } catch {
    return false;
  }
};

const SIZES = [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 390, h: 640 }, // a short phone with a browser bar
] as const;

const duel: LocalDuel = await startLocalDuel({ port: PORT, liveConfig: { turnMs: 60_000, challengeTtlMs: 120_000 } });
try {
  const match = await duel.newMatch();
  const phone = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const other = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    await openDuel(phone, match.matchId);
    await openDuel(other, match.matchId);
    await sleep(900);

    // ---- the real turn words, for the shots ------------------------------------------------
    const myTurnSeatIs = (s: SeatSession) => ev<boolean>(s, `(() => (document.querySelector('#duel-hud [data-duel-turn]')?.textContent || '').includes('Your turn'))()`);
    // One seat is on turn, the other is not: capture both real states.
    const acting = (await myTurnSeatIs(phone)) ? phone : other;
    const waiting = acting === phone ? other : phone;
    await shot(acting, 'your-turn-390');
    await shot(waiting, 'their-turn-390');
    check('the acting seat reads "Your turn"', (await myTurnSeatIs(acting)), await ev<string>(acting, `(() => document.querySelector('#duel-hud [data-duel-turn]').textContent)()`));
    check('the other seat reads "Their turn"', !(await myTurnSeatIs(waiting)), await ev<string>(waiting, `(() => document.querySelector('#duel-hud [data-duel-turn]').textContent)()`));

    // ---- the replay word, from a REAL replay -----------------------------------------------
    // Poll the watcher WHILE the actor plays: the replay is short, so watching concurrently is
    // the only reliable way to catch the lane mid-replay.
    let replayHow = 'not reached';
    let caught = false;
    const watch = (async (): Promise<void> => {
      for (let i = 0; i < 300; i++) {
        if ((await readOnline(waiting))?.revealing) {
          await shot(waiting, 'replay-390');
          caught = true;
          return;
        }
        await sleep(50);
      }
    })();
    try {
      await endTurnViaPage(acting);
      await watch;
      if (caught) replayHow = 'real replay';
    } catch {
      /* the replay may be too quick to catch: fall through */
    }
    if (!caught) {
      // The geometry proof is what matters; the word itself is forced so the shot still exists.
      await ev(waiting, `(() => { window.__futasakuHeader.set('Replaying their turn'); return true; })()`);
      await shot(waiting, 'replay-390');
      replayHow = 'forced (replay too quick to catch live)';
    }
    console.log(`    replay screenshot: ${replayHow}`);

    // ---- the layout guarantee at every size ------------------------------------------------
    for (const size of SIZES) {
      await phone.page.setViewportSize({ width: size.w, height: size.h });
      await sleep(700);
      const p = await ev<Probe>(phone, PROBE(LONG));
      const tag = `${size.w}x${size.h}`;
      check(`[${tag}] the lane height is unchanged by a long message`, p.after.lane!.height === p.before.lane!.height, `${p.before.lane?.height} -> ${p.after.lane?.height}`);
      check(`[${tag}] the lane stays one row (msg scrollHeight == clientHeight)`, p.after.msgScroll === p.after.msgClient && p.after.laneScroll === p.after.laneClient, `msg ${p.after.msgScroll}/${p.after.msgClient}, lane ${p.after.laneScroll}/${p.after.laneClient}`);
      check(`[${tag}] the lane never intersects the board's tiles`, p.laneTilesOverlap === 0 && p.hudTilesOverlap === 0, `${Math.round(p.laneTilesOverlap)}px² lane, ${Math.round(p.hudTilesOverlap)}px² hud`);
      check(`[${tag}] the board rectangle is IDENTICAL with and without a message`, JSON.stringify(p.before.board) === JSON.stringify(p.after.board), `${JSON.stringify(p.before.board)} vs ${JSON.stringify(p.after.board)}`);
      check(`[${tag}] the lane is a fixed-height row (<= 46px)`, (p.after.lane?.height ?? 0) <= 46, `${p.after.lane?.height}px`);
      check(`[${tag}] the ticker runs when the words overflow`, p.after.scroll === '1' && p.after.anims > 0, `scroll=${p.after.scroll} anims=${p.after.anims}`);
      check(`[${tag}] the header text has no border, outline, shadow or fill`, isFrameless(p.msgFrame) && isFrameless(p.trackFrame) && isFrameless(p.hudFrame) && isFrameless(p.laneFrame), JSON.stringify({ msg: p.msgFrame, track: p.trackFrame, hud: p.hudFrame }));
      check(`[${tag}] the two small circles are gone`, circleGone(p.chipDisplay) && circleGone(p.dotDisplay), `chip=${p.chipDisplay} dot=${p.dotDisplay}`);
      check(`[${tag}] the Real time pill is text, not a chip`, !p.pillFrame || isFrameless(p.pillFrame), JSON.stringify(p.pillFrame));
      const stopped = await shortProbe(phone);
      check(`[${tag}] the ticker stops when the words fit`, stopped.scroll === '0' && stopped.anims === 0, `scroll=${stopped.scroll} anims=${stopped.anims}`);
      if (size.w === 390) await shot(phone, `long-message-${tag}`);
    }

    // ---- Home Screen app display mode ------------------------------------------------------
    await phone.page.setViewportSize({ width: 390, height: 844 });
    const standalone = await setStandalone(phone, true);
    await sleep(700);
    if (standalone) {
      const p = await ev<Probe>(phone, PROBE(LONG));
      check('[standalone] the lane stays one fixed row and off the board', p.after.msgScroll === p.after.msgClient && p.laneTilesOverlap === 0 && (p.after.lane?.height ?? 0) <= 46, `${p.after.lane?.height}px, ${Math.round(p.laneTilesOverlap)}px²`);
      check('[standalone] the board rectangle is identical with and without a message', JSON.stringify(p.before.board) === JSON.stringify(p.after.board));
      await shot(phone, 'standalone-long-message-390');
      await setStandalone(phone, false);
    } else {
      console.log('    [standalone] CDP display-mode emulation is unavailable here; skipped');
    }

    // ---- the waiting pill is READABLE on the narrowest phone --------------------------------
    // A pending challenge puts the pill into its waiting state. The strip gives the pill only
    // ~115 px at 360 px, and the word shares that with the shared animated ellipsis AND the Cancel
    // control — so the word itself must be one that FITS: never cut mid-word, never dropped, and
    // never at the cost of the lane's whole contract (one fixed row, off the board, board identical).
    await challengeOnly(duel, match);
    let pillWaited = false;
    for (let i = 0; i < 80; i++) {
      if ((await pillState(phone)) === 'waiting') {
        pillWaited = true;
        break;
      }
      await sleep(200);
    }
    check('[waiting] a pending challenge puts the pill into its waiting state', pillWaited);

    for (const size of [{ w: 360, h: 640 }, { w: 390, h: 844 }] as const) {
      await phone.page.setViewportSize({ width: size.w, height: size.h });
      await sleep(700);
      const p = await ev<{ before: WaitSnap; after: WaitSnap }>(phone, WAIT_PROBE(LONG));
      const tag = `waiting ${size.w}px`;
      check(`[${tag}] the pill shows its waiting state`, p.before.state === 'waiting', String(p.before.state));
      check(`[${tag}] the state word is NOT clipped`, wordUnclipped(p.before), `"${p.before.word}" rendered ${p.before.wordRendered}px of ${p.before.wordNatural}px`);
      check(`[${tag}] the animated dots and the Cancel control are both still present`, p.before.dotsVisible && p.before.cancelVisible, `dots=${p.before.dotsVisible} cancel=${p.before.cancelVisible}`);
      check(`[${tag}] the lane stays ONE fixed-height row`, p.before.rows === true && p.before.laneH === p.after.laneH && (p.after.lane?.height ?? 0) <= 46, `${p.before.laneH}px -> ${p.after.laneH}px`);
      check(`[${tag}] neither the lane nor the strip reaches the board's tiles`, p.before.overlap === 0 && p.after.overlap === 0, `${Math.round(p.before.overlap)}px² / ${Math.round(p.after.overlap)}px²`);
      check(`[${tag}] the board rectangle is IDENTICAL with and without a long message`, JSON.stringify(p.before.board) === JSON.stringify(p.after.board), JSON.stringify(p.before.board));
    }

    // ---- Cancel is a REAL 44x44 target, not just the word -----------------------------------
    // The earlier defect here was invisible to screenshots: the pill's own 44px tap extender sat
    // above the Cancel WORD, so a tap on the word did nothing. The stacking step fixed the word;
    // this proves the control is a real target (its hit box is measured, not its glyphs) and that
    // its extra area genuinely works — by tapping the EDGES of the box with a real finger.
    for (const size of [{ w: 360, h: 640 }, { w: 390, h: 844 }] as const) {
      await phone.page.setViewportSize({ width: size.w, height: size.h });
      await sleep(700);
      await ensureWaiting(duel, match, phone);
      const tag = `cancel ${size.w}px`;
      const box = await ev<CancelBox | null>(phone, CANCEL_BOX);
      check(`[${tag}] the Cancel hit box is at least 44x44 CSS px`, !!box && box.width >= 44 && box.height >= 44, box ? `${box.width}x${box.height}` : 'no box');
      // The box must cover the word (the word may not stick out of its own target). The walk is
      // integer-precise, so a 1px tolerance is the honest bound: it is the pixel row/column where
      // the point stops landing on the control.
      check(
        `[${tag}] the hit box contains the whole word`,
        !!box && box.left <= box.word.left + 1 && box.right >= box.word.right - 1,
        box ? `box ${box.left}..${box.right} vs word ${box.word.left.toFixed(1)}..${box.word.right.toFixed(1)}` : '',
      );
      // The lane's whole contract still holds with this bigger target on screen.
      const lane = await ev<{ before: WaitSnap; after: WaitSnap }>(phone, WAIT_PROBE(LONG));
      check(`[${tag}] the lane stays ONE fixed-height row`, lane.before.rows === true && lane.before.laneH === lane.after.laneH && (lane.after.lane?.height ?? 0) <= 46, `${lane.before.laneH}px -> ${lane.after.laneH}px`);
      check(`[${tag}] nothing reaches the board and the board rectangle is identical`, lane.before.overlap === 0 && lane.after.overlap === 0 && JSON.stringify(lane.before.board) === JSON.stringify(lane.after.board), `${Math.round(lane.before.overlap)}px² / ${JSON.stringify(lane.before.board)}`);
      const boardWhileWaiting = JSON.stringify(lane.before.board);
      await shot(phone, `waiting-${size.w}`);

      // A real FINGER a few px inside each EDGE of the box must cancel: the extra area is real.
      const midX = Math.round((box!.left + box!.right) / 2);
      const midY = Math.round((box!.top + box!.bottom) / 2);
      const edges = [
        { name: 'top', x: midX, y: box!.top + 2 },
        { name: 'bottom', x: midX, y: box!.bottom - 2 },
        { name: 'left', x: box!.left + 2, y: midY },
        { name: 'right', x: box!.right - 2, y: midY },
      ];
      for (const e of edges) {
        const waitingNow = await ensureWaiting(duel, match, phone);
        const owner = await ownerAt(phone, e.x, e.y);
        await touchTap(phone, { x: e.x, y: e.y });
        const left = await waitLeftWaiting(phone);
        check(`[${tag}] a finger on the ${e.name} edge of the box cancels`, waitingNow && left, `(${e.x},${e.y}) owner=${owner}`);
      }
      const boardAfterTaps = await ev<string>(phone, `(() => { const r = document.getElementById('board-wrap').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }); })()`);
      check(`[${tag}] the board rectangle survives the whole cancel experience`, boardAfterTaps === boardWhileWaiting, `${boardAfterTaps} vs ${boardWhileWaiting}`);
    }

    // ---- the pill's OWN tap target still works (the two must not steal each other's taps) ----
    await phone.page.setViewportSize({ width: 390, height: 844 });
    await sleep(600);
    const centreBox = await ev<CancelBox | null>(phone, CANCEL_BOX);
    if (centreBox) await touchTap(phone, { x: centreBox.cx, y: centreBox.cy });
    const backToReady = await waitLeftWaiting(phone);
    check('[pill] a tap on the word returns the pill to its ready state', backToReady && (await pillState(phone)) === 'ready', String(await pillState(phone)));
    const pillTap = await ev<{ x: number; y: number; owner: string | null } | null>(phone, PILL_TAP);
    check('[pill] the pill body owns its own tap point (not the Cancel control)', !!pillTap && !/cancel/i.test(pillTap.owner ?? ''), JSON.stringify(pillTap));
    if (pillTap) await touchTap(phone, { x: pillTap.x, y: pillTap.y });
    let challengeStarted = false;
    for (let i = 0; i < 30; i++) {
      if ((await pillState(phone)) === 'waiting') {
        challengeStarted = true;
        break;
      }
      await sleep(200);
    }
    check('[pill] tapping the pill body starts a challenge again', challengeStarted);
    // Leave no pending challenge behind for the real-time section.
    if (challengeStarted) {
      const box2 = await ev<CancelBox | null>(phone, CANCEL_BOX);
      if (box2) await touchTap(phone, { x: box2.cx, y: box2.cy });
      await waitLeftWaiting(phone);
    }

    // ---- real time: the plain counter owns the lane -----------------------------------------
    await goLive(duel, match);
    const liveOk = await (async (): Promise<boolean> => {
      for (let i = 0; i < 100; i++) {
        if (await clockOn(phone)) return true;
        await sleep(200);
      }
      return false;
    })();
    check('[real time] the plain m:ss counter appears in the lane', liveOk);
    const counter = await ev<{ text: string; frame: Frame }>(phone, `(() => { const el = document.querySelector('#duel-hud [data-duel-urgency][data-live-clock]'); const s = getComputedStyle(el); return { text: (el.textContent || '').trim(), frame: { border: [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth].join(' '), outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow, background: s.backgroundColor, bgImage: s.backgroundImage } }; })()`);
    check('[real time] the counter is ONE number (m:ss), no "60s"', /^\d+:\d{2}$/.test(counter.text), counter.text);
    check('[real time] the counter has no frame either', isFrameless(counter.frame), JSON.stringify(counter.frame));
    const liveParts = await ev<{ chip: string; dot: string; pill: Frame | null }>(phone, `(() => {
      const frame = (el) => { const s = getComputedStyle(el); return { border: [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth].join(' '), outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow, background: s.backgroundColor, bgImage: s.backgroundImage }; };
      const chip = document.querySelector('#duel-hud .live-chip');
      const dot = document.querySelector('#duel-hud .live-clock-dot');
      const pill = document.querySelector('#duel-hud .live-pill');
      return { chip: chip ? getComputedStyle(chip).display : 'none-found', dot: dot ? getComputedStyle(dot).display : 'none-found', pill: pill ? frame(pill) : null };
    })()`);
    check('[real time] the two circles stay gone in real time', circleGone(liveParts.chip) && circleGone(liveParts.dot), `chip=${liveParts.chip} dot=${liveParts.dot}`);
    check('[real time] the pill stays frameless', !liveParts.pill || isFrameless(liveParts.pill), JSON.stringify(liveParts.pill));
    await shot(phone, 'real-time-counter-390');
    // A long message with the counter present: the ticker scrolls it, still one row, still off the board.
    const live = await ev<Probe>(phone, PROBE(LONG));
    check('[real time] a long message still tickers on one row', live.after.scroll === '1' && live.after.anims > 0 && live.after.msgScroll === live.after.msgClient, `scroll=${live.after.scroll} anims=${live.after.anims}`);
    check('[real time] a long message never reaches the board', live.laneTilesOverlap === 0 && JSON.stringify(live.before.board) === JSON.stringify(live.after.board), `${Math.round(live.laneTilesOverlap)}px²`);
    await shot(phone, 'real-time-long-message-390');
  } finally {
    await phone.context.close();
    await other.context.close();
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} header-lane checks failed`);
  process.exit(1);
}
console.log('\nThe header lane is one row, has no frame, and never touches the board.');
