// Loaded only in Test2. Rules, card identities and saved actions keep their existing names.
import { bombText } from '../logic/bomb-text.js';
import mossArt from '../assets/cards/moss.webp?url';
import ashArt from '../assets/cards/ash.webp?url';
import dewArt from '../assets/cards/dew.webp?url';
import emberArt from '../assets/cards/ember.webp?url';
import bombArt from '../assets/cards/bomb.webp?url';
import backArt from '../assets/cards/back.webp?url';

const CARD_ART_URLS = [mossArt, ashArt, dewArt, emberArt, bombArt, backArt];

export const CARDS_CSS = `
/* Card-local ink: never change terrain, ownership or interface colour tokens. */
.test2-cards .card.s0, .test2-cards .test2-combination .s0 { --suit:#7FCF8D; }
.test2-cards .card.s1, .test2-cards .test2-combination .s1 { --suit:#B389F3; }
.test2-cards .card.s2, .test2-cards .test2-combination .s2 { --suit:#76A8F5; }
.test2-cards .card.s3, .test2-cards .test2-combination .s3 { --suit:#EE7D73; }
.test2-cards .test2-combination [class*=' s'] { color:var(--suit); }
.test2-cards .card {
  --card-bg:rgba(20,21,21,.88);
  background:var(--card-bg);
  border-width:1px;
  border-color:color-mix(in srgb, var(--suit,var(--c-text)) 38%, transparent);
}
.test2-cards .card::after {
  inset:4px;
  border-width:1px !important;
  border-color:color-mix(in srgb, var(--suit,var(--c-text)) 52%, transparent) !important;
}
.test2-cards .card .c-suit svg { stroke-width:1.7; }
.test2-cards .card .c-num { letter-spacing:0; }
.test2-cards .card.fruit { --suit:var(--c-accent); }
.test2-cards .card.fruit .c-num,
.test2-cards .card.fruit .c-suit { color:var(--suit); }
/* The extra cream frame signals a special card without a badge or bright background. */
.test2-cards .card.fruit::after {
  border-style:double !important;
  border-width:3px !important;
  border-color:color-mix(in srgb, var(--suit) 60%, transparent) !important;
}
.test2-cards .card.fruit .c-fruit svg,
.test2-cards .dock .pile-top.card.fruit .c-fruit svg {
  width:calc(var(--cw)*.52); height:calc(var(--cw)*.52);
}
/* Clear keyboard feedback; pointer taps retain the existing selected-card styling. */
.test2-cards .card:focus-visible, .test2-cards .pile:focus-visible {
  outline:2px solid var(--c-accent); outline-offset:3px;
}
/* Quiet dark counters avoid pale badges competing with the hand's colours. */
.test2-cards .dock :is(#deck, #discard) .pile-count {
  background:rgba(20,21,21,.92); color:var(--c-accent);
  border:1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
  font-weight:700; display:inline-grid; place-items:center; line-height:1;
}
.test2-cards .dock #deck.low .pile-count { color:var(--c-gold); }
.test2-cards .card.fruit .c-idx svg { width:calc(var(--cw)*.25); height:calc(var(--cw)*.25); }
/* One shared decoded atlas per suit; duplicate cards use the same texture and cell. */
.test2-cards .card { isolation:isolate; }
.test2-cards .dock .hand-row > .hand .card {
  transition:transform .18s cubic-bezier(.22,.72,.24,1), opacity .16s ease, filter .16s ease, box-shadow .16s ease;
}
.test2-cards .card .test2-card-art {
  position:absolute; inset:1px; z-index:0; display:block; border-radius:inherit;
  background-size:300% 300%; background-repeat:no-repeat; pointer-events:none;
  opacity:0;
}
.test2-cards .card.s0 .test2-card-art { background-image:url('${mossArt}'); }
.test2-cards .card.s1 .test2-card-art { background-image:url('${ashArt}'); }
.test2-cards .card.s2 .test2-card-art { background-image:url('${dewArt}'); }
.test2-cards .card.s3 .test2-card-art { background-image:url('${emberArt}'); }
.test2-cards .card.fruit .test2-card-art { background-image:url('${bombArt}'); background-size:cover; background-position:center; }
.test2-cards.test2-card-art-ready .card .test2-card-art { opacity:1; }
.test2-cards.test2-card-art-ready .card :is(.c-num,.c-suit) { opacity:0; }
.test2-cards.test2-card-art-ready .card::after { display:none; }
.test2-cards.test2-card-art-ready .card:has(>.test2-card-art) { border-color:transparent; }
.test2-cards.test2-card-art-ready .card:has(>.test2-card-art).playable,
.test2-cards.test2-card-art-ready .card:has(>.test2-card-art).lifted { border-color:var(--c-accent); }
.test2-cards .test2-mini-card .test2-card-art { display:none; }
/* The separately supplied tree-logo back is the only face-down artwork. */
.test2-cards .card.back,
.test2-cards #deck .pile-stack,
.test2-cards #deck .pile-stack::before,
.test2-cards #deck .pile-stack::after {
  background-image:url('${backArt}'); background-size:100% 100%; background-position:center;
  border-color:transparent;
}
.test2-cards #deck .pile-stack { box-shadow:0 2px 5px rgba(0,0,0,.38); }
@media (prefers-reduced-motion:reduce) {
  .test2-cards .dock .hand-row > .hand .card { transition:none; }
}
.test2-cards.reduce-motion .dock .hand-row > .hand .card { transition:none; }
`;

/** Translate only presentation, including dynamic hints, captions and accessible names.
 * Never touch data attributes, ids, input values, settings, actions or persisted saves. */
export function mountCards() {
  document.documentElement.classList.add('test2-cards');
  const style = document.createElement('style');
  style.id = 'test2-cards-style'; style.textContent = CARDS_CSS; document.head.append(style);
  // Fetch and decode once in the background while the menu is visible. Until all six
  // textures are ready, the existing code-drawn face remains an instant fallback.
  void Promise.all(CARD_ART_URLS.map(async url => {
    const image = new Image(); image.decoding = 'async'; image.src = url;
    await image.decode();
  })).then(() => document.documentElement.classList.add('test2-card-art-ready')).catch(() => {
    // A failed art request leaves readable cards and the current game fully playable.
  });
  const attributes = ['aria-label', 'aria-description', 'title', 'alt'];
  const excluded = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest('script, style, textarea, input, [contenteditable]');
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
