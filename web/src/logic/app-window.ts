// The "own window" button: a small icon, top right of the main menu, computers only (owner,
// 2026-10-15). A page cannot pop itself out into an app window directly, so the button does the
// best thing the browser allows:
//   • Chrome / Edge (not installed yet): the browser's own "Install FUTASAKU" dialog — the game then
//     opens in its own window, started from the dock / taskbar / Start menu.
//   • anywhere else (Safari, Firefox, or already installed but opened in a tab): true full screen,
//     and a second press (or Esc) comes back.
//   • already running in its own window: the button is not shown.
import { isIOS, isMobile, isStandalone, nativeInstallAvailable, promptNativeInstall } from './install.js';

export type AppWindowCopy = { install: string; fullscreen: string; exitFullscreen: string };

const ICON_WINDOW = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="13" height="13" rx="2.5"/><path d="M13.5 3.5h7v7"/><path d="M20.5 3.5 11 13"/></svg>`;
const ICON_EXPAND = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>`;
const ICON_COLLAPSE = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/></svg>`;

const CSS = `
#app-window { position:absolute; z-index:3; top:calc(env(safe-area-inset-top, 0px) + 14px); right:calc(env(safe-area-inset-right, 0px) + 14px);
  width:44px; height:44px; display:grid; place-items:center; padding:0; border-radius:999px; cursor:pointer;
  color:var(--fu-cream, #e8ddc5); background:transparent; border:1px solid var(--fu-cream-28, rgba(232,221,197,.28));
  opacity:.82; transition:opacity .16s ease, background-color .16s ease, border-color .16s ease, transform .16s ease; }
#app-window:hover { opacity:1; background:var(--fu-cream-14, rgba(232,221,197,.14)); border-color:var(--fu-cream-55, rgba(232,221,197,.55)); }
#app-window:active { transform:translateY(1px); }
#app-window:focus-visible { outline:2px solid var(--fu-cream, #e8ddc5); outline-offset:2px; opacity:1; }
#app-window[hidden] { display:none; }
`;

const canFullscreen = (): boolean => typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false;

export const mountAppWindowButton = (copy: AppWindowCopy): void => {
  const menu = document.getElementById('menu');
  if (!menu || document.getElementById('app-window')) return;
  // Phones and tablets have the install invitation; this button is for computers.
  if (isMobile() || isIOS() || isStandalone()) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const btn = document.createElement('button');
  btn.id = 'app-window';
  btn.type = 'button';
  menu.append(btn);

  const paint = () => {
    const installed = isStandalone();
    const full = document.fullscreenElement !== null;
    const install = !full && nativeInstallAvailable();
    btn.hidden = installed || (!install && !canFullscreen());
    const label = full ? copy.exitFullscreen : install ? copy.install : copy.fullscreen;
    btn.innerHTML = full ? ICON_COLLAPSE : install ? ICON_WINDOW : ICON_EXPAND;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.dataset.mode = full ? 'exit' : install ? 'install' : 'fullscreen';
  };

  btn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (nativeInstallAvailable()) {
      void promptNativeInstall().then(paint);
      return;
    }
    void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', paint);
  window.addEventListener('beforeinstallprompt', () => setTimeout(paint, 0));
  window.addEventListener('appinstalled', paint);
  matchMedia('(display-mode: standalone)').addEventListener?.('change', paint);
  paint();
};
