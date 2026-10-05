// Test2 presentation only. The existing guide, effects and danger warning still supply every
// word; this module gives them one stable place, away from the board's playable cells.
import { IS_TEST2 } from '../channel.js';

type Notice = { node: HTMLElement; priority: 'routine' | 'major'; text: string };

export const INFORMATION_CSS = `
.test2-information .game {
  grid-template-rows: var(--hud-h, 48px) var(--race-h, 0px) var(--test2-information-h, 68px) minmax(0, 1fr);
}
.test2-information.large-text .game {
  grid-template-rows: var(--hud-h, 48px) var(--race-h, 0px) var(--test2-information-h, 84px) minmax(0, 1fr);
}
.test2-information .game > .play { grid-row: 4; }
.test2-information .game > #test2-information-rail { grid-row: 3; }
.test2-information-blocked #test2-information-rail { visibility: hidden; }
/* Long Bloom labels must stay inside their existing desktop message/control column. */
.test2-information[data-layout='side'] .table-row > .moves { flex-wrap: wrap; align-content: center; gap: 4px; }
.test2-information[data-layout='side'] .table-row > .moves > .btn { max-width: 100%; white-space: normal; line-height: 1.15; }
.test2-information #turn-pill,
.test2-information #edge-wash,
.test2-information #idle-tip { display: none !important; }
.test2-information #test2-information-rail {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: var(--test2-information-h, 68px);
  padding: 0 12px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 24px;
  gap: 2px;
  align-items: center;
  justify-items: center;
  pointer-events: none;
}
.test2-information.large-text #test2-information-rail {
  height: var(--test2-information-h, 84px);
  grid-template-rows: minmax(0, 1fr) 30px;
}
.test2-information #test2-information-rail #step-cue {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  width: 100%;
  min-width: 0;
  text-align: center;
  opacity: .34 !important;
  transition: opacity 180ms ease-out;
}
.test2-information #test2-information-rail #step-cue[data-level='hi'] { opacity: .58 !important; }
.test2-information #test2-information-rail #step-cue[data-level='lo'] { opacity: .42 !important; }
.test2-information[data-step='none'] #test2-information-rail #step-cue,
.test2-information[data-guide='off'] #test2-information-rail #step-cue { visibility: hidden; }
.test2-information #test2-information-rail .cue-plate {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: visible;
  animation: none !important;
}
.test2-information #test2-information-rail .cue-icon,
.test2-information #test2-information-rail .cue-pips,
.test2-information #test2-information-rail .cue-plate::after { display: none; }
.test2-information #test2-information-rail .cue-words {
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 10px;
  line-height: 1.08;
}
.test2-information #test2-information-rail .cue-kicker {
  font-size: 10px;
  letter-spacing: .025em;
  color: var(--c-text);
}
.test2-information #test2-information-rail .cue-text {
  font-size: clamp(28px, 7.6vw, 36px);
  line-height: 1.08;
  font-weight: 650;
  letter-spacing: 0;
  color: var(--c-text);
  animation: none !important;
}
.test2-information.large-text #test2-information-rail .cue-text { font-size: clamp(30px, 8.2vw, 40px); }
.test2-information #test2-information-rail #step-cue[data-step='opp'] .cue-kicker { display: none; }
.test2-information #test2-information-subline {
  min-width: 0;
  width: min(100%, 720px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: stretch;
}
.test2-information #test2-notice-slot { min-width: 0; width: 100%; text-align: center; }
.test2-information #test2-help-slot { min-width: 0; pointer-events: auto; }
.test2-information #test2-help-slot:empty { display: none; }
.test2-information #test2-information-rail[data-help='on']:not([data-notice-priority='major']) #test2-notice-slot,
.test2-information #test2-information-rail[data-notice-priority='major'] #test2-help-slot { display: none; }
.test2-information #test2-notice-slot > :not([data-information-active='true']) { display: none !important; }
.test2-information #test2-notice-slot > [data-information-active='true'] {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  opacity: 1 !important;
  display: block;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  font-size: .75rem;
  font-weight: 450;
  line-height: 1;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  color: var(--c-text);
  pointer-events: none;
}
.test2-information #test2-information-rail[data-notice-priority='routine'] #test2-notice-slot { opacity: .78; }
.test2-information #test2-notice-slot > .bad,
.test2-information #test2-notice-slot > #root-warn { color: var(--c-danger); }
.test2-information #test2-notice-slot > .good { color: var(--c-you); }
.test2-information #test2-notice-slot > #root-warn i { display: none; }
.test2-information body.paused #test2-information-rail { visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .test2-information #test2-information-rail #step-cue { transition: none; }
}
`;

