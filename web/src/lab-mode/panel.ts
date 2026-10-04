// The Lab panel (test copy only: main.ts loads this file only when IS_TEST). One scrollable
// sheet: map, deck and length, opponent, and four buttons. Experiments are saved in this
// channel's own storage (channel.ts adds the prefix) and travel in share links (#lab=...).
import { newGame } from '../../../src/engine/index.js';
import type { RulesConfig } from '../../../src/engine/index.js';
import { homeRotation } from '../logic/orient.js';
import { SHAPE_LIMITS } from './boardgen.js';
import type { HomesMode, MapResult } from './boardgen.js';
import { CLASSIC, PRESETS, decodeSetup, encodeSetup, isClassic, mapOf, sanitize, shortCode, toOverrides } from './setup.js';
import type { LabSetup } from './setup.js';
import { installPanZoom } from './panzoom.js';
import { LAB_CSS } from './lab-css.js';

export type LabHooks = {
  /** opens a sheet by id (null closes) */
  sheet: (id: string | null) => void;
  /** starts a new game with these overrides at this opponent level */
  play: (overrides: Partial<RulesConfig>, level: number) => void;
  /** "Watch a game": starts a game where a second opponent (level `green`) plays my seat */
  watch: (level: number, green: number, pause: number) => void;
  /** changes the watched game in place (null: I take over my seat) */
  setWatch: (w: { level: number; pause: number } | null) => void;
  board: SVGSVGElement;
  boardWrap: HTMLElement;
};

const ACTIVE_KEY = 'severgrow-lab-active';
/** "Watch a game" speeds: the extra pause after each move, in ms */
const PACES = [1400, 500, 0];
const PACE_NAMES = ['Slow', 'Normal', 'Fast'];
let pace = 1;
const MINE_KEY = 'severgrow-lab-presets';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked: the experiment still runs, it just isn't remembered */
  }
};

