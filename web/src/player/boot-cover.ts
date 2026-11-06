// THE BOOT COVER (owner, 2026-11-06: "in live .com version when opening the website first thing it
// loads the old logo, the old territory view background all for 0.5s and then to our screen. on /test
// version there is short black fade in loading screen that takes you straight to beautiful loaded
// menu ... the solution from /test should be on live too").
//
// The cover itself is in index.html (<style id="boot-cover-css"> and <div id="boot-cover">), so it is
// in the very first paint, before any script. This lifts it once the menu is composed: the kanji
// lockup in place and the planet drawing (`.world-grid.planet-on`), or at BOOT_COVER_MAX_MS whatever
// happened, so a slow network or a missing planet can never hold the game behind it. One short fade,
// then the element is removed: no frames are asked for afterwards.
export const BOOT_COVER_MAX_MS = 1200;
export const BOOT_COVER_FADE_MS = 220;

/** Is the menu composed? (The planet lockup applied and the planet drawing.) */
const composed = (): boolean =>
  document.documentElement.classList.contains('planet-lockup') && !!document.querySelector('.world-grid.planet-on');

export const liftBootCover = (opts: { reduceMotion: boolean }): void => {
  const cover = document.getElementById('boot-cover');
  if (!cover) return;
  const started = performance.now();
  let lifted = false;
  const lift = () => {
    if (lifted) return;
    lifted = true;
    if (opts.reduceMotion) { cover.remove(); return; }
    cover.style.transition = `opacity ${BOOT_COVER_FADE_MS}ms ease-out`;
    cover.style.opacity = '0';
    window.setTimeout(() => cover.remove(), BOOT_COVER_FADE_MS + 40);
  };
  // Checked once a frame only until it lifts (at most BOOT_COVER_MAX_MS of frames, then never again).
  const check = () => {
    if (lifted) return;
    if (composed() || performance.now() - started >= BOOT_COVER_MAX_MS) {
      // one more frame so the composed menu has painted under the cover before it fades
      requestAnimationFrame(lift);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  window.setTimeout(lift, BOOT_COVER_MAX_MS + 200); // a hidden tab gets no frames: lift anyway
};
