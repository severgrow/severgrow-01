/** Futasaku 0.3 cockpit presentation. Game-owned buttons remain the action source. */
type Action = { key: string; label: string; icon: string; priority: number; source: HTMLButtonElement };

const ICONS: Record<string, string> = {
  skip: '<path d="m5 5 7 7-7 7V5Zm8 0 7 7-7 7V5Z" fill="currentColor" stroke="none"/>',
  cancel: '<path d="M6 6 18 18M18 6 6 18"/>',
  clear: '<path d="M5 7h14M9 7V5h6v2m2 0-.7 12H7.7L7 7m3 4v5m4-5v5"/>',
  reverse: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  previous: '<path d="m14.5 5-7 7 7 7"/>',
  next: '<path d="m9.5 5 7 7-7 7"/>',
  bloom: '<path d="M12 12c-3-4-3-7 0-8 3 1 3 4 0 8Zm0 0c4-3 7-3 8 0-1 3-4 3-8 0Zm0 0c3 4 3 7 0 8-3-1-3-4 0-8Zm0 0c-4 3-7 3-8 0 1-3 4-3 8 0Z"/>',
  continue: '<path d="m8 5 8 7-8 7"/>',
  confirm: '<path d="m5 12 5 5L19 7"/>',
  neutral: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const svg = (kind: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] ?? ICONS.continue}</svg>`;
const actionKind = (button: HTMLButtonElement) => button.matches('[data-kind],.bloom-toggle') ? 'bloom'
  : button.matches('.draw-clear') ? 'clear' : button.matches('.draw-reverse') ? 'reverse'
  : button.matches('.list-prev') ? 'previous' : button.matches('.list-next') ? 'next'
  : button.matches('.cancel') ? 'cancel' : button.matches('.test2-skip,.end') ? 'skip'
  : button.matches('.empty-continue') ? 'continue' : button.matches('.primary') ? 'confirm' : 'continue';
const priority: Record<string, number> = { clear: 0, confirm: 1, cancel: 2, bloom: 3, reverse: 4, next: 5, previous: 6, continue: 7, skip: 8 };

export const SMART_COCKPIT_CSS = `
html.test2-information #step-cue { display:none !important; }
html.test2-information #tool-skip { display:none !important; }
html.test2-information #test2-box {
  --hardware-grain:
    radial-gradient(circle at 2px 3px,rgba(240,229,200,.22) 0 .62px,transparent 1px) 0 0/11px 13px,
    radial-gradient(circle at 7px 8px,rgba(0,0,0,.32) 0 .62px,transparent 1px) 0 0/17px 19px,
    radial-gradient(ellipse 22px 8px at 13% 2%,rgba(220,205,170,.09),transparent 90%),
    radial-gradient(ellipse 17px 7px at 86% 99%,rgba(220,205,170,.07),transparent 90%);
  --box-tools:calc(3 * var(--control-size) + 2 * var(--control-gap));
}
html.test2-information #test2-box #moves { position:absolute !important; width:0 !important; height:0 !important; min-height:0 !important; overflow:hidden !important; visibility:hidden !important; pointer-events:none !important; }
html.test2-information #test2-box > #smart-panel {
  grid-column:3; grid-row:1 / 3; align-self:end; justify-self:end;
  display:grid; grid-template-columns:repeat(3,var(--control-size)); grid-template-rows:repeat(2,var(--control-size));
  gap:var(--control-gap); width:var(--box-tools); height:calc(2 * var(--control-size) + var(--control-gap));
  position:relative; z-index:5; box-sizing:border-box;
}
html.test2-information[data-thumb='left'] #test2-box > #smart-panel { grid-column:1; justify-self:start; }
body.paused #smart-panel { visibility:hidden; }
html.test2-information #test2-box #test2-actions { display:contents !important; position:static !important; width:auto !important; height:auto !important; }
html.test2-information #test2-box #test2-actions > :nth-child(1) { grid-column:1; grid-row:2; }
html.test2-information #test2-box #test2-actions > :nth-child(2) { grid-column:2; grid-row:2; }
html.test2-information #test2-box #test2-actions > :nth-child(3) { grid-column:3; grid-row:2; }
html.test2-information #test2-box #test2-actions > .hand-slot[hidden] { display:grid !important; visibility:visible !important; }
html.test2-information #test2-box :is(#smart-context,#test2-actions > .hand-slot) {
  width:var(--control-size) !important; height:var(--control-size) !important;
  min-width:var(--control-size); min-height:var(--control-size); max-width:var(--control-size);
  margin:0; padding:0; position:relative; inset:auto; flex:none;
  display:grid; place-items:center; box-sizing:border-box;
  border:1px solid rgba(201,198,186,.33); border-radius:12px;
  background:var(--hardware-grain),linear-gradient(160deg,#262826 0%,#1c1e1d 42%,#141615 100%);
  color:var(--control-ivory); opacity:1;
  box-shadow:inset 0 1px rgba(255,250,236,.07),inset 0 -2px rgba(0,0,0,.46),0 2px 4px rgba(0,0,0,.38);
  touch-action:manipulation;
}
html.test2-information #test2-box #smart-context { grid-column:3; grid-row:1; cursor:pointer; }
html.test2-information #test2-box #smart-context svg { width:21px; height:21px; }
html.test2-information #test2-box #smart-context:is(:hover,:focus-visible,[aria-expanded='true']) {
  border-color:var(--control-amber); color:#fff1cf;
  box-shadow:inset 0 1px rgba(255,246,215,.14),inset 0 -2px rgba(0,0,0,.48),0 0 0 1px rgba(196,150,88,.3),0 0 12px rgba(196,150,88,.18);
}
html.test2-information #test2-box #smart-context:active:not(:disabled) { transform:translateY(1px) scale(.98); }
html.test2-information #test2-box #smart-context:disabled { opacity:.38; cursor:default; }
html.test2-information #test2-box #test2-actions > .hand-slot:disabled { opacity:.54; }
html.test2-information #test2-box #smart-context:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.test2-information #test2-box #smart-led {
  grid-column:1 / 3; grid-row:1; width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  padding:4px; box-sizing:border-box; border:1px solid rgba(201,198,186,.27); border-radius:12px;
  background:var(--hardware-grain),linear-gradient(160deg,#252725,#141615);
  box-shadow:inset 0 1px rgba(255,250,236,.06),inset 0 -2px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.38);
}
html.test2-information #test2-box #smart-led-window {
  display:flex; align-items:center; overflow:hidden; width:100%; height:100%; padding:0 5px; box-sizing:border-box;
  border-radius:7px; background:linear-gradient(180deg,#090c0b,#11140f 60%,#080a09);
  box-shadow:inset 0 1px 3px #030504,inset 0 0 0 1px rgba(199,164,104,.11);
}
html.test2-information #test2-box #smart-led-text {
  display:block; flex:none; white-space:nowrap; color:#e2b778;
  font:700 9px/1 var(--font-mono,ui-monospace,monospace); letter-spacing:.02em;
  text-shadow:0 0 5px rgba(217,149,55,.21); font-variant-numeric:tabular-nums;
}
@keyframes smart-led-scroll { 0%,13% { transform:translateX(0); } 87%,100% { transform:translateX(calc(-1 * var(--led-travel,0px))); } }
html.test2-information #smart-led-text.scrolling { animation:smart-led-scroll var(--led-duration,5s) ease-in-out infinite alternate; }
html.test2-information #smart-selector {
  position:absolute; right:0; top:0; z-index:10;
  display:flex; gap:var(--control-gap); width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  overflow-x:auto; overflow-y:hidden; padding:0; box-sizing:border-box; scrollbar-width:none;
  border:0; border-radius:12px;
  background:var(--hardware-grain),linear-gradient(155deg,#262826,#111411);
  box-shadow:0 2px 8px rgba(0,0,0,.4);
}
html.test2-information #smart-selector::-webkit-scrollbar { display:none; }
html.test2-information #smart-selector[hidden] { display:none; }
html.test2-information #smart-selector button {
  display:grid; place-items:center; flex:0 0 var(--control-size); width:var(--control-size); height:var(--control-size);
  border:1px solid rgba(201,198,186,.31); border-radius:12px; padding:0;
  background:var(--hardware-grain),linear-gradient(155deg,#262826,#111411);
  color:var(--control-ivory); touch-action:manipulation;
}
html.test2-information #smart-selector button:first-child { background:rgba(196,150,88,.10); }
html.test2-information #smart-selector button:is(:hover,:focus-visible) { background:rgba(196,150,88,.2); outline:1px solid var(--control-amber); }
html.test2-information #smart-selector button svg { width:19px; height:19px; }
html.test2-information #smart-selector .test2-combination { display:flex; flex-wrap:nowrap; gap:1px; max-width:40px; }
html.test2-information #smart-selector .test2-mini-card { width:9px !important; min-width:9px !important; height:18px !important; padding:0 !important; border-radius:2px; }
html.test2-information #smart-selector .test2-mini-card .c-num { font-size:7px !important; }
html.test2-information #smart-selector .test2-mini-card .c-suit svg { width:7px !important; height:7px !important; }
html.test2-information #smart-selector .smart-action-label { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
html.test2-information .dock #test2-box :is(#deck,#discard) .pile-meta .pile-count { left:50%; transform:translateX(-50%); }
html.test2-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) { box-shadow:0 0 0 1px rgba(119,194,115,.36),0 0 16px 3px rgba(88,171,86,.38),0 5px 15px rgba(5,16,9,.30); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card:not(.test2-throw-picked) { box-shadow:0 0 0 1px rgba(222,110,83,.45),0 0 18px 3px rgba(190,68,47,.48),0 5px 15px rgba(20,11,10,.34); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card.test2-throw-picked { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 18px 3px rgba(190,68,47,.48) !important; }
@media (prefers-reduced-motion:reduce) { html.test2-information #smart-led-text.scrolling { animation:none; max-width:100%; overflow:hidden; text-overflow:ellipsis; } }
html.test2-information.reduce-motion #smart-led-text.scrolling { animation:none; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
`;

export function mountSmartCockpit() {
  const box = document.getElementById('test2-box')!;
  const actions = document.getElementById('test2-actions')!;
  const moves = document.getElementById('moves')!;
  const rail = document.getElementById('test2-information-rail')!;
  const style = document.createElement('style');
  style.id = 'smart-cockpit-style'; style.textContent = SMART_COCKPIT_CSS; document.head.append(style);
  const panel = document.createElement('div'); panel.id = 'smart-panel'; panel.setAttribute('role','group'); panel.setAttribute('aria-label','Game controls');
  const led = document.createElement('div'); led.id = 'smart-led'; led.setAttribute('role','status'); led.setAttribute('aria-live','polite');
  const windowEl = document.createElement('div'); windowEl.id = 'smart-led-window';
  const text = document.createElement('span'); text.id = 'smart-led-text'; windowEl.append(text); led.append(windowEl);
  const context = document.createElement('button'); context.id = 'smart-context'; context.type = 'button'; context.setAttribute('aria-haspopup','menu'); context.setAttribute('aria-expanded','false');
  const selector = document.createElement('div'); selector.id = 'smart-selector'; selector.setAttribute('role','menu'); selector.hidden = true;
  context.setAttribute('aria-controls',selector.id);
  panel.append(led,context,actions,selector); box.append(panel);
  moves.setAttribute('aria-hidden','true');
  let current: Action[] = [];
  let signature = '';
  let lastPhase = '';
  let lastAction = '';
  let lastText = '';
  let messageUntil = 0;
  let transient = '';
  let messageTimer = 0;
  const close = () => { selector.hidden = true; context.setAttribute('aria-expanded','false'); };
  const setText = (value: string) => {
    if (value === lastText) return;
    lastText = value; text.textContent = value; led.title = value;
    text.classList.remove('scrolling');
    requestAnimationFrame(() => {
      if (value !== lastText) return;
      const travel = Math.ceil(text.scrollWidth - windowEl.clientWidth + 10);
      if (travel > 2) {
        text.style.setProperty('--led-travel',`${travel}px`);
        text.style.setProperty('--led-duration',`${Math.max(4.8,travel/20+2.5).toFixed(1)}s`);
        text.classList.add('scrolling');
      }
    });
  };
  const phaseMessage = () => {
    const root = document.documentElement;
    if (root.dataset.step === 'opp') return 'OPPONENT TURN';
    if (root.dataset.step === 'draw') return 'DRAW A CARD';
    if (root.dataset.step === 'throw') return 'THROW A CARD';
    if (root.dataset.test2Bloom === 'true') return 'BLOOM READY';
    if (root.dataset.step === 'grow') return 'GROW OR SKIP';
    return 'FUTASAKU';
  };
  const refreshMessage = () => {
    if (Date.now() >= messageUntil) transient = '';
    setText(transient || phaseMessage());
  };
  const flash = (value: string, ms = 1900) => {
    transient = value.toUpperCase(); messageUntil = Date.now() + ms;
    clearTimeout(messageTimer); refreshMessage();
    messageTimer = window.setTimeout(refreshMessage,ms+10);
  };
  const collect = (): Action[] => {
    const buttons = [...moves.querySelectorAll<HTMLButtonElement>('button')];
    const hasBloomChoices = buttons.some(button => button.hasAttribute('data-kind'));
    const items = buttons.filter(button => !button.disabled && !(hasBloomChoices && button.classList.contains('bloom-toggle')));
    if (hasBloomChoices) for (const button of [...moves.querySelectorAll<HTMLButtonElement>('.bloom-options [data-kind]')]) if (!items.includes(button)) items.push(button);
    if (document.getElementById('tool-skip')?.hidden === false) {
      const skip = document.getElementById('tool-skip') as HTMLButtonElement;
      items.push(skip);
    }
    if (document.getElementById('confirm')?.hidden === false) {
      items.push(document.getElementById('confirm-play') as HTMLButtonElement,document.getElementById('confirm-cancel') as HTMLButtonElement);
    }
    return items.filter(button => !button.closest('[hidden]') || button.closest('.bloom-options'))
      .map((button,index) => {
        const kind = button.id === 'tool-skip' ? 'skip' : button.id === 'confirm-play' ? 'confirm' : button.id === 'confirm-cancel' ? 'cancel' : actionKind(button);
        const label = button.getAttribute('aria-label') || button.title || button.textContent?.trim() || kind;
        const key = `${kind}:${button.dataset.kind ?? ''}:${label}`;
        return { key,label,icon:kind,priority:(button.id === 'tool-skip' ? -2 : priority[kind] ?? 9)+index/100,source:button };
      }).sort((a,b)=>a.priority-b.priority);
  };
  const renderSelector = () => {
    selector.replaceChildren(...current.map(item => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role','menuitem');
      b.dataset.action = item.key; b.setAttribute('aria-label',item.label); b.title = item.label;
      const combination = item.icon === 'bloom' ? item.source.querySelector('.test2-combination') : null;
      if (combination) b.append(combination.cloneNode(true)); else b.innerHTML = svg(item.icon);
      const label = document.createElement('span'); label.className = 'smart-action-label'; label.textContent = item.label; b.append(label);
      b.addEventListener('click', () => { close(); current.find(a=>a.key===item.key)?.source.click(); });
      return b;
    }));
  };
  context.addEventListener('click', () => {
    if (current.length === 1) { current[0]!.source.click(); return; }
    if (current.length < 2) return;
    const opening = selector.hidden;
    if (opening) { selector.hidden = false; context.setAttribute('aria-expanded','true'); selector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else close();
  });
  document.addEventListener('pointerdown', event => { if (!panel.contains(event.target as Node)) close(); }, { capture:true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !selector.hidden) { event.preventDefault(); close(); context.focus(); } });
  rail.addEventListener('test2-noticechange', () => {
    const shown = rail.querySelector<HTMLElement>('[data-information-active="true"]');
    if (shown && rail.dataset.noticePriority === 'major') flash(shown.textContent?.trim() || 'ACTION',2200);
    else refreshMessage();
  });
  window.addEventListener('resize', () => { lastText = ''; refreshMessage(); });
  return { sync() {
    const next = collect();
    const phase = document.documentElement.dataset.step ?? '';
    const key = `${phase}:${next.map(a=>a.key).join('|')}`;
    current = next;
    if (key !== signature) { close(); signature = key; renderSelector(); }
    const first = current[0];
    if (lastPhase === phase && lastAction && first?.key !== lastAction) {
      const hint = first?.icon === 'clear' ? 'CLEAR SHAPE' : first?.icon === 'reverse' ? 'REVERSE ORDER'
        : first?.icon === 'cancel' ? 'CANCEL SELECTION' : first?.icon === 'bloom' ? 'BLOOM READY'
        : first?.source.id === 'tool-skip' ? 'FAST FORWARD' : '';
      if (hint) flash(hint,1250);
    }
    lastPhase = phase; lastAction = first?.key ?? '';
    context.innerHTML = svg(first?.icon ?? 'neutral'); context.disabled = !first;
    context.setAttribute('aria-haspopup',current.length > 1 ? 'menu' : 'false');
    context.setAttribute('aria-label',first ? current.length > 1 ? `${first.label}. ${current.length} actions available` : first.label : 'No action available');
    context.title = context.getAttribute('aria-label') ?? '';
    for (const b of moves.querySelectorAll<HTMLButtonElement>('button')) b.tabIndex = -1;
    refreshMessage();
  }, flash };
}
