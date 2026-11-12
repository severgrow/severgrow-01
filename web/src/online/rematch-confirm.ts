// CHALLENGE AGAIN, ASKED FIRST (owner, 2026-11-10: 'make the rematch button swords and ask to confirm
// "You want to challenge RYK again?"'). The same dark glass, type and two keys as the Blitz challenge
// confirm (live/ui.ts), centred over Your matches. One window, made on first use and kept.
//
// Resolves true on Challenge, false on Not now, Escape or a tap outside. Focus returns to the key
// that asked. No timers.
import { ONLINE } from '../../../src/strings.js';
import { glassBaseCss } from '../player/glass-surface.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';
import { SWORD_PATH } from './swords-glyph.js';

const CSS = `
${glassBaseCss('.rematch-glass')}
.rematch-scrim { position:fixed; inset:0; z-index:89; background:rgba(4,6,5,.34); touch-action:none; }
.rematch-glass { z-index:90; left:50%; top:50%; transform:translate(-50%,-50%); width:min(340px, calc(100vw - 32px));
  display:grid; grid-template-columns:44px 1fr; align-items:center; column-gap:12px; padding:16px; }
.rematch-glass[hidden], .rematch-scrim[hidden] { display:none !important; }
.rematch-glass .rg-mark { width:44px; height:44px; display:grid; place-items:center; color:#f2c879; }
.rematch-glass .rg-mark svg { width:26px; height:26px; }
.rematch-glass .rg-question { margin:0; color:#f0e9dc; font:500 15px/1.35 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.02em; overflow-wrap:anywhere; }
.rematch-glass .rg-actions { grid-column:1 / -1; display:flex; gap:8px; margin-top:14px; }
.rematch-glass .rg-actions button { flex:1; min-height:44px; min-width:44px; border-radius:10px; cursor:pointer;
  font:400 14px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); text-transform:uppercase; letter-spacing:.08em;
  color:#f0e9dc; background:rgba(242,237,228,.03); border:1px solid rgba(242,237,228,.14); }
.rematch-glass .rg-actions button.primary { border-color:rgba(242,200,121,.28); box-shadow:inset 0 1px 0 rgba(255,244,214,.06),0 0 12px rgba(242,200,121,.08); }
.rematch-glass .rg-actions button:active { box-shadow:inset 0 2px 5px rgba(0,0,0,.45); }
.rematch-glass .rg-actions button:focus-visible { outline:2px solid #f0e9dc; outline-offset:2px; }
.large-text .rematch-glass .rg-question { font-size:17px; }
`;

type Window = { show(name: string, from: HTMLElement | null): Promise<boolean> };
let made: Window | null = null;

const make = (): Window => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const scrim = document.createElement('div');
  scrim.className = 'rematch-scrim';
  scrim.hidden = true;
  const panel = document.createElement('section');
  panel.className = 'rematch-glass';
  panel.dataset.mode = 'rematch-confirm';
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML = `<span class="rg-mark" aria-hidden="true"><svg viewBox="-7.6 -7.6 15.2 15.2"><path d="${SWORD_PATH}" fill="currentColor"/></svg></span>`;
  const question = document.createElement('p');
  question.className = 'rg-question';
  question.id = 'rematch-confirm-question';
  panel.setAttribute('aria-labelledby', question.id);
  const actions = document.createElement('div');
  actions.className = 'rg-actions';
  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = ONLINE.rematchConfirmNo;
  no.dataset.rematch = 'no';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'primary';
  yes.textContent = ONLINE.rematchConfirmYes;
  yes.dataset.rematch = 'yes';
  actions.append(no, yes);
  panel.append(question, actions);
  document.body.append(scrim, panel);

  let settle: ((v: boolean) => void) | null = null;
  let returnTo: HTMLElement | null = null;
  const finish = (answer: boolean) => {
    if (!settle) return;
    const done = settle;
    settle = null;
    exitSurface(panel, { travel: 2, scale: 1, onDone: () => { panel.hidden = true; } });
    exitSurface(scrim, { travel: 0, scale: 1, onDone: () => { scrim.hidden = true; } });
    returnTo?.focus({ preventScroll: true });
    done(answer);
  };
  yes.addEventListener('click', () => finish(true));
  no.addEventListener('click', () => finish(false));
  scrim.addEventListener('click', () => finish(false));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
    if (e.key !== 'Tab') return;
    // keep focus inside the two keys
    const keys = [no, yes];
    const at = keys.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    keys[(at + (e.shiftKey ? keys.length - 1 : 1)) % keys.length]!.focus();
  });
  return {
    show(name, from) {
      if (settle) finish(false);
      returnTo = from;
      question.textContent = ONLINE.rematchConfirm(name);
      scrim.hidden = false;
      panel.hidden = false;
      enterSurface(scrim, { travel: 0, scale: 1 });
      enterSurface(panel, { travel: 2, scale: 1 });
      yes.focus({ preventScroll: true });
      return new Promise<boolean>((resolve) => { settle = resolve; });
    },
  };
};

/** Ask "You want to challenge NAME again?". True when the player chose Challenge. */
export const askRematch = (name: string, from: HTMLElement | null = null): Promise<boolean> => {
  made ??= make();
  return made.show(name, from);
};
