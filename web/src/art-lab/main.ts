// FUTASAKU ART LAB (futasaku.com/art): a designer uploads art and sees it at once in the real game's
// drawing at a real phone size, then exports one art pack an agent drops into the game unchanged.
// Hidden page (noindex, not linked, never cached), its own bundle; everything stays on the device.
import './raw-storage.js';
import './lab.css';
import { viewFor } from '../../../src/engine/index.js';
import type { State } from '../../../src/engine/index.js';
import { GreedyBot } from '../../../src/bots/GreedyBot.js';
import { budgetVerdict, checkUpload, contrast, slowPhoneSeconds, weightNote } from './checks.js';
import { canWriteWebp, decode, measure, render, tilePreview } from './convert.js';
import { currentArt, systemFiles } from './current-art.js';
import { BoardOverlay, lostTiles } from './board-overlay.js';
import type { Scar } from './board-overlay.js';
import { PHONES, PhoneFrame } from './frame.js';
import type { PhoneSize } from './frame.js';
import { BOARD_SIZES, boardMoves, playGame, positionHash, readPositionHash } from './generator.js';
import type { BoardSize, Game } from './generator.js';
import { emptyState, exportPack, filePath, importPack, phoneBytes, slotStatus, slug } from './pack.js';
import type { LabFile, LabState, Status, SystemFiles, Value } from './pack.js';
import { SLOTS, defaults, targetSize } from './slots.js';
import type { Group, Setting, Slot } from './slots.js';
import { clearState, loadState, saveState } from './store.js';
import { mountSpec } from './spec.js';
import { mountPlanet } from './planet-view.js';

// ---------- tiny DOM helper ----------
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'text') e.textContent = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
const download = (bytes: Uint8Array | Blob, name: string, type = 'application/zip') => {
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// ---------- the lab's state ----------
let art: LabState = emptyState();
let today: LabState = emptyState();
let system: SystemFiles = new Map();
let artRev = 0;
let comparing = false;
let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let phone: PhoneSize = PHONES[1]!;
let seed = 4821;
let size: BoardSize = 'standard';
let game: Game = playGame(seed, size);
let moves = boardMoves(game);
let stepIndex = 0;
let playing: ReturnType<typeof setInterval> | null = null;
const notes = new Map<string, { errors: string[]; warnings: string[]; notes: string[] }>();
/** Narrow screens: the sections a designer has opened by hand (kept when a render rebuilds them). */
const folded = new Map<Group, boolean>();

const root = document.getElementById('lab')!;
const STATUS_TEXT: Record<Status, string> = { done: 'Done', current: "Today's art", missing: 'Missing', placeholder: 'Placeholder' };

// ---------- layout ----------
const statusBar = h('div', { class: 'budget', role: 'status', 'aria-live': 'polite' });
const checklist = h('div', { class: 'checklist' });
const slotsBox = h('div', { class: 'slots' });
const stage = h('section', { class: 'stage', 'aria-label': 'Preview' });
// Narrow screens (lab.css, max-width 999px): the workbench cannot be a workbench at phone size,
// so the page says so, frames the real game, and hands the dashboard over as labelled sections.
const narrowNote = h('section', { class: 'narrow-note', 'aria-labelledby': 'narrow-note-title' },
  h('p', { class: 'eyebrow', text: 'Phone view' }),
  h('h1', { id: 'narrow-note-title', text: 'The Art Lab is a workbench for a bigger screen.' }),
  h('p', { text: 'To drop in art and export a pack, open this page on a laptop. Below is the real game at your phone’s size; after it, every art slot and its spec.' }));
const previewCaption = h('p', { class: 'preview-caption' },
  h('strong', { text: 'The real game' }), ' at your phone’s size. The Art Lab is everything around it.');
const workbenchHead = h('div', { class: 'workbench-head' },
  h('h2', { text: 'The workbench' }),
  h('p', { text: 'Every art slot, grouped by where the game uses it. Open a section for its slots, sizes and settings.' }));
const tabs = h('div', { class: 'tabs', role: 'tablist' });
const panes: Record<string, HTMLElement> = {};
const phoneHost = h('div', { class: 'phone' });
const phoneWrap = h('div', { class: 'phone-wrap' }, phoneHost);
const frame = new PhoneFrame(phoneHost);
const overlay = new BoardOverlay(frame);
/** For the browser suite: what the lab holds and draws (read-only use). */
(window as unknown as Record<string, unknown>).__artLab = { overlay, state: () => art };
const positionLabel = h('output', { class: 'position' });
const scrub = h('input', { type: 'range', min: 0, max: 0, value: 0, 'aria-label': 'Move', class: 'scrub' }) as HTMLInputElement;
const toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
const say = (text: string) => { toast.textContent = text; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 3200); };

