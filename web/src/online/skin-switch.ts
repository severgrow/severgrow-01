// THE SKINS PANE (owner, 2026-11-20: "'COLOUR' in submenu is renamed to 'SKINS'"). It replaces the
// old three rows of chips with the two appearances that actually exist:
//
//   ON THE PLANET   Colour (Slab, plain owner colour) + the ten real skins.
//   IN A MATCH      the ten real skins only (there are no plain-colour board tiles).
//
// A real skin is ONE TAP and sets both appearances together. Choosing Colour opens the twenty-colour
// picker in a dark-glass sheet over this pane; when that sheet is committed the MATCH row takes the
// stage (glowing plate, one imperative line) until a real skin is picked. That second step is
// deliberate: without it the board would silently choose a skin for the player.
//
// The tile paint and the six new recipes belong to the recipe branch. This pane only asks
// ui/skin-catalogue.ts for names and previews (real tile renders for the four shipped sets,
// material-accurate placeholders for the six being built), so the UI can land before the art does.
//
// Static DOM, no timers; built once and re-marked by the ONE change notification in
// ui/skinChoice.ts (a tap here, the account's own answer, or another tab), so a tile never marks a
// skin the board is not wearing.
import { BACKGROUNDS, TERRITORIES, TERRITORY_IDS } from '../ui/forestAsh.js';
import type { TerritoryId } from '../ui/forestAsh.js';
import { SKIN_IDS, SKIN_NAMES, skinPreviewCss } from '../ui/skin-catalogue.js';
import type { PlanetSkin, SkinId } from '../ui/skin-catalogue.js';
import {
  SKIN_SWITCH,
  adoptServerSkin,
  chooseSkin,
  onSkinChoice,
  skinChoice,
  skinPickerVisible,
  skinRevision,
} from '../ui/skinChoice.js';
import type { SkinChoice } from '../ui/skinChoice.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';
import { ONLINE } from '../../../src/strings.js';
import type { DuelClient } from '../../../server/src/client.js';

const CSS = `
#world-skin-switch { display: grid; gap: 10px; }
#world-skin-switch [hidden] { display: none !important; }
#world-skin-switch .world-skin-locked {
  margin: 0; padding: 8px 4px; text-align: center; font-size: .74rem; line-height: 1.4; color: #e8ddc5a6;
}
#world-skin-switch .world-skin-group { display: grid; gap: 6px; padding: 8px; border-radius: 12px; }
#world-skin-switch .world-skin-group[data-needs-game='true'] {
  background: #f2c87914; box-shadow: inset 0 0 0 1px #f2c879b3;
}
#world-skin-switch .world-skin-head { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 6px; }
#world-skin-switch .world-skin-value { margin: 0; font-size: .66rem; letter-spacing: .1em; color: #f6ecd2; text-align: right; }
#world-skin-switch .world-skin-step {
  margin: 0; padding: 4px 2px 2px; font-size: .72rem; line-height: 1.35; color: #f6ecd2; text-align: center;
}
#world-skin-switch .world-skin-step[hidden] { display: none; }
#world-skin-switch .world-skins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
#world-skin-switch .world-skin-tile {
  display: grid; grid-template-rows: 44px auto auto; gap: 3px; min-width: 0; min-height: 44px;
  margin: 0; padding: 4px; border: 0; border-radius: 10px; background: #e8ddc508; color: #e8ddc5;
  font: inherit; text-align: center; cursor: pointer; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
#world-skin-switch .world-skin-tile:active { background: #e8ddc514; }
#world-skin-switch .world-skin-thumb {
  display: block; border-radius: 8px; background-size: cover; background-position: center;
  box-shadow: inset 0 1px 0 #ffffff26, inset 0 0 0 1px #0007;
}
#world-skin-switch .world-skin-name {
  display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: .625rem; letter-spacing: .04em; text-transform: uppercase; color: #e8ddc5cc;
}
#world-skin-switch .world-skin-tag { display: block; font-size: .5625rem; line-height: 1.15; letter-spacing: .05em; color: #e8ddc58a; }
#world-skin-switch .world-skin-tile.skin-on { background: #f2c87918; box-shadow: inset 0 0 0 1px #f2c87959; }
#world-skin-switch .world-skin-tile.skin-on .world-skin-name { color: #f6ecd2; }
#world-skin-switch .world-skin-tile.skin-on .world-skin-thumb { box-shadow: inset 0 1px 0 #ffffff3d, 0 0 0 2px #f6ecd2; }
#world-skin-switch .world-skin-tile:focus { outline: none; }
#world-skin-switch .world-skin-tile:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }
#world-skin-switch .world-skin-tile:disabled { opacity: .5; cursor: default; }
@media (min-width: 520px) {
  #world-skin-switch .world-skins { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`;

