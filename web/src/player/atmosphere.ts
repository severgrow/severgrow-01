// Futa04-only presentation. The grain is a static CSS background and the rim is baked once; no live
// noise/blur filter, animation clock, gameplay input, state or per-frame drawing.
import { cornerPts, S } from '../ui/geom.js';
export const ATMOSPHERE_CSS = `
/* THE ANALOGUE FILM GRAIN. This is the ONE grain in the app, and it goes on top of EVERYTHING,
   always (owner's rule, 2026-10-16: "always on top top top layer - even when we add new things").
   Every line here is load-bearing; do not tidy them away:
   - z-index one below the maximum, above every other layer in the app (the highest is 96);
   - mountAtmosphere keeps it as the LAST body child (pinGrain), so a later sibling cannot sit above
     it at an equal z-index - that is what makes the rule survive new UI;
   - pointer-events: none, or a full-screen layer would swallow every tap in the app;
   - NORMAL blending, not soft-light. Soft-light over these near-black surfaces is invisible - which
     is why the grain once read as a background texture with the interface cut out of it;
   - the grain must NOT go back on #texture::before: #texture sets a z-index, so it is a stacking
     context and anything inside it can only ever rise above the background, never above the app.

   DENSER, FINER GRAIN (owner, 2026-10-16: "looks chunky, especially on bigger screen ... more dense
   with smaller grain - so it doesn't look pixelated and more like real fujifilm style analog film
   grain"). The chunkiness had two compounding causes, both measured:
     1. THE SOURCE WAS UPSCALED. The tile was 220px of raster shown at 220 CSS px, so on a retina
        screen the browser stretched it - x2 at DPR2, x3 at DPR3 - and every speck became a 2-3px
        block. That is the pixelation.
     2. THE NOISE WAS ALREADY ALIASED. baseFrequency .55 is 0.55 cycles per pixel, ABOVE the Nyquist
        limit of 0.5, and its 2nd and 3rd octaves sat at 1.1 and 2.2. Frequencies the raster cannot
        represent turn into harsh single-pixel speckle, which the upscaling then magnified.
   So: a much larger source (1024) whose raster maps 1:1 to DEVICE pixels at any density
   (background-size = 1024 / devicePixelRatio, via the two media queries below), and a HIGHER
   baseFrequency so each speck is smaller. The two fixes are independent: the 1:1 mapping removes
   the blockiness (nothing is stretched any more), and the frequency sets the grain size.
   baseFrequency .7 was chosen by MEASURING a sweep of .35/.5/.65/.8/1.0 rather than by eye - in a
   1024 raster at 1:1, local variation per unit strength rises from .666 (old) to 1.06, while the
   autocorrelation falls from .193 to about zero, i.e. finer grain with no repeating block pattern.
   (1.0 collapses: at that frequency the octaves alias past what the raster can represent and the
   noise degenerates to flat grey - sd 0.61 - so .7 keeps a margin below the ceiling.) */
#futa04-film-grain {
  position: fixed; inset: 0; z-index: 2147483646; pointer-events: none !important;
  opacity: .085; background-repeat: repeat; background-size: 1024px 1024px;
  mix-blend-mode: normal; user-select: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .75  0 0 0 0 .75  0 0 0 0 .75  0 0 0 1.1 -.42'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
}
/* One tile is 1024 DEVICE pixels wide on every screen, so the grain is always rasterised at the
   display's own resolution: never upscaled (blocky), never needlessly downsampled (washed out).
   341.33 is 1024/3, kept exact so a 3x phone lands on a whole number of device pixels. */
@media (min-resolution: 2dppx) { #futa04-film-grain { background-size: 512px 512px; } }
@media (min-resolution: 3dppx) { #futa04-film-grain { background-size: 341.33px 341.33px; } }
/* ONE OPACITY EVERYWHERE (owner, 2026-10-16). There used to be a stronger in-match value
   (body:has(#game:not([hidden])) #futa04-film-grain { opacity: ... }) so the flecks stayed
   readable on the board. The owner asked for a single uniform value instead, so that rule is
   DELETED rather than left at the same number - one value, one place, nothing to drift. Do not
   reintroduce a per-screen bump. Lineage: .16 -> .141 -> .124 -> .085.
   NOTE: this stylesheet lives in a JS template literal, so never use backticks in these comments -
   they terminate the string and break the build. */
/* Ink is flat near-black paper: no grain at all. */
[data-theme='ink'] #futa04-film-grain { display: none; }
#futa04-board-backdrop { position: absolute; inset: 0; background: #000; opacity: .235; display: none; }
body:has(#game:not([hidden])) #futa04-board-backdrop { display: block; }
#futa04-outcome-light { position:absolute; inset:0; pointer-events:none; opacity:0; display:none; }
body:has(#game:not([hidden])) #futa04-outcome-light { display:block; }
#futa04-outcome-light[data-tone='good'] {
  background:radial-gradient(ellipse 59% 63% at 43% 53%,rgba(89,177,107,.19),rgba(63,119,76,.06) 50%,transparent 83%),
             radial-gradient(ellipse 35% 48% at 79% 73%,rgba(92,164,102,.09),transparent 82%);
}
#futa04-outcome-light[data-tone='bad'] {
  background:radial-gradient(ellipse 59% 63% at 43% 53%,rgba(188,79,61,.18),rgba(113,54,45,.06) 50%,transparent 83%),
             radial-gradient(ellipse 35% 48% at 79% 73%,rgba(164,77,54,.08),transparent 82%);
}
#futa04-map-rim { pointer-events: none; }
#board .hex-cell.normal.futa04-empty { filter: brightness(1.15); }
`;

