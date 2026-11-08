// Quiet optional "Keep your progress" for guests (owner, 2026-11-08).
//
// At most once: after a campaign level clear or a first claim. Dismissible. Never over a Blitz
// decision or the victory / Seeds card. Not a modal — a small dark-glass line with Sign in / Not now.
import type { KeyValue } from '../../../server/src/client.js';
import { ACCOUNT } from '../../../src/strings.js';
import { enterSurface, interfaceMotionAllowed } from '../ui/interface-motion.js';

export const KEEP_PROGRESS_KEY = 'severgrow.account.keep-progress.v1';

/** How long the line stays if the player does neither: one timeout, then it leaves (still once). */
export const KEEP_PROGRESS_DWELL_MS = 12_000;

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
#keep-progress {
  /* centred by margins, not translate: the shared entrance animates translate */
  position: fixed; z-index: 8; left: 0; right: 0; margin-inline: auto;
  bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 18px));
  box-sizing: border-box;
  width: max-content; max-width: min(320px, calc(100% - 32px));
  margin-block: 0; padding: 12px 14px; border: 0; border-radius: 15px;
  text-align: center;
  color: var(--instrument-selection, #f2e5c5);
  background: var(--dark-glass);
  -webkit-backdrop-filter: var(--dark-glass-blur);
  backdrop-filter: var(--dark-glass-blur);
  box-shadow: 0 10px 28px rgba(0, 0, 0, .22);
}
#keep-progress[hidden] { display: none; }
#keep-progress .keep-progress-title {
  display: block; margin: 0;
  font-size: .9rem; letter-spacing: .04em; color: #f2e7cb;
}
#keep-progress .keep-progress-body {
  display: block; margin: 4px 0 10px;
  font-size: var(--instrument-label-size, .6875rem);
  letter-spacing: var(--instrument-tracking, .08em);
  color: var(--instrument-muted, #e8ddc5b3);
}
#keep-progress .keep-progress-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
}
#keep-progress .keep-progress-actions button {
  min-height: 44px; min-width: 44px; padding: 0 14px; border-radius: 12px;
  border: 0;
  background: rgba(242, 237, 228,.06); color: #f2e7cb;
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
  // A small panel with two keys: a named region, not a live status that reads its keys aloud.
  root.setAttribute('role', 'region');
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
  root.append(title, body, actions);
  document.body.append(root);

  let held: KeepProgressReason | null = null;
  let disposed = false;

  const motionStill = (): boolean => {
    if (hooks.reduceMotion) return hooks.reduceMotion();
    return !interfaceMotionAllowed();
  };

  let dwell: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(dwell);
    dwell = undefined;
    root.hidden = true;
  };

  const show = (): void => {
    root.dataset.motion = motionStill() ? 'still' : 'motion';
    root.hidden = false;
    // The same soft arrival as every other sheet (nothing under reduced motion).
    enterSurface(root);
    // It is a suggestion, not a gate: it leaves on its own so it never sits over the next match.
    clearTimeout(dwell);
    dwell = setTimeout(hide, KEEP_PROGRESS_DWELL_MS);
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
