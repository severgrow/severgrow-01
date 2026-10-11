// Approved typography for Test and Futa04; legacy live keeps Alegreya Sans:
//   Besley (display / brand): the Futasaku wordmark, page and sheet titles, the result title, the
//     level selector's heading. About a tenth of the type; never interface copy or numbers.
//   Fragment Mono (UI / functional): everything else: buttons, the step plate, cards, labels,
//     tooltips, the coach, settings, body copy. Single weight (400); hierarchy via tracking/size.
//   Futasaku Numerals: tabular digits for scores, counts, card and tile numbers (unicode-range);
//     letters fall through to Fragment Mono.
// All SIL OFL, bundled in web/src/fonts/v2 (licences there). Scoped under
// <html class="test-typography-v2">. "Font: New / Previous" in the Lab switches Alegreya Sans.
import besley from '../fonts/v2/besley-wght.woff2?url';
import fragmentMono from '../fonts/v2/fragment-mono-latin-400-normal.woff2?url';
import numerals from '../fonts/v2/futasaku-numerals-700.woff2?url';

const KEY = 'severgrow-font';
export type FontChoice = 'new' | 'previous';

export const fontChoice = (): FontChoice => {
  try {
    return localStorage.getItem(KEY) === 'previous' ? 'previous' : 'new';
  } catch {
    return 'new';
  }
};

/** The scope class on <html>. */
export const TYPE_CLASS = 'test-typography-v2';

