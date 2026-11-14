import { allNeighbors, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Step } from '../logic/anim.js';
import type { Strike } from '../replay/timeline.js';
import { STRIKE_TIMING, strikeLook } from '../replay/strike.js';
import { BOMB_FACE, cardArtUrl } from './card-art.js';
import { centerOf, el, hexPath, S } from './geom.js';

/** Same one-card / two-card vocabulary and footprint as the replay. Presentation only. */
export const liveStrike = (step: Step): Strike | null => step.k === 'fruit'
  ? { target: step.target, area: [step.target], cards: 1 }
  : step.k === 'megaBomb'
    ? { target: step.target, area: [step.target, ...allNeighbors(parseKey(step.target)).map(coordKey)], cards: 2 }
    : null;

let serial = 0;
/** Bounded SVG cue: at most seven hexes and two existing card images, no frame loop or layout reads. */
export const showLiveStrike = (
  layer: SVGGElement, step: Step, ms: number, reduced: boolean,
  /** cards: false — the glow only. The Bomb's card has just flown onto the tile, so drawing it again
   *  here showed it twice (owner, 2026-11-08). */
  opts: { cards?: boolean } = {},
): SVGGElement | null => {
  const strike = liveStrike(step);
  if (!strike || !Number.isFinite(ms) || ms <= 0) return null;
  layer.querySelectorAll('.live-strike').forEach(node => {node.getAnimations({subtree:true}).forEach(a=>a.cancel());node.remove();});
  const root = el('g', { class: 'live-strike', 'data-cards': strike.cards, 'aria-hidden': 'true', 'pointer-events': 'none' }, layer);
  const id = `live-strike-glow-${++serial}`;
  const defs = el('defs', {}, root);
  const gradient = el('radialGradient', { id }, defs);
  for (const [offset, color] of [[0,'rgba(255,236,196,.75)'],[.55,'rgba(255,168,82,.42)'],[1,'rgba(222,58,40,.15)']] as const)
    el('stop', { offset, 'stop-color': color }, gradient);
  const area = el('g', { class: 'live-strike-area' }, root);
  const svg = layer.ownerSVGElement;
  for (const key of strike.area) {
    if (!svg?.querySelector(`.hex-cell[data-key="${key}"]`)) continue;
    el('path', { d: hexPath(key,S*.98,'flat'), fill: `url(#${id})`, stroke: 'rgba(255,120,72,.85)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, area);
  }
  const at = centerOf(strike.target);
  const anchor = el('g', { transform: `translate(${at.x} ${at.y})` }, root);
  const cards = el('g', { class: 'live-strike-cards' }, anchor);
  cards.style.transformBox = 'fill-box'; cards.style.transformOrigin = 'center';
  const h = S*2.15, w = h*256/356;
  const image = (dx: number, degrees: number) => el('image', {
    class: 'live-strike-card', href: cardArtUrl(BOMB_FACE), x: dx-w/2, y: -h/2, width:w, height:h,
    transform:`rotate(${degrees} ${dx} 0)`, preserveAspectRatio:'xMidYMid meet',
  }, cards);
  if (opts.cards !== false) { if (strike.cards === 2) { image(-w*.28,-9); image(w*.28,9); } else image(0,-4); }
  if (reduced) {
    area.setAttribute('opacity','.16');
    window.setTimeout(()=>root.remove(),ms);
    return root;
  }
  const times = [0,STRIKE_TIMING.landEnd*.7,STRIKE_TIMING.landEnd,STRIKE_TIMING.burst,STRIKE_TIMING.burst+.06,STRIKE_TIMING.cardOutEnd,STRIKE_TIMING.burstEnd,1];
  const cardMotion = cards.animate(times.map(offset=>{
    const look = strikeLook(offset).card;
    return { offset, opacity:look.alpha, transform:`translateY(${-look.lift*S}px) scale(${look.scale})` };
  }),{duration:ms,fill:'both'});
  const burst = area.animate(times.map(offset=>({offset,opacity:strikeLook(offset).burst})),{duration:ms,fill:'both'});
  let removed=false;
  const cleanup=()=>{if(removed)return;removed=true;cardMotion.cancel();burst.cancel();root.remove();};
  void cardMotion.finished.catch(()=>undefined);
  void burst.finished.then(cleanup,cleanup);
  return root;
};
