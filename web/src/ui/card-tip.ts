/**
 * THE CARD'S SUIT DETAIL, IN THE GAME'S OWN TREATMENT (owner, 2026-11-20: "replace browser-native
 * tile tooltips such as Ash with the existing FUTASAKU tile detail treatment").
 *
 * `cardFace` used to put `title="Ash"` on the suit glyph, so hovering a card for a moment showed the
 * browser's own grey tooltip — a different material, a different font and a different placement from
 * everything else in the game. This module replaces it with the board's existing quiet detail bubble
 * (the same dark surface, hairline and cream text as `#ctool-tip`).
 *
 * ACCESS IS KEPT:
 *   - mouse: pointerenter on the suit glyph shows the detail; leaving hides it;
 *   - touch: a 450 ms long-press shows it, a movement or release cancels/hides it;
 *   - keyboard: the card itself is already a button whose aria-label names the card ("Ash 5"), so a
 *     keyboard player hears the same fact; focusing the card also shows this bubble.
 *
 * It is presentation only: no game state, no network, no timer while nothing is hovered.
 */
const STYLE_ID = 'card-tip-style';
const TIP_ID = 'card-tip';

const CSS = `
#card-tip {
  position: fixed;
  z-index: 60;
  max-width: 220px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--c-surface, #191714);
  border: 1px solid var(--c-line, #4a443b);
  color: var(--c-text, #f0e9dc);
  font: inherit;
  font-size: .85rem;
  line-height: 1.3;
  letter-spacing: 0;
  box-shadow: 0 8px 24px -10px color-mix(in srgb, #000 80%, transparent);
  pointer-events: none;
}
#card-tip[hidden] { display: none; }
`;

let tip: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;
let current: Element | null = null;

const detailOf = (target: Element | null): Element | null =>
  target?.closest<HTMLElement>('[data-card-detail]') ?? null;

const place = (anchor: Element, text: string) => {
  if (!tip) return;
  tip.textContent = text;
  tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const gap = 8;
  const left = Math.min(Math.max(6, r.left + r.width / 2 - box.width / 2), window.innerWidth - box.width - 6);
  const above = r.top - box.height - gap;
  const top = above >= 6 ? above : Math.min(r.bottom + gap, window.innerHeight - box.height - 6);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
};

const hide = () => {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  if (tip) tip.hidden = true;
  current = null;
};

const show = (anchor: Element, delay = 220) => {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  current = anchor;
  const text = anchor.getAttribute('data-card-detail')?.trim();
  if (!text) return;
  showTimer = window.setTimeout(() => {
    if (current === anchor) place(anchor, text);
  }, delay);
};

/** Mount the one bubble, the delegated listeners and the stylesheet. Idempotent. */
export const mountCardTip = (doc: Document = document): void => {
  if (typeof window === 'undefined' || tip?.isConnected) return;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.append(style);
  }
  const existing = doc.getElementById(TIP_ID);
  tip = existing ?? doc.createElement('div');
  tip.id = TIP_ID;
  tip.className = 'ctool-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  if (!existing) doc.body.append(tip);

  // MOUSE + TOUCH. Pointer events cover both: a mouse enters at once; touch starts the same path on
  // pointerdown, and a long-press (450 ms) opens it. A movement or an early release cancels it.
  let pressTimer = 0;
  let pressAt: { x: number; y: number } | null = null;
  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const anchor = detailOf(event.target as Element | null);
    if (anchor) show(anchor);
  });
  doc.addEventListener('pointerout', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (detailOf(event.target as Element | null)) hide();
  });
  doc.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    const anchor = detailOf(event.target as Element | null);
    if (!anchor) return;
    pressAt = { x: event.clientX, y: event.clientY };
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      pressAt = null;
      show(anchor, 0);
      // A touch tip is transient: it never covers the board until the finger leaves.
      hideTimer = window.setTimeout(hide, 1800);
    }, 450);
  }, { passive: true });
  const cancelPress = () => { window.clearTimeout(pressTimer); pressAt = null; };
  doc.addEventListener('pointerup', cancelPress, { passive: true });
  doc.addEventListener('pointercancel', cancelPress, { passive: true });
  doc.addEventListener('pointermove', (event) => {
    if (!pressAt) return;
    if (Math.abs(event.clientX - pressAt.x) + Math.abs(event.clientY - pressAt.y) > 8) cancelPress();
  }, { passive: true });

  // KEYBOARD: focusing the card (a button) shows the same text; blur hides it.
  doc.addEventListener('focusin', (event) => {
    const anchor = detailOf(event.target as Element | null)
      ?? (event.target as Element | null)?.closest<HTMLElement>('.card')?.querySelector('[data-card-detail]');
    if (anchor) show(anchor, 0);
  });
  doc.addEventListener('focusout', hide);
  // Scrolling or a resize moves the anchor away from a fixed bubble: hide rather than leave it
  // pointing at the wrong card.
  doc.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
};