const T = `html.${TYPE_CLASS}`;
const CSS = `
/* fallbacks shaped like the real fonts (width, ascent, descent), so nothing jumps while they load */
@font-face { font-family: 'Besley Fallback'; src: local('Georgia'), local('Times New Roman'); size-adjust: 104%; ascent-override: 96%; descent-override: 28%; line-gap-override: 0%; }
@font-face { font-family: 'Fragment Mono Fallback'; src: local('ui-monospace'), local('SFMono-Regular'), local('Menlo'), local('Consolas'); size-adjust: 98%; ascent-override: 95%; descent-override: 25%; line-gap-override: 0%; }

/* ---------- tokens ---------- */
${T} body {
  --font-display: 'Besley', 'Besley Fallback', Georgia, serif;
  --font-ui: 'Fragment Mono', 'Fragment Mono Fallback', ui-monospace, monospace;
  --font-num: 'Futasaku Numerals', 'Fragment Mono', 'Fragment Mono Fallback', ui-monospace, monospace;
  --font: var(--font-ui);
  /* Fragment Mono ships only 400 — never faux-bold the UI face. */
  --w-ui-regular: 400;
  --w-ui-medium: 400;
  --w-ui-semibold: 400;
  --w-ui-strong: 400;
  --w-ui-bold: 400;
  --w-display: 700;
  --w-brand: 800;
  --lh-brand: 0.92;
  --lh-display: 1;
  --lh-heading: 1.1;
  --lh-control: 1.15;
  --lh-body: 1.48;
  --lh-small: 1.3;
  --track-brand: -0.03em;
  --track-heading: -0.012em;
  --track-action: 0.02em;
  --track-caps: 0.08em;
  --w-text: var(--w-ui-regular);
  --w-num: 700;
  font-family: var(--font-ui);
  font-weight: var(--w-ui-regular);
  font-size: 0.95rem;
  line-height: var(--lh-body);
  font-kerning: normal;
  font-synthesis: none;
  font-variant-numeric: tabular-nums lining-nums;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ---------- Besley: the voice of the game (titles only) ---------- */
${T} .title {
  font-family: var(--font-display);
  font-weight: var(--w-brand);
  text-transform: uppercase;
  letter-spacing: var(--track-brand);
  line-height: var(--lh-brand);
  font-size: clamp(2.5rem, 7.5vw + 0.9rem, 4.25rem);
}
${T} .levels-head h2,
${T} .sheet-head h2,
${T} .gameover .go-title,
${T} .lab h1,
${T} .lab-sheet h2,
${T} #sheet-lab h2 {
  font-family: var(--font-display);
  font-weight: var(--w-display);
  letter-spacing: var(--track-heading);
  line-height: var(--lh-heading);
}
${T} .gameover .go-title {
  font-weight: var(--w-brand);
  line-height: var(--lh-display);
  letter-spacing: -0.02em;
  font-size: clamp(1.75rem, 3.6vw + 1rem, 3rem);
  text-wrap: balance;
}
${T} .levels-head h2 {
  font-size: clamp(1.45rem, 2.4vw + 0.9rem, 2rem);
  padding-top: 0.04em;
}

/* ---------- Fragment Mono: the interface ---------- */
${T} .tagline {
  font-weight: var(--w-ui-regular);
  line-height: 1.5;
  letter-spacing: 0.012em;
}
/* Menu / difficulty / pause: CAPS labels in the cream frames (tracking + optical padding). */
${T} #menu .menu-buttons .btn,
${T} #levels .level-grid .difficulty-tile,
${T} #sheet-menu .sheet-body > .btn {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  line-height: 1.2;
  letter-spacing: 0.06em;
  padding-top: 1px;
  text-transform: uppercase;
}
${T} .btn,
${T} button.seg-btn {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  line-height: var(--lh-control);
  letter-spacing: 0.02em;
}
${T} .btn.big,
${T} .btn.primary {
  font-weight: var(--w-ui-strong);
  letter-spacing: 0.03em;
}
${T} .btn.link {
  font-weight: var(--w-ui-medium);
}
${T} .moves .btn {
  font-weight: var(--w-ui-strong);
  letter-spacing: 0.025em;
}
${T} .sheet h3 {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  text-transform: uppercase;
  letter-spacing: var(--track-caps);
  font-size: 0.72rem;
  line-height: var(--lh-small);
}
${T} .sheet-body,
${T} .prose,
${T} .coach,
${T} .first-tip,
${T} .tooltip {
  line-height: var(--lh-body);
  letter-spacing: 0.005em;
}
${T} .prose b,
${T} .coach b,
${T} .tooltip b {
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.02em;
}
${T} .muted.small,
${T} .small {
  line-height: var(--lh-small);
}
${T} .cue-text {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.04em;
  font-size: 15.5px;
}
${T} .cue-kicker {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  letter-spacing: 0.14em;
}
${T} .turn b,
${T} .gm-turn b {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.02em;
  line-height: 1.1;
}
${T} .turn small,
${T} .gm-turn small {
  font-weight: var(--w-ui-medium);
  letter-spacing: 0.01em;
}
${T} .banner {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.03em;
}
${T} .pile-label {
  font-weight: var(--w-ui-medium);
  letter-spacing: 0.02em;
  line-height: 1.2;
}
${T} .lt-name {
  font-weight: var(--w-ui-semibold);
  letter-spacing: 0.015em;
  line-height: 1.15;
}

/* ---------- numbers: tabular, steady ---------- */
${T} .num,
${T} .tile-num,
${T} .ghost-num,
${T} .c-num,
${T} .pile-count,
${T} .go-score,
${T} .badge,
${T} .gm-scores b {
  font-family: var(--font-num);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: var(--w-num);
}
${T} .c-num {
  line-height: 1;
  letter-spacing: -0.01em;
}
${T} .pile-count {
  line-height: 1;
}
/* tile numbers: Futasaku Numerals optical centre (unchanged plate geometry) */
${T} .tile-num {
  font-weight: var(--w-num);
  letter-spacing: 0;
  transform: translateY(0.087em);
}
`;

let installed = false;
/** The @font-face rules, the role rules and a preload of the interface font. */
export const installFonts = () => {
  if (installed) return;
  installed = true;
  for (const href of [fragmentMono, numerals, besley]) {
    const pre = document.createElement('link');
    pre.rel = 'preload';
    pre.as = 'font';
    pre.type = 'font/woff2';
    pre.crossOrigin = 'anonymous';
    pre.href = href;
    document.head.append(pre);
  }
  const css = document.createElement('style');
  css.id = 'typography-v2';
  css.textContent = CSS;
  document.head.append(css);
};

/** Applies the choice (new: Besley + Fragment Mono; previous: the theme's Alegreya Sans). */
export const applyFont = (c: FontChoice = fontChoice()) => {
  if (c === 'new') installFonts();
  document.documentElement.classList.toggle(TYPE_CLASS, c === 'new');
};

export const setFont = (c: FontChoice) => {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked: lasts until reload */
  }
  applyFont(c);
};
