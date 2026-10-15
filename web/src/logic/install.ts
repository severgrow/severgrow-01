// The install invitation.
//
// This used to be a permanent menu button ("Add to Home Screen" on mobile, "Open in separate
// window" on desktop). It is now a timed invitation that appears only after the player has
// actually played (see `install-prompt.ts` for the counting rule), and it is never a menu item.
//
// The words are handed in by the page (`INSTALL` in src/strings.ts) so a rename is a one-line
// change; this file only decides which FACE to show and drives the browser:
//   • native — Chrome / Android / desktop Chromium: the captured `beforeinstallprompt` opens the
//     browser's own install dialog, so the button really installs.
//   • ios — iOS Safari cannot be prompted from a button, so a two-step "Share → Add to Home
//     Screen" instruction is shown instead of a dead control.
//   • manual — any other browser with no native prompt: the generic browser-menu wording.
// When the game already runs installed (standalone / minimal-ui / iOS standalone) the invitation
// is never offered.

import { INSTALL_PROMPT_KEY, InstallInvitation, installCopyFor, installVariant } from './install-prompt.js';
import type { GameOutcome, InstallDesktopCopy, InstallVariant } from './install-prompt.js';

type InstallPromptEvent = Event & {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt: () => Promise<void>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export const isStandalone = (): boolean => {
  const nav = navigator as NavigatorWithStandalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    nav.standalone === true
  );
};

/** True on phones and tablets: a coarse pointer, or a device that reports touch points. */
export const isMobile = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** The words the invitation shows. Kept in src/strings.ts; only the page supplies them. */
export type InstallCopy = {
  title: string;
  why: readonly string[];
  /** The button that opens the browser's own install dialog (native face only). */
  install: string;
  /** The primary button on an instruction face (it simply closes: there is nothing to press). */
  done: string;
  notNow: string;
  never: string;
  iosSteps: readonly string[];
  manualSteps: readonly string[];
  /** Computer words: "its own window" instead of "home screen". */
  desktop?: InstallDesktopCopy;
};

export type InstallStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type InstallPromptHandle = {
  /** Count one finished game (offline OR online; never a tutorial step) and maybe invite. */
  noteFinished(outcome: GameOutcome): void;
  isOpen(): boolean;
  /** Open the invitation now. Used by tests and screenshots; never by the game itself. */
  showNow(): void;
  /** The counting memory, for diagnostics and the browser test hook. */
  memory(): { games: number; never: boolean };
};

// Captured once, at mount: the browser fires `beforeinstallprompt` at most once, early.
let deferred: InstallPromptEvent | null = null;
let capturing = false;

const captureNativePrompt = (): void => {
  if (capturing) return; // listen once, however many times this is asked for
  capturing = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
  });
};

/** True while the browser offers its own install dialog (Chrome / Edge, not installed yet). */
export const nativeInstallAvailable = (): boolean => {
  captureNativePrompt();
  return deferred !== null;
};

/** Opens the browser's own install dialog once (the browser allows each captured prompt one use). */
export const promptNativeInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  const current = deferred;
  if (!current) return 'unavailable';
  deferred = null;
  try {
    await current.prompt();
    return (await current.userChoice).outcome;
  } catch {
    return 'dismissed';
  }
};

const element = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export const mountInstallPrompt = (options: {
  copy: InstallCopy;
  storage: InstallStorage;
}): InstallPromptHandle => {
  const root = element('install-prompt');
  const title = element('install-title');
  const why = element('install-why');
  const steps = element('install-steps');
  const accept = element<HTMLButtonElement>('install-accept');
  const close = element<HTMLButtonElement>('install-close');
  const later = element<HTMLButtonElement>('install-later');
  const never = element<HTMLButtonElement>('install-never');

  const invitation = new InstallInvitation(options.storage.get(INSTALL_PROMPT_KEY), {
    installed: isStandalone,
    save: (memory) => options.storage.set(INSTALL_PROMPT_KEY, JSON.stringify(memory)),
  });

  // The browser's event is captured even if the invitation never opens, so the first real match
  // already has a working native button.
  captureNativePrompt();

  let open = false;
  let variant: InstallVariant = 'manual';

  const fill = (list: HTMLElement, lines: readonly string[]): void => {
    list.replaceChildren(
      ...lines.map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );
  };

  const paint = (): void => {
    variant = installVariant({ ios: isIOS(), hasNativePrompt: deferred !== null });
    // A computer has no home screen: there the same invitation offers the game in its own window.
    const words = installCopyFor(options.copy, !isMobile() && !isIOS());
    if (title) title.textContent = words.title;
    if (why) fill(why, words.why);
    if (steps) {
      const lines = variant === 'ios' ? words.iosSteps : words.manualSteps;
      fill(steps, lines);
      steps.hidden = variant === 'native';
    }
    if (accept) {
      accept.textContent = variant === 'native' ? words.install : options.copy.done;
    }
    if (later) {
      later.textContent = options.copy.notNow;
      later.hidden = variant !== 'native';
    }
    if (never) never.textContent = options.copy.never;
  };

  const focusables = (): HTMLElement[] =>
    root
      ? Array.from(root.querySelectorAll<HTMLElement>('button:not([hidden]), [href], [tabindex]:not([tabindex="-1"])')).filter(
          (el) => !el.hasAttribute('disabled'),
        )
      : [];

  const hide = (): void => {
    if (!root || !open) return;
    open = false;
    root.hidden = true;
    document.removeEventListener('keydown', onKey, true);
  };

  const show = (): void => {
    if (!root || open || isStandalone()) return;
    paint();
    open = true;
    root.hidden = false;
    document.addEventListener('keydown', onKey, true);
    // Match the sheets: focus the first real control (a keyboard player lands inside the dialog).
    (accept && !accept.hidden ? accept : focusables()[0] ?? root)?.focus();
  };

  function onKey(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !active || !root?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const acceptNow = (): void => {
    if (variant !== 'native') {
      hide();
      return;
    }
    const current = deferred;
    deferred = null;
    hide();
    if (current) void current.prompt().catch(() => undefined);
  };

  accept?.addEventListener('click', acceptNow);
  close?.addEventListener('click', hide);
  later?.addEventListener('click', hide);
  never?.addEventListener('click', () => {
    invitation.neverAgain();
    hide();
  });
  root?.querySelector('.install-prompt-scrim')?.addEventListener('click', hide);

  return {
    noteFinished: (outcome) => {
      if (invitation.finished(outcome)) show();
    },
    isOpen: () => open,
    showNow: show,
    memory: () => ({ games: invitation.games, never: invitation.never }),
  };
};

