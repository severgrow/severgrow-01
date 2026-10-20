// Visual effects for the board and the page: flash, sparks, floating numbers, captions,
// the turn banner and flying cards. They only decorate; they never change game state.
import { SUIT_NAMES } from '../../../src/engine/index.js';
import type { Card } from '../../../src/engine/index.js';
import type { BoardView } from './board.js';
import { S, centerOf, el, star } from './board.js';
import { BOMB_INDEX_SVG, BOMB_SVG, FRUIT_SVG, SUIT_SVG } from './icons.js';
declare const __CHANNEL__: string;
const IS_FUTA04 = typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05');
import { FRUIT } from '../../../src/strings.js';
import { ParticleBudget } from '../logic/juice.js';
import { EASE, MOTION, PINNED } from '../logic/motion.js';

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
  const art = IS_FUTA04 ? c.suit === null
    ? '<span class="futa04-card-art futa04-card-bomb" data-card-art="bomb" aria-hidden="true"></span>'
    : `<span class="futa04-card-art" data-card-art="${c.suit}:${c.rank}" style="background-position:${((c.rank - 1) % 3) * 50}% ${Math.floor((c.rank - 1) / 3) * 50}%" aria-hidden="true"></span>`
    : '';
  return art + (c.suit === null
    ? `<span class="c-num c-idx" aria-hidden="true">${IS_FUTA04 ? BOMB_INDEX_SVG : FRUIT_SVG}</span><span class="c-suit c-fruit" title="${IS_FUTA04 ? 'Bomb' : FRUIT.print}">${IS_FUTA04 ? BOMB_SVG : FRUIT_SVG}</span>`
    : `<span class="c-num num">${c.rank}</span><span class="c-suit" title="${SUIT_NAMES[c.suit]}">${SUIT_SVG[c.suit]}</span>`);
};

export const shakeFrames = (a: number): Keyframe[] => [
  { transform: 'translate(0,0)' },
  { transform: `translate(${-a}px, ${a * 0.4}px)` },
  { transform: `translate(${a * 0.8}px, ${-a * 0.3}px)` },
  { transform: `translate(${-a * 0.55}px, ${a * 0.25}px)` },
  { transform: `translate(${a * 0.35}px, ${-a * 0.15}px)` },
  { transform: `translate(${-a * 0.2}px, ${a * 0.1}px)` },
  { transform: 'translate(0,0)' },
];