const headerActions = h('div', { class: 'actions' },
  h('button', { type: 'button', class: 'key', id: 'compare', title: "Hold to see today's art", text: "Hold: today's art",
    onpointerdown: () => setCompare(true), onpointerup: () => setCompare(false), onpointerleave: () => setCompare(false),
    onkeydown: (e) => { if ((e as KeyboardEvent).key === ' ') setCompare(true); }, onkeyup: () => setCompare(false) }),
  h('label', { class: 'key file' }, 'Import pack', h('input', { type: 'file', accept: '.zip,application/zip', id: 'import', onchange: onImport })),
  h('button', { type: 'button', class: 'key primary', id: 'export', onclick: onExport, text: 'Export art pack' }),
  h('button', { type: 'button', class: 'key quiet', id: 'clear', onclick: onClear, text: 'Clear all' }),
);
const header = h('header', { class: 'top' },
  h('div', { class: 'brand' }, h('strong', { text: 'FUTASAKU' }), h('span', { text: 'Art Lab' })),
  h('label', { class: 'pack-name' }, h('span', { class: 'sr', text: 'Pack name' }),
    h('input', { id: 'pack-name', value: art.label, maxlength: 48, onchange: (e) => { art.label = (e.target as HTMLInputElement).value || 'Art pack'; changed(false); } })),
  statusBar,
  headerActions,
);

const viewTools = h('div', { class: 'view-tools' },
  h('label', {}, 'Phone ', h('select', { id: 'phone', onchange: (e) => { phone = PHONES.find((p) => p.id === (e.target as HTMLSelectElement).value) ?? phone; void restartFrame(); } },
    ...PHONES.map((p) => h('option', { value: p.id, selected: p === phone, text: p.label })))),
  h('label', {}, h('input', { type: 'checkbox', id: 'reduce', checked: reduceMotion, onchange: (e) => { reduceMotion = (e.target as HTMLInputElement).checked; void restartFrame(); } }), ' Reduce motion'),
  h('label', {}, 'Check ', h('select', { id: 'vision', onchange: (e) => { phoneWrap.dataset.vision = (e.target as HTMLSelectElement).value; } },
    h('option', { value: '', text: 'Normal view' }), h('option', { value: 'squint', text: 'Squint (values only)' }),
    h('option', { value: 'deutan', text: 'Red-green colour blindness' }), h('option', { value: 'tritan', text: 'Blue-yellow colour blindness' }),
    h('option', { value: 'small', text: 'Arm’s length (half size)' }))),
);

const generator = h('div', { class: 'generator', 'aria-label': 'Real games by bots' },
  h('div', { class: 'row' },
    h('label', {}, 'Seed ', h('input', { id: 'seed', type: 'number', min: 1, max: 999999, value: seed, inputmode: 'numeric', onchange: (e) => newGame(Number((e.target as HTMLInputElement).value) || 1) })),
    h('select', { id: 'board-size', 'aria-label': 'Board size', onchange: (e) => { size = (e.target as HTMLSelectElement).value as BoardSize; newGame(seed); } },
      ...(Object.keys(BOARD_SIZES) as BoardSize[]).map((k) => h('option', { value: k, text: BOARD_SIZES[k].label }))),
    h('button', { type: 'button', class: 'key', onclick: () => newGame(1 + Math.floor(Math.random() * 99999)), text: 'New game' })),
  h('div', { class: 'row' },
    h('button', { type: 'button', class: 'key icon', 'aria-label': 'Previous move', onclick: () => go(prevMove()), text: '◀' }),
    h('button', { type: 'button', class: 'key icon', id: 'play', 'aria-label': 'Play', onclick: togglePlay, text: '▶' }),
    h('button', { type: 'button', class: 'key icon', 'aria-label': 'Next move', onclick: () => go(nextMove()), text: '▶|' }),
    scrub, positionLabel,
    h('button', { type: 'button', class: 'key quiet', onclick: copyPosition, text: 'Copy link' })),
  h('div', { class: 'row anims', 'aria-label': 'Animations on this position' },
    ...([['Grow', 'grow'], ['Strengthen', 'strengthen'], ['Cut', 'cut'], ['Bomb', 'bomb'], ['Blast', 'blast']] as const)
      .map(([label, kind]) => h('button', { type: 'button', class: 'key', onclick: () => animateNext(kind), text: label })),
    h('button', { type: 'button', class: 'key', onclick: () => void playCard(), text: 'Card play' }),
    h('button', { type: 'button', class: 'key', onclick: idleMotion, text: 'Idle motion' })),
);
scrub.addEventListener('input', () => go(moves[Number(scrub.value)] ?? 0, false));

