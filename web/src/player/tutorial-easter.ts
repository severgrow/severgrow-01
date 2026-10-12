// Temporary one-shot tutorial easter egg. Delete when done joking around.
// Pink glitchy "error" modal — must not permanently break the tutorial gate.

const STYLE_ID = 'tutorial-easter-style';
const ROOT_ID = 'tutorial-easter';

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 120; display: grid; place-items: center;
  padding: 24px; box-sizing: border-box; pointer-events: auto;
  background: rgba(40, 0, 28, .18);
}
#${ROOT_ID}[hidden] { display: none; }
#${ROOT_ID} .te-win {
  position: relative; width: min(340px, calc(100vw - 40px));
  padding: 18px 16px 14px; border-radius: 4px;
  background: linear-gradient(160deg, #ff4da6 0%, #ff78c2 42%, #ff2d8a 100%);
  color: #2a0018; font: 700 15px/1.25 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  box-shadow: 6px 8px 0 rgba(90, 0, 50, .35), 0 0 0 2px #ff9ad0 inset;
  transform: rotate(-0.8deg) skewX(-0.4deg);
  animation: te-glitch 1.1s steps(2, end) infinite;
}
#${ROOT_ID} .te-win::before {
  content: 'ERR_0xLOVE'; position: absolute; top: 6px; right: 10px;
  font: 600 9px/1 monospace; letter-spacing: .14em; color: rgba(60, 0, 30, .55);
}
#${ROOT_ID} .te-title {
  margin: 10px 0 14px; font: 800 22px/1.1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .04em; text-transform: uppercase; text-wrap: balance;
  text-shadow: 2px 0 #fff, -1px 0 #c00;
}
#${ROOT_ID} .te-sub {
  margin: 0 0 14px; font: 600 13px/1.35 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  color: rgba(42, 0, 24, .82);
}
#${ROOT_ID} .te-actions { display: flex; flex-wrap: wrap; gap: 8px; }
#${ROOT_ID} .te-actions button {
  flex: 1 1 120px; min-height: 44px; border: 2px solid #2a0018; border-radius: 3px;
  background: #fff0f7; color: #2a0018; cursor: pointer;
  font: 700 12px/1.15 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .03em;
}
#${ROOT_ID} .te-actions button:focus-visible { outline: 2px solid #2a0018; outline-offset: 2px; }
#${ROOT_ID} .te-actions button:active { transform: translateY(1px); }
@keyframes te-glitch {
  0%, 100% { filter: none; transform: rotate(-0.8deg) skewX(-0.4deg); }
  40% { filter: hue-rotate(-12deg) saturate(1.2); transform: rotate(-0.4deg) translateX(1px); }
  70% { filter: contrast(1.08); transform: rotate(-1.1deg) translateX(-1px); }
}
.reduce-motion #${ROOT_ID} .te-win { animation: none; }
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} .te-win { animation: none; }
}
`;

export const TUTORIAL_EASTER_SELECTORS = Object.freeze([
  `#${ROOT_ID}`,
  `#${ROOT_ID} button`,
] as const);

export type TutorialEaster = {
  isOpen: () => boolean;
  /** Show once. onDone runs after full dismiss (either button path). */
  show: (onDone: () => void) => void;
  dismiss: () => void;
};

export const mountTutorialEaster = (): TutorialEaster => {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  let root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.hidden = true;
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'I LOVE YOU BOOBSIE');
    document.body.append(root);
  }

  let open = false;
  let onDone: (() => void) | null = null;

  const finish = () => {
    if (!root) return;
    root.hidden = true;
    root.replaceChildren();
    open = false;
    const done = onDone;
    onDone = null;
    done?.();
  };

  const showImpossible = () => {
    if (!root) return;
    root.replaceChildren();
    const win = document.createElement('div');
    win.className = 'te-win';
    const title = document.createElement('p');
    title.className = 'te-title';
    title.textContent = "THAT'S IMPOSSIBLE <3";
    const actions = document.createElement('div');
    actions.className = 'te-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'OK';
    ok.addEventListener('click', finish);
    actions.append(ok);
    win.append(title, actions);
    root.append(win);
    ok.focus();
  };

  return {
    isOpen: () => open,
    show(done) {
      if (!root || open) return;
      open = true;
      onDone = done;
      root.hidden = false;
      root.replaceChildren();
      const win = document.createElement('div');
      win.className = 'te-win';
      const title = document.createElement('p');
      title.className = 'te-title';
      title.textContent = 'I LOVE YOU BOOBSIE';
      const sub = document.createElement('p');
      sub.className = 'te-sub';
      sub.textContent = 'System fault // affection overflow';
      const actions = document.createElement('div');
      actions.className = 'te-actions';
      const too = document.createElement('button');
      too.type = 'button';
      too.textContent = 'I LOVE YOU TOO';
      too.addEventListener('click', finish);
      const more = document.createElement('button');
      more.type = 'button';
      more.textContent = 'I LOVE YOU MORE';
      more.addEventListener('click', showImpossible);
      actions.append(too, more);
      win.append(title, sub, actions);
      root.append(win);
      too.focus();
    },
    dismiss: finish,
  };
};
