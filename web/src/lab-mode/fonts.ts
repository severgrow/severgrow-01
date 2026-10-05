// The test copy's new type (loaded only in the test build): Fraunces (soft, display words: the
// step plate, headings, the turn) and Plus Jakarta Sans (UI text and every number). Both SIL OFL, bundled (web/src/fonts/new, licences there),
// subset to the characters the game uses. The choice and the reasons: docs/DECISIONS.md.
// "Font: New / Previous" in the Lab sheet switches back to Alegreya Sans instantly.
import fraunces from '../fonts/new/fraunces-soft-wght.woff2?url';
import jakarta from '../fonts/new/plus-jakarta-sans-wght.woff2?url';

const KEY = 'severgrow-font';
export type FontChoice = 'new' | 'previous';

export const fontChoice = (): FontChoice => {
  try {
    return localStorage.getItem(KEY) === 'previous' ? 'previous' : 'new';
  } catch {
    return 'new';
  }
};

let installed = false;
/** The @font-face rules, the metric-matched fallbacks (nothing jumps while loading) and a preload. */
export const installFonts = () => {
  if (installed) return;
  installed = true;
  const pre = document.createElement('link');
  pre.rel = 'preload';
  pre.as = 'font';
  pre.type = 'font/woff2';
  pre.crossOrigin = 'anonymous';
  pre.href = jakarta;
  document.head.append(pre);
  const css = document.createElement('style');
  css.id = 'font-new';
  css.textContent = `
@font-face { font-family: 'Fraunces Soft'; src: url('${fraunces}') format('woff2'); font-weight: 400 800; font-style: normal; font-display: swap; }
@font-face { font-family: 'Plus Jakarta Sans'; src: url('${jakarta}') format('woff2'); font-weight: 200 800; font-style: normal; font-display: swap; }
@font-face { font-family: 'Fraunces Fallback'; src: local('Georgia'), local('Times New Roman'); size-adjust: 103%; ascent-override: 95%; descent-override: 25%; line-gap-override: 0%; }
@font-face { font-family: 'Jakarta Fallback'; src: local('Arial'), local('Helvetica Neue'), local('Roboto'); size-adjust: 105%; ascent-override: 99%; descent-override: 21%; line-gap-override: 0%; }
html.font-new body {
  --font: 'Plus Jakarta Sans', 'Jakarta Fallback', system-ui, sans-serif;
  --font-display: 'Fraunces Soft', 'Fraunces Fallback', Georgia, serif;
  --font-num: 'Plus Jakarta Sans', 'Jakarta Fallback', system-ui, sans-serif;
  font-family: var(--font);
  font-size: 0.97rem; /* Alegreya Sans ran small (1.0625rem); Plus Jakarta Sans is wider */
}
html.font-new .num,
html.font-new .tile-num,
html.font-new .ghost-num,
html.font-new .card .n,
html.font-new .card-num,
html.font-new .pile-count,
html.font-new .badge {
  font-family: var(--font-num);
  font-variant-numeric: lining-nums tabular-nums;
  font-feature-settings: 'tnum' 1, 'lnum' 1;
}
html.font-new h1,
html.font-new h2,
html.font-new .turn b,
html.font-new .gm-turn b,
html.font-new .gameover h2,
html.font-new .banner,
html.font-new .cue-text {
  font-family: var(--font-display);
  font-weight: 650;
  letter-spacing: 0;
}
`;
  document.head.append(css);
};

/** Applies the choice (new: the bundled pair; previous: the theme's Alegreya Sans). */
export const applyFont = (c: FontChoice = fontChoice()) => {
  if (c === 'new') installFonts();
  document.documentElement.classList.toggle('font-new', c === 'new');
};

export const setFont = (c: FontChoice) => {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked: lasts until reload */
  }
  applyFont(c);
};