// Board and Cards share ONE live area: the phone frame never moves in the page (moving an iframe
// reloads the game inside it); only the controls beside it change with the tab.
const boardPane = h('div', { class: 'pane', id: 'pane-board', role: 'tabpanel' });
const cardsPane = h('div', { class: 'pane-cards', id: 'pane-cards' });
const planetPane = h('div', { class: 'pane', id: 'pane-planet', role: 'tabpanel', hidden: true });
const specPane = h('div', { class: 'pane', id: 'pane-spec', role: 'tabpanel', hidden: true });
Object.assign(panes, { board: boardPane, planet: planetPane, spec: specPane });
boardPane.append(phoneWrap, previewCaption, viewTools, generator, cardsPane);
const showTab = (id: string) => {
  const live = id === 'board' || id === 'cards';
  for (const [k, p] of Object.entries(panes)) p.hidden = k === 'board' ? !live : k !== id;
  generator.hidden = id !== 'board';
  cardsPane.hidden = id !== 'cards';
  for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
  if (id === 'planet') planet.show();
  else planet.hide();
  stage.dataset.tab = id;
  requestAnimationFrame(fitPhone);
  // a board built while its tab was hidden measures itself once it shows (it picks its tier then)
  if (id === 'board' || id === 'cards') requestAnimationFrame(() => dispatchEvent(new Event('resize')));
};
for (const [id, label] of [['board', 'Board'], ['cards', 'Cards'], ['planet', 'Planet'], ['spec', 'Spec sheet']] as const) {
  tabs.append(h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => showTab(id), text: label }));
}
const cardGallery = h('div', { class: 'card-gallery' });
cardsPane.append(h('h2', { text: 'Every card face' }), cardGallery);
const planet = mountPlanet(planetPane, () => (comparing ? today : art));
mountSpec(specPane);
stage.append(tabs, boardPane, planetPane, specPane);

// colour-blindness views (Machado 2009, full strength): can players still tell the two sides apart?
const filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
filters.setAttribute('aria-hidden', 'true');
filters.style.cssText = 'position:absolute;width:0;height:0';
filters.innerHTML = `<filter id="lab-deutan"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0"/></filter>
<filter id="lab-tritan"><feColorMatrix type="matrix" values="1.256 -0.077 -0.179 0 0 -0.078 0.931 0.148 0 0 0.005 0.691 0.304 0 0 0 0 0 1 0"/></filter>`;
document.body.append(filters);
root.replaceChildren(narrowNote, header, h('main', { class: 'body' }, h('aside', { class: 'side', id: 'workbench', 'aria-label': 'Art slots' }, workbenchHead, checklist, slotsBox), stage), toast);
root.removeAttribute('aria-busy');
showTab('board');

// A phone has no room for the toolbar, so on narrow screens the same editing keys move below the
// preview (one node, moved — never duplicated): presentation order, not a second code path.
const workbenchNarrow = matchMedia('(max-width: 999.98px)');
const placeActions = () => {
  const target = workbenchNarrow.matches ? workbenchHead : header;
  if (headerActions.parentElement !== target) target.append(headerActions);
};
placeActions();
workbenchNarrow.addEventListener('change', () => { placeActions(); renderSlots(); requestAnimationFrame(fitPhone); });

// ---------- art changes ----------
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function changed(redrawBoard = true) {
  artRev++;
  renderChecklist();
  renderBudget();
  if (redrawBoard) drawBoard();
  applyCardArt();
  renderCards();
  planet.refresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { if (!(await saveState(art))) say('This browser would not keep the work (private mode or storage full). Export a pack to keep it.'); }, 400);
}
function setCompare(on: boolean) {
  if (comparing === on) return;
  comparing = on;
  document.body.classList.toggle('comparing', on);
  artRev++;
  drawBoard();
  applyCardArt();
  planet.refresh();
}
const shown = () => (comparing ? today : art);

// ---------- checklist + slots ----------
function renderChecklist() {
  const counts: Record<Status, number> = { done: 0, current: 0, missing: 0, placeholder: 0 };
  for (const s of SLOTS) counts[slotStatus(s, art.slots[s.id])]++;
  checklist.replaceChildren(
    h('h2', { text: 'Checklist' }),
    h('p', { class: 'counts' }, ...(Object.keys(counts) as Status[]).map((k) => h('span', { class: `chip ${k}`, text: `${counts[k]} ${STATUS_TEXT[k]}` }))),
    h('p', { class: 'hint', text: 'Missing slots must be filled; placeholders are optional (the game shows plain colours). Click a slot to jump to it.' }),
    h('ol', { class: 'mini' }, ...SLOTS.map((s) => {
      const st = slotStatus(s, art.slots[s.id]);
      return h('li', {}, h('a', { href: `#slot-${s.id}`, class: `dot ${st}`, title: `${s.title}: ${STATUS_TEXT[st]}`, onclick: () => openGroup(s.group), text: slotLabel(s) }));
    })),
  );
  for (const s of SLOTS) {
    const el = document.getElementById(`slot-${s.id}`);
    const st = slotStatus(s, art.slots[s.id]);
    if (el) { el.dataset.status = st; el.querySelector('.chip')!.textContent = STATUS_TEXT[st]; el.querySelector('.chip')!.className = `chip ${st}`; }
  }
}

/** "4", or "4a", "4b"… when one brief item has several slots. */
const slotLabel = (s: Slot) => {
  const same = SLOTS.filter((x) => x.n === s.n);
  return same.length > 1 ? `${s.n}${'abcdefghij'[same.indexOf(s)]}` : String(s.n);
};