let account: { client: DuelClient; token: string; refresh: () => void } | null = null;
/**
 * Which save owns the switch. A newer tap (or a different account) bumps it, so an answer to an
 * older save — a success or a refusal — is out of date and can never move the choice.
 */
let saveSeq = 0;
/**
 * The skin the ACCOUNT is known to hold (from its own read, or from a save it accepted). A refused
 * save goes back to this, never to whatever the tap before it happened to be wearing.
 */
let confirmed: TerritoryId | null = null;

/** The token comes from the signed-in Planet view, never from a tile or a browser-supplied owner. */
export async function connectSkinSwitch(client: DuelClient, token: string, refresh?: () => void): Promise<void> {
  // The gate is the account, and a signed-in account can arrive AFTER the pane was first mounted
  // (the menu signs in, the Planet opens later), so refresh the section before deciding anything.
  refreshSkinPickerVisibility();
  if (!skinPickerVisible()) return;
  // THE SKIN BELONGS TO THE ACCOUNT (owner, 2026-11-18): read it again on every visit (game start,
  // sign-in, each Planet open), not once per session, so a choice made on another device arrives.
  // The same account keeps its switch (a save in flight still owns it); another account resets it.
  let current = account;
  // Game start and sign-in pass no `refresh`: the Planet's own (set when it opens) is kept.
  if (account?.token === token) { if (refresh) account.refresh = refresh; }
  else {
    current = account = { client, token, refresh: refresh ?? (() => undefined) };
    saveSeq++;  // a save from the previous account (or session) can no longer own this switch
    confirmed = null;
  }
  // The switch marks, and the board wears, THIS browser's own choice while the account's answer is
  // on its way, never a default that would undo a local six-id choice.
  const issued = skinRevision();
  try {
    const saved = await client.worldSkin(token);
    if (account !== current || !current) return;
    // The account's answer is the truth for "your tiles" only when the local choice is one the
    // four-id server column can express (ui/skinChoice.ts: adoptServerSkin).
    confirmed = saved && TERRITORY_IDS.includes(saved) ? saved : null;
    adoptServerSkin(saved, issued);
  } catch {
    /* No answer (an older server, a dropped connection): the browser's own choice stands. */
  }
}

export function disconnectSkinSwitch(): void { account = null; saveSeq++; }

