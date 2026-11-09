// THE BLITZ CLOCK (0.82, owner 2026-11-06): "instead of those 2 buttons [Undo, Match Intel] we replicate
// the led display screen frame, but we make it a timer ... 21:00 (21 seconds but we're showing
// milliseconds too) ... same style glow as led display but with no dots".
//
// One LED frame (the display's own frame art) spanning the two key slots, with a 7-segment clock in
// it: MM:SS (owner, 2026-11-06: "00:21 showing only seconds"). Pressure: calm ivory, amber from 5 s, red from 3 s; the last three seconds pulse once
// each. On the opponent's turn it shows THEIR clock, dimmer, so you watch their pressure too.
//
// Cost: it draws only while a clock is running and the page is visible (one rAF), touches only the
// segments that changed, and its glow is a static drop-shadow on a small box. Nothing runs when idle.
import { blitzClockText, blitzNextFlipIn, blitzStage, blitzTick } from '../logic/blitz.js';
import type { BlitzStage } from '../logic/blitz.js';
import { EASE, MOTION } from '../logic/motion.js';
import { LIGHT_TONES } from '../player/light.js';
import { BLITZ_CLOCK_EVENT } from '../logic/blitz-clock-event.js';
import type { BlitzClockSignal } from '../logic/blitz-clock-event.js';

/** Which segments light for each digit (a b c d e f g, the usual 7-segment order). */
const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};
export const segmentsOf = (digit: string): string => DIGITS[digit] ?? '';

/** Segment polygons in a 20 x 36 cell, slightly slanted like a real LED clock. */
const SEG: Record<string, string> = {
  a: '4,1 16,1 13.5,4 6.5,4',
  b: '17,2 17,16.5 14.5,15 14.5,5',
  c: '17,19.5 17,34 14.5,31 14.5,21',
  d: '4,35 16,35 13.5,32 6.5,32',
  e: '3,19.5 3,34 5.5,31 5.5,21',
  f: '3,2 3,16.5 5.5,15 5.5,5',
  g: '4.5,18 6.5,16.3 13.5,16.3 15.5,18 13.5,19.7 6.5,19.7',
};

export const BLITZ_CLOCK_CSS = `
#blitz-clock { display:none; }
html.blitz-match.futa04-information #smart-panel > #blitz-clock {
  display:block; grid-column:1 / 3; grid-row:2; position:relative; box-sizing:border-box;
  width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  padding:8px 6px; border-radius:12px; background:#111312; pointer-events:none;
}
html.blitz-match #blitz-clock::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:url('./hardware/display-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
/* THE SAME DEVICE AS THE LED DISPLAY ABOVE (owner, 2026-11-08: "make the timer look like from the
   same physical device as the led display"): the display's own glass colour and
   the game's light palette (player/light.ts), not a glass and inks of the clock's own. */
#blitz-clock .bc-glass {
  position:relative; z-index:1; width:100%; height:100%; border-radius:6px; background:#090c0b;
  display:flex; align-items:center; justify-content:center; overflow:hidden;
}
/* Seen through dark, slightly scratched plastic (owner, 2026-11-06: "colours less intense, like it's
   going through dark slightly scratched plastic screen"; then "the glass texture is good but the [unlit
   segments] not - remove. make it a bit more intense the color and a tiny bit more glow taking glass
   texture into account creating glow"). Lit segments only; the ink lights the smoked glass behind it
   (.bc-glass::before), and the glass texture sits over both. All static: no per-frame cost. */
#blitz-clock { --bc-ink:${LIGHT_TONES.amber.core}; }
#blitz-clock[data-stage='amber'] { --bc-ink:#f0a24e; }
#blitz-clock[data-stage='red'] { --bc-ink:${LIGHT_TONES.red.core}; }
#blitz-clock svg { position:relative; z-index:1; height:72%; width:auto; overflow:visible; color:var(--bc-ink);
  filter:drop-shadow(0 0 .8px color-mix(in srgb, currentColor 85%, transparent)) drop-shadow(0 0 2.4px color-mix(in srgb, currentColor 50%, transparent)); }
#blitz-clock[data-side='theirs'] svg { opacity:.6; }
#blitz-clock[data-side='theirs'] .bc-glass::before { opacity:.5; }
#blitz-clock polygon { fill:currentColor; opacity:0; }
#blitz-clock polygon.on { opacity:.94; }
#blitz-clock .bc-glass::before {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit; z-index:0;
  /* owner, 2026-11-08: "too much light glow in the very middle" — a soft even wash across the digits */
  background:radial-gradient(ellipse 64% 58% at 50% 50%, color-mix(in srgb, var(--bc-ink) 8%, transparent), color-mix(in srgb, var(--bc-ink) 4%, transparent) 55%, transparent 92%);
}
#blitz-clock .bc-glass::after {
  /* the glass texture at half strength (owner, 2026-11-06: "a bit less visible, by like 50%") */
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit; z-index:2; opacity:.5;
  background:
    linear-gradient(118deg, transparent 0 34%, rgb(255 248 230 / .045) 38% 44%, transparent 49%),
    repeating-linear-gradient(103deg, transparent 0 9px, rgb(255 250 235 / .035) 9px 9.6px, transparent 9.6px 23px),
    repeating-linear-gradient(17deg, transparent 0 13px, rgb(255 250 235 / .025) 13px 13.5px, transparent 13.5px 31px),
    linear-gradient(rgb(12 11 10 / .32), rgb(12 11 10 / .22));
}
#blitz-clock .bc-colon { fill:currentColor; opacity:.94; }
/* YOU and OPP (owner, 2026-11-06): both printed on the screen like an old LCD's legends, under the glass.
   The idle one is a dark cut-out, barely there (black on black); the side whose clock runs lights up in
   the clock's own ink. YOU keeps its place on the left (reading up); OPP mirrors it on the right. */
#blitz-clock .bc-who { position:absolute; top:50%; translate:0 -50%; z-index:1;
  font:600 7px/1 var(--font-mono, ui-monospace, monospace); letter-spacing:.12em; writing-mode:vertical-rl;
  color:#151615; text-shadow:0 .5px 0 rgb(255 250 235 / .07), 0 -.5px 0 rgb(0 0 0 / .7); }
#blitz-clock .bc-who.you { left:1px; rotate:180deg; }
#blitz-clock .bc-who.opp { right:1px; }
#blitz-clock[data-side='mine'] .bc-who.you, #blitz-clock[data-side='theirs'] .bc-who.opp {
  color:var(--bc-ink); text-shadow:0 0 1.4px color-mix(in srgb, var(--bc-ink) 60%, transparent); }
/* Blitz has no Undo, no Match Intel and no Replay (owner): their keys give their place to the clock. */
html.blitz-match #tool-undo, html.blitz-match #futa04-help-button, html.blitz-match #tool-replay, html.blitz-match #go-replay {
  visibility:hidden !important; pointer-events:none !important;
}
`;

