// Visual effects for the board and the page: flash, sparks, floating numbers, captions,
// the turn banner and flying cards. They only decorate; they never change game state.
import { SUIT_NAMES } from '../../../src/engine/index.js';
import type { Card } from '../../../src/engine/index.js';
import type { BoardView } from './board.js';
import { S, centerOf, el, star } from './board.js';
import { BOMB_INDEX_SVG, BOMB_SVG, FRUIT_SVG, SUIT_SVG } from './icons.js';
declare const __CHANNEL__: string;
const IS_TEST2 = typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test2';
import { FRUIT } from '../../../src/strings.js';
import { ParticleBudget } from '../logic/juice.js';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export const anim = (target: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
  if (!target) return null;
  try {
    return target.animate(frames, { fill: 'backwards', ...opts });
  } catch {
    return null;
  }
};
export const removeAfter = (a: Animation | null, node: Element, fallbackMs: number) => {
  if (a) a.finished.then(() => node.remove()).catch(() => node.remove());
  else setTimeout(() => node.remove(), fallbackMs);
};

/** The class for a card's look: its suit (s0-s3), or `fruit` for a v0.6 Fruit card. */
export const suitClass = (c: Card): string => (c.suit === null ? 'fruit' : `s${c.suit}`);

/**
 * A card's face: number and suit, or (a Fruit card, v0.8 UI pass) the same two parts with the
 * mushroom in both places: a small corner index where the number sits, a big icon where the suit sits.
 */
export const cardFace = (c: Card) => {
  const art = IS_TEST2 ? c.suit === null
    ? '<span class="test2-card-art test2-card-bomb" data-card-art="bomb" aria-hidden="true"></span>'
    : `<span class="test2-card-art" data-card-art="${c.suit}:${c.rank}" style="background-position:${((c.rank - 1) % 3) * 50}% ${Math.floor((c.rank - 1) / 3) * 50}%" aria-hidden="true"></span>`
    : '';
  return art + (c.suit === null
    ? `<span class="c-num c-idx" aria-hidden="true">${IS_TEST2 ? BOMB_INDEX_SVG : FRUIT_SVG}</span><span class="c-suit c-fruit" title="${IS_TEST2 ? 'Bomb' : FRUIT.print}">${IS_TEST2 ? BOMB_SVG : FRUIT_SVG}</span>`
    : `<span class="c-num num">${c.rank}</span><span class="c-suit" title="${SUIT_NAMES[c.suit]}">${SUIT_SVG[c.suit]}</span>`);
};

export const shakeFrames = (a: number): Keyframe[] => [
  { transform: 'translate(0,0)' },
  { transform: `translate(${-a}px, ${a * 0.4}px)` },
  { transform: `translate(${a * 0.8}px, ${-a * 0.3}px)` },
  { transform: `translate(${-a * 0.4}px, ${a * 0.2}px)` },
  { transform: 'translate(0,0)' },
];

