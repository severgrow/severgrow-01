// THE BOARD SKIN SWITCH (owner, 2026-11-14): inside the planet's colour pane, under the twenty
// colours. Three rows of named chips with a real thumbnail each: your tiles, their tiles and the
// board background. A tap stores the choice (ui/skinChoice.ts); the next match wears it.
//
// THE ADMIN GATE (owner, 2026-11-16): "hide the skins in the planet for now ... don't show the
// selection of skins or background in the planet for any players except for the admin account RYK."
// The whole switch is this ONE section, so one predicate covers the skins AND the background:
// `skinPickerVisible()` (ui/skinChoice.ts). A player who is not the admin gets no section, no gap and
// nothing announced. (The old header here said "/test/ only": that was already untrue — the mount
// condition also let a local dev host through, and the live root is built from the same futa05
// source. The route is no longer what decides; the account is.)
//
// Static DOM, no timers; built once and re-marked by the ONE change notification in ui/skinChoice.ts
// (a tap here, the account's own answer, or another tab), so a chip never marks a skin the board is
// not wearing.
import { BACKGROUNDS, TERRITORIES, TERRITORY_IDS } from '../ui/forestAsh.js';
import type { BackgroundId, TerritoryId } from '../ui/forestAsh.js';
import { TILE_SKIN_IDS, TILE_SKIN_NAMES } from '../ui/tileSkins.js';
import type { TileSkinId } from '../ui/tileSkins.js';
import { ART_W, ART_H, tileSkinDef } from '../ui/tileSkinArt.js';
import { SKIN_SWITCH, adoptServerSkin, chooseSkin, onSkinChoice, skinChoice, skinPickerVisible, skinRevision } from '../ui/skinChoice.js';
import type { SkinChoice } from '../ui/skinChoice.js';
import type { DuelClient } from '../../../server/src/client.js';

const NAMES: Record<TerritoryId | BackgroundId, string> = {
  forest: 'Forest', ash: 'Ash', water: 'Water', toxic: 'Toxic',
  classic: 'Classic', cocoa: 'Cocoa', lichen: 'Lichen', cinder: 'Cinder', clay: 'Clay', slate: 'Slate',
};

/** One chip: a value, the name it shows, and either a picture or a generated skin thumbnail. */
type SkinOption = { id: string; label: string; thumb: string | null; skin?: TileSkinId };

/**
 * A skin's chip picture, drawn by the SAME builder the board paints from (`ui/tileSkinArt.ts`), so
 * the pane can never advertise a family the board does not draw. No DOM (the node tests) → no
 * picture, and the chip keeps its name.
 */
const skinThumb = (id: TileSkinId): SVGSVGElement | null => {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ART_W} ${ART_H}`);
  svg.setAttribute('class', 'world-skin-thumb');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${tileSkinDef(defs, id, 0)}`);
  svg.appendChild(use);
  return svg;
};

/** The six in-game families, with the shipped look first: `null` is Forest / Ash. */
const tileOptions = (fallback: string): SkinOption[] => [
  { id: 'none', label: fallback, thumb: null },
  ...TILE_SKIN_IDS.map((id) => ({ id, label: TILE_SKIN_NAMES[id], thumb: null, skin: id })),
];

