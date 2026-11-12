// The main menu's beta line (between the wordmark and the entries), painted in the menu's FIRST
// layout with the other keys (owner, 2026-10-22: everything on the menu appears at once). The words
// and the link come from the one strings module; what the link OPENS is attached later by the
// feedback module (./mount.ts), which also replays a tap made before it arrived.
import { FEEDBACK } from '../../../src/strings.js';

/** Fill and reveal the line once; returns its link (or null when the page has no line). */
export const paintBetaLine = (beta: HTMLElement | null): HTMLButtonElement | null => {
  if (!beta) return null;
  let link = beta.querySelector('button');
  if (!link) {
    beta.append(document.createTextNode(`${FEEDBACK.betaNote(FEEDBACK.betaVersion)} `));
    link = document.createElement('button');
    link.textContent = FEEDBACK.betaLink;
    link.type = 'button';
    link.dataset.fb = 'menu-link';
    beta.append(link);
  }
  // The link may already exist in the built HTML (the line is painted at build time so the menu's
  // first frame carries it — see vite.config.ts). It still needs the early-tap guard: a tap made
  // before the feedback module takes ownership must open the form once it arrives.
  if (link.dataset.owned !== '1' && link.dataset.earlyBound !== '1') {
    link.dataset.earlyBound = '1';
    const early = link;
    early.addEventListener('click', () => {
      if (early.dataset.owned !== '1') early.dataset.earlyClick = '1';
    });
  }
  beta.hidden = false;
  return link;
};

/** A tap on the early-painted link, made before the feedback module arrived, is honoured now. */
export const replayEarlyTap = (link: HTMLButtonElement | null): void => {
  if (!link?.dataset.earlyClick) return;
  delete link.dataset.earlyClick;
  link.click();
};