const myPresets = (): LabSetup[] => {
  try {
    const raw: unknown = JSON.parse(read(MINE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.slice(0, 30).map((x) => sanitize(x as Partial<LabSetup>)) : [];
  } catch {
    return [];
  }
};

const SHAPE_NAMES: Record<LabSetup['map'], string> = {
  classic: 'Classic board',
  hexagon: 'Hexagon',
  rhombus: 'Rhombus',
  rectangle: 'Rectangle',
  triangle: 'Triangle',
  ring: 'Ring',
  blob: 'Blob',
};
const HOMES_NAMES: Record<HomesMode, string> = { auto: 'Auto', corners: 'Corners', centre: 'Near centre' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The preview: every hex, rock dark, gold yellow, my home green at the bottom, theirs at the top. */
const previewSvg = (s: LabSetup, m: MapResult | null): string => {
  let cells: string[];
  let rock = new Set<string>();
  let gold = new Set<string>();
  let homes: [string, string];
  let cfg: RulesConfig;
  if (m) {
    cells = m.spec.cells;
    rock = new Set(m.spec.rock);
    gold = new Set(m.spec.gold);
    homes = m.spec.homes;
    cfg = newGame(1, toOverrides(s, m)).config;
  } else {
    const g = newGame(s.mapSeed);
    cfg = g.config;
    cells = Object.keys(g.board);
    for (const [k, t] of Object.entries(g.terrain)) {
      if (t === 'rock') rock.add(k);
      if (t === 'rich') gold.add(k);
    }
    homes = Object.entries(g.board)
      .filter(([, t]) => t?.root)
      .sort((a, b) => a[1]!.owner - b[1]!.owner)
      .map(([k]) => k) as [string, string];
  }
  const a = ((-90 + 60 * homeRotation('flat', cfg, 0)) * Math.PI) / 180;
  const pos = (k: string) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    const bx = Math.sqrt(3) * (q + r / 2);
    const by = 1.5 * r;
    return { x: bx * Math.cos(a) - by * Math.sin(a), y: bx * Math.sin(a) + by * Math.cos(a) };
  };
  const ps = cells.map((k) => ({ k, ...pos(k) }));
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const x0 = Math.min(...xs) - 1.2;
  const y0 = Math.min(...ys) - 1.2;
  const w = Math.max(...xs) - x0 + 1.2;
  const h = Math.max(...ys) - y0 + 1.2;
  const hex = (x: number, y: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const t = ((60 * i + 30) * Math.PI) / 180 + a;
      return `${(x + 0.95 * Math.cos(t)).toFixed(2)},${(y + 0.95 * Math.sin(t)).toFixed(2)}`;
    }).join(' ');
  const body = ps
    .map((p) => {
      const cls = p.k === homes[0] ? 'me' : p.k === homes[1] ? 'opp' : rock.has(p.k) ? 'rock' : gold.has(p.k) ? 'gold' : 'open';
      return `<polygon class="lp-${cls}" points="${hex(p.x, p.y)}"/>`;
    })
    .join('');
  return `<svg class="lab-preview" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" role="img" aria-label="Map preview: ${cells.length} hexes">${body}</svg>`;
};

export const mountLab = (hooks: LabHooks) => {
  const style = document.createElement('style');
  style.textContent = LAB_CSS;
  document.head.appendChild(style);
  let s: LabSetup = (() => {
    const c = read(ACTIVE_KEY);
    return (c && decodeSetup(c)) || CLASSIC;
  })();
  let active: LabSetup | null = read(ACTIVE_KEY) ? s : null;
  let fromLink = false;

  // ---------- the sheet ----------
  const sheet = document.createElement('section');
  sheet.id = 'sheet-lab';
  sheet.className = 'sheet lab-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'lab-title');
  sheet.hidden = true;
  document.getElementById('scrim')!.after(sheet);

  const num = (key: keyof LabSetup, label: string, lo: number, hi: number, unit = '', zeroText = '') => {
    const v = s[key] as number;
    const shown = v === 0 && zeroText ? zeroText : `${v}${unit}`;
    return `<label class="lab-row"><span>${label} <b data-out="${key}">${shown}</b></span><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" data-num="${key}" data-unit="${unit}" data-zero="${esc(zeroText)}"></label>`;
  };
  const check = (key: keyof LabSetup, label: string) => `<label class="lab-row lab-check"><span>${label}</span><input type="checkbox" data-bool="${key}"${s[key] ? ' checked' : ''}></label>`;
  const select = (key: keyof LabSetup, label: string, options: [string, string][]) =>
    `<label class="lab-row"><span>${label}</span><select data-sel="${key}">${options.map(([v, t]) => `<option value="${v}"${String(s[key]) === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

  const render = () => {
    const m = mapOf(s);
    const lim = s.map === 'classic' ? null : SHAPE_LIMITS[s.map];
    const presets = [...PRESETS, ...myPresets()];
    sheet.innerHTML = `
      <header class="sheet-head"><h2 id="lab-title">Lab</h2><button class="icon-only" type="button" data-lab="close" aria-label="Close">✕</button></header>
      <div class="sheet-body lab-body">
        ${fromLink ? `<div class="lab-link-note"><p>Someone shared an experiment: <b>${esc(s.name)}</b>.</p><button class="btn primary big" type="button" data-lab="play">Play this experiment</button></div>` : ''}
        ${select('name' as keyof LabSetup, 'Start from', [['', 'Pick a preset…'], ...presets.map((p, i): [string, string] => [String(i), p.name])])}
        <label class="lab-row"><span>Name</span><input type="text" maxlength="40" value="${esc(s.name)}" data-text="name"></label>
        <h3>Map</h3>
        ${select('map', 'Shape', (Object.keys(SHAPE_NAMES) as LabSetup['map'][]).map((k): [string, string] => [k, SHAPE_NAMES[k]]))}
        ${lim ? num('a', lim.aLabel, lim.a[0], lim.a[1]) : ''}
        ${lim?.b && lim.bLabel ? num('b', lim.bLabel, lim.b[0], lim.b[1]) : ''}
        ${lim ? num('rockPct', 'Rock', 0, 40, '%') + num('goldPct', 'Gold', 0, 40, '%') + select('homes', 'Homes', (Object.keys(HOMES_NAMES) as HomesMode[]).map((k): [string, string] => [k, HOMES_NAMES[k]])) : '<p class="muted small">The classic board: rock and gold are dealt fresh each game. The preview shows one example.</p>'}
        <div class="lab-row"><span>Map seed <b>${s.mapSeed}</b></span><button class="btn ghost" type="button" data-lab="seed">Randomise</button></div>
        <div class="lab-preview-wrap">${previewSvg(s, m)}</div>
        <p class="muted small lab-legend"><i class="lp-me"></i> your home (bottom) <i class="lp-opp"></i> opponent's home (top) <i class="lp-rock"></i> rock <i class="lp-gold"></i> gold · ${m ? m.spec.cells.length : 37} hexes</p>
        ${m && m.warnings.length ? `<ul class="lab-warnings">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="muted small">No warnings.</p>'}
        <h3>Deck and length</h3>
        ${num('handSize', 'Hand size', 4, 10)}
        ${num('copies', 'Copies of each card', 1, 3)}
        ${num('maxRank', 'Highest card', 5, 9)}
        ${num('fruit', 'Fruit cards', 0, 8)}
        ${check('sprout', 'Sprout (one tile a turn)')}
        ${check('strengthen', 'Strengthen')}
        ${check('reshuffle', 'Reshuffle the throw pile when the deck runs out')}
        ${num('turns', 'Turns each', s.reshuffle ? 10 : 0, 200, '', s.reshuffle ? '' : 'until the deck runs out')}
        <p class="muted small">${s.reshuffle ? 'With reshuffle on, the turn limit is the only clock.' : 'The game ends at the turn limit or when the deck runs out, whichever comes first.'}</p>
        <h3>Opponent</h3>
        ${num('level', 'Level', 1, 9)}
        <h3>Watch a game</h3>
        <p class="muted small">Two opponents play each other on this experiment while you watch. Green plays your side, red is the opponent above. You can take over green at any time.</p>
        ${num('watchLevel', 'Green level', 1, 9)}
        <div class="lab-buttons">
          <button class="btn primary big" type="button" data-lab="play">Apply and play</button>
          <button class="btn big" type="button" data-lab="watch">Watch a game</button>
          <button class="btn ghost" type="button" data-lab="classic">Reset to Classic</button>
          <button class="btn ghost" type="button" data-lab="copy">Copy link</button>
          <button class="btn ghost" type="button" data-lab="save">Save as preset</button>
        </div>
        <p class="muted small" data-lab-msg aria-live="polite"></p>
      </div>`;
  };

  const msg = (t: string) => {
    const el = sheet.querySelector<HTMLElement>('[data-lab-msg]');
    if (el) el.textContent = t;
  };
  const set = (x: Partial<LabSetup>) => {
    s = sanitize({ ...s, ...x });
  };

  sheet.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.num) {
      const v = Number(t.value);
      const out = sheet.querySelector<HTMLElement>(`[data-out="${t.dataset.num}"]`);
      if (out) out.textContent = v === 0 && t.dataset.zero ? t.dataset.zero : `${v}${t.dataset.unit ?? ''}`;
    }
    if (t.dataset.text === 'name') set({ name: t.value });
  });
  sheet.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const keep = sheet.scrollTop;
    if (t.dataset.num) set({ [t.dataset.num]: Number(t.value) });
    else if ((t as HTMLInputElement).dataset.bool) set({ [(t as HTMLInputElement).dataset.bool!]: (t as HTMLInputElement).checked });
    else if (t.dataset.sel === 'name') {
      const p = [...PRESETS, ...myPresets()][Number(t.value)];
      if (p) s = { ...p };
    } else if (t.dataset.sel === 'map') {
      const map = t.value as LabSetup['map'];
      const lim = map === 'classic' ? null : SHAPE_LIMITS[map];
      // a sensible size for the new shape
      const a = map === 'hexagon' ? 4 : map === 'blob' ? 80 : map === 'ring' ? 5 : map === 'triangle' ? 9 : 7;
      const b = map === 'ring' ? 2 : map === 'rectangle' ? 10 : 7;
      set({ map, a: lim ? a : 3, b, reshuffle: map === 'classic' ? s.reshuffle : true, turns: map === 'classic' ? s.turns : Math.max(s.turns, 40) });
    } else if (t.dataset.sel === 'homes') set({ homes: t.value as HomesMode });
    else return;
    render();
    sheet.scrollTop = keep;
  });
  sheet.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-lab]');
    if (!b) return;
    const what = b.dataset.lab;
    if (what === 'close') hooks.sheet(null);
    else if (what === 'seed') {
      set({ mapSeed: 1 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 999_999) });
      const keep = sheet.scrollTop;
      render();
      sheet.scrollTop = keep;
    } else if (what === 'classic') {
      s = { ...CLASSIC };
      fromLink = false;
      render();
    } else if (what === 'play') {
      fromLink = false;
      activate(s);
      hooks.sheet(null);
      hooks.play(toOverrides(s), s.level);
    } else if (what === 'watch') {
      fromLink = false;
      activate(s);
      hooks.sheet(null);
      hooks.watch(s.level, s.watchLevel, PACES[pace]!);
    } else if (what === 'copy') {
      const url = `${location.origin}${location.pathname}#lab=${encodeSetup(s)}`;
      msg(url);
      if (navigator.clipboard) void navigator.clipboard.writeText(url).then(() => msg(`Link copied. Anyone who opens it sees this experiment: ${url}`), () => msg(url));
    } else if (what === 'save') {
      const mine = myPresets().filter((p) => p.name !== s.name);
      write(MINE_KEY, JSON.stringify([...mine, s].slice(-30)));
      render();
      msg(`Saved "${s.name}". It is in "Start from".`);
    }
  });

  // ---------- the menu: a Lab button and the "Test build" line ----------
  const menuButtons = document.querySelector('#menu .menu-buttons');
  const labBtn = document.createElement('button');
  labBtn.type = 'button';
  labBtn.id = 'menu-lab';
  labBtn.className = 'btn ghost';
  labBtn.textContent = 'Lab';
  labBtn.addEventListener('click', () => {
    render();
    hooks.sheet('sheet-lab');
  });
  menuButtons?.appendChild(labBtn);
  const line = document.createElement('p');
  line.className = 'lab-line small';
  menuButtons?.after(line);
  const showLine = () => {
    line.innerHTML = active
      ? `Test build · <b>${esc(active.name)}</b> <span class="muted">(${shortCode(active)})</span> <button class="btn ghost lab-back" type="button">Back to Classic</button>`
      : 'Test build · Classic';
    line.querySelector('.lab-back')?.addEventListener('click', () => {
      activate(null);
      s = { ...CLASSIC };
    });
  };
  const activate = (x: LabSetup | null) => {
    active = x && !isClassic(x) ? x : null;
    write(ACTIVE_KEY, active ? encodeSetup(active) : null);
    showLine();
  };
  showLine();

  // ---------- a shared link: #lab=1.xxxx ----------
  const fromHash = () => {
    const m = /#lab=([^&]+)/.exec(location.hash);
    if (!m) return;
    const got = decodeSetup(decodeURIComponent(m[1]!));
    history.replaceState(null, '', location.pathname + location.search);
    if (!got) return;
    s = got;
    fromLink = true;
    render();
    hooks.sheet('sheet-lab');
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);

  // ---------- big boards: pan and zoom ----------
  installPanZoom(hooks.board, hooks.boardWrap);

  // ---------- a calm "Thinking" note when the opponent takes over 2 seconds ----------
  const note = document.createElement('div');
  note.className = 'lab-thinking';
  note.textContent = 'Thinking…';
  note.hidden = true;
  document.body.appendChild(note);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // ---------- the bar shown while watching: speed and "Take over" ----------
  const bar = document.createElement('div');
  bar.className = 'lab-watchbar';
  bar.hidden = true;
  document.body.appendChild(bar);
  let watched: { level: number; pause: number } | null = null;
  const showBar = () => {
    bar.hidden = !watched;
    if (!watched) return;
    bar.innerHTML = `<span>Watching: <b>green</b> Level ${watched.level} vs <b>red</b> Level ${s.level}</span>
      <div class="lab-speed" role="radiogroup" aria-label="Speed">${PACE_NAMES.map((n, i) => `<button type="button" role="radio" aria-checked="${i === pace}" data-pace="${i}"${i === pace ? ' class="on"' : ''}>${n}</button>`).join('')}</div>
      <button type="button" class="btn ghost" data-take>Take over</button>`;
  };
  bar.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-pace], [data-take]');
    if (!t || !watched) return;
    if (t.dataset.pace !== undefined) {
      pace = Number(t.dataset.pace);
      watched = { ...watched, pause: PACES[pace]! };
      hooks.setWatch(watched);
    } else {
      watched = null;
      hooks.setWatch(null);
    }
    showBar();
  });

  return {
    watchingChanged: (w: { level: number; pause: number } | null) => {
      watched = w;
      showBar();
    },
    /** the engine overrides for a new game (the active experiment's, or none) */
    overrides: (): Partial<RulesConfig> => (active ? toOverrides(active) : {}),
    thinking: (on: boolean) => {
      clearTimeout(timer);
      if (on) timer = setTimeout(() => (note.hidden = false), 2000);
      else note.hidden = true;
    },
  };
};
