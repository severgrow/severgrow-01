// Loaded only in Futa04. Rules, card identities and saved actions keep their existing names.
import { bombText } from '../logic/bomb-text.js';
import { CARD_FACES, cardArtUrl, cardArtUrls } from '../ui/card-art.js';
import { CARD_STACK_SHADOW, cardStackPose } from '../ui/card-stack.js';

/**
 * The six faces to decode, in the same order as `ART_KINDS` below. The URLs themselves live in
 * `ui/card-art.ts` — the ONE table the hand, the piles and the Blast's strike card all read — so
 * this module names no asset of its own any more.
 */
export const CARD_ART_URLS: readonly string[] = cardArtUrls();
// The rules below name each face once. They are bound to the shared table (never to an asset
// import of their own), so a card skin that replaces a face reaches this stylesheet too.
const mossArt = cardArtUrl('s0'), ashArt = cardArtUrl('s1'), dewArt = cardArtUrl('s2'), emberArt = cardArtUrl('s3'), bombArt = cardArtUrl('fruit'), backArt = cardArtUrl('back');
const ART_KINDS = CARD_FACES;
const READY_FACES=ART_KINDS.slice(0,5).map(kind=>`.futa04-cards.futa04-card-art-${kind}-ready .card.${kind}`).join(',');

/**
 * THE DRAW PILE IS THE RITUAL'S DECK, so its thickness is the ritual's own fan (`ui/card-stack.ts`):
 * three visible layers — the face and the two card silhouettes behind it — with the stack's single
 * contact shadow under the lowest one. The poses are written straight from the shared module, so
 * the ceremony and the pile can never drift apart.
 */
const PILE_STACK_LAYERS = 3;
const pileNear = cardStackPose(PILE_STACK_LAYERS, 1);
const pileFar = cardStackPose(PILE_STACK_LAYERS, 2);
const pileShadow = `0 calc(var(--pile-h, 71px) * ${CARD_STACK_SHADOW.y}) calc(var(--pile-h, 71px) * ${CARD_STACK_SHADOW.blur}) rgba(0,0,0,${CARD_STACK_SHADOW.alpha})`;

let cardArtReady: Promise<void> | null = null;

/** Start fetch/decode as soon as the module loads (menu still visible). Safe to call twice. */
export function preloadCardArt(): Promise<void> {
  if (cardArtReady) return cardArtReady;
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    cardArtReady = Promise.resolve();
    return cardArtReady;
  }
  cardArtReady = Promise.all(cardArtUrls().map(async url => {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try {await image.decode();return true;}catch{return false;}
  })).then(ready => {
    // Enable only decoded faces. A missing suit keeps its readable number and symbol.
    const classes=ART_KINDS.filter((_,index)=>ready[index]).map(kind=>`futa04-card-art-${kind}-ready`);
    if(ready.every(Boolean))classes.push('futa04-card-art-ready');
    if(classes.length)document.documentElement.classList.add(...classes);
  });
  return cardArtReady;
}

/**
 * WHEN THE FIRST HAND'S ART LOADS (measured; docs/PERF-COLDSTART.md).
 *
 * This used to start at module evaluation — i.e. while the menu was still assembling — and the six
 * faces are 424 kB together, more than half of the menu's whole image budget, for art the menu never
 * shows. On a good mobile link that competed directly with the lobby and planet chunks the first
 * reveal is actually waiting for.
 *
 * It now starts once the app is READY (the menu composed and revealed): measured at 4G, that is
 * ~2 s in, and the earliest a match can ask for a card is seconds after that — the starter ritual
 * alone takes over a second. A safety timer covers a boot that fails before `severor-ready`.
 *
 * `preloadCardArt()` itself is unchanged and still safe to call from anywhere: this only decides WHEN.
 */
let cardArtScheduled = false;
export function warmCardArtWhenReady(): void {
  if (cardArtScheduled || typeof window === 'undefined') return;
  cardArtScheduled = true;
  const start = (): void => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => { void preloadCardArt(); }, { timeout: 1500 });
    else window.setTimeout(() => { void preloadCardArt(); }, 120);
  };
  // The listener is registered before main.ts dispatches the event (this module is in the entry).
  window.addEventListener('severor-ready', start, { once: true });
  window.setTimeout(start, 5000);
}

