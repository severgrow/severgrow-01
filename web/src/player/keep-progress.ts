// Quiet optional "Keep your progress" for guests (owner, 2026-11-08).
//
// At most once: after a campaign level clear or a first claim. Dismissible. Never over a Blitz
// decision or the victory / Seeds card. Not a modal — a small dark-glass line with Sign in / Not now.
import type { KeyValue } from '../../../server/src/client.js';
import { ACCOUNT } from '../../../src/strings.js';
import { enterSurface, interfaceMotionAllowed } from '../ui/interface-motion.js';

export const KEEP_PROGRESS_KEY = 'severgrow.account.keep-progress.v1';

export type KeepProgressMemory = {
  dismissed: boolean;
  /** Already shown once on this device (even if not dismissed). */
  offered: boolean;
};

export type KeepProgressReason = 'level-clear' | 'first-claim';

export const parseKeepProgressMemory = (raw: string | null): KeepProgressMemory => {
  try {
    const parsed = raw ? JSON.parse(raw) as Partial<KeepProgressMemory> : null;
    if (!parsed || typeof parsed !== 'object') return { dismissed: false, offered: false };
    return {
      dismissed: parsed.dismissed === true,
      offered: parsed.offered === true,
    };
  } catch {
    return { dismissed: false, offered: false };
  }
};

export const keepProgressDecision = (input: {
  kind: 'guest' | 'account' | null;
  memory: KeepProgressMemory;
  reason: KeepProgressReason;
  covered: boolean;
}): { offer: boolean; memory: KeepProgressMemory } => {
  if (input.kind !== 'guest') return { offer: false, memory: input.memory };
  if (input.memory.dismissed || input.memory.offered) return { offer: false, memory: input.memory };
  if (input.covered) return { offer: false, memory: input.memory };
  if (input.reason !== 'level-clear' && input.reason !== 'first-claim') {
    return { offer: false, memory: input.memory };
  }
  return { offer: true, memory: { dismissed: false, offered: true } };
};

export const KEEP_PROGRESS_CSS = `
/* A dialog over the finished game, the screen behind blurred (owner, 2026-11-08: "always at the end
   game blurring the rest of the screen behind"), the same treatment as the install invitation. */
#keep-progress {
  position: fixed; inset: 0; z-index: 30;
  display: grid; place-items: center; padding: 16px;
  color: var(--instrument-selection, #f2e5c5);
}
#keep-progress[hidden] { display: none; }
#keep-progress::before {
  content: ''; position: absolute; inset: 0;
  background: color-mix(in srgb, #0e0f10 38%, transparent);
  -webkit-backdrop-filter: blur(20px) brightness(0.5) saturate(0.9);
  backdrop-filter: blur(20px) brightness(0.5) saturate(0.9);
}
#keep-progress .keep-progress-card {
  position: relative; box-sizing: border-box;
  width: min(340px, 100%); padding: 18px 18px 16px; border-radius: 18px;
  text-align: center;
  background: var(--dark-glass);
  -webkit-backdrop-filter: var(--dark-glass-blur);
  backdrop-filter: var(--dark-glass-blur);
  box-shadow: 0 18px 44px rgba(0, 0, 0, .35);
}
#keep-progress .keep-progress-title {
  display: block; margin: 0;
  font-size: 1rem; letter-spacing: .04em; color: #f2e7cb;
}
#keep-progress .keep-progress-body {
  display: block; margin: 6px 0 14px;
  font-size: var(--instrument-label-size, .6875rem);
  letter-spacing: var(--instrument-tracking, .08em);
  color: var(--instrument-muted, #e8ddc5b3);
}
#keep-progress .keep-progress-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
}
#keep-progress .keep-progress-actions button {
  min-height: 44px; min-width: 44px; padding: 0 16px; border-radius: 12px;
  border: 0;
  background: rgba(242, 237, 228, .06); color: #f2e7cb;
  font: inherit; letter-spacing: .04em; cursor: pointer;
}
#keep-progress .keep-progress-actions button.primary {
  background: rgba(242, 229, 197, .16);
}
#keep-progress .keep-progress-actions button:focus-visible {
  outline: 2px solid var(--instrument-focus, #f2e5c5); outline-offset: 2px;
}
#keep-progress[data-motion="still"] { transition: none; animation: none; }
@media (prefers-reduced-motion: reduce) {
  #keep-progress { transition: none; animation: none; }
}
html.reduce-motion #keep-progress { transition: none; animation: none; }
`;