function renderBudget() {
  const kb = phoneBytes(art, system) / 1024;
  const v = budgetVerdict(kb);
  statusBar.dataset.level = v.level;
  statusBar.textContent = `${v.text} About ${slowPhoneSeconds(kb)} s on a slow phone connection.${canWriteWebp() ? '' : ' (This browser saves PNG, not WebP: export from Chrome or Firefox for lighter files.)'}`;
}

const ruleLine = (s: Slot) => {
  const r = s.rule;
  if (r.shape === 'svg') return 'SVG (preferred) or a see-through PNG ≥ 96×96 · drawn in the suit colour';
  const [w, hh] = targetSize(s, r.tiered ? 'hi' : 'lo', defaults(s.fileSettings));
  const parts = [r.shape === 'card-sheet' ? `${w}×${hh} (3×3 sheet) or one 256×356 card` : `${w}×${hh}${r.tiered ? ` (phones get ${targetSize(s, 'lo', defaults(s.fileSettings)).join('×')})` : ''}`,
    r.alpha === 'required' ? (r.shape === 'hex' ? 'see-through around the hex' : 'see-through background') : r.alpha === 'forbidden' ? 'solid, no transparency' : 'transparency allowed',
    ...(r.seamless ? ['seamless (tiles)'] : []), 'PNG / JPG / WebP in', `aim < ${r.budgetKB} KB`];
  return parts.join(' · ');
};

function renderSlots() {
  const groups: Record<Group, string> = { board: 'Board', cards: 'Cards', planet: 'Planet' };
  slotsBox.replaceChildren(...(Object.keys(groups) as Group[]).map((g) => {
    const cards = SLOTS.filter((s) => s.group === g).map(slotCard);
    const heading = h('h2', { text: groups[g] });
    // Desktop keeps today's plain section, pixel for pixel. Narrow screens get a labelled,
    // foldable section: the page stays a short stack until the owner asks for the slots.
    if (!workbenchNarrow.matches) return h('section', { class: 'group', id: `group-${g}` }, heading, ...cards);
    const box = h('details', { class: 'group group-fold', id: `group-${g}`, open: folded.get(g) ?? false },
      h('summary', {}, heading, h('span', { class: 'fold-count', text: `${cards.length} slots` })), ...cards);
    box.addEventListener('toggle', () => { if (workbenchNarrow.matches) folded.set(g, box.open); });
    return box;
  }));
  renderChecklist();
}

/** Narrow screens only: revealing a slot must reveal the section it lives in first. */
function openGroup(g: Group) {
  if (!workbenchNarrow.matches) return;
  folded.set(g, true);
  const box = document.getElementById(`group-${g}`);
  if (box instanceof HTMLDetailsElement) box.open = true;
}

function slotCard(s: Slot): HTMLElement {
  const st = art.slots[s.id]!;
  const status = slotStatus(s, st);
  const msg = notes.get(s.id);
  const files = h('div', { class: 'files' }, ...st.files.map((f, i) => fileCard(s, f, i)));
  const accept = s.rule.shape === 'svg' ? '.svg,image/svg+xml,image/png' : 'image/png,image/jpeg,image/webp';
  const canAdd = st.files.filter((f) => f.source === 'designer').length < s.count.max;
  const drop = s.count.max > 0 ? h('label', { class: `drop${canAdd ? '' : ' full'}` },
    h('span', { text: canAdd ? (s.count.max > 1 ? `Drop or choose up to ${s.count.max} files` : 'Drop or choose a file') : 'Full: remove a file to add another' }),
    h('input', { type: 'file', accept, multiple: s.count.max > 1, disabled: !canAdd, onchange: (e) => { const t = e.target as HTMLInputElement; void upload(s, [...(t.files ?? [])]); t.value = ''; } })) : null;
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop?.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); void upload(s, [...((e as DragEvent).dataTransfer?.files ?? [])]); });
  const settings = s.settings.length ? h('div', { class: 'settings' }, ...s.settings.map((set) => control(set, st.settings[set.key], (v) => { st.settings[set.key] = v; changed(); }))) : null;
  const numbersNote = s.id.endsWith('-numbers') ? h('p', { class: 'note', text: `Contrast of the number on its plate: ${contrast(String(st.settings.ink), String(st.settings.plate))}:1 (aim for 4.5:1 or more).` }) : null;
  return h('article', { class: 'slot', id: `slot-${s.id}`, 'data-status': status },
    h('header', {},
      h('span', { class: 'n', text: slotLabel(s) }),
      h('h3', { text: s.title }),
      h('span', { class: `chip ${status}`, text: STATUS_TEXT[status] })),
    h('p', { class: 'where', text: s.where }),
    h('p', { class: 'rule', text: ruleLine(s) }),
    msg ? h('div', { class: 'messages', role: 'alert' }, ...msg.errors.map((t) => h('p', { class: 'error', text: t })), ...msg.warnings.map((t) => h('p', { class: 'warn', text: t })), ...msg.notes.map((t) => h('p', { class: 'note', text: t }))) : null,
    files, drop, settings, numbersNote,
    h('div', { class: 'slot-actions' },
      s.group === 'board' && st.files.length ? h('button', { type: 'button', class: 'link', onclick: () => pointAt(s), text: 'Show on the board' }) : null,
      (today.slots[s.id]?.files.length ?? 0) > 0 && st.files.some((f) => f.source === 'designer') ? h('button', { type: 'button', class: 'link', onclick: () => { art.slots[s.id] = structuredClone(today.slots[s.id]!); notes.delete(s.id); changed(); renderSlots(); }, text: "Back to today's art" }) : null),
  );
}