export type OutcomeLight = { pulse: (tone: 'good' | 'bad', strength: number) => void; reset: () => void };
let mounted: OutcomeLight | null = null;

export function mountAtmosphere(): OutcomeLight {
  if (mounted) return mounted;
  const style = document.createElement('style');
  style.id = 'futa04-atmosphere-style';
  style.textContent = ATMOSPHERE_CSS;
  document.head.append(style);
  const grain = document.createElement('div');
  grain.id = 'futa04-film-grain';
  grain.setAttribute('aria-hidden', 'true');
  // The noise is a CSS background-image in ATMOSPHERE_CSS rather than a canvas painted here: it is
  // the same SVG the background grain used, so the film and the old background texture are visibly
  // identical, and there is nothing to build on mount.
  document.body.append(grain);
  // Keep the grain as the last body child so it stays above later fixed UI layers.
  // Debounce: body childList fires often during board/hand rebuilds.
  let pinGrainTimer = 0;
  const pinGrain = () => {
    if (!grain.isConnected || document.body.lastElementChild === grain) return;
    document.body.append(grain);
  };
  const schedulePinGrain = () => {
    if (pinGrainTimer) return;
    pinGrainTimer = window.setTimeout(() => { pinGrainTimer = 0; pinGrain(); }, 48);
  };
  pinGrain();
  new MutationObserver(schedulePinGrain).observe(document.body, { childList: true });
  const backdrop = document.createElement('div');
  backdrop.id = 'futa04-board-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const outcome = document.createElement('div');
  outcome.id = 'futa04-outcome-light';
  outcome.setAttribute('aria-hidden', 'true');
  document.getElementById('texture')?.append(backdrop,outcome);
  let running: Animation | null = null;
  let lastStart = 0;
  let lastStrength = 0;
  let reflectFrame = 0;
  mounted = {
    pulse(tone, strength) {
      if (document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const now = performance.now();
      if (now - lastStart < 380 && strength <= lastStrength) return;
      lastStart = now; lastStrength = strength;
      running?.cancel();
      outcome.dataset.tone = tone;
      const peak = Math.min(.82, Math.max(.22, strength * .75));
      running = outcome.animate([
        { opacity: 0, offset: 0 }, { opacity: peak, offset: .23 },
        { opacity: peak * .46, offset: .49 }, { opacity: 0, offset: 1 },
      ], { duration: 880, easing: 'cubic-bezier(.2,.55,.4,1)' });
      if (strength >= .68) {
        const panel = document.getElementById('smart-panel');
        if (panel) {
          cancelAnimationFrame(reflectFrame);
          panel.classList.remove('hardware-reflect');
          reflectFrame = requestAnimationFrame(() => panel.classList.add('hardware-reflect'));
        }
      }
    },
    reset() {
      running?.cancel(); running = null; lastStart = 0; lastStrength = 0;
      cancelAnimationFrame(reflectFrame);
      document.getElementById('smart-panel')?.classList.remove('hardware-reflect');
    },
  };

  const board = document.querySelector<SVGSVGElement>('#board');
  if (!board) return mounted;
  let signature = '';
  const rim = () => {
    const paths = [...board.querySelectorAll<SVGPathElement>('.l-base .hex-cell > .hex')];
    if (!paths.length) return;
    const shape = paths.map(path => path.getAttribute('d') ?? '').join(' ');
    if (shape === signature && board.querySelector('#futa04-map-rim')) return;
    const boxes = paths.map(path => path.getBBox());
    const pad = 24;
    const x = Math.min(...boxes.map(box => box.x)) - pad;
    const y = Math.min(...boxes.map(box => box.y)) - pad;
    const w = Math.max(...boxes.map(box => box.x + box.width)) - x + pad;
    const h = Math.max(...boxes.map(box => box.y + box.height)) - y + pad;
    const scale = Math.min(1, 1024 / Math.max(w, h));
    const mask = document.createElement('canvas');
    mask.width = Math.ceil(w * scale); mask.height = Math.ceil(h * scale);
    const m = mask.getContext('2d');
    const baked = document.createElement('canvas');
    baked.width = mask.width; baked.height = mask.height;
    const b = baked.getContext('2d');
    if (!m || !b) return;
    m.scale(scale, scale); m.translate(-x, -y);
    m.fillStyle = m.strokeStyle = '#fff'; m.lineWidth = 2;
    // Full cell polygons cover rounded artwork gaps. A connected map has one solid mask,
    // including concave/bridge shapes, so there can be no glowing internal hex seams.
    for (const path of paths) {
      const key = path.parentElement?.getAttribute('data-key');
      if (!key) continue;
      m.beginPath();
      cornerPts(key, S + 1).forEach(([px, py], index) => index ? m.lineTo(px, py) : m.moveTo(px, py));
      m.closePath(); m.fill(); m.stroke();
    }
    b.shadowBlur = 4 * scale; b.shadowColor = 'rgba(255,246,207,.16)';
    // Draw the source off-canvas and offset only its shadow back into view. This avoids
    // a white antialiased outline from the mask itself leaking into the glow.
    b.shadowOffsetX = mask.width + 32;
    b.drawImage(mask, -b.shadowOffsetX, 0);
    b.shadowOffsetX = 0; b.shadowBlur = 0; b.globalCompositeOperation = 'destination-out';
    b.drawImage(mask, 0, 0);
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.id = 'futa04-map-rim';
    image.setAttribute('aria-hidden', 'true');
    image.setAttribute('x', String(x)); image.setAttribute('y', String(y));
    image.setAttribute('width', String(w)); image.setAttribute('height', String(h));
    image.setAttribute('href', baked.toDataURL());
    board.querySelector('#futa04-map-rim')?.remove();
    board.insertBefore(image, board.querySelector('.l-base'));
    signature = shape;
  };
  // Setup replaces the SVG children. Moves only update later layers, never rebake the rim.
  new MutationObserver(rim).observe(board, { childList: true });
  rim();
  // Presentation follows actual rendered ownership. Classes never enter game/save state.
  const lightEmptyCells = () => {
    const occupied = new Set([...board.querySelectorAll('.tile[data-key]')].map(tile=>tile.getAttribute('data-key')));
    for (const cell of board.querySelectorAll('.l-base .hex-cell.normal'))
      cell.classList.toggle('futa04-empty', !occupied.has(cell.getAttribute('data-key')));
  };
  new MutationObserver(lightEmptyCells).observe(board, { childList: true, subtree: true });
  lightEmptyCells();
  return mounted;
}