export type BlitzClockSide = 'mine' | 'theirs';

export type BlitzClock = {
  /** Run a clock toward a WALL-clock deadline (ms, Date.now(): the server's turn deadline). */
  run: (side: BlitzClockSide, deadline: number) => void;
  /** Run a clock toward a STEADY deadline (ms, performance.now(): a local turn). */
  runSteady: (side: BlitzClockSide, deadline: number) => void;
  /** Hold the clock still showing `ms` (a turn not yet playable, or one that just ended). */
  hold: (side: BlitzClockSide, ms: number) => void;
  /** Hide everything (not a Blitz match on screen). */
  off: () => void;
  /** Test hook: what the clock shows. */
  snapshot: () => { on: boolean; text: string; stage: BlitzStage; side: BlitzClockSide; running: boolean };
  destroy: () => void;
};

export type BlitzClockHooks = {
  reduceMotion: () => boolean;
  /** The last three seconds of MY clock: one soft key click each. */
  tick: (second: 1 | 2 | 3) => void;
};

/** One clock per page: practice Blitz and the online Blitz duel share it (never two #blitz-clock). */
let shared: BlitzClock | null = null;
export const blitzClockIn = (host: HTMLElement, hooks: BlitzClockHooks): BlitzClock => {
  if (shared && document.getElementById('blitz-clock')?.parentElement === host) return shared;
  shared?.destroy();
  shared = mountBlitzClock(host, hooks);
  return shared;
};

