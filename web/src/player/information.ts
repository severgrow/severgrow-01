// Test2 presentation only. The existing guide, effects and danger warning still supply every
// word; prompts float over the map and disappear as soon as a move begins. No layout row.
import { IS_TEST2 } from '../channel.js';

type Notice = { node: HTMLElement; priority: 'routine' | 'major'; text: string };

export const INFORMATION_CSS = `
.test2-information .game {
  grid-template-rows: var(--hud-h, 48px) var(--race-h, 0px) minmax(0, 1fr);
}
.test2-information .game > .play { grid-row: 3; }
.test2-information-blocked #test2-information-rail,
.test2-information-blocked #step-cue { visibility: hidden; }
/* Long Bloom labels must stay inside their existing desktop message/control column. */
.test2-information[data-layout='side'] .table-row > .moves { flex-wrap: wrap; align-content: center; gap: 4px; }
.test2-information[data-layout='side'] .table-row > .moves > .btn { max-width: 100%; white-space: normal; line-height: 1.15; }
.test2-information #turn-pill,
.test2-information #edge-wash,
.test2-information #idle-tip { display: none !important; }
.test2-information #test2-information-rail {
  position: absolute;
  inset: 6px 8px auto;
  z-index: 6;
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  pointer-events: none;
}
.test2-information #step-cue {
  position: absolute !important;
  inset: calc((100% - var(--cam-under, 0px)) / 2) auto auto 50% !important;
  transform: translate(-50%, -50%) !important;
  width: calc(100% - 28px);
  max-width: 560px;
  min-width: 0;
  z-index: 5;
  text-align: center;
  pointer-events: none;
  opacity: .72 !important;
  transition: opacity 140ms ease-out;
}
.test2-information #step-cue[data-level='hi'] { opacity: .86 !important; }
.test2-information #step-cue[data-level='lo'] { opacity: .66 !important; }
.test2-information #step-cue[data-level='off'],
.test2-information.test2-move-active #step-cue,
.test2-information.gd-picked #step-cue { opacity: 0 !important; }
.test2-information[data-step='none'] #step-cue,
.test2-information[data-guide='off'] #step-cue { visibility: hidden; }
.test2-information .cue-plate {
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
.test2-information .cue-icon,
.test2-information .cue-kicker,
.test2-information .cue-pips,
.test2-information .cue-plate::after { display: none; }
.test2-information .cue-words {
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 0;
  line-height: 1.08;
}
.test2-information #step-cue .cue-text {
  font-family: var(--font-ui, inherit);
  font-size: clamp(30px, 8.2vw, 48px);
  line-height: 1.08;
  font-weight: 750;
  letter-spacing: .025em;
  text-transform: uppercase;
  color: #fff9e9;
  text-shadow: 0 2px 12px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.95);
  -webkit-text-stroke: .35px rgba(0,0,0,.5);
  animation: none !important;
}
.test2-information.large-text #step-cue .cue-text { font-size: clamp(32px, 8.8vw, 52px); }
.test2-information #step-cue[data-step='opp'] .cue-text { font-size: clamp(24px, 6.6vw, 38px); }
.test2-information #test2-information-subline {
  min-width: 0;
  width: 100%;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.test2-information #test2-notice-slot { min-width: 0; width: 100%; text-align: center; }
.test2-information #test2-help-slot { min-width: 0; pointer-events: auto; }
.test2-information #test2-help-slot:empty { display: none; }
.test2-information #test2-help-button { height: 44px; min-height: 44px; line-height: 44px; }
.test2-information #test2-help-button::before { display: none; }
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
  text-shadow: 0 1px 5px rgba(0,0,0,.85);
  pointer-events: none;
}
.test2-information #test2-information-rail[data-notice-priority='routine'] #test2-notice-slot { opacity: .78; }
.test2-information #test2-notice-slot > .bad,
.test2-information #test2-notice-slot > #root-warn { color: var(--c-danger); }
.test2-information #test2-notice-slot > .good { color: var(--c-you); }
.test2-information #test2-notice-slot > #root-warn i { display: none; }
.test2-information body.paused #test2-information-rail,
.test2-information body.paused #step-cue { visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .test2-information #step-cue { transition: none; }
}
.test2-information.reduce-motion #step-cue { transition: none; }
`;

/** Mount after player enhancements (including mountGuide). No game state or settings change. */
export const mountInformation = () => {
  const root = document.documentElement;
  const game = document.getElementById('game');
  const wrap = document.getElementById('board-wrap');
  if (!IS_TEST2 || !game || !wrap || document.getElementById('test2-information-rail')) return;
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
  wrap.append(rail);

  const cue = document.getElementById('step-cue');
  if (cue) wrap.append(cue);
  const cueText = cue?.querySelector<HTMLElement>('.cue-text');
  if (cueText) {
    const labels: Record<string, string> = { draw: 'Draw card', grow: 'Grow or skip', throw: 'Throw one card' };
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
  let moveWasActive = root.classList.contains('test2-move-active');
  // A finished/cancelled move returns to a decision immediately; the guide owns which phase
  // it is. Its idle breath cannot bring text back over an in-progress card or Bloom selection.
  new MutationObserver(() => {
    const active = root.classList.contains('test2-move-active');
    if (moveWasActive && !active && !root.classList.contains('gd-picked') &&
        root.dataset.step !== 'none' && cue) cue.dataset.level = 'hi';
    moveWasActive = active;
  }).observe(root, { attributes: true, attributeFilter: ['class'] });
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