// Kick off once the menu is up — never before the first composed frame.
warmCardArtWhenReady();

/**
 * THE SUIT INK'S STEP (owner, 2026-11-20: "the color intensity of suits inside cards difference
 * in hand during GROW and THROW selection. im talking red purple green inside etc. during grow the
 * colors should be more vibrant, during throw insensity colors way lower, and then as it is now the
 * selected one grey scale. we have system for that but it isnt set good").
 *
 * The step already owned the hand's LIGHT (the Grow glow vs the quieter Throw glow), but the
 * printed face itself — the suit glyphs' red / purple / blue / green — never changed with it, so
 * the two steps' ink was identical. These are the values of ONE static veil over the printed face,
 * set by `data-step` on the root and read by the card's own sheet. GROW is the vibrant hand (no
 * veil); THROW turns the ink down towards the card's shadow tone; the picked card stays exactly as
 * it is (its own greyscale, no veil). It is a paint, not a filter: a filter on a card that breathes
 * would re-rasterise every card on every frame (see player/smart-cockpit.ts).
 */
export const CARD_INK = Object.freeze({ grow: 0, throw: 0.34, picked: 0 });

export const CARDS_CSS = `
/* Card-local ink: never change terrain, ownership or interface colour tokens. */
.futa04-cards .card.s0, .futa04-cards .futa04-combination .s0 { --suit:#7FCF8D; }
.futa04-cards .card.s1, .futa04-cards .futa04-combination .s1 { --suit:#B389F3; }
.futa04-cards .card.s2, .futa04-cards .futa04-combination .s2 { --suit:#76A8F5; }
.futa04-cards .card.s3, .futa04-cards .futa04-combination .s3 { --suit:#EE7D73; }
.futa04-cards .futa04-combination [class*=' s'] { color:var(--suit); }
.futa04-cards .card {
  --card-bg:rgba(20,21,21,.88);
  background:var(--card-bg);
  border-width:1px;
  border-color:color-mix(in srgb, var(--suit,var(--c-text)) 38%, transparent);
}
.futa04-cards .card::after {
  inset:4px;
  border-width:1px !important;
  border-color:color-mix(in srgb, var(--suit,var(--c-text)) 52%, transparent) !important;
}
.futa04-cards .card .c-suit svg { stroke-width:1.7; }
.futa04-cards .card .c-num { letter-spacing:0; }
.futa04-cards .card.fruit { --suit:var(--c-accent); }
.futa04-cards .card.fruit .c-num,
.futa04-cards .card.fruit .c-suit { color:var(--suit); }
/* The extra cream frame signals a special card without a badge or bright background. */
.futa04-cards .card.fruit::after {
  border-style:double !important;
  border-width:3px !important;
  border-color:color-mix(in srgb, var(--suit) 60%, transparent) !important;
}
.futa04-cards .card.fruit .c-fruit svg,
.futa04-cards .dock .pile-top.card.fruit .c-fruit svg {
  width:calc(var(--cw)*.52); height:calc(var(--cw)*.52);
}
/* Clear keyboard feedback; pointer taps retain the existing selected-card styling. */
.futa04-cards .card:focus-visible, .futa04-cards .pile:focus-visible {
  outline:2px solid var(--c-accent); outline-offset:3px;
}
/* Quiet dark counters avoid pale badges competing with the hand's colours. */
.futa04-cards .dock :is(#deck, #discard) .pile-count {
  background:rgba(20,21,21,.92); color:var(--c-accent);
  border:1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
  font-weight:700; display:inline-grid; place-items:center; line-height:1;
}
.futa04-cards .dock #deck.low .pile-count { color:var(--c-gold); }
.futa04-cards .card.fruit .c-idx svg { width:calc(var(--cw)*.25); height:calc(var(--cw)*.25); }
/* One shared decoded atlas per suit; duplicate cards use the same texture and cell. */
.futa04-cards .card { isolation:isolate; }
.futa04-cards .dock .hand-row > .hand .card {
  transition:transform .18s cubic-bezier(.22,.72,.24,1), opacity .16s ease, filter .16s ease, box-shadow .16s ease;
}
.futa04-cards .card .futa04-card-art {
  position:absolute; inset:1px; z-index:0; display:block; border-radius:inherit;
  background-size:300% 300%; background-repeat:no-repeat; pointer-events:none;
  opacity:0; transition:opacity .28s ease;
}
.futa04-cards .card :is(.c-num,.c-suit) { transition:opacity .22s ease; }
/* THE SUIT INK FOLLOWS THE STEP (owner, 2026-11-20: "during grow the colors should be more vibrant,
   during throw insensity colors way lower"). One static alpha veil over the printed face, in the
   card's own shadow tone: it mutes the suit glyphs' chroma without a filter (a filter here would
   re-rasterise every breathing card each frame) and without touching the card's palette. The steps
   write only the custom property; the picked card opts out and keeps its existing greyscale. */
.futa04-cards .card > .futa04-card-art::after {
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:rgb(14 15 15 / var(--card-ink, 0));
}
html.futa04-cards[data-step='grow'] #hand .card { --card-ink:${CARD_INK.grow}; }
html.futa04-cards[data-step='throw'] #hand .card { --card-ink:${CARD_INK.throw}; }
/* "as it is now the selected one grey scale": its filter is the whole treatment. */
html.futa04-cards[data-step='throw'] #hand .card.futa04-throw-picked { --card-ink:${CARD_INK.picked}; }
/* THE PILE IS A STACK OF CARDS, SO EVERY LAYER WEARS THE CARD'S OWN CORNER (owner, 2026-11-14:
   "on draw pile the corners look wrong"; open request 3 in docs/HANDOFF-0.86.md: "draw pile,
   discard and opponent piles must draw the exact new card shape (radius, no extra frames),
   including stacked layers"). One token, used by the card, both slab pseudo-elements and the top
   card, on BOTH piles: before this the discard's slabs kept the old --radius * 0.6 (9.6px on a
   50px card, a third of the card's width) while the deck's used the card's percentage, so the two
   piles disagreed with each other and with the card between them. */
.futa04-cards .dock :is(#deck,#discard) :is(.pile-card,.pile-stack,.pile-stack::before,.pile-stack::after,.pile-top.card) {
  border-radius:5.9% / 4.2%;
}
.futa04-cards .dock #deck[data-count='last'] .pile-stack { border-radius:5.9% / 4.2%; }
.futa04-cards .card.s0 .futa04-card-art { background-image:url('${mossArt}'); }
.futa04-cards .card.s1 .futa04-card-art { background-image:url('${ashArt}'); }
.futa04-cards .card.s2 .futa04-card-art { background-image:url('${dewArt}'); }
.futa04-cards .card.s3 .futa04-card-art { background-image:url('${emberArt}'); }
.futa04-cards .card.fruit .futa04-card-art { background-image:url('${bombArt}'); background-size:cover; background-position:center; }
:is(${READY_FACES}) .futa04-card-art { opacity:1; }
:is(${READY_FACES}) :is(.c-num,.c-suit) { opacity:0; }
@media (prefers-reduced-motion:reduce) {
  .futa04-cards .card .futa04-card-art,
  .futa04-cards .card :is(.c-num,.c-suit) { transition:none; }
}
.futa04-cards.reduce-motion .card .futa04-card-art,
.futa04-cards.reduce-motion .card :is(.c-num,.c-suit) { transition:none; }
:is(${READY_FACES})::after { display:none; }
/* THE GLOW WRAPS THE CARD (owner, 2026-11-14: "its glow should wrap the card perfectly" and "never do
   the contour frame when selected"). With its art in, a card IS its art: the art covers the whole box
   the box has no border or fill of its own and the art's own corner (15 of 256 x 356 px), so
   every glow and shadow on the card follows the printed edge. No border colour when playable or
   selected: the lift and the glow say it. */
:is(${READY_FACES}):has(>.futa04-card-art) { border:0; background:transparent; border-radius:5.9% / 4.2%; }
:is(${READY_FACES}):has(>.futa04-card-art):is(.playable,.lifted) { border-color:transparent; }
:is(${READY_FACES}) > .futa04-card-art { inset:0; border-radius:5.9% / 4.2%; }
.futa04-cards .futa04-mini-card .futa04-card-art { display:none; }
/* THE DRAW PILE IS THE RITUAL'S DECK (owner, 2026-11-14: "remove this weird rectangle from behind
   the draw pile and make the draw pile look exactly like the pile in ritual at the end when cards
   coming back together in middle screen"). Every layer is the card back itself — the same face, the
   same printed corner, the same small fan and tilt the ritual's nine-card stack has as it comes
   back together, and ONE soft shadow under the lowest card. The two grey slabs with their own
   hairline that used to sit behind the face (and read as a plain rectangle) are gone. */
.futa04-cards .card.back,
.futa04-cards #deck .pile-stack,
.futa04-cards #deck .pile-stack::before,
.futa04-cards #deck .pile-stack::after {
  background-image:url('${backArt}'); background-size:100% 100%; background-position:center;
  border-color:transparent;
}
.futa04-cards #deck .pile-stack::before,
.futa04-cards #deck .pile-stack::after { border:0; background-color:transparent; }
.futa04-cards .card.back { border-radius:5.9% / 4.2%; }
/* The face is the card you see; the two layers behind it are the pile's thickness, in the ritual's
   order — the near layer above the far one. Percentages of the card's own box, so the pile and the
   ritual deck are the same object at any size. */
.futa04-cards #deck .pile-stack::after { translate:${pileNear.x}% ${pileNear.y}%; rotate:${pileNear.rot}deg; }
.futa04-cards #deck .pile-stack::before { translate:${pileFar.x}% ${pileFar.y}%; rotate:${pileFar.rot}deg; }
/* One shadow for the whole stack, cast by its lowest visible card (the ritual's own, at the pile's
   height). data-layers is how many cards the pile shows (logic/piles.ts). */
.futa04-cards #deck[data-layers='2'] .pile-stack::after { box-shadow:${pileShadow}; }
.futa04-cards #deck:is([data-layers='3'],[data-layers='4']) .pile-stack::before { box-shadow:${pileShadow}; }
@media (prefers-reduced-motion:reduce) {
  .futa04-cards .dock .hand-row > .hand .card { transition:none; }
}
.futa04-cards.reduce-motion .dock .hand-row > .hand .card { transition:none; }
`;

