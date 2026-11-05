// THE MENU'S SOUND KEY (owner, 2026-11-05: "make sound disabled by default but on main menu in corner
// make a low opacity cream icon with the sound showing that its disabled").
//
// A quiet speaker in the menu's top corner: crossed out while sound is off, plain while it is on.
// It mirrors the fullscreen key (top right, 14px in). One tap switches sound through the page's one settings path (the same as Settings' switch). It is a
// real 44px button with a label and a focus ring; it has no animation of its own.
import { ICONS } from '../ui/icons.js';

export const MENU_SOUND_CSS = `
#menu-sound {
  position: absolute; top: max(14px, env(safe-area-inset-top)); left: max(14px, env(safe-area-inset-left));
  z-index: 3; width: 44px; height: 44px; padding: 0; margin: 0; border: 0; border-radius: 22px;
  display: grid; place-items: center; background: transparent; color: #e8ddc5; opacity: .3;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
#menu-sound[aria-pressed="true"] { opacity: .55; }
#menu-sound > svg { width: 20px; height: 20px; }
#menu-sound:focus-visible { outline: 2px solid #e8ddc5; outline-offset: 2px; opacity: .8; }
@media (hover: hover) { #menu-sound:hover { opacity: .6; } }
`;

export type MenuSoundKeyState = { icon: 'mute' | 'sound'; label: string; pressed: boolean };

/** What the key shows: the crossed-out speaker while sound is off. */
export const menuSoundKeyState = (on: boolean): MenuSoundKeyState => on
  ? { icon: 'sound', label: 'Sound on. Tap to turn sound off', pressed: true }
  : { icon: 'mute', label: 'Sound off. Tap to turn sound on', pressed: false };

export type MenuSoundKeyHooks = {
  /** Is sound on now? */
  isOn: () => boolean;
  /** Turn sound on or off (the page saves it and syncs Settings). */
  setSound: (on: boolean) => void;
};

/** Mounts the key in the menu; returns `refresh` for when sound changes elsewhere (Settings). */
export const mountMenuSoundKey = (hooks: MenuSoundKeyHooks): { refresh: () => void } => {
  const menu = document.getElementById('menu');
  if (!menu) return { refresh: () => undefined };
  if (!document.getElementById('menu-sound-css')) {
    const style = document.createElement('style');
    style.id = 'menu-sound-css';
    style.textContent = MENU_SOUND_CSS;
    document.head.append(style);
  }
  const key = document.createElement('button');
  key.id = 'menu-sound';
  key.type = 'button';
  const refresh = () => {
    const st = menuSoundKeyState(hooks.isOn());
    key.innerHTML = ICONS[st.icon] ?? '';
    key.setAttribute('aria-label', st.label);
    key.setAttribute('aria-pressed', String(st.pressed));
    key.title = st.label;
  };
  key.addEventListener('click', () => {
    hooks.setSound(!hooks.isOn());
    refresh();
  });
  menu.append(key);
  refresh();
  return { refresh };
};
