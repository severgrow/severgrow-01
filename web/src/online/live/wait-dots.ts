// FUTASAKU 0.5 — the SHARED "waiting / connecting" animated ellipsis.
//
// The owner's rule: whenever the header strip shows a connecting or waiting state it must show the
// loading animation `.` → `..` → `...`. This is the one implementation of that treatment, so no
// second one is invented elsewhere. It is exported (class name + CSS + a builder) precisely so the
// header lane can reuse it.
//
// It is CSS-only: three dots light up in sequence via a keyframe animation. There is NO per-frame
// JavaScript. With Reduce motion the dots are simply shown steady (a static ellipsis still reads as
// "waiting"), which also keeps the animation from running for players who asked for less motion.
//
// HOW TO REUSE (for the header / strip lane):
//   import { WAIT_DOTS_CSS, WAIT_DOTS_CLASS, waitDots } from './online/live/wait-dots.js';
//   document.head.append(style(WAIT_DOTS_CSS));  // once
//   el.append(waitDots());                       // wherever the words are
// Do NOT add a second dots animation: the wording lives in `src/strings.ts` and the motion here.

/** The class the animated dots carry. */
export const WAIT_DOTS_CLASS = 'futasaku-wait-dots';

/** The dots: three `<i>` elements, revealed one after another by `futasaku-wait-dot`. */
export const WAIT_DOTS_CSS = `
.${WAIT_DOTS_CLASS} { display:inline-flex; align-items:flex-end; gap:2px; margin-left:2px; }
/* A display:inline-flex author rule beats the browser's own [hidden] { display:none }, so the
   shared dots carry their own hidden rule: any caller may set dots.hidden = true and trust it. */
.${WAIT_DOTS_CLASS}[hidden] { display:none !important; }
.${WAIT_DOTS_CLASS} i { width:3px; height:3px; border-radius:50%; background:currentColor; opacity:1;
  animation: futasaku-wait-dot 1.35s ease-in-out infinite both; }
.${WAIT_DOTS_CLASS} i:nth-child(2) { animation-delay:.22s; }
.${WAIT_DOTS_CLASS} i:nth-child(3) { animation-delay:.44s; }
@keyframes futasaku-wait-dot { 0%, 6% { opacity:.15 } 26%, 100% { opacity:1 } }
/* Reduce motion: a steady ellipsis, still legible as "waiting", with nothing animating. */
.reduce-motion .${WAIT_DOTS_CLASS} i { animation:none !important; opacity:1; }
@media (prefers-reduced-motion: reduce) { .${WAIT_DOTS_CLASS} i { animation:none !important; opacity:1; } }
`;

/**
 * Build the dots. `aria-hidden` because the animated ellipsis is decoration: the WORDS next to it
 * already say what is happening, and a screen reader must not hear dots changing.
 */
export const waitDots = (): HTMLElement => {
  const span = document.createElement('span');
  span.className = WAIT_DOTS_CLASS;
  span.setAttribute('aria-hidden', 'true');
  span.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  return span;
};