/** Translate only presentation, including dynamic hints, captions and accessible names.
 * Never touch data attributes, ids, input values, settings, actions or persisted saves. */
export function mountCards() {
  if(document.getElementById('futa04-cards-style'))return;
  document.documentElement.classList.add('futa04-cards');
  const style = document.createElement('style');
  style.id = 'futa04-cards-style'; style.textContent = CARDS_CSS; document.head.append(style);
  // Decode may already be in flight from preloadCardArt(); class flips when ready.
  void preloadCardArt();
  const attributes = ['aria-label', 'aria-description', 'title', 'alt'];
  // The board's SVG contains no Fruit wording. Its tiles are rebuilt during
  // play, so walking that entire subtree for text translation wastes work.
  const excluded = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest('script, style, textarea, input, [contenteditable], #board, .match-chat, #match-chat-panel, #online-hub, #online-world-screen, #world-chat-list, [data-message-id], #profile-name, [data-player-text]');
  const translate = (node: Node) => {
    if (excluded(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const before = node.nodeValue ?? '', after = bombText(before);
      if (after !== before) node.nodeValue = after;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    for (const name of attributes) {
      const before = element.getAttribute(name);
      if (before !== null) { const after = bombText(before); if (after !== before) element.setAttribute(name, after); }
    }
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: text => excluded(text) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    while (walk.nextNode()) translate(walk.currentNode);
    for (const child of element.querySelectorAll('[aria-label], [aria-description], [title], [alt]')) {
      if (excluded(child)) continue;
      for (const name of attributes) {
        const before = child.getAttribute(name);
        if (before !== null) { const after = bombText(before); if (after !== before) child.setAttribute(name, after); }
      }
    }
  };
  translate(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) translate(node);
      else if (record.type === 'characterData') translate(record.target);
      else if (record.type === 'attributes' && record.attributeName) {
        const node = record.target as Element, before = node.getAttribute(record.attributeName);
        if (before !== null && !excluded(node)) { const after = bombText(before); if (after !== before) node.setAttribute(record.attributeName, after); }
      }
    }
  }).observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributes });
}
