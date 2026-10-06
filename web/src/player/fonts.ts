// Approved typography v2 for Test and Test2; legacy live keeps Alegreya Sans:
//   Besley (display / brand): the Futasaku wordmark, page and sheet titles, the result title, the
//     level selector's heading. About a tenth of the type; never interface copy or numbers.
//   Commissioner (UI / functional): everything else: buttons, the step plate, cards, labels,
//     tooltips, the coach, settings, body copy.
//   Futasaku Numerals: Commissioner Bold's digits made tabular (equal widths, centred), so scores,
//     counts, card and tile numbers never shift (Commissioner has no tabular figures). It covers
//     only digits and a few signs (unicode-range); letters fall through to Commissioner.
// All SIL OFL, bundled in web/src/fonts/v2 (licences there), subset to the characters the game
// uses, hinting kept. Everything is scoped under <html class="test-typography-v2">.
// "Font: New / Previous" in the Lab sheet switches back to Alegreya Sans instantly.
import besley from '../fonts/v2/besley-wght.woff2?url';
import commissioner from '../fonts/v2/commissioner-wght.woff2?url';
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
@font-face { font-family: 'Besley'; src: url('${besley}') format('woff2'); font-weight: 600 800; font-style: normal; font-display: swap; }
@font-face { font-family: 'Commissioner'; src: url('${commissioner}') format('woff2'); font-weight: 400 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'Futasaku Numerals'; src: url('${numerals}') format('woff2'); font-weight: 400 800; font-style: normal; font-display: swap; unicode-range: U+0030-0039, U+002B-002F, U+0025, U+003A, U+00D7, U+2212; }
/* fallbacks shaped like the real fonts (width, ascent, descent), so nothing jumps while they load */
@font-face { font-family: 'Besley Fallback'; src: local('Georgia'), local('Times New Roman'); size-adjust: 104%; ascent-override: 96%; descent-override: 28%; line-gap-override: 0%; }
@font-face { font-family: 'Commissioner Fallback'; src: local('Arial'), local('Helvetica Neue'), local('Roboto'); size-adjust: 100%; ascent-override: 98%; descent-override: 21%; line-gap-override: 0%; }

/* ---------- tokens ---------- */
${T} body {
  --font-display: 'Besley', 'Besley Fallback', Georgia, serif;
  --font-ui: 'Commissioner', 'Commissioner Fallback', system-ui, sans-serif;
  --font-num: 'Futasaku Numerals', 'Commissioner', 'Commissioner Fallback', system-ui, sans-serif;
  --font: var(--font-ui);
  --w-ui-regular: 460;
  --w-ui-medium: 530;
  --w-ui-semibold: 600;
  --w-ui-strong: 660;
  --w-ui-bold: 700;
  --w-display: 700;
  --w-brand: 800;
  --lh-brand: 0.92;
  --lh-display: 1;
  --lh-heading: 1.1;
  --lh-control: 1;
  --lh-body: 1.42;
  --lh-small: 1.2;
  --track-brand: -0.03em;
  --track-heading: -0.012em;
  --track-action: 0.035em;
  --track-caps: 0.09em;
  /* the theme's weight tokens, mapped onto the new scale */
  --w-text: var(--w-ui-regular);
  --w-num: var(--w-ui-bold);
  font-family: var(--font-ui);
  font-weight: var(--w-ui-regular);
  font-size: 1rem; /* Alegreya Sans ran small (1.0625rem); Commissioner sits a little larger */
  line-height: var(--lh-body);
  font-kerning: normal;
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
${T} .welcome-title,
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
  text-wrap: balance; /* never a lone "7!" on the second line */
}
${T} .welcome-title {
  display: block;
  font-size: 1.2rem;
  margin-bottom: 2px;
}
${T} .levels-head h2 {
  font-size: clamp(1.45rem, 2.4vw + 0.9rem, 2rem);
}

/* ---------- Commissioner: the interface ---------- */
${T} .tagline {
  font-weight: var(--w-ui-regular);
  line-height: 1.4;
  letter-spacing: 0.002em;
}
${T} .btn,
${T} button.seg-btn {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  line-height: var(--lh-control);
  letter-spacing: 0.005em;
}
${T} .btn.big,
${T} .btn.primary {
  font-weight: var(--w-ui-strong);
}
${T} .btn.link {
  font-weight: var(--w-ui-medium);
}
/* the move buttons beside the hand (Bloom, Sprout, Strengthen, Fruit, Skip): action weight */
${T} .moves .btn {
  font-weight: var(--w-ui-strong);
  letter-spacing: 0.01em;
}
/* the sheets' section labels (Look, Sound and feel ...): small caps labels, not headings */
${T} .sheet h3 {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  text-transform: uppercase;
  letter-spacing: var(--track-caps);
  font-size: 0.74rem;
  line-height: var(--lh-small);
}
${T} .sheet-body,
${T} .prose,
${T} .coach,
${T} .first-tip,
${T} .welcome,
${T} .tooltip {
  line-height: var(--lh-body);
}
${T} .prose b,
${T} .coach b,
${T} .tooltip b {
  font-weight: var(--w-ui-bold);
}
${T} .muted.small,
${T} .small {
  line-height: var(--lh-small);
}
/* the step plate: DRAW / GROW / THROW in the action voice */
${T} .cue-text {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.01em;
  font-size: 16.5px;
}
${T} .cue-kicker {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-semibold);
  letter-spacing: 0.15em;
}
/* the turn in the menu (and the old header pill, if shown) */
${T} .turn b,
${T} .gm-turn b {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.01em;
  line-height: 1.05;
}
${T} .turn small,
${T} .gm-turn small {
  font-weight: var(--w-ui-medium);
}
${T} .banner {
  font-family: var(--font-ui);
  font-weight: var(--w-ui-bold);
  letter-spacing: 0.02em;
}
/* the piles' labels and the level names */
${T} .pile-label {
  font-weight: var(--w-ui-medium);
  letter-spacing: 0.01em;
  line-height: 1.15;
}
${T} .lt-name {
  font-weight: var(--w-ui-semibold);
  letter-spacing: 0.005em;
  line-height: 1.1;
}

/* ---------- numbers: tabular, steady ---------- */
${T} .num,
${T} .tile-num,
${T} .ghost-num,
${T} .c-num,
${T} .pile-count,
${T} .lt-num,
${T} .lt-wins,
${T} .go-score,
${T} .badge,
${T} .gm-scores b {
  font-family: var(--font-num);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: var(--w-ui-bold);
}
${T} .c-num {
  line-height: 1;
  letter-spacing: -0.01em;
}
${T} .pile-count,
${T} .lt-wins {
  line-height: 1;
}
/* tile numbers: with 'dominant-baseline: central' Commissioner's digits sit 0.087em above the em
   middle (measured, digits 1-9 within 0.01em of each other), so they are lowered by exactly that
   to the plate's optical centre (the plate and its safe area are unchanged) */
${T} .tile-num {
  font-weight: var(--w-ui-bold);
  letter-spacing: 0;
  transform: translateY(0.087em);
}
`;

let installed = false;
/** The @font-face rules, the role rules and a preload of the interface font. */
export const installFonts = () => {
  if (installed) return;
  installed = true;
  for (const href of [commissioner, numerals, besley]) {
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

/** Applies the choice (new: Besley + Commissioner; previous: the theme's Alegreya Sans). */
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
