// THE MENU'S LOCKUP ON THE PLANET (owner, 2026-11-04: "change logo to kanji with no tree, have FUTASAKU
// below it with exactly the same width under it with specified margin and have the globe around it
// ... The logo grouped perfectly centered in the sphere").
//
// The kanji moves into the menu's stack, directly above the FUTASAKU wordmark, and is sized to the
// wordmark's own ink width — measured, so the two always end at the same left and right edge,
// whatever the font, the screen or the text size. The gap between them is a fixed share of that
// width. The planet module reads `lockupBox()` and centres its globe on the pair.
const GAP_SHARE = .075;
const CSS = `
html.planet-lockup #menu .menu-stack > #logo {
  flex: none; display: block !important; width: var(--lockup-w, 52vw) !important; max-width: none;
  margin: 0 auto calc(var(--lockup-w, 52vw) * ${GAP_SHARE}) !important;
}
/* Shadowed PAINT mark is 316×110 (3× of the owner pad box) — do not stretch into 300/94. */
html.planet-lockup #menu .menu-stack > #logo { height: auto !important; aspect-ratio: 316 / 110 !important; min-height: 0 !important; }
html.planet-lockup #menu .menu-stack > #logo :is(svg, img) {
  display: block; width: 100% !important; height: auto !important; image-rendering: auto;
}
`;

/** The wordmark's INK box (viewport px): its glyphs, not its line box or its centred element. */
const inkBox = (title: HTMLElement): DOMRect => {
  const text = title.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return title.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(text);
  const box = range.getBoundingClientRect();
  // The advance width carries the last letter's letter-spacing too; the ink does not.
  const spacing = parseFloat(getComputedStyle(title).letterSpacing) || 0;
  return new DOMRect(box.left, box.top, Math.max(0, box.width - spacing), box.height);
};

/** The globe's radius behind the menu (px): it encloses the logo group, never wider than the screen. */
export const menuDiscRadius = (box: { width: number; height: number }, width: number, height: number): number =>
  Math.min(Math.hypot(box.width, box.height) / 2 * 1.12, Math.min(width, height) * .49);

/** Keep the menu this far inside the screen even when the group is taller than it. */
const EDGE = 8;

/** The logo and its wordmark as one box (viewport px), or null when the menu is not laid out. */
export const lockupBox = (): DOMRect | null => {
  const logo = document.getElementById('logo'), title = document.querySelector<HTMLElement>('#menu .title');
  if (!logo || !title) return null;
  const a = logo.getBoundingClientRect(), b = inkBox(title);
  if (!a.width || !b.width) return null;
  const left = Math.min(a.left, b.left), right = Math.max(a.right, b.right);
  const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
};

export const mountPlanetLockup = (): void => {
  const logo = document.getElementById('logo');
  const stack = document.querySelector<HTMLElement>('#menu .menu-stack');
  const title = document.querySelector<HTMLElement>('#menu .title');
  if (!logo || !stack || !title) return;
  if (!document.getElementById('planet-lockup-css')) {
    const style = document.createElement('style');
    style.id = 'planet-lockup-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  document.documentElement.classList.add('planet-lockup');
  if (logo.parentElement !== stack) stack.insertBefore(logo, title);
  // Same width as the wordmark's ink, and over the same left/right edges: the ink may sit a little
  // off its element's centre (letter-spacing, side bearings), so the kanji follows the ink.
  const fit = () => {
    const box = inkBox(title);
    if (!(box.width > 0)) return;
    logo.style.setProperty('--lockup-w', `${box.width.toFixed(2)}px`);
    logo.style.translate = '0 0';
    const at = logo.getBoundingClientRect();
    const shift = box.left - at.left;
    logo.style.translate = `${shift.toFixed(2)}px 0`;
  };
  // THE WHOLE GROUP SITS IN THE MIDDLE (owner, 2026-11-04: "There should be the same amount of space on
  // top and bottom, so logo together with the buttons and globe should be centered vertically too").
  // The group runs from the globe's top edge to the lowest key; the column moves by one translate so
  // the space above it equals the space below. The globe follows, since it is centred on the lockup.
  // The keys never leave the screen: on a short screen the globe may run past an edge instead.
  const inner = stack.closest<HTMLElement>('.menu-inner');
  let shift = 0;
  const centre = () => {
    const box = lockupBox();
    if (!inner || !box) return;
    const keys = [...stack.querySelectorAll<HTMLElement>('*')].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0 && r.width > 0);
    if (!keys.length) return;
    // Everything is measured where it would be with no shift.
    const vh = window.innerHeight, cy = box.top + box.height / 2 - shift, r = menuDiscRadius(box, window.innerWidth, vh);
    const contentTop = Math.min(box.top, ...keys.map((k) => k.top)) - shift, contentBottom = Math.max(...keys.map((k) => k.bottom)) - shift;
    const top = Math.min(cy - r, contentTop), bottom = Math.max(cy + r, contentBottom);
    let next = (vh - bottom - top) / 2;
    next = Math.max(EDGE - contentTop, Math.min(vh - EDGE - contentBottom, next));
    if (!Number.isFinite(next) || Math.abs(next - shift) < .5) return;
    shift = next;
    inner.style.translate = `0 ${shift.toFixed(1)}px`;
  };
  const both = () => { fit(); centre(); };
  both();
  window.addEventListener('resize', both, { passive: true });
  void document.fonts?.ready.then(both);
  const watch = new ResizeObserver(both);
  watch.observe(title);
  watch.observe(stack);
};