// ---- the pane ---------------------------------------------------------------------------------
let paneEl: HTMLElement | null = null;
let section: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let sheetPanel: HTMLElement | null = null;
let sheetTrigger: HTMLElement | null = null;
let note: HTMLElement | null = null;
let lockNote: HTMLElement | null = null;
/** The deliberate second step after Colour: true until a real match skin is tapped. */
let awaitingGame = false;
/** The exact choice the planet had before the colour sheet opened, so a cancel restores it. */
let choiceBeforeColour: SkinChoice | null = null;

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const tile = (value: string, name: string, tag: string, preview: string, image?: string): HTMLButtonElement => {
  const button = element('button', 'world-skin-tile');
  button.type = 'button';
  button.dataset.value = value;
  button.setAttribute('aria-label', tag ? `${name}. ${tag}` : name);
  const thumb = element('span', 'world-skin-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  if (image) thumb.style.backgroundImage = `url("${image}")`;
  else thumb.style.background = preview;
  const label = element('span', 'world-skin-name');
  label.textContent = name;
  const hint = element('span', 'world-skin-tag');
  hint.textContent = tag;
  button.append(thumb, label, hint);
  return button;
};

/** The preview a skin tile wears: a real tile render for the four shipped sets, CSS for the rest. */
const skinLook = (id: PlanetSkin): { preview: string; image?: string } =>
  (TERRITORY_IDS as readonly string[]).includes(id)
    ? { preview: '', image: TERRITORIES[id as TerritoryId].tiles[0]!.url }
    : { preview: skinPreviewCss(id) };

const group = (key: 'planet' | 'game' | 'board', labelText: string): { box: HTMLElement; grid: HTMLElement; value: HTMLElement } => {
  const box = element('section', 'world-skin-group');
  box.dataset.group = key;
  const head = element('div', 'world-skin-head');
  const label = element('p', 'world-pane-label');
  label.textContent = labelText;
  const value = element('p', 'world-skin-value');
  value.setAttribute('role', 'status');
  head.append(label, value);
  const grid = element('div', 'world-skins');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', labelText);
  box.append(head, grid);
  return { box, grid, value };
};

/** The glass sheet's title/close/done copy and its open/close choreography. */
const prepareSheet = (): void => {
  sheet = document.getElementById('world-colour-sheet');
  sheetPanel = document.getElementById('world-colour-sheet-panel') ?? sheet?.querySelector<HTMLElement>('.world-colour-sheet-panel') ?? null;
  const title = document.getElementById('world-colour-sheet-title');
  if (title) title.textContent = ONLINE.worldColourTitle;
  const done = document.getElementById('world-colour-done') as HTMLButtonElement | null;
  if (done) done.textContent = ONLINE.worldColourDone;
  // The pane is clipped by the window's rounded body; the sheet belongs to the page instead.
  if (sheet && typeof document.body?.append === 'function' && sheet.parentElement !== document.body) document.body.append(sheet);
};

const openColourSheet = (trigger: HTMLElement): void => {
  if (!sheet || !sheetPanel) return;
  choiceBeforeColour = skinChoice();
  sheetTrigger = trigger;
  // The planet preview changes at once (it is behind the glass); a cancel puts it back.
  chooseSkin({ mine: 'colour' });
  sheet.hidden = false;
  enterSurface(sheetPanel);
  const grid = document.getElementById('world-colour-grid');
  const focus = grid?.querySelector<HTMLElement>('.world-colour-swatch.current') ?? grid?.querySelector<HTMLElement>('.world-colour-swatch');
  focus?.focus({ preventScroll: true });
  document.addEventListener('keydown', onSheetKey, true);
};
const closeColourSheet = (commit: boolean): void => {
  if (!sheet || sheet.hidden) return;
  document.removeEventListener('keydown', onSheetKey, true);
  const trigger = sheetTrigger;
  exitSurface(sheetPanel, { onDone: () => {
    if (sheet) sheet.hidden = true;
    if (commit && skinPickerVisible()) {
      awaitingGame = true;
      paint();
      // The required second step takes focus, so it cannot be missed with a keyboard either.
      const gameBox = section?.querySelector<HTMLElement>('[data-group="game"]');
      gameBox?.scrollIntoView?.({ block: 'nearest' });
      gameBox?.querySelector<HTMLElement>('.world-skin-tile')?.focus({ preventScroll: true });
    } else {
      if (!commit && choiceBeforeColour) chooseSkin(choiceBeforeColour);
      if (!commit) trigger?.focus({ preventScroll: true });
      else paint();
    }
  } });
  // Fake-DOM and reduced-motion paths: exitSurface may not animate or call back; the state above
  // must still be correct immediately.
  if (!sheetPanel) { sheet.hidden = true; if (!commit && choiceBeforeColour) chooseSkin(choiceBeforeColour); }
};

const onSheetKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    // The sheet is a layer ABOVE the window: Escape must close this first, not the whole pane.
    event.stopPropagation();
    event.preventDefault();
    closeColourSheet(false);
    return;
  }
  if (event.key !== 'Tab' || !sheetPanel) return;
  const focusable = [...sheetPanel.querySelectorAll<HTMLElement>('button:not([disabled])')];
  if (focusable.length === 0) return;
  // A simple, honest trap: the sheet is modal, so Tab cannot wander into the map behind it.
  const first = focusable[0]!, last = focusable[focusable.length - 1]!;
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
};

