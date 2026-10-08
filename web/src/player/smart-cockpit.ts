/** Futasaku 0.3 cockpit presentation. Game-owned buttons remain the action source. */
import { drawLedCells } from './led-cells.js';
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
    radial-gradient(ellipse 9px 6px at 2px 3px,rgba(231,216,181,.27),transparent 88%) 0 0/19px 23px,
    radial-gradient(ellipse 10px 7px at 8px 9px,rgba(0,0,0,.40),transparent 90%) 0 0/27px 29px,
    radial-gradient(circle at 4px 6px,rgba(232,218,188,.43) 0 1.1px,transparent 1.7px) 0 0/13px 17px,
    radial-gradient(circle at 9px 4px,rgba(0,0,0,.52) 0 1px,transparent 1.6px) 0 0/17px 13px;
  --hardware-wear:
    radial-gradient(ellipse 17px 11px at 8% 5%,rgba(234,220,185,.14),transparent 95%),
    radial-gradient(ellipse 15px 12px at 38% 52%,rgba(213,200,166,.14),transparent 82%),
    radial-gradient(ellipse 13px 9px at 91% 92%,rgba(201,184,145,.10),transparent 95%),
    linear-gradient(116deg,rgba(239,227,198,.16),transparent 24%,transparent 76%,rgba(232,218,184,.09)),
    linear-gradient(0deg,rgba(206,187,148,.10),transparent 12%,transparent 88%,rgba(234,222,194,.13));
  --hardware-edge:inset 0 1px rgba(255,244,215,.18),inset 1px 0 rgba(225,212,180,.08),inset -1px 0 rgba(225,212,180,.06),inset 0 -2px rgba(0,0,0,.48);
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
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot) {
  width:var(--control-size) !important; height:var(--control-size) !important;
  min-width:var(--control-size); min-height:var(--control-size); max-width:var(--control-size);
  margin:0; padding:0; position:relative; inset:auto; flex:none;
  display:grid; place-items:center; box-sizing:border-box;
  border:1px solid rgba(201,198,186,.33); border-radius:12px;
  background:var(--hardware-wear),var(--hardware-grain),linear-gradient(160deg,#262826 0%,#1c1e1d 42%,#141615 100%);
  color:var(--control-ivory); opacity:1;
  box-shadow:var(--hardware-edge),0 2px 4px rgba(0,0,0,.38);
  touch-action:manipulation;
}
html.test2-information #test2-box #smart-context { grid-column:3; grid-row:1; cursor:pointer; }
html.test2-information #test2-box #smart-context svg { width:21px; height:21px; }
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot) :is(svg,.i) { opacity:.94; }
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
  background:var(--hardware-wear),var(--hardware-grain),linear-gradient(160deg,#252725,#141615);
  box-shadow:var(--hardware-edge),0 2px 4px rgba(0,0,0,.38);
}
html.test2-information #test2-box #smart-led-window {
  display:flex; align-items:center; overflow:hidden; width:100%; height:100%; padding:0 5px; box-sizing:border-box; position:relative;
  border-radius:7px; background:linear-gradient(180deg,#090c0b,#11140f 60%,#080a09);
  box-shadow:inset 0 1px 3px #030504,inset 0 0 0 1px rgba(199,164,104,.16),inset 0 0 10px rgba(192,125,45,.055);
}
html.test2-information #test2-box #smart-led-text {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
html.test2-information #test2-box #smart-led-cells {
  display:block; flex:none; width:auto; height:20px;
}
@keyframes smart-led-scroll { 0%,13% { transform:translateX(0); } 87%,100% { transform:translateX(calc(-1 * var(--led-travel,0px))); } }
html.test2-information #smart-led-cells.scrolling { animation:smart-led-scroll var(--led-duration,5s) ease-in-out infinite alternate; }
html.test2-information #smart-selector {
  position:absolute; right:0; top:0; z-index:10;
  display:flex; gap:var(--control-gap); width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  overflow-x:auto; overflow-y:hidden; padding:0; box-sizing:border-box; scrollbar-width:none;
  border:0; border-radius:12px;
  background:var(--hardware-wear),var(--hardware-grain),linear-gradient(155deg,#262826,#111411);
  box-shadow:0 2px 8px rgba(0,0,0,.4);
}
html.test2-information #smart-selector::-webkit-scrollbar { display:none; }
html.test2-information #smart-selector[hidden] { display:none; }
html.test2-information #smart-selector button {
  display:grid; place-items:center; flex:0 0 var(--control-size); width:var(--control-size); height:var(--control-size);
  border:1px solid rgba(201,198,186,.31); border-radius:12px; padding:0;
  background:var(--hardware-wear),var(--hardware-grain),linear-gradient(155deg,#262826,#111411);
  color:var(--control-ivory); touch-action:manipulation; box-shadow:var(--hardware-edge);
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
html.test2-information .dock #test2-box .pile-count.pile-meter {
  background:var(--hardware-wear),var(--hardware-grain),linear-gradient(180deg,#23251f 0%,#101210 26%,#0b0d0b 60%,#20221d 100%);
  border-color:rgba(189,178,151,.7);
  box-shadow:var(--hardware-edge),0 1px 2px rgba(0,0,0,.55);
}
html.test2-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) { box-shadow:0 0 0 1px rgba(119,194,115,.4),0 0 9px 1px rgba(88,171,86,.4),0 5px 12px rgba(5,16,9,.30); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card:not(.test2-throw-picked) { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 10px 1px rgba(190,68,47,.5),0 5px 12px rgba(20,11,10,.34); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card.test2-throw-picked { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 10px 1px rgba(190,68,47,.5) !important; }
/* The discard draw cue belongs to its printed top card, never to a second slot. */
html.test2-information[data-step='draw'] #discard .pile-card { box-shadow:none !important; }
html.test2-information[data-step='draw'] #discard .gd-fx { display:none !important; }
html.test2-information[data-step='draw'] #discard.ready:not(.test2-bloom-draw) .pile-top.card { border-color:var(--c-line); box-shadow:0 1px 2px rgba(0,0,0,.4); }
html.test2-information[data-step='draw'] #discard.test2-bloom-draw .pile-top.card {
  transform:translateY(-3px); border-color:rgba(209,172,105,.8);
  box-shadow:0 0 0 1px rgba(209,172,105,.34),0 0 9px 1px rgba(205,162,87,.21),0 2px 4px rgba(0,0,0,.45);
  transition:transform .2s ease-out,border-color .2s ease-out,box-shadow .2s ease-out;
}
/* Legal empty sockets share one warm, recessed treatment on Forest and Volcano turns. */
html.test2-information #board .l-over .receptive-well {
  fill:rgba(225,216,190,.045); stroke:rgba(5,6,5,.66); stroke-width:2.5;
  pointer-events:none;
}
html.test2-information #board .l-over .target.kind-grow {
  fill:#ded6bd; fill-opacity:calc(.055 + var(--near,0) * .16);
  stroke:#d8c8a5; stroke-width:1.15; stroke-opacity:calc(.30 + var(--near,0) * .35);
  stroke-dasharray:none; animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.test2-information #board .l-over .target.kind-grow:hover {
  fill-opacity:.24; stroke-opacity:.72;
}
html.test2-information #board .l-over .selected.receptive-active {
  fill:#e2d7ba; fill-opacity:.20; stroke:#e1d0a9; stroke-opacity:.70; stroke-width:1.35;
  pointer-events:none;
}
@media (prefers-reduced-motion:reduce) { html.test2-information #smart-led-cells.scrolling { animation:none; } }
html.test2-information.reduce-motion #smart-led-cells.scrolling { animation:none; }
@media (prefers-reduced-motion:reduce) { html.test2-information #board .l-over .target.kind-grow { animation:none; transition:none; } }
html.test2-information.reduce-motion #board .l-over .target.kind-grow { animation:none; transition:none; }
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
  const text = document.createElement('span'); text.id = 'smart-led-text';
  const cells = document.createElement('canvas'); cells.id = 'smart-led-cells'; cells.setAttribute('aria-hidden','true');
  windowEl.append(text,cells); led.append(windowEl);
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
    cells.classList.remove('scrolling');
    const width = drawLedCells(cells,value);
    requestAnimationFrame(() => {
      if (value !== lastText) return;
      const travel = Math.ceil(width - windowEl.clientWidth + 10);
      if (travel > 2) {
        cells.style.setProperty('--led-travel',`${travel}px`);
        cells.style.setProperty('--led-duration',`${Math.max(4.8,travel/20+2.5).toFixed(1)}s`);
        cells.classList.add('scrolling');
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
