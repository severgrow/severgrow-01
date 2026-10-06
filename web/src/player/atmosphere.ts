// Test2-only presentation. Both grain and rim are baked once; no live noise/blur filter,
// animation clock, gameplay input, state or per-frame drawing.
export const ATMOSPHERE_CSS = `
#test2-film-grain {
  position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;
  opacity: .04; background-repeat: repeat; background-size: 128px 128px;
  user-select: none;
}
#test2-board-backdrop { position: absolute; inset: 0; background: #000; opacity: .10; display: none; }
body:has(#game:not([hidden])) #test2-board-backdrop { display: block; }
#test2-map-rim { pointer-events: none; }
`;

export function mountAtmosphere() {
  if (document.getElementById('test2-film-grain')) return;
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
      // A centred bell-like distribution: neutral fine grain, never coloured flecks.
      const ink = Math.round((random() + random() + random()) * 255 / 3);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = ink;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    grain.style.backgroundImage = `url(${tile.toDataURL()})`;
    document.body.append(grain);
  }
  const backdrop = document.createElement('div');
  backdrop.id = 'test2-board-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.getElementById('texture')?.append(backdrop);

  const board = document.querySelector<SVGSVGElement>('#board');
  if (!board) return;
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
    m.fillStyle = m.strokeStyle = '#fff'; m.lineWidth = 3;
    // Fill the narrow hex gaps into one silhouette; only its outer contour emits light.
    for (const path of paths) { const p = new Path2D(path.getAttribute('d')!); m.fill(p); m.stroke(p); }
    b.shadowBlur = 12 * scale; b.shadowColor = 'rgba(255,246,207,.36)';
    b.drawImage(mask, 0, 0);
    b.shadowBlur = 0; b.globalCompositeOperation = 'destination-out';
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
}
