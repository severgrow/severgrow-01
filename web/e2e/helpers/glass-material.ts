// ONE definition of the game's dark-glass window, read from the live DOM.
//
// Source of truth, web/src/style.css `:root`:
//   --dark-glass: rgba(8, 10, 10, 0.42);
//   --dark-glass-blur: blur(9px) saturate(1.05);
// and the last word on its edge, the "NO FRAME AROUND THE GLASS" rule further down that file:
// border 0, the family's 15px corner and one soft drop shadow — nothing drawn along an edge.
//
// Those are the values the pause plate (#sheet-menu), the Match Intel / lesson window
// (web/src/player/glass-surface.ts `#futasaku-glass`), the finish plate and every submenu sheet
// already wear. The Territory challenge card and the profile sheet did NOT: the challenge card had
// its own opaque material and a 1px outline, the profile sheet an alpha-0.982 plate and a 32px
// corner. Both suites below compare against THIS object, so "the two dialogs share one material" is
// asserted against one set of numbers rather than two sets that could drift together.
//
// The check is the honest one for this family: the glass family's own rule is border 0 and no
// outline (there is no "shared hairline" in the product's glass — a hairline frame is exactly what
// the owner rejected), so a nonzero border or a drawn outline is a failure, not a tolerance.
import type { Page } from 'playwright-core';

export const GLASS = Object.freeze({
  background: 'rgba(8, 10, 10, 0.42)',
  backdrop: 'blur(9px) saturate(1.05)',
  radius: '15px',
  shadow: 'rgba(0, 0, 0, 0.22) 0px 10px 28px 0px',
  border: '0px',
  outline: 'none',
});

export type Material = {
  /** `backgroundColor` as the browser computes it. */
  background: string;
  /** `backdropFilter` (or its -webkit alias) as the browser computes it. */
  backdrop: string;
  /** All four corners, e.g. `15px 15px 15px 15px`. */
  radius: string;
  shadow: string;
  /** `border-<side>-width` for top / right / bottom / left. */
  borders: string[];
  outline: string;
};

/** Read the settled material of ONE element. Call it after the surface's arrival has finished. */
export const readMaterial = async (page: Page, selector: string): Promise<Material | null> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      backdrop: cs.backdropFilter || 'none',
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
      shadow: cs.boxShadow,
      borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      outline: `${cs.outlineStyle} ${cs.outlineWidth}` === 'none 0px' ? 'none' : `${cs.outlineStyle} ${cs.outlineWidth}`,
    };
  }, selector);

/** Every way `m` departs from the game's one glass window. Empty means it wears the family material. */
export const materialMismatches = (m: Material | null): string[] => {
  if (!m) return ['the surface is not in the DOM'];
  const out: string[] = [];
  if (m.background !== GLASS.background) out.push(`background ${m.background}`);
  if (m.backdrop !== GLASS.backdrop) out.push(`backdrop ${m.backdrop}`);
  if (m.radius !== `${GLASS.radius} ${GLASS.radius} ${GLASS.radius} ${GLASS.radius}`) out.push(`radius ${m.radius}`);
  if (m.shadow !== GLASS.shadow) out.push(`shadow ${m.shadow}`);
  if (m.borders.some((w) => w !== GLASS.border)) out.push(`border ${m.borders.join('/')}`);
  if (m.outline !== GLASS.outline) out.push(`outline ${m.outline}`);
  return out;
};

/**
 * THE EDGE, IN PIXELS. A window can be given a frame by something other than its own `border`: an
 * inset box-shadow, a `::before` hairline, an image. `getComputedStyle` cannot see those, so this
 * samples the RENDERED pixels across the surface's left edge at its mid-height and reports how much
 * the ground varies column to column (device pixels, 4 CSS px either side of the edge). A stroked
 * edge is a bright spike; the glass family's edge is a step of tone and nothing else.
 */
export const edgeStrokeSpread = async (
  page: Page,
  selector: string,
): Promise<{ spread: number; columns: number[] } | null> => {
  const box = (await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, h: r.height };
  })()`)) as { x: number; y: number; h: number } | null;
  if (!box) return null;
  const png = await page.screenshot({
    clip: {
      x: Math.max(0, box.x - 4),
      y: Math.max(0, box.y + box.h / 2 - 3),
      width: 12,
      height: 6,
    },
  });
  const url = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(url)};
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height);
    const columns = [];
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      columns.push(+(sum / height).toFixed(2));
    }
    return { spread: +(Math.max(...columns) - Math.min(...columns)).toFixed(2), columns };
  })()`) as Promise<{ spread: number; columns: number[] }>;
};