const CSS = `
#world-skin-switch { display: grid; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e8ddc51f; }
#world-skin-switch .world-colour-chip { background-size: cover; background-position: center; }
#world-skin-switch .world-colours { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }
#world-skin-switch .world-colour-swatch.skin-on { background: #f2c87918; box-shadow: inset 0 0 0 1px #f2c87959; }
#world-skin-switch .world-colour-swatch.skin-on .world-colour-name { color: #f6ecd2; }
#world-skin-switch .world-colour-swatch.skin-on .world-colour-chip { box-shadow: 0 0 0 2px #f6ecd2; }
#world-skin-switch .world-skin-note { margin: 0; font-size: 11px; line-height: 1.35; color: #e8ddc5a8; }
#world-skin-switch .world-skin-thumb { display: block; width: 100%; height: 100%; }
#world-skin-switch .world-colour-chip:has(.world-skin-thumb) { background: #0d0f13; }
#world-skin-switch .world-skin-help { margin: 0; font-size: 10.5px; line-height: 1.35; color: #e8ddc57a; }
#world-skin-switch .world-skin-note[hidden] { display: none; }
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
  // Only the admin's account is synced at all: a non-admin has no use for the stored skin (the
  // product defaults are theirs, ui/skinChoice.ts) and must not spend a request on it.
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
  // on its way. It used to preview Forest here, which made the pane claim a skin the board would not
  // draw for the whole length of the read — and on a slow or failing connection the player could
  // enter a match believing Forest was chosen while the stored skin was Water.
  const issued = skinRevision();
  try {
    const saved = await client.worldSkin(token);
    if (account !== current || !current) return;
    // The account's answer is the truth for "your tiles" — but only when nothing was chosen since
    // this read left. A read that is out of date is dropped, never written back over the tap; a
    // failed or empty answer leaves this browser's choice alone (ui/skinChoice.ts: adoptServerSkin).
    confirmed = saved && TERRITORY_IDS.includes(saved) ? saved : null;
    // The switch marks itself through ui/skinChoice.ts's one notification; nothing to do here.
    adoptServerSkin(saved, issued);
    // The initial world read already carries the public skin on each claim. Re-fetching here
    // duplicates wallet/world requests on entry; a deliberate POST below still refreshes it.
  } catch {
    /* No answer (an older server, a dropped connection): the browser's own choice stands. */
  }
}

export function disconnectSkinSwitch(): void { account = null; saveSeq++; }

export function mountSkinSwitch(pane: HTMLElement | null): void {
  // THE ADMIN GATE (owner, 2026-11-16, "for now"): one predicate hides the skins AND the background.
  // Checked before anything is created, so a non-admin's pane gets no section, no style, no gap and
  // nothing for a screen reader to announce.
  if (!SKIN_SWITCH || !skinPickerVisible() || !pane || pane.querySelector('#world-skin-switch')) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('section');
  box.id = 'world-skin-switch';
  box.setAttribute('aria-label', 'Board skin (test)');
  // A save the server refused says so, quietly, in the pane (role=status: announced, not shouted).
  const note = document.createElement('p');
  note.className = 'world-skin-note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  const rows: [string, keyof SkinChoice, SkinOption[]][] = [
    ['Your tiles (test)', 'mine', TERRITORY_IDS.map((id) => ({ id, label: NAMES[id], thumb: TERRITORIES[id].tiles[0]!.url }))],
    ['Their tiles (test)', 'theirs', TERRITORY_IDS.map((id) => ({ id, label: NAMES[id], thumb: TERRITORIES[id].tiles[0]!.url }))],
    ['Your tiles — six skins (test)', 'tileMine', tileOptions('Forest')],
    ['Their tiles — six skins (test)', 'tileTheirs', tileOptions('Ash')],
    ['Board (test)', 'background', BACKGROUNDS.map((b) => ({ id: b.id, label: NAMES[b.id], thumb: b.url }))],
  ];
  const mark = () => {
    const c = skinChoice();
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-field]')) {
      // `none` stands for "no skin chosen" (null), which is the shipped Forest/Ash look.
      const on = (c[b.dataset.field as keyof SkinChoice] ?? 'none') === b.dataset.value;
      // Its own mark, not the colour grid's `.current` (tests and styles read that as "my colour").
      b.classList.toggle('skin-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  // The pane marks what the board wears, whoever changed it: this pane, an account read, or another
  // tab (ui/skinChoice.ts). One subscription, no per-tap bookkeeping.
  onSkinChoice(mark);
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
      b.setAttribute('aria-label', o.label);
      const chip = document.createElement('span');
      chip.className = 'world-colour-chip';
      chip.setAttribute('aria-hidden', 'true');
      if (o.thumb) chip.style.backgroundImage = `url("${o.thumb}")`;
      else chip.style.background = '#2a2b2e';
      const thumb = o.skin ? skinThumb(o.skin) : null;
      if (thumb) chip.replaceChildren(thumb);
      const name = document.createElement('span');
      name.className = 'world-colour-name';
      name.textContent = o.label;
      b.append(chip, name);
      b.addEventListener('click', () => {
        note.hidden = true;
        const previous = skinChoice();
        // `none` is "no skin": it stores null and the board returns to Forest / Ash.
        chooseSkin({ [field]: o.id === 'none' ? null : o.id });   // the pane re-marks itself
        if (field !== 'mine' || !account) return;
        const selected = o.id as TerritoryId;
        const owner = account;
        // THE LAST TAP OWNS THE SWITCH. A save that is still in flight used to swallow every later
        // tap silently (one stalled request locked "Your tiles" for good). Now a newer tap is
        // accepted, and only the newest save's answer may move the choice — an older answer, success
        // or refusal, is out of date and is dropped.
        const ticket = ++saveSeq;
        void owner.client.chooseWorldSkin(owner.token, selected).then((saved) => {
          if (account !== owner || ticket !== saveSeq) return;
          confirmed = TERRITORY_IDS.includes(saved) ? saved : selected;
          chooseSkin({ mine: saved }); owner.refresh();
        }).catch(() => {
          if (account !== owner || ticket !== saveSeq) return;
          // The server did not take it. Put the switch back on what is actually stored (the account's
          // last confirmed skin), and say so: a chip that silently snaps back reads as "nothing
          // happened".
          const staying = confirmed ?? previous.mine;
          chooseSkin({ mine: staying });
          note.textContent = `Not saved — the board stays ${NAMES[staying]}.`;
          note.hidden = false;
        });
      });
      grid.appendChild(b);
    }
    box.append(title, grid);
  }
  // Two sides that wear the SAME family cannot be told apart by colour any more: these skins have
  // fixed colours and are never tinted toward the owner's palette colour (ui/tileSkins.ts).
  const help = document.createElement('p');
  help.className = 'world-skin-help';
  help.textContent = 'Skins paint fixed colours: colour no longer says whose. Pick a different family for each side.';
  box.append(note, help);
  pane.appendChild(box);
  mark();
}
