// THE BLITZ CLOCK (0.82, owner 2026-11-06): "instead of those 2 buttons [Undo, Match Intel] we replicate
// the led display screen frame, but we make it a timer ... 21:00 (21 seconds but we're showing
// milliseconds too) ... same style glow as led display but with no dots".
//
// One LED frame (the display's own frame art) spanning the two key slots, with a 7-segment stopwatch
// in it: SS:CC. Pressure: calm ivory, amber from 5 s, red from 3 s; the last three seconds pulse once
// each. On the opponent's turn it shows THEIR clock, dimmer, so you watch their pressure too.
//
// Cost: it draws only while a clock is running and the page is visible (one rAF), touches only the
// segments that changed, and its glow is a static drop-shadow on a small box. Nothing runs when idle.
import { blitzClockText, blitzStage, blitzTick } from '../logic/blitz.js';
import type { BlitzStage } from '../logic/blitz.js';
import { EASE, MOTION } from '../logic/motion.js';

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
#blitz-clock .bc-glass {
  position:relative; z-index:1; width:100%; height:100%; border-radius:6px; background:#0b0d0c;
  display:flex; align-items:center; justify-content:center; overflow:hidden;
}
/* Seen through dark, slightly scratched plastic (owner, 2026-11-06: "colours less intense, like it's
   going through dark slightly scratched plastic screen"; then "the glass texture is good but the [unlit
   segments] not - remove. make it a bit more intense the color and a tiny bit more glow taking glass
   texture into account creating glow"). Lit segments only; the ink lights the smoked glass behind it
   (.bc-glass::before), and the glass texture sits over both. All static: no per-frame cost. */
#blitz-clock { --bc-ink:#d8c59e; }
#blitz-clock[data-stage='amber'] { --bc-ink:#e3963f; }
#blitz-clock[data-stage='red'] { --bc-ink:#e04432; }
#blitz-clock svg { position:relative; z-index:1; height:72%; width:auto; overflow:visible; color:var(--bc-ink);
  filter:drop-shadow(0 0 1.2px color-mix(in srgb, currentColor 85%, transparent)) drop-shadow(0 0 5px color-mix(in srgb, currentColor 45%, transparent)); }
#blitz-clock[data-side='theirs'] svg { opacity:.6; }
#blitz-clock[data-side='theirs'] .bc-glass::before { opacity:.5; }
#blitz-clock polygon { fill:currentColor; opacity:0; }
#blitz-clock polygon.on { opacity:.94; }
#blitz-clock .bc-glass::before {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit; z-index:0;
  background:radial-gradient(ellipse 58% 62% at 54% 50%, color-mix(in srgb, var(--bc-ink) 20%, transparent), color-mix(in srgb, var(--bc-ink) 6%, transparent) 55%, transparent 80%);
}
#blitz-clock .bc-glass::after {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit; z-index:2;
  background:
    linear-gradient(118deg, transparent 0 34%, rgb(255 248 230 / .045) 38% 44%, transparent 49%),
    repeating-linear-gradient(103deg, transparent 0 9px, rgb(255 250 235 / .035) 9px 9.6px, transparent 9.6px 23px),
    repeating-linear-gradient(17deg, transparent 0 13px, rgb(255 250 235 / .025) 13px 13.5px, transparent 13.5px 31px),
    linear-gradient(rgb(12 11 10 / .32), rgb(12 11 10 / .22));
}
#blitz-clock .bc-colon { fill:currentColor; opacity:.94; }
#blitz-clock .bc-who { position:absolute; left:7px; top:50%; translate:0 -50%; z-index:2;
  font:600 7px/1 var(--font-mono, ui-monospace, monospace); letter-spacing:.12em; color:#8d8577; writing-mode:vertical-rl; rotate:180deg; }
/* Blitz has no Undo, no Match Intel and no Replay (owner): their keys give their place to the clock. */
html.blitz-match #tool-undo, html.blitz-match #futa04-help-button, html.blitz-match #tool-replay, html.blitz-match #go-replay {
  visibility:hidden !important; pointer-events:none !important;
}
`;

export type BlitzClockSide = 'mine' | 'theirs';

export type BlitzClock = {
  /** Run a clock toward `deadline` (ms, Date.now() clock) for one side. */
  run: (side: BlitzClockSide, deadline: number) => void;
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
  const who = document.createElement('span');
  who.className = 'bc-who';
  who.setAttribute('aria-hidden', 'true');
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
  glass.append(svg);
  root.append(glass, who);
  host.append(root);

  let shown = '';
  let stage: BlitzStage = 'calm';
  let side: BlitzClockSide = 'mine';
  let deadline: number | null = null;
  let frame = 0;
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
      root.setAttribute('aria-label', `${side === 'mine' ? 'Your' : 'Their'} time: ${text.replace(':', '.')} seconds`);
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
    const left = Math.max(0, deadline - Date.now());
    paint(left);
    if (side === 'mine') {
      const s = blitzTick(lastLeft, left);
      if (s) {
        hooks.tick(s);
        pulse();
      }
    }
    lastLeft = left;
    if (left > 0 && !document.hidden) frame = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const show = (s: BlitzClockSide) => {
    on = true;
    side = s;
    root.dataset.side = s;
    who.textContent = s === 'mine' ? 'YOU' : 'THEM';
    document.documentElement.classList.add('blitz-match');
  };

  const onVisible = () => {
    if (!document.hidden && deadline !== null && !frame) frame = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    run(s, at) {
      show(s);
      if (deadline === at && frame) return;
      deadline = at;
      lastLeft = Math.max(0, at - Date.now());
      stop();
      frame = requestAnimationFrame(loop);
      paint(lastLeft);
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
    },
    snapshot: () => ({ on, text: shown, stage, side, running: deadline !== null }),
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      root.remove();
    },
  };
};