export type KeepProgressHooks = {
  storage: () => KeyValue | null;
  /** guest / account / signed-out */
  kind: () => 'guest' | 'account' | null;
  /** Blitz decision or victory / Seeds card is up. */
  covered: () => boolean;
  /** Open the existing sign-in flow (Google or email). */
  onSignIn: () => void;
  reduceMotion?: () => boolean;
  /** False when this build has no sign-in key (then nothing is offered). Omitted: assume it has. */
  canSignIn?: () => boolean;
};

export type KeepProgressController = {
  /** A level clear or first claim just happened. */
  note(reason: KeepProgressReason): void;
  /** Victory / Blitz cover went away — retry a held offer. */
  release(): void;
  dispose(): void;
};

const writeMemory = (storage: KeyValue | null, memory: KeepProgressMemory): void => {
  if (!storage) return;
  try {
    storage.set(KEEP_PROGRESS_KEY, JSON.stringify(memory));
  } catch {
    /* full / blocked store: offer rules still apply in-session */
  }
};

/**
 * Mount the quiet keep-progress line. Own root; CSS scoped under `#keep-progress`.
 */
export const mountKeepProgress = (hooks: KeepProgressHooks): KeepProgressController => {
  if (typeof document === 'undefined') {
    return { note() {}, release() {}, dispose() {} };
  }
  let style = document.getElementById('keep-progress-css') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'keep-progress-css';
    style.textContent = KEEP_PROGRESS_CSS;
    document.head.append(style);
  }

  const root = document.createElement('div');
  root.id = 'keep-progress';
  root.hidden = true;
  // A dialog over the finished game (owner, 2026-11-08), named by its title.
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', ACCOUNT.keepProgressTitle);
  const title = document.createElement('strong');
  title.className = 'keep-progress-title';
  title.textContent = ACCOUNT.keepProgressTitle;
  const body = document.createElement('span');
  body.className = 'keep-progress-body';
  body.textContent = ACCOUNT.keepProgressBody;
  const actions = document.createElement('div');
  actions.className = 'keep-progress-actions';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'primary';
  yes.textContent = ACCOUNT.keepProgressYes;
  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = ACCOUNT.keepProgressDismiss;
  actions.append(yes, no);
  const card = document.createElement('div');
  card.className = 'keep-progress-card';
  card.append(title, body, actions);
  root.append(card);
  document.body.append(root);

  let held: KeepProgressReason | null = null;
  let disposed = false;

  const motionStill = (): boolean => {
    if (hooks.reduceMotion) return hooks.reduceMotion();
    return !interfaceMotionAllowed();
  };

  const hide = (): void => {
    root.hidden = true;
  };

  const show = (): void => {
    root.dataset.motion = motionStill() ? 'still' : 'motion';
    root.hidden = false;
    // The same soft arrival as every other sheet (nothing under reduced motion).
    enterSurface(card);
    yes.focus();
  };

  const readMem = (): KeepProgressMemory => parseKeepProgressMemory(hooks.storage()?.get(KEEP_PROGRESS_KEY) ?? null);

  const consider = (reason: KeepProgressReason): void => {
    if (disposed) return;
    // A build with no sign-in key has nothing to offer: never show a Sign in that does nothing.
    if (hooks.canSignIn && !hooks.canSignIn()) return;
    if (hooks.covered()) {
      held = reason;
      return;
    }
    const decision = keepProgressDecision({
      kind: hooks.kind(),
      memory: readMem(),
      reason,
      covered: false,
    });
    writeMemory(hooks.storage(), decision.memory);
    if (decision.offer) show();
    held = null;
  };

  yes.addEventListener('click', () => {
    const memory = { ...readMem(), dismissed: true, offered: true };
    writeMemory(hooks.storage(), memory);
    hide();
    hooks.onSignIn();
  });
  no.addEventListener('click', () => {
    writeMemory(hooks.storage(), { dismissed: true, offered: true });
    hide();
  });
  // Escape puts it away like Not now.
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') no.click();
  });

  return {
    note(reason) { consider(reason); },
    release() {
      if (held) consider(held);
    },
    dispose() {
      disposed = true;
      hide();
      root.remove();
    },
  };
};
