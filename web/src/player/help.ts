/** Test2 teaching lives behind one readable disclosure, never over playable hexes.
 * Move the original nodes so their game-owned content, dismissal and coach actions stay intact.
 */
export const HELP_SHEET_ID = 'sheet-test2-help';

type HelpKind = 'tip' | 'coach';
type HelpHooks = { sheet: (id: string | null) => void };

export const mountHelp = (hooks: HelpHooks) => {
  const slot = document.getElementById('test2-help-slot');
  const coach = document.getElementById('coach');
  const firstTip = document.getElementById('first-tip');
  if (!slot || !coach || !firstTip) throw new Error('Test2 help requires its rail and original teaching panels');

  const style = document.createElement('style');
  style.id = 'test2-help-style';
  style.textContent = `
    .test2-information .dock .table-row > .hint-line { display: none; }
    #test2-actions {
      grid-column: 3; grid-row: 2; display: flex; align-items: center;
      justify-content: center; gap: 16px; height: 28px; min-width: 0;
    }
    #test2-actions > .hand-slot { flex: 0 0 28px; margin: 0; }
    #test2-actions > .hand-slot[hidden] { display: grid; visibility: hidden; pointer-events: none; }
    #test2-help-button { touch-action: manipulation; }
    #test2-help-button:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 3px; }
    html[data-thumb] #test2-actions {
      position: absolute; left: var(--t-moves-x);
      top: calc(var(--t-moves-y) + var(--t-moves-h) - 44px);
      width: calc(100% - var(--t-moves-x) - 8px); height: 44px;
      justify-content: flex-end; gap: 4px; z-index: 3;
    }
    html[data-thumb] #test2-actions > .hand-slot { flex-basis: 44px; width: 44px; height: 44px; }
    html[data-thumb] #test2-actions > .hand-slot::after { display: none; }
    html[data-thumb] #test2-actions .i { width: 20px; height: 20px; }
    html[data-thumb] .dock .table-row > .moves {
      width: calc(100% - var(--t-moves-x) - 8px);
      height: calc(var(--t-moves-h) - 48px); justify-content: flex-end;
    }
    html[data-thumb='left'] #test2-actions,
    html[data-thumb='left'] .dock .table-row > .moves {
      left: 8px; width: calc(var(--t-discard-x) - 18px); justify-content: flex-start;
    }
    #sheet-test2-help {
      display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px;
      max-height: min(86dvh, 760px); overflow: hidden;
    }
    .reduce-motion #sheet-test2-help { animation: none; }
    #sheet-test2-help[hidden], #sheet-test2-help [hidden], #test2-help-button[hidden] { display: none; }
    #sheet-test2-help .sheet-head { position: relative; min-height: 48px; z-index: 1; }
    #sheet-test2-help .sheet-head h2 { white-space: normal; overflow: visible; }
    #sheet-test2-help .test2-help-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 0 8px; }
    #sheet-test2-help .test2-help-content {
      position: static !important; inset: auto !important; width: auto !important;
      max-width: none; max-height: none; margin: 0; padding: 4px 0;
      border: 0; border-radius: 0; background: transparent;
      font-size: 1rem; line-height: 1.5; overflow: visible;
    }
    #sheet-test2-help .coach-head { flex-wrap: wrap; min-height: 44px; gap: 6px 10px; }
    #sheet-test2-help .coach-head .muted { white-space: nowrap; }
    #sheet-test2-help .coach-head .i { flex: 0 0 auto; }
    #sheet-test2-help .coach p, #sheet-test2-help .first-tip p { margin: 12px 0; }
    #sheet-test2-help .coach-main { font-size: 1.08rem; }
    #sheet-test2-help .coach .tip, #sheet-test2-help .coach #coach-why { font-size: 1rem; }
    #sheet-test2-help #coach-suggested, #sheet-test2-help #coach-tip,
    #sheet-test2-help #coach-why, #sheet-test2-help #first-tip-title,
    #sheet-test2-help #first-tip-text {
      white-space: normal; overflow: visible; text-overflow: clip;
      -webkit-line-clamp: unset; max-height: none; word-break: normal;
    }
    #sheet-test2-help button {
      min-width: 44px; min-height: 44px; white-space: normal; line-height: 1.25;
      touch-action: manipulation;
    }
    #sheet-test2-help .coach-actions { gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    #sheet-test2-help .coach-actions .btn, #sheet-test2-help #coach-hide { padding: 10px 12px; }
    #sheet-test2-help .draw-demo { margin: 12px auto; }
  `;
  document.head.append(style);

  const trigger = document.createElement('button');
  trigger.id = 'test2-help-button';
  trigger.className = 'hand-slot test2-help-button';
  trigger.type = 'button';
  trigger.hidden = true;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', HELP_SHEET_ID);
  trigger.setAttribute('aria-expanded', 'false');
  // Keep the existing controls and handlers; only their Test2 presentation moves.
  const actions = document.createElement('div');
  actions.id = 'test2-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', 'Undo, hint and arrange cards');
  const undo = document.getElementById('tool-undo');
  const sort = document.getElementById('hand-sort');
  const table = document.querySelector('.dock > .table-row');
  if (!undo || !sort || !table) throw new Error('Test2 hint requires the existing card controls');
  trigger.innerHTML = '<span class="i"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/></svg></span>';
  actions.append(undo, trigger, sort);
  table.append(actions);

  const dialog = document.createElement('section');
  dialog.id = HELP_SHEET_ID;
  dialog.className = 'sheet test2-help-sheet';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'test2-help-title');
  const header = document.createElement('header');
  header.className = 'sheet-head';
  const title = document.createElement('h2');
  title.id = 'test2-help-title';
  title.textContent = 'Game help';
  const close = document.createElement('button');
  close.className = 'icon-only';
  close.type = 'button';
  close.dataset.close = '';
  close.setAttribute('aria-label', 'Close help');
  close.textContent = '×';
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'sheet-body test2-help-body';
  const tipPanel = document.createElement('div');
  tipPanel.className = 'test2-help-panel test2-help-tip';
  const coachPanel = document.createElement('div');
  coachPanel.className = 'test2-help-panel test2-help-coach';
  tipPanel.append(firstTip);
  coachPanel.append(coach);
  body.append(tipPanel, coachPanel);
  dialog.append(header, body);
  document.body.append(dialog);

  // Discard only the previous overlay's presentation; retain the actual game-owned nodes.
  for (const panel of [coach, firstTip]) {
    panel.classList.remove('teaching-compact');
    for (const property of ['position', 'left', 'width', 'top', 'bottom']) panel.style.removeProperty(property);
  }
  coach.classList.add('test2-help-content');
  firstTip.classList.add('test2-help-content');
  const coachHide = document.getElementById('coach-hide');
  if (coachHide) {
    coachHide.classList.remove('icon-only');
    coachHide.classList.add('btn', 'ghost');
    coachHide.textContent = 'Turn coach off';
  }

  let kind: HelpKind = 'coach';
  let blocked = true;
  let returnFocus: HTMLElement | null = null;
  let wasOpen = false;

  const available = (requested: HelpKind) => requested === 'tip' ? !firstTip.hidden : !coach.hidden;
  const showKind = () => {
    tipPanel.hidden = kind !== 'tip';
    coachPanel.hidden = kind !== 'coach';
    title.textContent = kind === 'tip' ? 'Learn to play' : 'Your hint';
    dialog.dataset.help = kind;
  };
  const restoreFocus = () => {
    if (document.querySelector('.sheet:not([hidden])')) {
      returnFocus = null;
      return;
    }
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus();
    else if (!trigger.hidden && !trigger.disabled) trigger.focus();
    else document.getElementById('board')?.focus();
    returnFocus = null;
  };
  const closeHelp = () => {
    if (dialog.hidden) return;
    hooks.sheet(null);
    trigger.setAttribute('aria-expanded', 'false');
    wasOpen = false;
    restoreFocus();
  };
  const open = (requested: HelpKind = kind) => {
    if (!available(requested)) return;
    kind = requested;
    showKind();
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
    hooks.sheet(HELP_SHEET_ID);
    trigger.setAttribute('aria-expanded', 'true');
    wasOpen = true;
  };
  trigger.addEventListener('click', () => { if (!blocked) open(); });
  close.addEventListener('click', closeHelp);

  // Closing first lets the existing "Show me where" handler place its arrow on the board.
  // Acknowledgements still run the original persistence and coach-state handlers afterwards.
  for (const id of ['coach-show', 'coach-hide', 'coach-summary-ok', 'first-tip-ok']) {
    document.getElementById(id)?.addEventListener('click', closeHelp, { capture: true });
  }

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeHelp();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !!element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  // The existing scrim and keyboard sheet hooks also close this sheet. Observe only visibility,
  // so text updates never open it or steal focus from a move.
  const observer = new MutationObserver(() => {
    trigger.setAttribute('aria-expanded', String(!dialog.hidden));
    if (wasOpen && dialog.hidden) {
      wasOpen = false;
      restoreFocus();
    }
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });

  return {
    open,
    update({ blocked: nextBlocked }: { blocked: boolean }) {
      blocked = nextBlocked;
      const hasTip = !firstTip.hidden;
      const hasCoach = !coach.hidden;
      trigger.hidden = blocked || (!hasTip && !hasCoach);
      trigger.disabled = blocked;
      slot.closest<HTMLElement>('#test2-information-rail')?.setAttribute('data-help', trigger.hidden ? 'off' : 'on');
      if (dialog.hidden) kind = hasCoach ? 'coach' : 'tip';
      const tipTitle = document.getElementById('first-tip-title')?.textContent?.trim() || 'Game help';
      const progress = document.getElementById('coach-step');
      const step = progress?.textContent?.trim().replace(/^Tip\s+/i, '') || '';
      if (step && progress) progress.textContent = `Tip ${step}`;
      if (hasTip && !hasCoach) {
        const topic = /bloom/i.test(tipTitle) ? 'Bloom' : tipTitle;
        trigger.title = `Learn: ${topic}`;
        trigger.setAttribute('aria-label', `Learn: ${tipTitle}. Open the full explanation.`);
      } else {
        trigger.title = 'Hint';
        trigger.setAttribute('aria-label', step ? `Hint. Tip ${step}. Open the suggestion and explanation.` : 'Hint. Open your coach summary.');
      }
      if (!dialog.hidden) {
        // An opponent action or game ending may invalidate advice while a sheet is open.
        // Never retain a stale move as an actionable hint.
        if (!available(kind)) closeHelp();
        else showKind();
      }
    },
  };
};