function fileCard(s: Slot, f: LabFile, i: number): HTMLElement {
  const url = URL.createObjectURL(new Blob([(f.hi ?? f.lo) as Uint8Array<ArrayBuffer>], { type: f.mime }));
  const img = h('img', { src: url, alt: f.name, loading: 'lazy' });
  img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60_000), { once: true });
  const kb = Math.round(f.lo.length / 1024);
  const box = h('figure', { class: `file ${f.source}` }, img,
    h('figcaption', {}, h('span', { text: f.source === 'current' ? "today's" : f.name }), h('span', { class: 'kb', text: `${kb} KB` }),
      h('button', { type: 'button', class: 'x', 'aria-label': `Remove ${f.name}`, onclick: () => { art.slots[s.id]!.files.splice(i, 1); changed(); renderSlots(); }, text: '×' })));
  if (s.rule.seamless) {
    box.append(h('button', { type: 'button', class: 'link', text: '3×3 tiling', onclick: async () => {
      const d = await decode(new Blob([f.lo as Uint8Array<ArrayBuffer>], { type: f.mime }));
      const c = tilePreview(d.bitmap);
      c.className = 'tiling';
      box.querySelector('.tiling')?.remove();
      box.append(c);
    } }));
  }
  if (s.fileSettings?.length) {
    box.append(h('div', { class: 'settings small' }, ...s.fileSettings.map((set) => control(set, f.settings[set.key], async (v) => {
      f.settings[set.key] = v;
      // a sprite's size sets its file size: remake its tiers when the size changes
      if (set.key === 'size' && originals.has(f)) await remake(s, f);
      changed();
    }))));
  }
  return box;
}

function control(set: Setting, value: Value | undefined, on: (v: Value) => void): HTMLElement {
  const id = `c-${Math.random().toString(36).slice(2, 9)}`;
  if (set.type === 'colour') return h('label', { for: id }, set.label, h('input', { id, type: 'color', value: String(value ?? set.default), oninput: (e) => on((e.target as HTMLInputElement).value) }));
  if (set.type === 'toggle') return h('label', { for: id, class: 'toggle' }, h('input', { id, type: 'checkbox', checked: value === undefined ? set.default : !!value, onchange: (e) => on((e.target as HTMLInputElement).checked) }), set.label);
  if (set.type === 'select') return h('label', { for: id }, set.label, h('select', { id, onchange: (e) => on((e.target as HTMLSelectElement).value) }, ...set.options.map((o) => h('option', { value: o, selected: (value ?? set.default) === o, text: o }))));
  const out = h('output', { text: String(value ?? set.default) });
  return h('label', { for: id, class: 'range' }, set.label,
    h('input', { id, type: 'range', min: set.min, max: set.max, step: set.step, value: Number(value ?? set.default), oninput: (e) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = String(v); on(v); } }), out);
}

// ---------- uploads ----------
/** The designer's original upload, so a size change remakes the tiers from it (this session). */
const originals = new WeakMap<LabFile, Blob>();

async function makeFile(s: Slot, blob: Blob, name: string, settings: Record<string, Value>) {
  const d = await decode(blob);
  const meta = measure(d, s);
  const verdict = checkUpload(s, meta, settings);
  if (verdict.errors.length) return { verdict, file: null };
  let file: LabFile;
  if (d.svg) file = { name, source: 'designer', mime: 'image/svg+xml', lo: new TextEncoder().encode(d.svg), settings };
  else {
    const [lw, lh] = targetSize(s, 'lo', settings);
    const lo = await render(d, s, lw, lh);
    file = { name, source: 'designer', mime: lo.mime, lo: lo.bytes, settings };
    if (s.rule.tiered) { const [hw, hh] = targetSize(s, 'hi', settings); file.hi = (await render(d, s, hw, hh)).bytes; }
    const heavy = weightNote(s, lo.bytes.length);
    if (heavy) verdict.warnings.push(heavy);
  }
  originals.set(file, blob);
  return { verdict, file };
}

async function remake(s: Slot, f: LabFile) {
  const blob = originals.get(f);
  if (!blob) return;
  const made = await makeFile(s, blob, f.name, f.settings);
  if (made.file) { f.lo = made.file.lo; if (made.file.hi) f.hi = made.file.hi; }
}

