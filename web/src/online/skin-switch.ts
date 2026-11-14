// THE BOARD SKIN SWITCH (owner, 2026-11-14), on /test/ only: inside the planet's colour pane, under
// the twenty colours. Three rows of named chips with a real thumbnail each: your tiles, their tiles
// and the board background. A tap stores the choice (ui/skinChoice.ts); the next match wears it.
// Static DOM, no timers or subscriptions; built once, re-marked on tap.
import { BACKGROUNDS, TERRITORIES, TERRITORY_IDS } from '../ui/forestAsh.js';
import type { BackgroundId, TerritoryId } from '../ui/forestAsh.js';
import { DEFAULT_SKIN, SKIN_SWITCH, chooseSkin, skinChoice } from '../ui/skinChoice.js';
import type { SkinChoice } from '../ui/skinChoice.js';
import type { DuelClient } from '../../../server/src/client.js';

const NAMES: Record<TerritoryId | BackgroundId, string> = {
  forest: 'Forest', ash: 'Ash', water: 'Water', toxic: 'Toxic',
  classic: 'Classic', cocoa: 'Cocoa', lichen: 'Lichen', cinder: 'Cinder', clay: 'Clay', slate: 'Slate',
};

const CSS = `
#world-skin-switch { display: grid; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e8ddc51f; }
#world-skin-switch .world-colour-chip { background-size: cover; background-position: center; }
#world-skin-switch .world-colours { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }
#world-skin-switch .world-colour-swatch.skin-on { background: #f2c87918; box-shadow: inset 0 0 0 1px #f2c87959; }
#world-skin-switch .world-colour-swatch.skin-on .world-colour-name { color: #f6ecd2; }
#world-skin-switch .world-colour-swatch.skin-on .world-colour-chip { box-shadow: 0 0 0 2px #f6ecd2; }
`;

let account: { client: DuelClient; token: string; refresh: () => void } | null = null;
let markChoice: (() => void) | null = null;
let saving = false;

/** The token comes from the signed-in Planet view, never from a tile or a browser-supplied owner. */
export async function connectSkinSwitch(client: DuelClient, token: string, refresh: () => void): Promise<void> {
  if (!SKIN_SWITCH) return;
  if (account?.token === token) { account.refresh = refresh; return; }
  const current = account = { client, token, refresh };
  saving = false;
  // A new account must never inherit the previous account's local preview while its own
  // public choice is loading. An older server simply leaves this safe default in place.
  chooseSkin({ mine: DEFAULT_SKIN.mine });
  markChoice?.();
  try {
    const saved = await client.worldSkin(token);
    if (account !== current) return;
    if (saved && TERRITORY_IDS.includes(saved)) chooseSkin({ mine: saved });
    else chooseSkin({ mine: DEFAULT_SKIN.mine });
    markChoice?.();
    // The initial world read already carries the public skin on each claim. Re-fetching here
    // duplicates wallet/world requests on entry; a deliberate POST below still refreshes it.
  } catch { /* An older server has no skin route; the local preview stays usable. */ }
}

export function disconnectSkinSwitch(): void { account = null; saving = false; }

export function mountSkinSwitch(pane: HTMLElement | null): void {
  if (!SKIN_SWITCH || !pane || pane.querySelector('#world-skin-switch')) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('section');
  box.id = 'world-skin-switch';
  box.setAttribute('aria-label', 'Board skin (test)');
  const rows: [string, keyof SkinChoice, { id: TerritoryId | BackgroundId; thumb: string | null }[]][] = [
    ['Your tiles (test)', 'mine', TERRITORY_IDS.map((id) => ({ id, thumb: TERRITORIES[id].tiles[0]!.url }))],
    ['Their tiles (test)', 'theirs', TERRITORY_IDS.map((id) => ({ id, thumb: TERRITORIES[id].tiles[0]!.url }))],
    ['Board (test)', 'background', BACKGROUNDS.map((b) => ({ id: b.id, thumb: b.url }))],
  ];
  const mark = () => {
    const c = skinChoice();
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-field]')) {
      const on = c[b.dataset.field as keyof SkinChoice] === b.dataset.value;
      // Its own mark, not the colour grid's `.current` (tests and styles read that as "my colour").
      b.classList.toggle('skin-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  markChoice = mark;
  for (const [label, field, options] of rows) {
    const title = document.createElement('p');
    title.className = 'world-pane-label';
    title.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'world-colours';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', label);
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'world-colour-swatch';
      b.dataset.field = field;
      b.dataset.value = o.id;
      b.setAttribute('aria-label', NAMES[o.id]);
      const chip = document.createElement('span');
      chip.className = 'world-colour-chip';
      chip.setAttribute('aria-hidden', 'true');
      if (o.thumb) chip.style.backgroundImage = `url("${o.thumb}")`;
      else chip.style.background = '#2a2b2e';
      const name = document.createElement('span');
      name.className = 'world-colour-name';
      name.textContent = NAMES[o.id];
      b.append(chip, name);
      b.addEventListener('click', () => {
        if (field === 'mine' && saving) return;
        const previous = skinChoice();
        chooseSkin({ [field]: o.id }); mark();
        if (field !== 'mine' || !account) return;
        const selected = o.id as TerritoryId;
        const owner = account;
        saving = true;
        void owner.client.chooseWorldSkin(owner.token, selected).then((saved) => {
          if (account !== owner) return;
          chooseSkin({ mine: saved }); mark(); owner.refresh();
        }).catch(() => {
          if (account !== owner) return;
          chooseSkin({ mine: previous.mine }); mark();
        }).finally(() => { if (account === owner) saving = false; });
      });
      grid.appendChild(b);
    }
    box.append(title, grid);
  }
  pane.appendChild(box);
  mark();
}
