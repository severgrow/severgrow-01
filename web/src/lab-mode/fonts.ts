// The test copy's new type (loaded only in the test build): Bricolage Grotesque for display words
// and numbers, Figtree for UI text. Both SIL OFL, bundled (web/src/fonts/new, licences there),
// subset to the characters the game uses. The choice and the reasons: docs/DECISIONS.md.
// "Font: New / Previous" in the Lab sheet switches back to Alegreya Sans instantly.
import bricolage from '../fonts/new/bricolage-grotesque-wght.woff2?url';
import figtree from '../fonts/new/figtree-wght.woff2?url';

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
  pre.href = bricolage;
  document.head.append(pre);
  const css = document.createElement('style');
  css.id = 'font-new';
  css.textContent = `
@font-face { font-family: 'Bricolage Grotesque'; src: url('${bricolage}') format('woff2'); font-weight: 200 800; font-style: normal; font-display: swap; }
@font-face { font-family: 'Figtree'; src: url('${figtree}') format('woff2'); font-weight: 300 900; font-style: normal; font-display: swap; }
@font-face { font-family: 'Bricolage Fallback'; src: local('Arial'), local('Helvetica Neue'), local('Roboto'); size-adjust: 111%; ascent-override: 84%; descent-override: 24%; line-gap-override: 0%; }
@font-face { font-family: 'Figtree Fallback'; src: local('Arial'), local('Helvetica Neue'), local('Roboto'); size-adjust: 100%; ascent-override: 95%; descent-override: 25%; line-gap-override: 0%; }
html.font-new body {
  --font: 'Figtree', 'Figtree Fallback', system-ui, sans-serif;
  --font-display: 'Bricolage Grotesque', 'Bricolage Fallback', system-ui, sans-serif;
  --font-num: 'Bricolage Grotesque', 'Bricolage Fallback', system-ui, sans-serif;
  font-family: var(--font);
  font-size: 1rem; /* Alegreya Sans ran small (1.0625rem); Figtree is wider */
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
html.font-new .gm-scores b,
html.font-new .gm-turn b,
html.font-new .gameover h2,
html.font-new .banner,
html.font-new .step-cue {
  font-family: var(--font-display);
  letter-spacing: -0.005em;
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
