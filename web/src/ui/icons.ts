// Simple line icons drawn as SVG (no emoji, no image files). 24x24, currentColor.
const wrap = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS: Record<string, string> = {
  gear: wrap('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  menu: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  history: wrap('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  shield: wrap('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v5M12 16h0"/>'),
  target: wrap('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  replay: wrap('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
  undo: wrap('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  skip: wrap('<path d="M5 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor"/>'),
  coach: wrap('<path d="M4 6h16v10H9l-5 4z"/><path d="M8 10h8M8 13h5"/>'),
  sound: wrap('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
};

/** The inner drawings of the suit symbols (24x24): Moss (leaf), Ash (flake), Dew (drop), Ember (flame). */
export const SUIT_BODY: readonly string[] = [
  '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" fill="currentColor" fill-opacity=".25"/><path d="M5 19L14 10"/>',
  '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M12 3l-2 2.5M12 3l2 2.5M12 21l-2-2.5M12 21l2-2.5"/>',
  '<path d="M12 3c4 5 6.5 8.3 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 11.3 8 8 12 3z" fill="currentColor" fill-opacity=".25"/>',
  '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.5 3.6-9.8 2.8 1.6 3.2 4.4 2.9 6 1.2-.6 1.9-1.9 2-3.2 2.6 2.1 4.5 4.4 4.5 7.2 0 3.4-2.5 6-6.5 6z" fill="currentColor" fill-opacity=".25"/>',
];

/** Suit symbols as plain line icons. */
export const SUIT_SVG: readonly string[] = SUIT_BODY.map((b) => wrap(b));

/** Fills every <span class="i" data-icon="..."> placeholder in the page. */
export const fillIcons = (root: ParentNode = document) => {
  for (const el of root.querySelectorAll<HTMLElement>('.i[data-icon]')) {
    if (!el.firstChild) el.innerHTML = ICONS[el.dataset.icon!] ?? '';
  }
};

/**
 * v0.6 Fruit card: a mushroom cap with spores drifting off it (24x24, line style). Drawn in
 * the card's own ink; no suit colour.
 */
export const FRUIT_SVG = wrap(
  '<path d="M4 13c0-5 3.6-8.5 8-8.5S20 8 20 13z" fill="currentColor" fill-opacity=".18"/>' +
    '<path d="M10 13v4.5a2 2 0 0 0 4 0V13"/>' +
    '<circle cx="9" cy="9.5" r=".9" fill="currentColor"/><circle cx="13.5" cy="8" r=".9" fill="currentColor"/><circle cx="16" cy="11" r=".7" fill="currentColor"/>' +
    '<circle cx="6" cy="4.5" r=".6" fill="currentColor"/><circle cx="18.5" cy="4" r=".5" fill="currentColor"/><circle cx="20.5" cy="7.5" r=".45" fill="currentColor"/>',
);