/** Save a four-id planet skin to the account; the six new ids stay local (docs/SKINS.md). */
const savePlanetSkin = (previous: SkinChoice, selected: SkinId): void => {
  if (!account || !(TERRITORY_IDS as readonly string[]).includes(selected)) return;
  const owner = account;
  const ticket = ++saveSeq;
  void owner.client.chooseWorldSkin(owner.token, selected as TerritoryId).then((saved) => {
    if (account !== owner || ticket !== saveSeq) return;
    confirmed = TERRITORY_IDS.includes(saved) ? saved : (selected as TerritoryId);
    chooseSkin({ mine: saved });
    owner.refresh();
  }).catch(() => {
    if (account !== owner || ticket !== saveSeq) return;
    // The server did not take it. Put the switch back on what is actually stored, and say so.
    const staying = confirmed ?? ((TERRITORY_IDS as readonly string[]).includes(previous.mine) ? previous.mine as TerritoryId : 'forest');
    chooseSkin(previous);
    if (note) {
      note.textContent = `Not saved — the board stays ${SKIN_NAMES[staying]}.`;
      note.hidden = false;
    }
  });
};

/** Re-mark every tile from the ONE model notification. */
const paint = (): void => {
  if (!section) return;
  const choice = skinChoice();
  const planet = section.querySelector<HTMLElement>('[data-group="planet"]');
  const game = section.querySelector<HTMLElement>('[data-group="game"]');
  const board = section.querySelector<HTMLElement>('[data-group="board"]');
  for (const button of planet?.querySelectorAll<HTMLButtonElement>('.world-skin-tile') ?? []) {
    const on = choice.mine === button.dataset.value;
    button.classList.toggle('skin-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  for (const button of game?.querySelectorAll<HTMLButtonElement>('.world-skin-tile') ?? []) {
    const on = choice.mineGame !== null && choice.mineGame === button.dataset.value;
    button.classList.toggle('skin-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  for (const button of board?.querySelectorAll<HTMLButtonElement>('.world-skin-tile') ?? []) {
    const on = choice.background === button.dataset.value;
    button.classList.toggle('skin-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  const planetValue = planet?.querySelector<HTMLElement>('.world-skin-value');
  if (planetValue) planetValue.textContent = ONLINE.worldSkinPlanetValue(SKIN_NAMES[choice.mine]);
  const gameValue = game?.querySelector<HTMLElement>('.world-skin-value');
  if (gameValue) gameValue.textContent = ONLINE.worldSkinGameValue(choice.mineGame ? SKIN_NAMES[choice.mineGame] : ONLINE.worldSkinGamePending);
  // A colour planet with no match skin is an unfinished choice, and it stays visibly unfinished
  // until the player picks one — across a reload too, because it is derived from the stored model.
  awaitingGame = awaitingGame || (choice.mine === 'colour' && choice.mineGame === null);
  if (game) game.dataset.needsGame = String(awaitingGame);
  if (step) step.hidden = !awaitingGame || !skinPickerVisible();
};

let step: HTMLElement | null = null;

const build = (): void => {
  if (!paneEl || section) return;
  const style = document.createElement('style');
  style.id = 'world-skin-style';
  style.textContent = CSS;
  if (!document.getElementById('world-skin-style')) document.head.appendChild(style);
  section = element('section');
  section.id = 'world-skin-switch';
  section.setAttribute('aria-label', ONLINE.worldSkins);

  // ON THE PLANET: Colour first (the plain option), then the ten real skins.
  const planet = group('planet', ONLINE.worldSkinPlanet);
  const colourLook = skinLook('colour');
  const colourTile = tile('colour', SKIN_NAMES.colour, ONLINE.worldSkinColourOnly, colourLook.preview, colourLook.image);
  colourTile.dataset.slot = 'colour';
  colourTile.addEventListener('click', () => openColourSheet(colourTile));
  planet.grid.appendChild(colourTile);
  for (const id of SKIN_IDS) {
    const look = skinLook(id);
    const button = tile(id, SKIN_NAMES[id], ONLINE.worldSkinBoth, look.preview, look.image);
    button.addEventListener('click', () => {
      if (note) note.hidden = true;
      awaitingGame = false;
      const previous = skinChoice();
      chooseSkin({ mine: id });
      savePlanetSkin(previous, id);
    });
    planet.grid.appendChild(button);
  }

  // IN A MATCH: ten real skins, never Colour.
  const game = group('game', ONLINE.worldSkinGame);
  step = element('p', 'world-skin-step');
  step.setAttribute('role', 'status');
  step.setAttribute('aria-live', 'polite');
  step.textContent = ONLINE.worldSkinPickGame;
  step.hidden = true;
  game.box.insertBefore(step, game.grid);
  for (const id of SKIN_IDS) {
    const look = skinLook(id);
    const button = tile(id, SKIN_NAMES[id], ONLINE.worldSkinGameOnly, look.preview, look.image);
    button.addEventListener('click', () => {
      if (note) note.hidden = true;
      awaitingGame = false;
      chooseSkin({ mineGame: id });
    });
    game.grid.appendChild(button);
  }

  // THE BOARD: the backdrop is independent of the skins and keeps its own small row.
  const board = group('board', ONLINE.worldSkinBoard);
  for (const b of BACKGROUNDS) {
    const name = b.id[0]!.toUpperCase() + b.id.slice(1);
    const button = b.url
      ? tile(b.id, name, '', '', b.url)
      : tile(b.id, name, '', '#2a2b2e');
    button.addEventListener('click', () => chooseSkin({ background: b.id }));
    board.grid.appendChild(button);
  }

  note = document.createElement('p');
  note.className = 'world-skin-note';
  note.setAttribute('role', 'status');
  note.hidden = true;

  // A guest sees the Colour tile (the twenty owner colours are not skins) and this one line.
  lockNote = document.createElement('p');
  lockNote.className = 'world-skin-locked';
  lockNote.textContent = ONLINE.worldSkinLocked;
  lockNote.hidden = true;

  section.append(planet.box, lockNote, game.box, board.box, note);
  paneEl.appendChild(section);
  prepareSheet();

  // Scrim, close and Done own their gestures; the sheet itself never closes silently.
  const scrim = sheet?.querySelector<HTMLElement>('.world-colour-sheet-scrim');
  scrim?.addEventListener('click', () => closeColourSheet(false));
  document.getElementById('world-colour-sheet-close')?.addEventListener('click', () => closeColourSheet(false));
  document.getElementById('world-colour-done')?.addEventListener('click', () => closeColourSheet(true));
  // Closing the whole window while the glass sheet is up must not leave a modal floating on the
  // map: the sheet is a layer of THIS pane, so the pane losing the colour page cancels it.
  const panelRoot = paneEl.closest?.('#online-world-panel') ?? null;
  if (panelRoot && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (panelRoot.getAttribute('data-pane') !== 'colour' && sheet && !sheet.hidden) closeColourSheet(false);
    }).observe(panelRoot, { attributes: true, attributeFilter: ['data-pane'] });
  }

  onSkinChoice(paint);
  paint();
};

/**
 * Make the section match the account gate. Called at mount and whenever an account arrives
 * (connectSkinSwitch), so signing in on the Planet reveals the skins without a reload.
 *
 * A GUEST STILL GETS THE COLOUR TILE. The twenty owner colours are not skins — they were always
 * everyone's, and the owner asked only to keep SKINS for accounts. So the pane is built for every
 * player, the Colour tile opens the colour sheet for everyone, and every REAL skin (plus the match
 * row and the board row) is hidden until an account is signed in.
 */
export const refreshSkinPickerVisibility = (): void => {
  if (!paneEl) return;
  if (!section) build();
  if (!section) return;
  const unlocked = skinPickerVisible();
  section.hidden = false;
  section.dataset.locked = String(!unlocked);
  if (lockNote) lockNote.hidden = unlocked;
  const planetBox = section.querySelector<HTMLElement>('[data-group="planet"]');
  for (const button of planetBox?.querySelectorAll<HTMLButtonElement>('.world-skin-tile') ?? []) {
    if (button.dataset.value !== 'colour') button.hidden = !unlocked;
  }
  const game = section.querySelector<HTMLElement>('[data-group="game"]');
  const board = section.querySelector<HTMLElement>('[data-group="board"]');
  if (game) game.hidden = !unlocked;
  if (board) board.hidden = !unlocked;
  if (step) step.hidden = !unlocked || !awaitingGame;
};

export function mountSkinSwitch(pane: HTMLElement | null): void {
  if (!SKIN_SWITCH || !pane) return;
  paneEl = pane;
  refreshSkinPickerVisibility();
  // A sign-in can happen in another tab; a focus check is free and reveals the pane then too.
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', refreshSkinPickerVisibility);
    window.addEventListener('storage', refreshSkinPickerVisibility);
  }
}
