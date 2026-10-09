// Test2-only presentation. Both grain and rim are baked once; no live noise/blur filter,
// animation clock, gameplay input, state or per-frame drawing.
import { cornerPts, S } from '../ui/geom.js';
export const ATMOSPHERE_CSS = `
#test2-film-grain {
  position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;
  opacity: .12; background-repeat: repeat; background-size: 128px 128px;
  user-select: none;
}
#test2-board-backdrop { position: absolute; inset: 0; background: #000; opacity: .235; display: none; }
body:has(#game:not([hidden])) #test2-board-backdrop { display: block; }
#test2-outcome-light { position:absolute; inset:0; pointer-events:none; opacity:0; display:none; }
body:has(#game:not([hidden])) #test2-outcome-light { display:block; }
#test2-outcome-light[data-tone='good'] {
  background:radial-gradient(ellipse 59% 63% at 43% 53%,rgba(89,177,107,.19),rgba(63,119,76,.06) 50%,transparent 83%),
             radial-gradient(ellipse 35% 48% at 79% 73%,rgba(92,164,102,.09),transparent 82%);
}
#test2-outcome-light[data-tone='bad'] {
  background:radial-gradient(ellipse 59% 63% at 43% 53%,rgba(188,79,61,.18),rgba(113,54,45,.06) 50%,transparent 83%),
             radial-gradient(ellipse 35% 48% at 79% 73%,rgba(164,77,54,.08),transparent 82%);
}
#test2-map-rim { pointer-events: none; }
#board .hex-cell.normal.test2-empty { filter: brightness(1.15); }
`;

export type OutcomeLight = { pulse: (tone: 'good' | 'bad', strength: number) => void; reset: () => void };
let mounted: OutcomeLight | null = null;

export function mountAtmosphere(): OutcomeLight {
  if (mounted) return mounted;
  const style = document.createElement('style');
  style.id = 'test2-atmosphere-style';
  style.textContent = ATMOSPHERE_CSS;
  document.head.append(style);
  const grain = document.createElement('div');
  grain.id = 'test2-film-grain';
  grain.setAttribute('aria-hidden', 'true');
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const ctx = tile.getContext('2d');
  if (ctx) {
    const pixels = ctx.createImageData(128, 128);
    let seed = 0x46555441;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < pixels.data.length; i += 4) {
      // Fine dark flecks avoid the grey veil that would brighten the dark backdrop.
      const ink = Math.round((random() + random() + random()) * 255 / 3);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
      pixels.data[i + 3] = ink;
    }
    ctx.putImageData(pixels, 0, 0);
    grain.style.backgroundImage = `url(${tile.toDataURL()})`;
    document.body.append(grain);
  }
  const backdrop = document.createElement('div');
  backdrop.id = 'test2-board-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const outcome = document.createElement('div');
  outcome.id = 'test2-outcome-light';
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
    if (shape === signature && board.querySelector('#test2-map-rim')) return;
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
    image.id = 'test2-map-rim';
    image.setAttribute('aria-hidden', 'true');
    image.setAttribute('x', String(x)); image.setAttribute('y', String(y));
    image.setAttribute('width', String(w)); image.setAttribute('height', String(h));
    image.setAttribute('href', baked.toDataURL());
    board.querySelector('#test2-map-rim')?.remove();
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
      cell.classList.toggle('test2-empty', !occupied.has(cell.getAttribute('data-key')));
  };
  new MutationObserver(lightEmptyCells).observe(board, { childList: true, subtree: true });
  lightEmptyCells();
  return mounted;
}