async function upload(s: Slot, list: File[]) {
  const st = art.slots[s.id]!;
  const all = { errors: [] as string[], warnings: [] as string[], notes: [] as string[] };
  // the designer's first file replaces today's art in this slot
  if (list.length && st.files.every((f) => f.source === 'current')) st.files = [];
  for (const file of list) {
    if (st.files.length >= s.count.max) { all.warnings.push(`Only ${s.count.max} file${s.count.max > 1 ? 's' : ''} fit this slot; ${file.name} was left out.`); continue; }
    try {
      const settings = { ...defaults(s.fileSettings), ...(s.id.endsWith('-tiles') ? { strength: Math.min(9, st.files.length + 1) } : {}) };
      const { verdict, file: made } = await makeFile(s, file, file.name, settings);
      const tag = list.length > 1 ? `${file.name}: ` : '';
      all.errors.push(...verdict.errors.map((t) => tag + t));
      all.warnings.push(...verdict.warnings.map((t) => tag + t));
      all.notes.push(...verdict.notes.map((t) => tag + t));
      if (made) st.files.push(made);
    } catch (e) {
      all.errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  if (!st.files.length && today.slots[s.id]?.files.length) art.slots[s.id] = structuredClone(today.slots[s.id]!);
  notes.set(s.id, all);
  changed();
  renderSlots();
  document.getElementById(`slot-${s.id}`)?.scrollIntoView({ block: 'nearest' });
}

// ---------- the board ----------
function scarsAt(i: number): Scar[] {
  const out: Scar[] = [];
  const turnAt = (k: number) => game.steps[k]!.state.turnNumber ?? k;
  for (let k = 1; k <= i; k++) {
    const before = game.steps[k - 1]!.state.board, after = game.steps[k]!.state.board;
    for (const key of lostTiles(before, after)) out.push({ key, owner: before[key]!.owner, age: Math.max(0, turnAt(i) - turnAt(k)), tile: before[key]! });
  }
  const latest = new Map(out.map((s) => [s.key, s]));
  return [...latest.values()].filter((s) => (s.age ?? 0) <= 2);
}

function drawBoard(fresh: string[] = []) {
  const st: State = game.steps[stepIndex]!.state;
  overlay.draw(shown(), system, artRev, st, scarsAt(stepIndex), reduceMotion, fresh);
}

function prevMove() { const m = [...moves].reverse().find((i) => i < stepIndex); return m ?? 0; }
function nextMove() { return moves.find((i) => i > stepIndex) ?? game.steps.length - 1; }

function go(i: number, syncScrub = true) {
  stepIndex = Math.max(0, Math.min(game.steps.length - 1, i));
  const moveNo = moves.filter((m) => m <= stepIndex).length;
  positionLabel.textContent = `Seed ${seed} · move ${moveNo} of ${moves.length}${size === 'small' ? ' · small board' : ''}`;
  if (syncScrub) scrub.value = String(Math.max(0, moves.indexOf(moves.filter((m) => m <= stepIndex).at(-1) ?? 0)));
  history.replaceState(null, '', positionHash(seed, moveNo, size));
  drawBoard();
}

function newGame(s: number, move = 0) {
  seed = Math.max(1, Math.min(999999, Math.floor(s)));
  (document.getElementById('seed') as HTMLInputElement).value = String(seed);
  (document.getElementById('board-size') as HTMLSelectElement).value = size;
  game = playGame(seed, size);
  moves = boardMoves(game);
  scrub.max = String(Math.max(0, moves.length - 1));
  artRev++;
  void restartFrame().then(() => go(move ? moves[Math.min(moves.length, move) - 1]! : 0));
}

function togglePlay() {
  const btn = document.getElementById('play')!;
  if (playing) { clearInterval(playing); playing = null; btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play'); return; }
  btn.textContent = '❚❚'; btn.setAttribute('aria-label', 'Pause');
  playing = setInterval(() => {
    const n = nextMove();
    if (n <= stepIndex || n >= game.steps.length - 1) { togglePlay(); go(game.steps.length - 1); return; }
    animateTo(n);
  }, reduceMotion ? 900 : 1300);
}

function copyPosition() {
  const link = `${location.origin}${location.pathname}${positionHash(seed, moves.filter((m) => m <= stepIndex).length, size)}`;
  void navigator.clipboard?.writeText(link).then(() => say('Link copied: it opens this exact position.'), () => say(link));
}

/** Moves to step `i` with the game's own board effects for what changed. */
function animateTo(i: number) {
  const before = game.steps[stepIndex]!.state.board;
  const step = game.steps[i]!;
  const after = step.state.board;
  const fresh = Object.keys(after).filter((k) => after[k] && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  const lost = lostTiles(before, after);
  stepIndex = i;
  go(i);
  drawBoard(fresh);
  const fx = overlay.effects(reduceMotion);
  if (!fx || reduceMotion) return;
  const a = step.action;
  const big = a?.t === 'MegaBomb';
  fresh.forEach((k, i) => fx.fx.sparks(k, step.actor === 1 ? 'bot' : 'you', i * 60, 1, 7));
  lost.forEach((k, i) => { fx.fx.cutFlash(k, 520, 0.32, 0.6); fx.fx.dust(k, 6, 1, i); });
  if (a?.t === 'PlayFruit' || big) { const at = lost[0] ?? fresh[0]; if (at) fx.fx.flash(at, 1, big, { dark: big }); fx.view.shake(false); }
}

function animateNext(kind: 'grow' | 'strengthen' | 'cut' | 'bomb' | 'blast') {
  const match = (k: number) => {
    const a = game.steps[k]!.action;
    if (!a) return false;
    // a Sprout on the player's own tile strengthens it; on empty ground it grows
    const onOwn = a.t === 'Sprout' && !!game.steps[k - 1]!.state.board[`${a.coord.q},${a.coord.r}`];
    if (kind === 'grow') return (a.t === 'Sprout' && !onOwn) || a.t === 'Bloom';
    if (kind === 'strengthen') return onOwn;
    if (kind === 'bomb') return a.t === 'PlayFruit';
    if (kind === 'blast') return a.t === 'MegaBomb';
    return a.t !== 'PlayFruit' && a.t !== 'MegaBomb' && lostTiles(game.steps[k - 1]!.state.board, game.steps[k]!.state.board).length > 0;
  };
  const from = [...game.steps.keys()].find((k) => k > stepIndex && match(k)) ?? [...game.steps.keys()].find((k) => k > 0 && match(k));
  if (from === undefined) { say(`This game has no ${kind}. Try New game.`); return; }
  // stand on the position just before it, then play it
  stepIndex = from - 1;
  drawBoard();
  setTimeout(() => animateTo(from), 350);
}

function idleMotion() {
  const on = !phoneWrap.classList.toggle('still');
  say(on ? 'Idle motion on: props, homes and motes move as in the game (off with Reduce motion).' : 'Idle motion paused.');
}

function pointAt(s: Slot) {
  const st = art.slots[s.id]!;
  const els = st.files.flatMap((f, i) => overlay.where(filePath(s, i, f)));
  showTab('board');
  if (!els.length) { say('Not on the board at this move (try another move, or it is part of the ground painting).'); return; }
  for (const e of els) { e.classList.add('art-lab-point'); setTimeout(() => e.classList.remove('art-lab-point'), 2400); }
  say(`${els.length} place${els.length > 1 ? 's' : ''} on this board.`);
}

// ---------- the real game frame ----------
async function restartFrame() {
  phoneHost.style.setProperty('--w', `${phone.w}px`);
  phoneHost.style.setProperty('--h', `${phone.h}px`);
  fitPhone();
  await frame.load(seed, phone, reduceMotion);
  // pointing at a slot's pictures: a soft pulse inside the frame
  frame.setCss(FRAME_BASE + cardArtCss);
  artRev++;
  drawBoard();
}

function fitPhone() {
  const avail = Math.max(240, (phoneWrap.clientWidth || 400) - 24);
  // the whole phone fits the window (below the header and tabs), never above real size
  const k = Math.min(1, avail / phone.w, Math.max(0.45, (innerHeight - 150) / phone.h));
  phoneHost.style.setProperty('--k', String(k));
}
addEventListener('resize', fitPhone);
new MutationObserver(() => frame.doc?.documentElement.classList.toggle('art-lab-still', phoneWrap.classList.contains('still'))).observe(phoneWrap, { attributes: true, attributeFilter: ['class'] });

/** The real hand plays its next move (deal, play, throw on the pile) with the game's own animations. */
async function playCard() {
  const hk = frame.hook();
  const st = hk?.state();
  if (!hk || !st) { say('The game is still loading.'); return; }
  if (st.actor !== 0 || hk.busy()) { say("It's the other player's turn: wait a moment and press again."); return; }
  const a = GreedyBot.chooseAction(viewFor(st, 0));
  hk.playFor(a, 0);
  showTab('cards');
}

// ---------- cards ----------
/** Inside the frame: pointing at a slot's pictures (a soft pulse), and pausing idle motion. */
const FRAME_BASE = `.art-lab-point{animation:art-lab-point .6s ease-in-out 4 alternate;transform-box:fill-box;transform-origin:center}
@keyframes art-lab-point{to{filter:drop-shadow(0 0 6px #ffd27a) brightness(1.35)}}
html.art-lab-still *{animation-play-state:paused !important}\n`;
let cardArtCss = '';
const cardUrls: string[] = [];
function applyCardArt() {
  for (const u of cardUrls.splice(0)) URL.revokeObjectURL(u);
  const src = shown();
  const url = (id: string) => {
    const f = src.slots[id]?.files[0];
    if (!f) return null;
    const u = URL.createObjectURL(new Blob([f.lo as Uint8Array<ArrayBuffer>], { type: f.mime }));
    cardUrls.push(u);
    return u;
  };
  const rules: string[] = [];
  (['moss', 'ash', 'dew', 'ember'] as const).forEach((s, i) => { const u = url(`card-${s}`); if (u) rules.push(`.futa04-cards .card.s${i} .futa04-card-art{background-image:url('${u}') !important}`); });
  const bomb = url('card-bomb');
  if (bomb) rules.push(`.futa04-cards .card.fruit .futa04-card-art{background-image:url('${bomb}') !important}`);
  const back = url('card-back');
  if (back) rules.push(`.futa04-cards .card.back,.futa04-cards #deck .pile-stack,.futa04-cards #deck .pile-stack::before,.futa04-cards #deck .pile-stack::after{background-image:url('${back}') !important}`);
  cardArtCss = rules.join('\n');
  // suit symbols: the uploaded SVGs replace the drawn ones
  const icons = (['moss', 'ash', 'dew', 'ember'] as const).map((s) => { const f = src.slots[`icon-${s}`]?.files[0]; return f?.mime === 'image/svg+xml' ? new TextDecoder().decode(f.lo) : null; });
  if (frame.doc) {
    for (const el of frame.doc.querySelectorAll<HTMLElement>('.card .c-suit')) {
      const suit = /\bs([0-3])\b/.exec(el.closest('.card')?.className ?? '')?.[1];
      const svg = suit !== undefined ? icons[Number(suit)] : null;
      if (svg && el.dataset.lab !== String(artRev)) { el.innerHTML = svg; el.dataset.lab = String(artRev); }
    }
  }
  frame.setCss(FRAME_BASE + cardArtCss);
}

function renderCards() {
  const src = shown();
  const faces = (['moss', 'ash', 'dew', 'ember'] as const).map((s, i) => {
    const f = src.slots[`card-${s}`]?.files[0];
    const u = f ? URL.createObjectURL(new Blob([f.lo as Uint8Array<ArrayBuffer>], { type: f.mime })) : '';
    return h('div', { class: 'suit-row' }, h('h3', { text: s[0]!.toUpperCase() + s.slice(1) }),
      ...Array.from({ length: 9 }, (_, r) => h('div', { class: `mini-card s${i}`, style: u ? `background-image:url('${u}');background-position:${(r % 3) * 50}% ${Math.floor(r / 3) * 50}%` : '', title: `${s} ${r + 1}`, text: u ? '' : String(r + 1) })));
  });
  const one = (id: string, label: string) => {
    const f = src.slots[id]?.files[0];
    const u = f ? URL.createObjectURL(new Blob([f.lo as Uint8Array<ArrayBuffer>], { type: f.mime })) : '';
    return h('figure', { class: 'single-wrap' }, h('div', { class: 'mini-card single', style: u ? `background-image:url('${u}')` : '' }), h('figcaption', { text: label }));
  };
  cardGallery.replaceChildren(...faces, h('div', { class: 'suit-row' }, one('card-back', 'Back'), one('card-back-frame', 'Back frame (not drawn by today’s game)'), one('card-bomb', 'Bomb (Blast too)')));
}

// ---------- export / import / clear ----------
function onExport() {
  try {
    const zip = exportPack(art, system);
    download(zip, `${slug(art.label)}.zip`);
    const missing = SLOTS.filter((s) => slotStatus(s, art.slots[s.id]) === 'missing');
    say(missing.length ? `Exported. Still missing: ${missing.map((s) => s.title).join(', ')}.` : 'Exported: the pack has every required slot.');
  } catch (e) { say(`Export failed: ${(e as Error).message}`); }
}
async function onImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    art = importPack(new Uint8Array(await f.arrayBuffer()));
    (document.getElementById('pack-name') as HTMLInputElement).value = art.label;
    notes.clear();
    changed();
    renderSlots();
    say(`Opened “${art.label}”.`);
  } catch (err) { say((err as Error).message); }
}
let clearArmed = false;
async function onClear() {
  const b = document.getElementById('clear')!;
  if (!clearArmed) { clearArmed = true; b.textContent = 'Sure? Clear all'; setTimeout(() => { clearArmed = false; b.textContent = 'Clear all'; }, 4000); return; }
  clearArmed = false;
  b.textContent = 'Clear all';
  await clearState();
  art = structuredClone(today);
  art.label = 'New art pack';
  (document.getElementById('pack-name') as HTMLInputElement).value = art.label;
  notes.clear();
  changed();
  renderSlots();
  say("Cleared: back to today's art. Nothing of yours is kept on this device.");
}

// ---------- start ----------
// The lab owns its route: register the /art/-scoped worker (web/art/public/art-sw.js). It answers this
// page's navigations from the network, so neither the game's root worker nor a 10-minute-old HTML
// cache entry can put anything but the lab at /art/. Offline play is the game's job, not the lab's.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./art-sw.js').catch(() => {
    /* the lab works without it; a failed registration must not stop the dashboard */
  });
}
(async () => {
  const progress = h('progress', { max: 1, value: 0 });
  root.prepend(h('div', { class: 'loading' }, 'Loading today’s art… ', progress));
  try {
    [system, today] = await Promise.all([systemFiles(), currentArt((f) => { progress.value = f; })]);
  } catch (e) { say(`Could not load today's art: ${(e as Error).message}`); }
  root.querySelector('.loading')?.remove();
  art = (await loadState()) ?? structuredClone(today);
  (document.getElementById('pack-name') as HTMLInputElement).value = art.label;
  renderSlots();
  renderBudget();
  renderCards();
  const pos = readPositionHash(location.hash);
  if (pos) size = pos.size;
  newGame(pos?.seed ?? seed, pos?.move ?? 0);
})();
