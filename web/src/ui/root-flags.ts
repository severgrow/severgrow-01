// PAGE-WIDE SCREEN FLAGS (measured 2026-11-10). A style rule whose subject is the whole page
// (html, :root or body) with :has() makes the browser re-check the whole page for EVERY element added
// anywhere (each board tile, each SVG piece, each card), then restyle the whole document. Opening an
// online game did ~100 full restyles because of seven such rules; on CI's slow machines that froze
// the page for ~4 s. These flags answer the same questions ("is the game showing?") once per change,
// as classes on <html> and <body>, and the rules read the class instead. The guard in
// tests/hud-rail.test.ts keeps page-wide :has() out of the source.
//
// Each rule keeps its exact priority: `:has(#game:not([hidden]))` counted one id and one attribute,
// so its replacement is `.has-game:not(#no-has)`: one class and one id that never matches.

/** Flag class -> is it on right now. Pure reads; cheap (a few lookups by id). */
export const ROOT_FLAGS: Readonly<Record<string, () => boolean>> = Object.freeze({
  'has-game': () => shown('game'),
  'has-gameover': () => shown('gameover'),
  'has-sheet-profile': () => shown('sheet-profile'),
  'has-install-prompt': () => shown('install-prompt'),
  'has-online-screen': () =>
    ['online-world-screen', 'online-hub', 'online-waiting', 'online-join'].some(
      (id) => shown(id) && document.getElementById(id)!.getAttribute('aria-hidden') !== 'true',
    ),
});

function shown(id: string): boolean {
  const el = document.getElementById(id);
  return !!el && !el.hidden;
}

/** Keep the flags in step with the page. Call once at start-up. */
export const mountRootFlags = (): void => {
  const targets = [document.documentElement, document.body];
  const sync = () => {
    for (const [name, on] of Object.entries(ROOT_FLAGS)) {
      const want = on();
      // Only touch the class when it really changes: an identical write still costs a restyle.
      for (const t of targets) if (t.classList.contains(name) !== want) t.classList.toggle(name, want);
    }
  };
  // `hidden`/`aria-hidden` flips and screens added later (the online screens, the install prompt).
  // The callback runs once per batch of changes, before the next frame, and only reads by id.
  new MutationObserver(sync).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'],
  });
  sync();
};