/** Mount after player enhancements (including mountGuide). No game state or settings change. */
export const mountInformation = () => {
  const root = document.documentElement;
  const game = document.getElementById('game');
  if (!IS_TEST2 || !game || document.getElementById('test2-information-rail')) return;
  root.classList.add('test2-information');
  const style = document.createElement('style');
  style.id = 'test2-information-style';
  style.textContent = INFORMATION_CSS;
  document.head.append(style);

  const rail = document.createElement('div');
  rail.id = 'test2-information-rail';
  const subline = document.createElement('div');
  subline.id = 'test2-information-subline';
  const notices = document.createElement('div');
  notices.id = 'test2-notice-slot';
  notices.setAttribute('role', 'status');
  notices.setAttribute('aria-live', 'polite');
  notices.setAttribute('aria-atomic', 'true');
  const help = document.createElement('div');
  help.id = 'test2-help-slot';
  subline.append(notices, help);
  rail.append(subline);
  document.getElementById('race')?.after(rail);
  if (!rail.isConnected) game.prepend(rail);

  const cue = document.getElementById('step-cue');
  if (cue) rail.prepend(cue);
  const cueText = cue?.querySelector<HTMLElement>('.cue-text');
  if (cueText) {
    const labels: Record<string, string> = { draw: 'Draw a card', grow: 'Grow or skip', throw: 'Throw one card' };
    const normalize = () => {
      const label = labels[root.dataset.step ?? ''];
      if (label && cueText.textContent !== label) cueText.textContent = label;
    };
    // The guide remains the sole phase source, including on resumed games. Its idle refresh
    // can refill the old Grow wording, so normalize just that presentation without a loop.
    new MutationObserver(normalize).observe(cueText, { childList: true, characterData: true, subtree: true });
    new MutationObserver(normalize).observe(root, { attributes: true, attributeFilter: ['data-step'] });
    normalize();
  }
  const captions = document.getElementById('captions');
  // The message now has one live region; floating score numbers keep their existing rendering.
  captions?.setAttribute('aria-live', 'off');
  const banner = document.getElementById('banner');
  if (banner) {
    banner.removeAttribute('aria-hidden');
    notices.append(banner);
  }
  const warning = document.getElementById('root-warn');
  if (warning) {
    warning.removeAttribute('role');
    notices.append(warning);
  }

  let current: Notice | null = null;
  let timer = 0;
  const announceChange = () => rail.dispatchEvent(new CustomEvent('test2-noticechange', { bubbles: true }));
  const update = () => {
    for (const child of notices.children) (child as HTMLElement).removeAttribute('data-information-active');
    const shown = current?.node.isConnected && (current.priority === 'major' || !warning || warning.hidden)
      ? current
      : warning && !warning.hidden
        ? { node: warning, priority: 'major' as const, text: warning.textContent ?? '' }
        : null;
    if (shown) {
      shown.node.dataset.informationActive = 'true';
      rail.dataset.noticePriority = shown.priority;
    } else delete rail.dataset.noticePriority;
    announceChange();
  };
  const expire = () => {
    clearTimeout(timer);
    current = null;
    update();
  };
  const priorityFor = (node: HTMLElement, text: string): Notice['priority'] =>
    node.id === 'banner' || !/\b(threw away|took (?:a |an |the |Moss|Ash|Dew|Ember|Fruit)|nothing to play)\b/i.test(text) ? 'major' : 'routine';
  const take = (node: HTMLElement) => {
    const text = node.textContent?.trim() ?? '';
    if (!text) return;
    if (current && current.node !== node) current.node.removeAttribute('data-information-active');
    if (node.parentElement !== notices) notices.append(node);
    current = { node, priority: priorityFor(node, text), text };
    clearTimeout(timer);
    // Important outcomes get room to finish; routine opponent bookkeeping yields immediately
    // when the player acts. Original caption animations still own their DOM cleanup.
    timer = window.setTimeout(expire, current.priority === 'major' ? 3500 : 1800);
    update();
  };

  if (captions) {
    for (const caption of captions.querySelectorAll<HTMLElement>('.caption')) take(caption);
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node instanceof HTMLElement && node.classList.contains('caption')) take(node);
    }).observe(captions, { childList: true });
  }
  if (banner) new MutationObserver(() => take(banner)).observe(banner, { childList: true, characterData: true, subtree: true });
  if (warning) new MutationObserver(update).observe(warning, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => {
    if (current && !current.node.isConnected) expire();
  }).observe(notices, { childList: true });

  const clearRoutine = () => {
    if (current?.priority === 'routine') expire();
  };
  for (const event of ['pointerdown', 'keydown'] as const)
    window.addEventListener(event, clearRoutine, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) expire();
  });
  update();
  return { clearRoutine };
};
