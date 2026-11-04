// THE PLANET, INTRODUCED AT THE END OF THE LESSONS (owner, 2026-11-04: "at the end of the level 10,
// over the end of game screen there should be a lesson window popped up explaining THE PLANET ...
// and a button that takes you to the planet").
//
// One small window over the won level 10 card: what the Planet is, what Seeds do there, why holding
// land matters, and the way in. It sits INSIDE the finish dialog, so the dialog's own hiding hides
// it too and it can never outlive the card. One finite entrance (the shared surface motion), no
// loop, no timer once shown. LATER leaves the card exactly as it was, with its own key to the Planet.
import { enterSurface, exitSurface, interfaceMotionAllowed } from '../ui/interface-motion.js';
import { PLANET_INTRO } from '../online/seed-icon.js';

/** The win lands first; then the window. Long enough to read the result, short enough to feel tied to it. */
export const PLANET_INTRO_DELAY_MS = 900;

const CSS = `
#planet-intro {
  position: absolute; inset: 0; z-index: 20; display: grid; place-items: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  background: color-mix(in srgb, #07090a 62%, transparent);
}
#planet-intro[hidden] { display: none; }
#planet-intro .pi-panel {
  position: relative; width: min(360px, 100%); box-sizing: border-box; text-align: center;
  padding: 26px 22px 18px; border-radius: 18px;
  background: color-mix(in srgb, var(--c-surface, #232425) 92%, #07090a);
  border: 1px solid #e8ddc52e;
  box-shadow: 0 18px 48px #000a, inset 0 1px 0 #ffffff0d;
}
#planet-intro .pi-globe { display: block; width: 76px; height: 76px; margin: 0 auto 14px; overflow: visible; }
#planet-intro .pi-eyebrow {
  margin: 0 0 6px; font-family: var(--font-ui); font-size: var(--instrument-label-size, .6875rem);
  letter-spacing: .22em; text-transform: uppercase; color: var(--instrument-muted, #e8ddc5b3);
}
#planet-intro .pi-title {
  margin: 0 0 14px; font-family: var(--font-display, inherit); font-size: 1.55rem; line-height: 1.1;
  letter-spacing: .12em; color: #f2e5c5;
}
#planet-intro .pi-lines { margin: 0 0 20px; padding: 0; list-style: none; display: grid; gap: 9px; }
#planet-intro .pi-lines li {
  font-family: var(--font-ui); font-size: .9rem; line-height: 1.45; color: var(--c-text, #eeebe4);
  text-wrap: balance;
}
#planet-intro .pi-lines li:first-child { color: var(--c-text, #eeebe4); }
#planet-intro .pi-lines li + li { color: #e8ddc5cc; }
#planet-intro .pi-keys { display: grid; gap: 8px; }
#planet-intro .pi-keys .btn { width: 100%; min-height: 48px; margin: 0; text-transform: uppercase; letter-spacing: .16em; }
html.large-text #planet-intro .pi-lines li { font-size: 1.02rem; }
@media (max-height: 520px) {
  #planet-intro .pi-panel { padding: 16px 18px 12px; }
  #planet-intro .pi-globe { width: 48px; height: 48px; margin-bottom: 8px; }
  #planet-intro .pi-title { margin-bottom: 8px; }
  #planet-intro .pi-lines { margin-bottom: 12px; gap: 5px; }
  #planet-intro .pi-keys { grid-template-columns: 1fr 1fr; }
}
`;

