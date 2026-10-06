// Loaded only in Test2. Rules, card identities and saved actions keep their existing names.
import { bombText } from '../logic/bomb-text.js';

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
`;

/** Translate only presentation, including dynamic hints, captions and accessible names.
 * Never touch data attributes, ids, input values, settings, actions or persisted saves. */
export function mountCards() {
  document.documentElement.classList.add('test2-cards');
  const style = document.createElement('style');
  style.id = 'test2-cards-style'; style.textContent = CARDS_CSS; document.head.append(style);
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