/** Effects bound to the board and the current animation speed / motion settings. */
export const createEffects = (board: BoardView, timeScale: () => number, motion: () => number) => {
  // At most 60 particles on screen at once; each one frees its slot when it ends.
  const particles = new ParticleBudget(60);
  const particle = (node: Element, a: Animation | null, ms: number) => {
    const done = () => {
      node.remove();
      particles.free(1);
    };
    if (a) a.finished.then(done).catch(done);
    else setTimeout(done, ms);
  };

  /** A soft ring spreading from a hex (photosensitivity: at most 35% strength, fading at once). */
  function flash(key: string, f: number, big: boolean) {
    const { x, y } = centerOf(key);
    const c = el('circle', { cx: x, cy: y, r: S * 0.5, class: `fx-flash${big ? ' big' : ''}` }, board.fx);
    removeAfter(anim(c, [{ transform: 'scale(.3)', opacity: 0.35 }, { transform: `scale(${big ? 3.2 : 2.2})`, opacity: 0 }], { duration: 520 * Math.max(f, 0.3), easing: 'ease-out', fill: 'forwards' }), c, 600);
  }

  /** Part 2: the cut's impact flash: local (a few hexes), white at `alpha` (≤35%), `ms` long (≤60ms). */
  function cutFlash(key: string, ms: number, alpha: number, radius: number) {
    if (ms <= 0 || alpha <= 0) return;
    const { x, y } = centerOf(key);
    const c = el('circle', { cx: x, cy: y, r: S * radius, class: 'fx-cutflash' }, board.fx);
    removeAfter(anim(c, [{ opacity: alpha }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }), c, ms + 40);
  }

  /** A burst of n small sparks from a hex (a tile replaced, a big grow, a win). */
  function sparks(key: string, who: 'you' | 'bot', delay: number, f: number, n = 9) {
    if (motion() === 0) return;
    const { x, y } = centerOf(key);
    const k = particles.take(n);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + i;
      const d = S * (0.7 + (i % 3) * 0.28);
      const p = el('path', { d: star(x, y, 3.4), class: `fx-spark ${who}` }, board.fx);
      particle(p, anim(p, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }], { duration: 560 * f, delay, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' }), 800);
    }
  }

  /** A few grey motes drifting up and away from a cut-off tile. */
  function drift(key: string, delay: number, f: number, n = 2) {
    if (motion() === 0) return;
    const { x, y } = centerOf(key);
    const k = particles.take(n);
    for (let i = 0; i < k; i++) {
      const dx = (i % 2 ? 1 : -1) * (4 + ((x + i * 7) % 9));
      const c = el('circle', { cx: x, cy: y, r: 1.6, class: 'fx-mote' }, board.fx);
      particle(c, anim(c, [{ transform: 'translate(0,0)', opacity: 0.8 }, { transform: `translate(${dx}px, ${-S * 0.9}px)`, opacity: 0 }], { duration: 900 * f, delay: delay + i * 60, easing: 'ease-out', fill: 'both' }), 1200);
    }
  }

  /** One tiny spark for a small move. */
  function spark(key: string, delay: number, f: number) {
    if (motion() === 0 || !particles.take(1)) return;
    const { x, y } = centerOf(key);
    const p = el('path', { d: star(x + S * 0.35, y - S * 0.35, 3), class: 'fx-spark you' }, board.fx);
    particle(p, anim(p, [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.4 }, { transform: 'scale(0)', opacity: 0 }], { duration: 420 * f, delay, fill: 'both', transformOrigin: 'center' } as KeyframeAnimationOptions), 600);
  }

  function boardWrapPoint(key: string | null) {
    const wrap = $('board-wrap').getBoundingClientRect();
    if (!key) return { x: wrap.width / 2, y: wrap.height * 0.16 };
    const p = board.screenPoint(key);
    return { x: p.x - wrap.left, y: p.y - wrap.top };
  }

  function floatText(text: string, key: string, tone: string, f: number) {
    // The board tells this story directly for now; keep the effect for a later caption pass.
    if (IS_TEST2) return;
    const d = document.createElement('div');
    d.className = `float num ${tone}`;
    d.textContent = text;
    const p = boardWrapPoint(key);
    d.style.left = `${p.x}px`;
    d.style.top = `${p.y}px`;
    $('captions').appendChild(d);
    removeAfter(anim(d, [{ transform: 'translate(-50%, -20%) scale(.7)', opacity: 0 }, { transform: 'translate(-50%, -90%) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, -200%) scale(1)', opacity: 0 }], { duration: 1600 * Math.max(f, 0.5), easing: 'ease-out', fill: 'forwards' }), d, 1600);
  }

  function caption(text: string, key: string | null, tone: string) {
    if (IS_TEST2) return;
    const box = $('captions');
    const d = document.createElement('div');
    d.className = `caption ${tone}`;
    d.textContent = text;
    const p = boardWrapPoint(key);
    const wrap = $('board-wrap').getBoundingClientRect();
    d.style.left = `${Math.min(Math.max(p.x, 110), wrap.width - 110)}px`;
    d.style.top = `${Math.min(Math.max(p.y + (key ? S * 1.1 : 0), 20), wrap.height - 40)}px`;
    box.querySelectorAll('.caption').forEach((c) => c.remove());
    box.appendChild(d);
    const ms = 2400 * Math.max(timeScale(), 0.7);
    removeAfter(anim(d, [{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: 'translate(-50%, 0)' }], { duration: ms, fill: 'forwards' }), d, ms);
  }

  function banner(text: string, tone?: 'you' | 'bot' | 'big' | 'calm') {
    if (IS_TEST2) return;
    const b = $('banner');
    b.textContent = text;
    b.className = `banner ${tone ?? 'you'}`;
    const f = Math.max(timeScale(), 0.5);
    anim(
      b,
      motion() === 0
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [{ transform: 'translate(-50%, 0) translateX(-40vw)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.22 }, { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%, 0) translateX(30vw)', opacity: 0 }],
      { duration: 1300 * f, easing: 'ease-in-out', fill: 'both' },
    );
  }

  function flyCard(c: Card, from: DOMRect, to: DOMRect, f: number) {
    const d = document.createElement('div');
    d.className = `flyer card ${suitClass(c)}`;
    d.innerHTML = cardFace(c);
    Object.assign(d.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(d);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sc = to.height / Math.max(from.height, 1);
    const frames: Keyframe[] = motion() === 0
      ? [{ opacity: 1 }, { opacity: 0 }]
      : IS_TEST2
        ? [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: .92 }]
        : [{ transform: 'translate(0,0) rotateY(0deg)' }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) rotateY(90deg) scale(${(1 + sc) / 2})`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) rotateY(0deg) scale(${sc})` }];
    const duration = (IS_TEST2 ? 280 : 440) * f;
    removeAfter(anim(d, frames, { duration, easing: IS_TEST2 ? 'cubic-bezier(.25,.72,.25,1)' : 'ease-in-out', fill: 'forwards' }), d, duration + 40);
  }

  function flyBack(from: HTMLElement, to: HTMLElement, f: number) {
    if (motion() === 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'flyer card back';
    Object.assign(d.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(d);
    removeAfter(anim(d, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(.4)`, opacity: 0 }], { duration: 400 * f, easing: 'ease-in', fill: 'forwards' }), d, 0);
  }

  /** Strengthen: a thin ring expanding outward from a tile (bigger shine for a top rank). */
  const ring = (key: string, f: number, big: boolean) => {
    const { x, y } = centerOf(key);
    const c = el('circle', { cx: x, cy: y, r: S * 0.55, class: `fx-ring${big ? ' big' : ''}` }, board.fx);
    const a = anim(c, [{ transform: 'scale(0.6)', opacity: 0.95 }, { transform: `scale(${big ? 2.1 : 1.6})`, opacity: 0 }], { duration: 620 * f, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' } as KeyframeAnimationOptions);
    removeAfter(a, c, 700 * f);
  };
  /** Fruit: spore puffs stream from each given-up tile to the target. */
  const stream = (from: readonly string[], to: string, f: number, n: number) => {
    const t = centerOf(to);
    const k = particles.take(n);
    for (let i = 0; i < k; i++) {
      const s = centerOf(from[i % from.length]!);
      const c = el('circle', { cx: s.x, cy: s.y, r: 2.2, class: 'fx-spore' }, board.fx);
      const bend = ((i % 3) - 1) * S * 0.5;
      const a = anim(
        c,
        [
          { transform: 'translate(0,0) scale(1)', opacity: 0 },
          { transform: `translate(${(t.x - s.x) / 2 + bend}px,${(t.y - s.y) / 2 - S * 0.4}px) scale(1.4)`, opacity: 0.95, offset: 0.45 },
          { transform: `translate(${t.x - s.x}px,${t.y - s.y}px) scale(0.6)`, opacity: 0 },
        ],
        { duration: (560 + (i % 4) * 60) * f, delay: i * 18 * f, easing: 'ease-in-out', fill: 'forwards' },
      );
      particle(c, a, 900 * f);
    }
  };
  return { flash, cutFlash, sparks, spark, drift, ring, stream, boardWrapPoint, floatText, caption, banner, flyCard, flyBack, particles };
};