/** A small planet: the menu's globe in miniature, a halo, the lit side, and a cluster of grown tiles. */
const GLOBE = (() => {
  const hex = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a) * .86).toFixed(2)}`;
    });
    return pts.join(' ');
  };
  // A small holding seen on the curve: three tiles lit, two around them faint.
  const tiles = [
    [33, 34, 'pi-own'], [41.4, 34, 'pi-own'], [37.2, 41.2, 'pi-own'], [45.6, 41.2, 'pi-ring'], [29, 41.2, 'pi-ring'], [37.2, 26.8, 'pi-ring'],
  ] as const;
  return `<svg class="pi-globe" viewBox="0 0 76 76" aria-hidden="true">
  <defs>
    <radialGradient id="pi-body" cx="34%" cy="30%" r="78%">
      <stop offset="0" stop-color="#3a3f3a"/><stop offset=".55" stop-color="#1b1e1c"/><stop offset="1" stop-color="#0b0d0c"/>
    </radialGradient>
    <radialGradient id="pi-halo" r="50%"><stop offset=".74" stop-color="#e8ddc5" stop-opacity=".3"/><stop offset="1" stop-color="#e8ddc5" stop-opacity="0"/></radialGradient>
    <clipPath id="pi-clip"><circle cx="38" cy="38" r="27"/></clipPath>
  </defs>
  <circle cx="38" cy="38" r="35" fill="url(#pi-halo)"/>
  <circle cx="38" cy="38" r="27" fill="url(#pi-body)"/>
  <g clip-path="url(#pi-clip)">
    ${tiles.map(([x, y, c]) => `<polygon class="${c}" points="${hex(x, y, 4.6)}"/>`).join('')}
  </g>
  <circle cx="38" cy="38" r="27" fill="none" stroke="#e8ddc5" stroke-opacity=".28" stroke-width=".8"/>
  <style>.pi-own{fill:#8fc9a3;stroke:#0b0d0c;stroke-width:.7}.pi-ring{fill:#3b413c;stroke:#0b0d0c;stroke-width:.7}</style>
</svg>`;
})();

export type PlanetIntro = {
  /** Show the window over the finish card (after the short beat). Calling it again while up does nothing. */
  show: () => void;
  /** Take it down at once (the card is going away). */
  hide: () => void;
  readonly open: boolean;
};

/**
 * Mount the window inside `host` (the finish dialog). `onOpen` takes the player to the Planet; the
 * window has already closed itself by then. Focus goes to OPEN THE PLANET on show and back to the
 * card's lead key on LATER.
 */
export const mountPlanetIntro = (host: HTMLElement, hooks: { onOpen: () => void; returnFocus: () => HTMLElement | null }): PlanetIntro => {
  if (!document.getElementById('planet-intro-css')) {
    const style = document.createElement('style');
    style.id = 'planet-intro-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.id = 'planet-intro';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'planet-intro-title');
  root.setAttribute('aria-describedby', 'planet-intro-lines');
  root.innerHTML = `<div class="pi-panel" data-ix-surface>
  ${GLOBE}
  <p class="pi-eyebrow"></p>
  <h2 id="planet-intro-title" class="pi-title"></h2>
  <ul id="planet-intro-lines" class="pi-lines"></ul>
  <div class="pi-keys">
    <button id="planet-intro-open" class="btn primary" type="button"></button>
    <button id="planet-intro-later" class="btn ghost" type="button"></button>
  </div>
</div>`;
  root.querySelector('.pi-eyebrow')!.textContent = PLANET_INTRO.eyebrow;
  root.querySelector('.pi-title')!.textContent = PLANET_INTRO.title;
  const list = root.querySelector('.pi-lines')!;
  for (const line of PLANET_INTRO.lines) { const li = document.createElement('li'); li.textContent = line; list.append(li); }
  const openKey = root.querySelector<HTMLButtonElement>('#planet-intro-open')!;
  const laterKey = root.querySelector<HTMLButtonElement>('#planet-intro-later')!;
  openKey.textContent = PLANET_INTRO.open;
  laterKey.textContent = PLANET_INTRO.later;
  host.append(root);
  const panel = root.querySelector<HTMLElement>('.pi-panel')!;
  let timer = 0, up = false;

  const close = (then?: () => void) => {
    window.clearTimeout(timer); timer = 0;
    if (!up) { then?.(); return; }
    up = false;
    exitSurface(panel, { onDone: () => { root.hidden = true; } });
    if (!interfaceMotionAllowed()) root.hidden = true;
    then?.();
  };
  openKey.addEventListener('click', () => close(hooks.onOpen));
  laterKey.addEventListener('click', () => close(() => hooks.returnFocus()?.focus({ preventScroll: true })));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); laterKey.click(); return; }
    // Focus stays inside the window while it is up.
    if (e.key === 'Tab') {
      const first = openKey, last = laterKey;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return {
    show() {
      if (up || timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (host.hidden) return;
        up = true;
        root.hidden = false;
        enterSurface(panel);
        openKey.focus({ preventScroll: true });
      }, interfaceMotionAllowed() ? PLANET_INTRO_DELAY_MS : 0);
    },
    hide() {
      window.clearTimeout(timer); timer = 0;
      up = false;
      root.hidden = true;
    },
    get open() { return up; },
  };
};