/** Heavier, slower board thud for Blast — lowkey but you feel the weight. */
export const heavyShakeFrames = (a: number): Keyframe[] => [
  { transform: 'translate(0,0) scale(1)' },
  { transform: `translate(${-a * 0.9}px, ${a * 0.55}px) scale(1.012)`, offset: 0.12 },
  { transform: `translate(${a * 0.7}px, ${-a * 0.35}px) scale(0.995)`, offset: 0.32 },
  { transform: `translate(${-a * 0.45}px, ${a * 0.28}px) scale(1.008)`, offset: 0.52 },
  { transform: `translate(${a * 0.25}px, ${-a * 0.12}px) scale(1)`, offset: 0.72 },
  { transform: `translate(${-a * 0.1}px, ${a * 0.06}px)`, offset: 0.88 },
  { transform: 'translate(0,0) scale(1)' },
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

  /**
   * A soft ring spreading from a hex (photosensitivity: at most 35% strength, fading at once).
   * `dark` draws the Mega Bomb's short dark pulse instead; `ms`/`radius` size the pulse to the
   * destroyed set (opacity stays at or under 40%).
   */
  function flash(key: string, f: number, big: boolean, opts: { ms?: number; dark?: boolean; radius?: number } = {}) {
    const { x, y } = centerOf(key);
    const r0 = S * (opts.radius ?? 0.5);
    const c = el('circle', { cx: x, cy: y, r: r0, class: `fx-flash${big ? ' big' : ''}${opts.dark ? ' dark' : ''}` }, board.fx);
    const ms = opts.ms ?? 624 * Math.max(f, 0.3);
    const alpha = opts.dark ? 0.42 : 0.38;
    const grow = big ? 3.4 : opts.radius ? Math.max(2.35, opts.radius * 1.75) : 2.35;
    removeAfter(anim(c, [{ transform: 'scale(.3)', opacity: alpha }, { transform: `scale(${grow})`, opacity: 0 }], { duration: ms, easing: EASE.out, fill: 'forwards' }), c, ms + 60);
  }

  /** Part 2: the cut's impact flash: local (a few hexes), white at `alpha` (≤38%), short.
   *  `linkTo` is the torn edge: one hex (the link that snapped), or several for a Severe cut so
   *  the flash runs along the whole seam. */
  function cutFlash(key: string, ms: number, alpha: number, radius: number, linkTo?: string | readonly string[]) {
    if (ms <= 0 || alpha <= 0) return;
    const { x, y } = centerOf(key);
    const links = linkTo === undefined ? [] : typeof linkTo === 'string' ? [linkTo] : linkTo;
    const a = Math.min(0.38, alpha * (IS_FUTA04 ? 1.12 : 1));
    const c = IS_FUTA04 && links.length
      ? el('path', { d: links.map((k) => {
          const o = centerOf(k);
          return `M${x.toFixed(2)},${y.toFixed(2)}L${o.x.toFixed(2)},${o.y.toFixed(2)}`;
        }).join(''), fill:'none',stroke:'#fff2d2','stroke-width':3.2,'stroke-linecap':'round' }, board.fx)
      : el('circle', { cx: x, cy: y, r: S * radius * (IS_FUTA04 ? 1.08 : 1), class: 'fx-cutflash' }, board.fx);
    removeAfter(anim(c, [{ opacity: a }, { opacity: 0 }], { duration: Math.max(ms, IS_FUTA04 ? ms * 1.15 : ms), easing: EASE.out, fill: 'forwards' }), c, ms + 50);
  }

  /** A surviving tile beside a Severe cut: a 1.5px flinch toward the tear and a 6% dim, then back. */
  function flinch(key: string, origin: string, ms: number) {
    if (motion() === 0) return;
    const tile = board.tile(key);
    if (!tile || ms <= 0) return;
    const p = centerOf(key);
    const o = centerOf(origin);
    const len = Math.hypot(p.x - o.x, p.y - o.y) || 1;
    const dx = ((o.x - p.x) / len) * 1.5;
    const dy = ((o.y - p.y) / len) * 1.5;
    anim(tile, [
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`, opacity: 0.94, offset: 0.45 },
      { transform: 'translate(0,0)', opacity: 1 },
    ], { duration: ms, easing: EASE.out });
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
      particle(p, anim(p, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }], { duration: 672 * f, delay, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' }), 960);
    }
  }

  /** One grey mote drifting up and away from a cut-off tile (a short ash fade). */
  function drift(key: string, delay: number, f: number, n = 1) {
    if (motion() === 0) return;
    const { x, y } = centerOf(key);
    const count = IS_FUTA04 ? Math.min(n + 1, 3) : n;
    const k = particles.take(count);
    for (let i = 0; i < k; i++) {
      const dx = (i % 2 ? 1 : -1) * (4 + ((x + i * 7) % 9));
      const c = el('circle', { cx: x, cy: y, r: IS_FUTA04 ? 1.85 : 1.6, class: 'fx-mote' }, board.fx);
      particle(c, anim(c, [{ transform: 'translate(0,0)', opacity: 0.85 }, { transform: `translate(${dx}px, ${-S * 0.6}px)`, opacity: 0 }], { duration: MOTION.move * f, delay: delay + i * PINNED.ripple, easing: EASE.out, fill: 'both' }), MOTION.move * f + 240);
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

  function floatText(text: string, key: string, tone: string, f: number, force = false) {
    // Futa04 tells most of this through the LED and the outcome light; a cut's single −N is the
    // one floating payoff it keeps (and never with Reduce motion, which the caller guards).
    if (IS_FUTA04 && !force) return;
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
    if (IS_FUTA04) return;
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
    if (IS_FUTA04) return;
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
    // A hidden source has no box: there is nothing to fly from (and the scale would explode).
    if (from.width < 1 || from.height < 1 || to.height < 1) return;
    const d = document.createElement('div');
    d.className = `flyer card ${suitClass(c)}`;
    d.innerHTML = cardFace(c);
    Object.assign(d.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(d);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sc = to.height / Math.max(from.height, 1);
    // Futa04 fly-to-pile: snappy land, fade begins once the card is seated.
    const land = sc * 0.92;
    const frames: Keyframe[] = motion() === 0
      ? [{ opacity: 1 }, { opacity: 0 }]
      : IS_FUTA04
        ? [{ transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * .55}px, ${dy * .55 - 20}px) scale(${(1 + sc) / 2})`, opacity: 1, offset:.48 },
          { transform: `translate(${dx}px, ${dy}px) scale(${land})`, opacity: 1, offset: .68 },
          { transform: `translate(${dx}px, ${dy}px) scale(${land})`, opacity: 0 }]
        : [{ transform: 'translate(0,0) rotateY(0deg)' }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) rotateY(90deg) scale(${(1 + sc) / 2})`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) rotateY(0deg) scale(${sc})` }];
    const duration = (IS_FUTA04 ? PINNED.throwFlight : 440) * f;
    removeAfter(anim(d, frames, { duration, easing: IS_FUTA04 ? EASE.out : 'ease-in-out', fill: 'forwards' }), d, duration + 40);
  }

  function flyBack(from: HTMLElement, to: HTMLElement, f: number) {
    if (motion() === 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'flyer card back';
    Object.assign(d.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(d);
    // The opponent's hidden draw: the card stays visible most of the way, then fades as it arrives
    // (it used to ease in AND fade from the start, so it was barely seen).
    const tx = b.left + b.width / 2 - (a.left + a.width / 2);
    const ty = b.top + b.height / 2 - (a.top + a.height / 2);
    removeAfter(anim(d, [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${(tx * 0.7).toFixed(1)}px, ${(ty * 0.7).toFixed(1)}px) scale(.6)`, opacity: 1, offset: 0.65 },
      { transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(.4)`, opacity: 0 },
    ], { duration: 380 * f, easing: EASE.out, fill: 'forwards' }), d, 0);
  }

  /**
   * The opponent's cards live in one layer inside the game (see `.enemy-flight`). Its seat anchor
   * is placed on layout/resize, so a flight only reads two rects when it starts: never per frame.
   */
  const flightLayer = () => document.getElementById('enemy-flight');
  const clearFlights = (layer: HTMLElement) => {
    for (const n of layer.querySelectorAll('.flyer.opp')) n.remove();
  };
  const placeFlyer = (d: HTMLElement, r: DOMRect, layer: DOMRect) => {
    Object.assign(d.style, {
      left: `${(r.left - layer.left).toFixed(1)}px`,
      top: `${(r.top - layer.top).toFixed(1)}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };

  /**
   * The opponent's hidden draw: a card back leaves the Draw pile and settles on their seat.
   * A lift, a few degrees of tilt and a short hold; never a face. Returns how long it runs.
   * Reduce motion keeps the card still on the seat and only fades it.
   */
  function oppDraw(from: HTMLElement, seat: HTMLElement, f: number, quick = false): number {
    const layer = flightLayer();
    if (!layer) return 0;
    clearFlights(layer);
    const a = from.getBoundingClientRect();
    const b = seat.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'flyer card back opp';
    d.setAttribute('aria-hidden', 'true');
    placeFlyer(d, a, layerRect);
    layer.appendChild(d);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const sc = b.height / Math.max(a.height, 1);
    const atSeat = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const ms = Math.max(1, Math.round((quick ? 130 : 280) * Math.max(f, 0.1)));
    const frames: Keyframe[] = motion() === 0
      ? [
          { transform: atSeat, opacity: 0 },
          { transform: atSeat, opacity: 0.9, offset: 0.2 },
          { transform: atSeat, opacity: 0.9, offset: 0.8 },
          { transform: atSeat, opacity: 0 },
        ]
      : [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 0.96 },
          { transform: `translate(${(dx * 0.58).toFixed(1)}px, ${(dy * 0.58 - 18).toFixed(1)}px) rotate(4deg) scale(${((1 + sc) / 2).toFixed(3)})`, opacity: 1, offset: 0.58 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-3deg) scale(${sc.toFixed(3)})`, opacity: 1, offset: 0.82 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-3deg) scale(${sc.toFixed(3)})`, opacity: 1, offset: 0.9 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-3deg) scale(${sc.toFixed(3)})`, opacity: 0 },
        ];
    removeAfter(anim(d, frames, { duration: ms, easing: EASE.out, fill: 'forwards' }), d, ms + 50);
    return ms;
  }

  /**
   * The opponent's throw: the real card turns face up on their seat, holds for a beat, then arcs
   * into the Throw pile and settles. Returns how long it runs; the caller advances the pile on
   * that arrival, never before. A Bomb gets one brief border pulse at the reveal.
   * Reduce motion: a fade on the seat, then a fade on the pile, with no travel between them.
   */
  function oppThrow(card: Card, seat: HTMLElement, pile: Element, f: number, quick = false): number {
    const layer = flightLayer();
    if (!layer) return 0;
    clearFlights(layer);
    const a = seat.getBoundingClientRect();
    const b = pile.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = `flyer card opp ${suitClass(card)}`;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = cardFace(card);
    placeFlyer(d, a, layerRect);
    layer.appendChild(d);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const sc = b.height / Math.max(a.height, 1);
    const reveal = quick ? 70 : 130;
    const arc = quick ? 150 : 350;
    const ms = Math.max(1, Math.round((reveal + arc) * Math.max(f, 0.1)));
    const hold = reveal / (reveal + arc);
    const atSeat = 'translate(0, 0)';
    const atPile = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const frames: Keyframe[] = motion() === 0
      ? [
          { transform: atSeat, opacity: 0 },
          { transform: atSeat, opacity: 1, offset: Math.min(0.5, hold * 0.45) },
          { transform: atSeat, opacity: 1, offset: hold },
          { transform: atPile, opacity: 0, offset: Math.min(0.97, hold + 0.02) },
          { transform: atPile, opacity: 0.9, offset: Math.min(0.99, hold + 0.08) },
          { transform: atPile, opacity: 0 },
        ]
      : [
          { transform: 'translate(0, 0) rotate(0deg) scale(0.92)', opacity: 0 },
          { transform: 'translate(0, 0) rotate(-1deg) scale(1)', opacity: 1, offset: hold * 0.7 },
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: hold },
          { transform: `translate(${(dx * 0.52).toFixed(1)}px, ${(dy * 0.52 - 26).toFixed(1)}px) rotate(3deg) scale(${((1 + sc) / 2).toFixed(3)})`, opacity: 1, offset: hold + (1 - hold) * 0.55 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-1deg) scale(${(sc * 1.04).toFixed(3)})`, opacity: 1, offset: 0.93 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(${sc.toFixed(3)})`, opacity: 1, offset: 0.97 },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(${sc.toFixed(3)})`, opacity: 0 },
        ];
    removeAfter(anim(d, frames, { duration: ms, easing: EASE.out, fill: 'forwards' }), d, ms + 60);
    if (card.suit === null) {
      anim(d, [
        { boxShadow: '0 0 0 0 rgba(255,225,167,0)' },
        { boxShadow: '0 0 0 6px rgba(255,225,167,.46)', offset: 0.4 },
        { boxShadow: '0 0 0 0 rgba(255,225,167,0)' },
      ], { duration: Math.max(220, reveal * 2), easing: EASE.out, fill: 'none' });
    }
    return ms;
  }

  /** One quiet ring, only on the tile that just changed (bigger shine for a top rank). */
  const ring = (key: string, f: number, big: boolean) => {
    const { x, y } = centerOf(key);
    const c = el('circle', { cx: x, cy: y, r: S * 0.55, class: `fx-ring${big ? ' big' : ''}` }, board.fx);
    const ms = (big ? MOTION.moment : MOTION.move) * f;
    const a = anim(c, [{ transform: 'scale(0.6)', opacity: 0.95 }, { transform: `scale(${big ? 2.1 : 1.6})`, opacity: 0 }], { duration: ms, easing: EASE.out, fill: 'forwards' } as KeyframeAnimationOptions);
    removeAfter(a, c, ms + 60);
  };

  /** After a cut wave: the removed hexes' edges linger faintly, then go (about 400ms).
   *  Futa04 skips this — cut tiles must leave no remnant outline. */
  const scar = (keys: readonly string[], f: number) => {
    if (IS_FUTA04 || motion() === 0 || keys.length === 0) return;
    const g = el('g', { class: 'fx-scar' }, board.fx);
    for (const key of keys) el('path', { d: board.hexPath(key, S - 1.6), class: 'fx-scar-edge' }, g);
    const ms = 400 * Math.max(f, 0.5);
    removeAfter(anim(g, [{ opacity: 0.3 }, { opacity: 0 }], { duration: ms, easing: EASE.out, fill: 'forwards' }), g, ms + 40);
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
  return { flash, cutFlash, flinch, sparks, spark, drift, ring, stream, scar, boardWrapPoint, floatText, caption, banner, flyCard, flyBack, oppDraw, oppThrow, particles };
};
