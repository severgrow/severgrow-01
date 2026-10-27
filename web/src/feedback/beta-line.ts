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
    const early = link;
    early.addEventListener('click', () => {
      if (early.dataset.owned !== '1') early.dataset.earlyClick = '1';
    });
    beta.append(link);
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
