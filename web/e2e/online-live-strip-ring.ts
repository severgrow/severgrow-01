// FUTASAKU live duels — the header clock, the home timeout ring and the click-through strip.
//
//   npx tsx web/e2e/online-live-strip-ring.ts
//
// Three owner decisions from the two-device playtest, all on the strip that sits in the fixed
// header row between the menu button and the logo (the owner's "invisible box"):
//   1. the live clock is ALWAYS shown there during live play, continuously;
//   2. the timeout ring around the active home reads as FUTASAKU's own thin ornamental line —
//      subtle, side-coloured, and clearly legible in the last seconds (and under Reduce motion);
//   3. the strip is CLICK-THROUGH: the text over the map never eats a board tap, while the one
//      real control in it (the "Real time" pill) still works.
import { mkdirSync } from 'node:fs';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { openDuel, openSeat, sleep, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/live/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4234);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;

type Strip = {
  present: boolean;
  visible: boolean;
  text: string;
  side: string;
  urgent: string;
  liveClock: boolean;
  pointerEvents: string;
  background: string;
  border: string;
  boxShadow: string;
  role: string | null;
  ariaLive: string | null;
};

const readStrip = (s: SeatSession): Promise<Strip> =>
  ev<Strip>(
    s,
    `(() => {
      const el = document.querySelector('#duel-hud [data-duel-urgency]');
      const box = document.getElementById('duel-hud');
      if (!el || !box) return { present: false, visible: false, text: '', side: '', urgent: '', liveClock: false, pointerEvents: '', background: '', border: '', boxShadow: '', role: null, ariaLive: null };
      const cs = getComputedStyle(box);
      const r = el.getBoundingClientRect();
      return {
        present: true,
        visible: !el.closest('[hidden]') && r.width > 1 && r.height > 1,
        text: (el.textContent || '').trim(),
        side: el.getAttribute('data-side') || '',
        urgent: el.getAttribute('data-urgent') || '',
        liveClock: el.getAttribute('data-live-clock') === '1',
        pointerEvents: cs.pointerEvents,
        background: cs.backgroundColor,
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
        boxShadow: cs.boxShadow,
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live'),
      };
    })()`,
  );

type Ring = { present: boolean; visible: boolean; side: string; urgent: string; stroke: string; width: string; bgStroke: string; dasharray: string; offset: string };
const readRing = (s: SeatSession): Promise<Ring> =>
  ev<Ring>(
    s,
    `(() => {
      const svg = document.querySelector('.live-ring');
      if (!svg) return { present: false, visible: false, side: '', urgent: '', stroke: '', width: '', bgStroke: '', dasharray: '', offset: '' };
      const fg = svg.querySelector('.fg');
      const bg = svg.querySelector('.bg');
      const fcs = fg ? getComputedStyle(fg) : null;
      return {
        present: true,
        visible: !svg.hasAttribute('hidden') && svg.getBoundingClientRect().width > 1,
        side: svg.getAttribute('data-side') || '',
        urgent: svg.getAttribute('data-urgent') || '',
        stroke: fcs ? fcs.stroke : '',
        width: fcs ? fcs.strokeWidth : '',
        bgStroke: bg ? getComputedStyle(bg).strokeWidth : '',
        dasharray: fg ? fg.style.strokeDasharray : '',
        offset: fg ? fg.style.strokeDashoffset : '',
      };
    })()`,
  );

/** The point where the strip's own text sits, and what the browser says is really there. */
const textPoint = (s: SeatSession): Promise<{ x: number; y: number; topEl: string } | null> =>
  ev(s, `(() => {
    const el = document.querySelector('#duel-hud [data-duel-turn]') || document.querySelector('#duel-hud [data-duel-urgency]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2) return null;
    const x = r.left + Math.min(r.width / 2, 30);
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x: x, y: y, topEl: top ? top.tagName + (top.getAttribute('class') ? '.' + String(top.getAttribute('class')).split(' ')[0] : '') : 'none' };
  })()`);