export const mountBlitzClock = (host: HTMLElement, hooks: BlitzClockHooks): BlitzClock => {
  if (!document.getElementById('blitz-clock-style')) {
    const style = document.createElement('style');
    style.id = 'blitz-clock-style';
    style.textContent = BLITZ_CLOCK_CSS;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.id = 'blitz-clock';
  root.setAttribute('role', 'timer');
  root.setAttribute('aria-live', 'off');
  const glass = document.createElement('div');
  glass.className = 'bc-glass';
  const legend = (cls: string, word: string) => {
    const span = document.createElement('span');
    span.className = `bc-who ${cls}`;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = word;
    return span;
  };
  const you = legend('you', 'YOU');
  const opp = legend('opp', 'OPP');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 92 36');
  svg.setAttribute('aria-hidden', 'true');
  const cells: SVGPolygonElement[][] = [];
  const x0 = [0, 21, 50, 71];
  for (const x of x0) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${x} 0) skewX(-6)`);
    const segs: SVGPolygonElement[] = [];
    for (const name of 'abcdefg') {
      const p = document.createElementNS(ns, 'polygon');
      p.setAttribute('points', SEG[name]!);
      p.dataset.seg = name;
      g.append(p);
      segs.push(p);
    }
    svg.append(g);
    cells.push(segs);
  }
  for (const cy of [11.5, 24.5]) {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', '44.5');
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '1.9');
    dot.setAttribute('class', 'bc-colon');
    svg.append(dot);
  }
  glass.append(you, svg, opp);
  root.append(glass);
  host.append(root);

  let shown = '';
  let stage: BlitzStage = 'calm';
  let side: BlitzClockSide = 'mine';
  /**
   * RELIABILITY (owner, 2026-11-06: "Make sure the clock never lags never slows down and is super
   * reliable"): the deadline is kept on the STEADY clock (performance.now(), which never jumps when the
   * phone adjusts its time), and the clock sleeps exactly until the shown second flips, then reads the
   * time afresh — no per-frame work, and a late wake (a busy moment) can never accumulate into drift.
   */
  let deadline: number | null = null;
  let frame = 0;
  const now = () => performance.now();
  let lastLeft = Infinity;
  let on = false;

  const paint = (ms: number) => {
    const text = blitzClockText(ms);
    if (text !== shown) {
      const digits = text.replace(':', '');
      for (let i = 0; i < 4; i++) {
        if (shown && shown.replace(':', '')[i] === digits[i]) continue;
        const lit = segmentsOf(digits[i]!);
        for (const p of cells[i]!) p.classList.toggle('on', lit.includes(p.dataset.seg!));
      }
      shown = text;
      root.setAttribute('aria-label', `${side === 'mine' ? 'Your' : 'Their'} time: ${Number(text.slice(0, 2)) * 60 + Number(text.slice(3))} seconds`);
    }
    const next = blitzStage(ms);
    if (next !== stage) {
      stage = next;
      root.dataset.stage = stage;
    }
  };

  const pulse = () => {
    if (hooks.reduceMotion()) return;
    svg.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: MOTION.move, easing: EASE.out });
  };

  const loop = () => {
    frame = 0;
    if (deadline === null) return;
    const left = Math.max(0, deadline - now());
    paint(left);
    if (side === 'mine') {
      const s = blitzTick(lastLeft, left);
      if (s) {
        hooks.tick(s);
        pulse();
      }
    }
    lastLeft = left;
    const flip = blitzNextFlipIn(left);
    // +2 ms so the wake lands just past the boundary, never a hair before it
    if (flip !== null && !document.hidden) frame = window.setTimeout(loop, flip + 2);
  };

  const stop = () => {
    if (frame) window.clearTimeout(frame);
    frame = 0;
  };

  const start = (s: BlitzClockSide, at: number) => {
    show(s);
    deadline = at;
    lastLeft = Math.max(0, at - now());
    stop();
    loop();
  };

  /** Tell listeners (BLITZ_CLOCK_EVENT) only when on/off or the side actually changed. */
  let signalled = '';
  const signal = () => {
    const key = `${on}:${on ? side : ''}`;
    if (key === signalled) return;
    signalled = key;
    const detail: BlitzClockSignal = { on, side: on ? side : null };
    window.dispatchEvent(new CustomEvent(BLITZ_CLOCK_EVENT, { detail }));
  };

  const show = (s: BlitzClockSide) => {
    on = true;
    side = s;
    root.dataset.side = s;
    document.documentElement.classList.add('blitz-match');
    signal();
  };

  // Back from the background: read the time at once (a hidden tab's timers are slowed by the browser).
  const onVisible = () => {
    if (!document.hidden && deadline !== null) {
      stop();
      loop();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    run(s, at) {
      // the server's wall-clock deadline, turned into the steady clock ONCE; later calls with the same
      // deadline (every status poll) keep the running countdown instead of nudging it by a few ms
      const steady = now() + (at - Date.now());
      if (deadline !== null && side === s && Math.abs(steady - deadline) < 250) {
        show(s);
        if (!frame && !document.hidden) loop();
        return;
      }
      start(s, steady);
    },
    runSteady(s, at) {
      if (deadline === at && side === s && frame) return;
      start(s, at);
    },
    hold(s, ms) {
      show(s);
      deadline = null;
      stop();
      paint(ms);
    },
    off() {
      on = false;
      deadline = null;
      stop();
      document.documentElement.classList.remove('blitz-match');
      signal();
    },
    snapshot: () => ({ on, text: shown, stage, side, running: deadline !== null }),
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      if (on) {
        on = false;
        signal();
      }
      root.remove();
    },
  };
};
