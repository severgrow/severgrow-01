// Menu install / separate-window button.
//
// Mobile (a coarse pointer or a touch screen): "Add to Home Screen" drives the browser's standard
// install flow. The `beforeinstallprompt` event is captured and its default is prevented so that
// the game's own button is the only prompt; clicking calls `prompt()`. Browsers that never offer
// that event (iOS Safari) show a short, quiet inline hint instead of failing silently. When the
// game already runs installed (standalone), the button is hidden.
//
// Desktop (a fine pointer, no touch): "Open in separate window" opens the game in a small window,
// falling back to an ordinary new tab when the popup is blocked.
//
// Self-contained: it only reads and writes #menu-install and #menu-install-hint.

type InstallPromptEvent = Event & {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt: () => Promise<void>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const isStandalone = (): boolean => {
  const nav = navigator as NavigatorWithStandalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    nav.standalone === true
  );
};

/** True on phones and tablets: a coarse pointer, or a device that reports touch points. */
const isMobile = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Open the game in its own window. `noopener` makes `window.open` return null, which would leave
 * no way to tell a blocked popup apart from a successful one, so we detach the opener ourselves
 * instead of putting `noopener` in the feature string.
 */
const openSeparateWindow = (): void => {
  const popup = window.open('', '_blank', 'width=520,height=900');
  if (popup) {
    popup.opener = null;
    popup.location.href = location.href;
    return;
  }
  window.open(location.href, '_blank'); // popup blocked: a normal new tab
};

export const mountInstallButton = (): void => {
  const btn = document.getElementById('menu-install');
  const hint = document.getElementById('menu-install-hint');
  if (!(btn instanceof HTMLButtonElement) || !(hint instanceof HTMLElement)) return;

  if (isStandalone()) {
    btn.hidden = true;
    hint.hidden = true;
    return;
  }

  const mobile = isMobile();
  btn.textContent = mobile ? 'Add to Home Screen' : 'Open in separate window';
  btn.dataset.installMode = mobile ? 'install' : 'window';
  btn.hidden = false;

  let deferred: InstallPromptEvent | null = null;
  let hintTimer = 0;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
  });

  const showHint = (message: string): void => {
    hint.textContent = message;
    hint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      hint.hidden = true;
    }, 6000);
  };

  btn.addEventListener('click', () => {
    if (btn.dataset.installMode === 'window') {
      openSeparateWindow();
      return;
    }
    if (deferred) {
      const current = deferred;
      deferred = null;
      void current.prompt();
      return;
    }
    showHint(
      isIOS()
        ? 'Share ▸ Add to Home Screen'
        : 'Use your browser menu to add Futasaku to your home screen.',
    );
  });
};
