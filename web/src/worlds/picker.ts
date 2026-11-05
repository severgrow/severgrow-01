import { WORLD_ART } from './art.js';
import { WORLDS, WORLD_IDS } from './worlds.js';
import { selectedWorld, selectWorld, WORLD_SKINS_ENABLED } from './preference.js';

/** Reuses the existing swatch vocabulary, within Colours. No extra menu key or explanatory prose. */
export function paintWorldPicker(colourGrid: HTMLElement): void {
  if (!WORLD_SKINS_ENABLED) return;
  let section = document.getElementById('world-style-picker');
  if (!section) {
    section = document.createElement('section'); section.id = 'world-style-picker';
    const label = document.createElement('div'); label.className = 'world-pane-label'; label.id = 'world-style-label'; label.textContent = 'WORLD';
    const grid = document.createElement('div'); grid.className = 'world-colours'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', label.id);
    for (const id of WORLD_IDS) {
      const material = WORLDS[id], art = WORLD_ART[id];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'world-colour-swatch'; button.dataset.worldStyle = id;
      button.style.setProperty('--swatch', material.base);
      button.style.setProperty('--swatch-light', material.light);
      button.style.setProperty('--swatch-dark', material.shade);
      const chip = document.createElement('span'); chip.className = 'world-colour-chip'; chip.setAttribute('aria-hidden', 'true');
      if (art) { chip.style.backgroundImage = `url("${art.home}")`; chip.style.backgroundSize = 'contain'; chip.style.backgroundRepeat = 'no-repeat'; chip.style.backgroundPosition = 'center'; }
      const name = document.createElement('span'); name.className = 'world-colour-name'; name.textContent = material.name;
      button.append(chip, name); button.addEventListener('click', () => { selectWorld(id); paintWorldPicker(colourGrid); }); grid.append(button);
    }
    section.append(label, grid); colourGrid.parentElement?.append(section);
  }
  for (const button of section.querySelectorAll<HTMLButtonElement>('[data-world-style]')) {
    const on = button.dataset.worldStyle === selectedWorld();
    button.classList.toggle('current', on); button.setAttribute('aria-pressed', String(on));
  }
}