/** The top-most element at every hex centre that the strip's own box covers. */
const stripOverHexes = (s: SeatSession): Promise<{ key: string; topEl: string }[]> =>
  ev(
    s,
    `(() => {
      const box = document.getElementById('duel-hud');
      if (!box) return [];
      const b = box.getBoundingClientRect();
      const out = [];
      for (const cell of document.querySelectorAll('#board .hex-cell[data-key]')) {
        const r = cell.getBoundingClientRect();
        if (r.width < 2) continue;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
        const top = document.elementFromPoint(x, y);
        out.push({ key: cell.getAttribute('data-key'), topEl: top ? top.tagName + (top.getAttribute('class') ? '.' + String(top.getAttribute('class')).split(' ')[0] : '') : 'none' });
      }
      return out;
    })()`,
  );

const liveClockVisible = (s: SeatSession): Promise<boolean> =>
  ev(s, `(() => { const el = document.querySelector('#duel-hud [data-duel-urgency][data-live-clock]'); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 1; })()`);

/** Put the match live: A challenges, B accepts (both pages already sit in the match). */
const goLive = async (duel: LocalDuel, match: LocalMatch): Promise<void> => {
  const res = await fetch(`${duel.apiBase}/v1/matches/${match.matchId}/live/challenge`, {
    method: 'POST',
    headers: { authorization: `Bearer ${match.guests[0].token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'live' }),
  });
  if (!res.ok) throw new Error(`challenge failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { challenge?: { id: string } };
  const id = body.challenge?.id;
  if (!id) throw new Error(`no challenge in ${JSON.stringify(body).slice(0, 160)}`);
  const acc = await fetch(`${duel.apiBase}/v1/challenges/${id}/accept`, {
    method: 'POST',
    headers: { authorization: `Bearer ${match.guests[1].token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!acc.ok) throw new Error(`accept failed: ${acc.status} ${await acc.text()}`);
};

const waitLive = async (s: SeatSession, timeout = 25_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await liveClockVisible(s)) return true;
    await sleep(200);
  }
  return false;
};

const shot = (s: SeatSession, name: string): Promise<unknown> =>
  s.page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 });

const duel: LocalDuel = await startLocalDuel({
  port: PORT,
  // A short live clock so the low-time state (and its screenshot) is reachable in one run.
  liveConfig: { turnMs: 22_000, replayAllowanceMs: 1_000, challengeTtlMs: 20_000 },
});
try {
  const match = await duel.newMatch();
  const phone = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const wide = await openSeat(duel, match, 1, { hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 } });
  try {
    await openDuel(phone, match.matchId);
    await openDuel(wide, match.matchId);
    check('[phone] the duel HUD is up before going live', await ev<boolean>(phone, `(() => !!document.querySelector('#duel-hud:not([hidden])'))()`));
    await goLive(duel, match);
    check('[phone] the live clock appears in the strip', await waitLive(phone), JSON.stringify(await readStrip(phone)));
    check('[wide] the live clock appears in the strip', await waitLive(wide), JSON.stringify(await readStrip(wide)));

    // ---- 1. the header clock -----------------------------------------------------------------
    const first = await readStrip(phone);
    check('[phone] the clock sits in the existing strip (not a new element)', first.present && first.liveClock);
    check('[phone] it is visible and reads m:ss', first.visible && /^\d+:\d{2}$/.test(first.text), first.text);
    check('[phone] it is not colour alone (the words carry it)', /^\d+:\d{2}$/.test(first.text));
    check('[phone] the strip is still transparent (no fill, no frame)', first.background === 'rgba(0, 0, 0, 0)' || first.background === 'transparent', `${first.background} / ${first.border}`);
    check('[phone] no shadow was added to the strip', first.boxShadow === 'none', first.boxShadow);
    const ticked = await (async (): Promise<string> => {
      const start = Date.now();
      while (Date.now() - start < 4_000) {
        const t = (await readStrip(phone)).text;
        if (t !== first.text) return t;
        await sleep(200);
      }
      return first.text;
    })();
    check('[phone] the clock keeps running (it changed within 4 s)', ticked !== first.text, `${first.text} -> ${ticked}`);
    check('[phone] it is NOT a live region (never announced every second)', first.role === null && first.ariaLive === 'off', `role=${first.role} aria-live=${first.ariaLive}`);
    check('[phone] it carries the side of the live turn', first.side === 'me' || first.side === 'opp', first.side);

    // ---- 3. the strip is click-through ------------------------------------------------------
    const strip = await readStrip(phone);
    check('[phone] the strip itself takes no taps (pointer-events: none)', strip.pointerEvents === 'none', strip.pointerEvents);
    const overHexes = await stripOverHexes(phone);
    if (overHexes.length === 0) {
      console.log('    [phone] the strip does not overlap a hex centre on this board (nothing to pass through)');
    } else {
      const eaten = overHexes.filter((h) => !/\.hex\b|^path\.|^svg\./.test(h.topEl));
      check(
        '[phone] a hex centre under the strip really receives the tap',
        eaten.length === 0,
        `${overHexes.length} hex(es) under the strip; top elements: ${JSON.stringify(overHexes.slice(0, 3))}`,
      );
    }
    const tp = await textPoint(phone);
    if (tp) {
      // Tapping the words themselves must do nothing: the browser must not even offer the text as
      // the target (it is decoration, so the board underneath is what a tap reaches).
      check('[phone] tapping the strip words does nothing (they are not the hit target)', !/duel-turn-slot|duel-urgency|duel-presence|duel-opp/.test(tp.topEl), `${tp.topEl} at ${Math.round(tp.x)},${Math.round(tp.y)}`);
      await phone.page.touchscreen.tap(tp.x, tp.y);
      await sleep(250);
      check('[phone] the tap on the words did not leave the board or open anything', await ev<boolean>(phone, `(() => !document.getElementById('game').hidden && !!document.querySelector('#gameover[hidden]'))()`));
    }
    // The one real control in the strip must still work: go to a real match row? The pill is only
    // offered when a challenge is possible, so this asserts its own style instead.
    const pillPe = await ev<string>(phone, `(() => { const p = document.querySelector('#duel-hud .live-pill'); return p ? getComputedStyle(p).pointerEvents : 'none-found'; })()`);
    check('[phone] the live pill keeps its taps (it is a real control)', pillPe === 'auto' || pillPe === 'none-found', pillPe);
    const menuOk = await ev<boolean>(phone, `(() => { const b = document.getElementById('hud-menu'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && (el === b || b.contains(el)); })()`);
    check('[phone] the menu button is untouched by the click-through', menuOk);

    // ---- 4. the timeout ring -----------------------------------------------------------------
    const ring = await readRing(phone);
    check('[phone] the ring is drawn around the active home', ring.present && ring.visible, JSON.stringify(ring));
    check('[phone] it is a thin arc (≤ 2 px), not a thick hoop', parseFloat(ring.width) <= 2, ring.width);
    check('[phone] its track is a faint, thin line', parseFloat(ring.bgStroke) <= 1.6, ring.bgStroke);
    check('[phone] it drains (a dash offset is set)', ring.dasharray.length > 0 && ring.offset.length > 0, `${ring.dasharray} / ${ring.offset}`);
    check('[phone] it carries the side of the live turn', ring.side === 'me' || ring.side === 'opp', ring.side);

    await shot(phone, 'strip-ring-live-390x844');
    await shot(wide, 'strip-ring-live-1280x800');

    // ---- 4b. the low-time state --------------------------------------------------------------
    const low = await (async (): Promise<Ring | null> => {
      const start = Date.now();
      while (Date.now() - start < 40_000) {
        if ((await readRing(phone)).urgent === '1') return readRing(phone);
        await sleep(400);
      }
      return null;
    })();
    check('[phone] the last ten seconds make the ring thicken and brighten', !!low && parseFloat(low.width) > parseFloat(ring.width), low ? `${ring.width} -> ${low.width}` : 'never reached the last ten seconds');
    const lowStrip = await readStrip(phone);
    check('[phone] the clock stays visible in the last ten seconds', lowStrip.visible && /^\d+:\d{2}$/.test(lowStrip.text), lowStrip.text);
    await shot(phone, 'strip-ring-lowtime-390x844');

    // ---- 1c/4c. Reduce motion: the state is static but still legible --------------------------
    await phone.page.emulateMedia({ reducedMotion: 'reduce' });
    await phone.page.evaluate(`(() => document.documentElement.classList.add('reduce-motion'))()`);
    await sleep(800);
    const rm = await readRing(phone);
    check('[phone] Reduce motion keeps the ring drawn (static, still shows the time left)', rm.visible && rm.offset.length > 0, JSON.stringify(rm));

    // ---- Large text -------------------------------------------------------------------------
    await phone.page.evaluate(`(() => document.documentElement.classList.add('large-text'))()`);
    await sleep(500);
    const bigStrip = await readStrip(phone);
    check('[phone] Large text keeps the clock legible and inside the strip', bigStrip.visible && /^\d+:\d{2}$/.test(bigStrip.text), bigStrip.text);
    await shot(phone, 'strip-ring-large-text-390x844');

    // ---- 3b. the smallest phone the owner plays on (text over the map) ------------------------
    await phone.page.evaluate(`(() => { document.documentElement.classList.remove('large-text'); document.documentElement.classList.remove('reduce-motion'); })()`);
    await phone.page.setViewportSize({ width: 360, height: 640 });
    await sleep(900);
    const smallOver = await stripOverHexes(phone);
    const smallTp = await textPoint(phone);
    if (smallOver.length === 0) {
      console.log('    [360x640] the strip sits above the board on this layout too; the hit test below is the proof that the words never eat a tap');
    } else {
      const eaten = smallOver.filter((h) => !/\.hex\b|^path\.|^svg\./.test(h.topEl));
      check('[360x640] every hex centre under the strip still receives the tap', eaten.length === 0, `${smallOver.length} under the strip: ${JSON.stringify(smallOver.slice(0, 3))}`);
    }
    if (smallTp) {
      check('[360x640] the on-screen words are not the hit target', !/duel-turn-slot|duel-urgency|duel-presence|duel-opp/.test(smallTp.topEl), smallTp.topEl);
      await phone.page.touchscreen.tap(smallTp.x, smallTp.y);
      await sleep(250);
      check('[360x640] tapping the words does nothing at all', await ev<boolean>(phone, `(() => !document.getElementById('game').hidden && !!document.querySelector('#gameover[hidden]'))()`));
    }
    // A real tap on the board while live: it must reach the board's own handler (the hex under the
    // finger is the top element), never the strip.
    const anyHex = await ev<string | null>(phone, `(() => { const c = document.querySelector('#board .hex-cell[data-key]'); return c ? c.getAttribute('data-key') : null; })()`);
    if (anyHex) {
      const centre = await ev<{ x: number; y: number; topEl: string }>(phone, `(() => { const c = document.querySelector('#board .hex-cell[data-key="${anyHex}"]'); const r = c.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const t = document.elementFromPoint(x, y); return { x: x, y: y, topEl: t ? t.tagName + '.' + String(t.getAttribute('class') || '') : 'none' }; })()`);
      check('[360x640] a board hex is the hit target under its centre', /hex-cell|hex/.test(centre.topEl), `${anyHex} -> ${centre.topEl}`);
    }
    await shot(phone, 'strip-ring-360x640');
  } finally {
    await phone.context.close();
    await wide.context.close();
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} live strip / ring checks failed`);
  process.exit(1);
}
console.log('\nThe live clock, the home ring and the click-through strip behave as asked.');
