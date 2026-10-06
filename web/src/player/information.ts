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
.test2-information:has(#tooltip:not([hidden])) #step-cue,
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
@keyframes test2-cue-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .94; } }
.test2-information #step-cue:is([data-step='draw'], [data-step='grow'], [data-step='throw']) .cue-text {
  animation: test2-cue-breathe 3s ease-in-out infinite !important;
}
.test2-information-blocked #step-cue .cue-text,
.test2-information.test2-move-active #step-cue .cue-text { animation-play-state: paused !important; }
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
/* Test2 owns prompt visibility independently of the guide's legacy entrance/settle clock. */
.test2-information:not(.test2-idle-ready) #step-cue { opacity: 0 !important; }
.test2-information.test2-idle-ready #step-cue:not([data-step='opp']) { opacity: .86 !important; }
.test2-information.test2-idle-ready #step-cue .cue-text { animation-play-state: running !important; }
.test2-information #step-cue[data-step='opp'] { visibility: hidden !important; }
.test2-information:has(#tooltip:not([hidden])) #step-cue { opacity: 0 !important; }
.test2-information .dock .hand .card.playable {
  border-color: color-mix(in srgb, var(--c-accent) 88%, var(--c-line));
  box-shadow: 0 0 7px color-mix(in srgb, var(--c-accent) 16%, transparent);
}
.test2-information .dock .hand .card.test2-bloom-card {
  border-color: var(--c-accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c-accent) 28%, transparent), inset 0 0 7px color-mix(in srgb, var(--c-accent) 8%, transparent);
}
.test2-information .dock .hand.waiting .card {
  opacity: .38 !important;
  filter: grayscale(.85) brightness(.72) !important;
  box-shadow: none !important;
}
.test2-information #moves .test2-skip {
  color: var(--c-muted); background: transparent; border: 1px solid var(--c-line);
  opacity: .6; text-decoration: none;
}
.test2-information #moves .test2-skip:hover,
.test2-information #moves .test2-skip:focus-visible { opacity: 1; }
.test2-information .test2-combination { display: inline-flex; align-items: center; gap: 2px; }
.test2-information .test2-mini-card {
  display: grid; place-items: center; width: 14px; height: 28px; border: 1px solid currentColor;
  border-radius: 4px; font-size: 10px; line-height: 1; padding: 2px; box-sizing: border-box;
}
.test2-information .test2-mini-card .c-num { font-size: 10px; padding: 0; }
.test2-information .test2-mini-card .c-suit svg { width: 10px; height: 10px; }
.test2-information .test2-combination .s0 { color: var(--c-moss); }
.test2-information .test2-combination .s1 { color: var(--c-ash); }
.test2-information .test2-combination .s2 { color: var(--c-dew); }
.test2-information .test2-combination .s3 { color: var(--c-ember); }
.test2-information #moves .kind { min-height: 44px; padding: 4px 7px; }
.test2-information #moves .bloom-toggle::after { content: '⌄'; margin-left: 4px; }
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
  .test2-information #step-cue .cue-text.cue-text { animation: none !important; }
}
.test2-information.reduce-motion #step-cue { transition: none; }
.test2-information.reduce-motion #step-cue .cue-text { animation: none !important; }
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
    const labels: Record<string, string> = { draw: 'Draw', grow: 'Grow', throw: 'Throw', opp: '' };
    const normalize = () => {
      const label = root.dataset.test2Bloom === 'true' && root.dataset.step === 'grow' ? 'Bloom' : labels[root.dataset.step ?? ''];
      if (label !== undefined && cueText.textContent !== label) cueText.textContent = label;
    };
    // The guide remains the sole phase source, including on resumed games. Its idle refresh
    // can refill the old Grow wording, so normalize just that presentation without a loop.
    new MutationObserver(normalize).observe(cueText, { childList: true, characterData: true, subtree: true });
    new MutationObserver(normalize).observe(root, { attributes: true, attributeFilter: ['data-step', 'data-test2-bloom'] });
    normalize();
  }
  // Guidance is a fallback, never the opening ceremony of a turn. One timer is reset by
  // real input, phase/turn readiness, menus and visibility; repeated renders don't postpone it.
  let idleTimer = 0;
  let held = false;
  let idleKey = '';
  const armPrompt = () => {
    clearTimeout(idleTimer);
    root.classList.remove('test2-idle-ready');
    if (held || document.hidden || game.hidden || root.dataset.test2Waiting !== 'true' ||
        root.classList.contains('test2-information-blocked') || document.body.classList.contains('paused')) return;
    idleTimer = window.setTimeout(() => root.classList.add('test2-idle-ready'), 3000);
  };
  const syncPrompt = () => {
    const key = [root.dataset.step, root.dataset.test2Turn, root.dataset.test2Waiting,
      root.dataset.test2Bloom, root.classList.contains('test2-information-blocked'),
      document.body.classList.contains('paused'), game.hidden].join(':');
    if (key !== idleKey) { idleKey = key; armPrompt(); }
  };
  new MutationObserver(syncPrompt).observe(root, { attributes: true, attributeFilter: ['class', 'data-step', 'data-test2-turn', 'data-test2-waiting', 'data-test2-bloom'] });
  new MutationObserver(syncPrompt).observe(game, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(syncPrompt).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pointerdown', () => { held = true; armPrompt(); }, { capture: true, passive: true });
  for (const event of ['pointerup', 'pointercancel'] as const)
    window.addEventListener(event, () => { held = false; armPrompt(); }, { capture: true, passive: true });
  for (const event of ['keydown', 'click', 'wheel', 'pointermove'] as const)
    window.addEventListener(event, armPrompt, { capture: true, passive: true });
  window.addEventListener('blur', () => { held = false; clearTimeout(idleTimer); root.classList.remove('test2-idle-ready'); });
  window.addEventListener('focus', armPrompt);
  document.addEventListener('visibilitychange', armPrompt);
  syncPrompt();
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
