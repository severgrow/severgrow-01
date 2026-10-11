// The "who starts" draw at the start of a match. The engine has already drawn the starter
// from the seed (docs/SPEC.md 5); this only shows the result as a short lottery: a light
// hops between the two sides, slows down and stops on the starter. Tap to skip. With speed
// set to skip it does not show; with Reduce motion it shows the result without the hops.
import { OPP } from '../../../src/strings.js';

const CSS = `
#starter-draw { position:fixed; inset:0; z-index:60; display:grid; place-items:center; padding:16px;
  background:rgba(4,6,6,.42); cursor:pointer; -webkit-tap-highlight-color:transparent;
  animation:starter-in .18s ease-out both; }
#starter-draw.leaving { animation:starter-out .22s ease-in both; }
#starter-draw .sd-panel { box-sizing:border-box; width:min(320px,100%); padding:16px 16px 14px; border-radius:15px;
  border:1px solid rgba(214,204,177,.16); color:#f0e9dc; background:rgba(10,13,13,.9);
  box-shadow:inset 0 1px rgba(243,232,202,.07),0 12px 32px rgba(0,0,0,.35);
  font:500 13px/1.35 Commissioner,system-ui,sans-serif; text-align:center; }
#starter-draw .sd-title { margin:0 0 12px; color:#bcae8d; font:700 11px/1.1 Commissioner,system-ui,sans-serif; letter-spacing:.18em; }
#starter-draw .sd-sides { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
#starter-draw .sd-side { padding:12px 6px; border-radius:10px; border:1px solid rgba(229,214,183,.14);
  background:rgba(255,255,255,.03); font-weight:750; letter-spacing:.12em; font-size:12px;
  transition:background .08s, border-color .08s, box-shadow .08s, color .08s; color:#a99f8b; }
#starter-draw .sd-side[data-side='you'].lit { color:#effbe9; border-color:rgb(140,214,150);
  background:rgba(140,214,150,.18); box-shadow:0 0 16px rgba(140,214,150,.35); }
#starter-draw .sd-side[data-side='opponent'].lit { color:#fff0e8; border-color:rgb(240,132,96);
  background:rgba(240,132,96,.18); box-shadow:0 0 16px rgba(240,132,96,.35); }
#starter-draw .sd-result { min-height:1.4em; margin:12px 0 0; font:800 15px/1.3 Besley,Georgia,serif; letter-spacing:.04em; }
#starter-draw .sd-hint { margin:6px 0 0; color:#8f8775; font-size:10px; letter-spacing:.12em; }
@keyframes starter-in { from { opacity:0; } }
@keyframes starter-out { to { opacity:0; } }
.reduce-motion #starter-draw, .reduce-motion #starter-draw.leaving { animation:none; }
@media (prefers-reduced-motion:reduce) { #starter-draw, #starter-draw.leaving { animation:none; } }
`;

export type StarterSide = 'you' | 'opponent';

/** The gaps between hops, slowing down; the count is chosen so the light ends on `starter`. */
export const hopPlan = (starter: StarterSide): { first: StarterSide; gaps: number[] } => {
  const gaps = [70, 75, 85, 95, 110, 130, 160, 200, 250];
  // the light starts on one side and changes sides once per gap
  const first: StarterSide = gaps.length % 2 === 0 ? starter : starter === 'you' ? 'opponent' : 'you';
  return { first, gaps };
};

/**
 * Shows the draw and resolves when it is gone. `scale` is the game's animation speed
 * (0 = skip: resolves at once, nothing shown).
 */
export const showStarterDraw = (starter: StarterSide, scale: number, reduceMotion: boolean): Promise<void> => {
  if (scale <= 0 || typeof document === 'undefined') return Promise.resolve();
  if (!document.getElementById('starter-draw-style')) {
    const style = document.createElement('style');
    style.id = 'starter-draw-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  document.getElementById('starter-draw')?.remove();
  const root = document.createElement('div');
  root.id = 'starter-draw';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<div class="sd-panel"><p class="sd-title">WHO STARTS?</p>
    <div class="sd-sides"><div class="sd-side" data-side="you">YOU</div><div class="sd-side" data-side="opponent"></div></div>
    <p class="sd-result"></p><p class="sd-hint">TAP TO CONTINUE</p></div>`;
  root.querySelector('[data-side="opponent"]')!.textContent = OPP.label.toUpperCase();
  document.body.append(root);
  const sides = { you: root.querySelector<HTMLElement>('[data-side="you"]')!, opponent: root.querySelector<HTMLElement>('[data-side="opponent"]')! };
  const light = (side: StarterSide) => {
    sides.you.classList.toggle('lit', side === 'you');
    sides.opponent.classList.toggle('lit', side === 'opponent');
  };
  const result = root.querySelector<HTMLElement>('.sd-result')!;

  return new Promise<void>((resolve) => {
    const timers: number[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      root.classList.add('leaving');
      const gone = () => { root.remove(); resolve(); };
      if (reduceMotion) gone();
      else timers.push(window.setTimeout(gone, 220));
    };
    const settle = () => {
      light(starter);
      result.textContent = starter === 'you' ? 'You start' : `${OPP.label} starts`;
      timers.push(window.setTimeout(finish, Math.max(700, 900 * scale)));
    };
    root.addEventListener('click', () => { if (!done) { timers.forEach(clearTimeout); light(starter); finish(); } });
    if (reduceMotion) return settle();
    const { first, gaps } = hopPlan(starter);
    let side = first;
    light(side);
    let at = 0;
    for (const gap of gaps) {
      at += gap * scale;
      timers.push(window.setTimeout(() => { side = side === 'you' ? 'opponent' : 'you'; light(side); }, at));
    }
    timers.push(window.setTimeout(settle, at + 120 * scale));
  });
};
