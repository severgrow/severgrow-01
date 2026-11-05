// ANOTHER PLAYER'S PROFILE — the SAME sheet in its visitor mode (owner, 2026-11-01: "use profile
// section we have and allow to look up other peoples profile on territory").
//
// The panel is tested here without a browser, through the `Document` injection it already had:
//
//   * visitor mode switches ONE attribute (`data-mode="visitor"`) and the CSS drops the three
//     private rows (Seeds, all-time wins, offline record);
//   * name, tag, level, tiles, colour and the ONLINE record are painted from the visitor facts;
//   * a null read is the honest em-dash state — never an invented number — and a later read paints
//     the same sheet;
//   * an own-profile update can never repaint a visitor sheet (and vice versa);
//   * every word comes from `src/strings.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROFILE } from '../../src/strings.js';
import { installProfileUI } from '../src/accounts/profile.js';
import type { ProfileFacts, VisitorFacts } from '../src/accounts/profile.js';
import { hslToHex, visitorFacts } from '../src/accounts/visitor-profile.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const css = read('../src/style.css');
const mountSource = read('../src/accounts/mount.ts');
const profileSection = html.slice(
  html.indexOf('<section id="sheet-profile"'),
  html.indexOf('</section>', html.indexOf('<section id="sheet-profile"')),
);

// ---- a minimal Document, enough for installProfileUI (no jsdom in this repo) --------------------

type FakeStyle = {
  values: Record<string, string>;
  setProperty(key: string, value: string): void;
  removeProperty(key: string): void;
};

type FakeNode = {
  nodeType: number;
  textContent: string;
  hidden: boolean;
  title: string;
  className: string;
  firstChild: unknown;
  dataset: Record<string, string>;
  style: FakeStyle;
  classList: { add(): void; remove(): void; contains(): boolean };
  attributes: Record<string, string>;
  children: FakeNode[];
  addEventListener(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  focus(): void;
  append(...nodes: FakeNode[]): void;
  replaceChildren(...nodes: FakeNode[]): void;
  querySelector(): FakeNode | null;
};

const fakeStyle = (): FakeStyle => {
  const values: Record<string, string> = {};
  return {
    values,
    setProperty: (key, value) => { values[key] = value; },
    removeProperty: (key) => { delete values[key]; },
  };
};

// `installProfileUI` uses `instanceof HTMLElement` for the opener; Node has no such global, so a
// bare constructor is all the check needs (a null activeElement never matches it anyway).
(globalThis as { HTMLElement?: unknown }).HTMLElement ??= class {};

const node = (over: Partial<FakeNode> = {}): FakeNode => {
  const value: FakeNode = {
    nodeType: 1,
    textContent: '',
    hidden: false,
    title: '',
    className: '',
    firstChild: null,
    dataset: {},
    style: fakeStyle(),
    classList: { add: () => undefined, remove: () => undefined, contains: () => false },
    attributes: {},
    children: [],
    addEventListener: () => undefined,
    setAttribute(name, v) { value.attributes[name] = v; },
    getAttribute(name) { return value.attributes[name] ?? null; },
    removeAttribute(name) { delete value.attributes[name]; },
    focus: () => undefined,
    append(...nodes) { value.children.push(...nodes); },
    replaceChildren(...nodes) { value.children = [...nodes]; },
    querySelector: () => null,
    ...over,
  };
  return value;
};

const fakeDocument = () => {
  const ids = [
    'sheet-profile', 'profile-scrim', 'profile-name', 'profile-seeds', 'profile-tiles', 'profile-wins',
    'profile-play-offline', 'profile-play-online', 'profile-title', 'profile-name-label',
    'profile-tiles-label', 'profile-wins-label', 'profile-seeds-label', 'profile-play-title',
    'profile-play-offline-label', 'profile-play-online-label', 'profile-flag', 'profile-colour',
    'profile-visitor', 'profile-level', 'profile-colour-hex',
  ];
  const byId: Record<string, FakeNode> = {};
  for (const id of ids) byId[id] = node({ textContent: '-' });
  // The brand already has a child, so installProfileUI never reaches the real SVG builder.
  byId['profile-brand'] = node({ firstChild: {} });
  const close = node();
  const sheet = byId['sheet-profile']!;
  sheet.querySelector = () => close;
  const face = node();
  const doc = {
    activeElement: null,
    getElementById: (id: string) => byId[id] ?? null,
    querySelector: (selector: string) => (selector.includes('sp-swatch-face') ? face : null),
    createElement: () => node(),
    addEventListener: () => undefined,
  };
  return { doc: doc as unknown as Document, byId, sheet, close, face };
};

const visitor = (over: Partial<VisitorFacts> = {}): VisitorFacts => ({
  name: 'BloomHeron #ABCD',
  level: 7,
  tiles: 2,
  colour: { css: 'hsl(341 42% 53%)', name: 'Rose', hex: '#b95575' },
  online: { games: 5, wins: 3, longestStreak: 2 },
  ...over,
});

const own = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  name: 'RYK #7QK2',
  country: 'PL',
  colour: { css: 'hsl(150 20% 40%)', name: 'Fern' },
  seeds: 128,
  tiles: 3,
  matchesWon: 9,
  offline: { games: 24, wins: 14, longestStreak: 7 },
  online: { games: 9, wins: 4, longestStreak: 3 },
  ...over,
});

describe('one sheet, two modes: the mode is a single attribute', () => {
  it('own mode restores the title and paints the private rows it always had', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.open(own());
    expect(env.sheet.dataset.mode).toBe('own');
    expect(env.byId['profile-play-title']!.textContent).toBe(PROFILE.playTitle);
    expect(env.byId['profile-seeds']!.textContent).toBe('128');
    expect(env.byId['profile-wins']!.textContent).toBe('9');
    expect(env.byId['profile-level']!.hidden).toBe(true);
  });

  it('visitor mode is identified by the mode attribute and the record heading, not a caption', () => {
    // OWNER, 2026-11-02: "remove that - self explanatory adding clutter". Whose sheet it is is
    // already obvious from the name and from the rows a visitor does not get; there is no caption.
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.openVisitor(visitor());
    expect(env.sheet.dataset.mode).toBe('visitor');
    expect(env.byId['profile-play-title']!.textContent).toBe(PROFILE.theirGames);
    // Nothing writes a caption: the stub keeps whatever the markup shipped, which is ''.
    expect(env.byId['profile-visitor']!.textContent).toBe('-');
  });

  it('visitor mode renders the public facts: name & tag, level, tiles, colour and online record', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.openVisitor(visitor());
    expect(env.byId['profile-name']!.textContent).toBe('BloomHeron #ABCD');
    // The visible form is short (owner: "level can be lvl to safe space"); the spoken label spells it.
    expect(env.byId['profile-level']!.textContent).toBe('Lvl 7');
    expect(env.byId['profile-level']!.getAttribute?.('aria-label')).toBe('Level 7');
    expect(env.byId['profile-level']!.hidden).toBe(false);
    expect(env.byId['profile-tiles']!.textContent).toBe('2');
    // The silhouette is still the board's own hex (written once when the sheet is installed).
    expect(env.face.getAttribute('points')).not.toBeNull();
    // The colour is painted through the shared `--tile` property, exactly as own mode does.
    expect(env.byId['profile-colour']!.style.values['--tile']).toBe('hsl(341 42% 53%)');
    // NO HEX CODE BESIDE THE TILE (owner, 2026-11-02: "what's the hashtag and number next to tile
    // in profile? color? remove"). The swatch carries the colour and its name is its aria-label, so
    // the `#b95575` label is gone from the sheet, the paint path and the strings.
    expect(read('../src/accounts/profile.ts')).not.toContain('colourHex');
    expect(read('../../src/strings.ts')).not.toContain('colourHex');
    // The online record is the only grid actually carrying values.
    const text = env.byId['profile-play-online']!.children.map((tile) => tile.children.map((part) => part.textContent).join(':'));
    expect(text).toEqual([`${PROFILE.games}:5`, `${PROFILE.winRate}:60%`, `${PROFILE.longestStreak}:2`]);
  });

  it('visitor mode carries NO Seeds row and NO offline value, even if an own profile painted first', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.open(own());
    expect(env.byId['profile-seeds']!.textContent).toBe('128');
    ui.openVisitor(visitor());
    expect(env.byId['profile-seeds']!.textContent).toBe(PROFILE.unknown);
    expect(env.byId['profile-wins']!.textContent).toBe(PROFILE.unknown);
    // The offline grid is emptied to em dashes and is hidden by the visitor CSS rule.
    const offline = env.byId['profile-play-offline']!.children.map((tile) => tile.children.at(-1)?.textContent);
    expect(offline).toEqual([PROFILE.unknown, PROFILE.unknown, PROFILE.unknown]);
  });
});

describe('an unknown or failed read is the em dash, never an invented number', () => {
  it('opens the honest empty state, then paints the answer into the same sheet', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.openVisitor(null);
    expect(env.sheet.dataset.mode).toBe('visitor');
    expect(env.byId['profile-name']!.textContent).toBe(PROFILE.unknown);
    expect(env.byId['profile-tiles']!.textContent).toBe(PROFILE.unknown);
    expect(env.byId['profile-level']!.hidden).toBe(true);
    expect(env.byId['profile-play-online']!.children.map((tile) => tile.children.at(-1)?.textContent))
      .toEqual([PROFILE.unknown, PROFILE.unknown, PROFILE.unknown]);
    ui.showVisitor(visitor());
    expect(env.byId['profile-name']!.textContent).toBe('BloomHeron #ABCD');
  });

  it('a failed read simply leaves the empty state (showVisitor(null) is not a zero)', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.openVisitor(null);
    ui.showVisitor(null);
    expect(env.byId['profile-tiles']!.textContent).toBe(PROFILE.unknown);
    expect(env.byId['profile-play-online']!.children.every((tile) => tile.children.at(-1)?.textContent === PROFILE.unknown))
      .toBe(true);
  });

  it('an own-profile answer cannot overwrite a visitor sheet, and vice versa', () => {
    const env = fakeDocument();
    const ui = installProfileUI(env.doc);
    ui.openVisitor(visitor());
    ui.show(own());
    expect(env.byId['profile-name']!.textContent).toBe('BloomHeron #ABCD');
    expect(env.sheet.dataset.mode).toBe('visitor');
    ui.openVisitor(visitor());
    ui.showVisitor(visitor({ name: 'RYK #7QK2' }));
    expect(env.byId['profile-name']!.textContent).toBe('RYK #7QK2');
  });
});

describe('the wire becomes panel facts in one pure place', () => {
  it('maps a closed server payload, tag included', () => {
    expect(visitorFacts({
      displayName: 'BloomHeron', tag: 'ABCD', level: 7, tiles: 2, connectedTiles: 1, colourId: 0,
      online: { games: 5, wins: 3, longestStreak: 2 },
    })).toEqual({
      name: 'BloomHeron #ABCD',
      level: 7,
      tiles: 2,
      connectedTiles: 1,
      colour: { css: 'hsl(341 42% 53%)', name: 'Rose', hex: '#b95575' },
      online: { games: 5, wins: 3, longestStreak: 2 },
    });
  });

  it('names the colour in hex from the palette’s own hsl, and invents none for an unknown slot', () => {
    expect(hslToHex('hsl(341 42% 53%)')).toBe('#b95575');
    expect(hslToHex('hsl(0 0% 0%)')).toBe('#000000');
    expect(hslToHex('hsl(360 100% 100%)')).toBe('#ffffff');
    // Not a shape the palette parses: no hex, never a guess.
    expect(hslToHex('#b95575')).toBeNull();
    // A slot this build's palette does not know draws no colour at all (honest em dash).
    expect(visitorFacts({
      displayName: 'BloomHeron', tag: 'ABCD', level: 7, tiles: 2, colourId: 999,
      online: { games: 0, wins: 0, longestStreak: 0 },
    })!.colour).toBeNull();
  });

  it('null in, null out - the panel then shows its em-dash state', () => {
    expect(visitorFacts(null)).toBeNull();
    expect(visitorFacts(undefined)).toBeNull();
  });

  it('drops a broken or impossible count instead of printing it', () => {
    const facts = visitorFacts({
      displayName: 'BloomHeron', tag: 'ABCD', level: -3, tiles: Number.NaN, colourId: 4,
      online: { games: 5, wins: 9, longestStreak: 2 },
    })!;
    expect(facts.level).toBeNull();
    expect(facts.tiles).toBeNull();
    expect(facts.online).toBeNull(); // wins greater than games is not a fact
  });

  it('keeps the name even when the tag is missing, and no name when there is none', () => {
    expect(visitorFacts({
      displayName: 'BloomHeron', tag: '', level: 1, tiles: 0, colourId: 0,
      online: { games: 0, wins: 0, longestStreak: 0 },
    })!.name).toBe('BloomHeron');
    expect(visitorFacts({
      displayName: null, tag: 'ABCD', level: 1, tiles: 0, colourId: 0,
      online: { games: 0, wins: 0, longestStreak: 0 },
    })!.name).toBeNull();
  });
});

describe('the markup and CSS carry the two modes', () => {
  it('has the level mark and the colour hex, and NO caption line (owner, 2026-11-02)', () => {
    expect(profileSection).not.toContain('id="profile-visitor"');
    expect(profileSection).toContain('id="profile-level"');
    expect(profileSection).toMatch(/id="profile-level"[^>]*hidden/);
    // The hex chip is GONE: the swatch says the colour, and its code was a designer's label.
    expect(profileSection).not.toContain('profile-colour-hex');
  });

  it('tags the three private rows so one attribute can hide them', () => {
    expect(profileSection).toContain('class="sp-row sp-row-seeds"');
    expect(profileSection).toContain('class="sp-row sp-row-wins"');
    expect(profileSection).toContain('class="sp-play-row" data-play-row="offline"');
    expect(css).toMatch(/#sheet-profile\[data-mode='visitor'\] \.sp-row-seeds,\s*#sheet-profile\[data-mode='visitor'\] \.sp-row-wins,\s*#sheet-profile\[data-mode='visitor'\] \.sp-play-row\[data-play-row='offline'\] \{\s*display: none;/);
  });

  it('shows the quiet line only in visitor mode, and the level only when known', () => {
    expect(css).toMatch(/#sheet-profile:not\(\[data-mode='visitor'\]\) \.sp-visitor \{\s*display: none;/);
    expect(css).toMatch(/#sheet-profile \.sp-level\[hidden\] \{\s*display: none;/);
  });

  it('carries no "viewing another player" caption anywhere (owner, 2026-11-02)', () => {
    // The line was clutter: the sheet only opens for a real name, and a visitor's missing private
    // rows already say what kind of page this is.
    expect(profileSection).not.toContain('profile-visitor');
    expect(read('../src/accounts/profile.ts')).not.toContain('visitorLine');
    expect(read('../../src/strings.ts')).not.toContain("visitor: 'Viewing another player'");
  });

  it('the request bridge is one zero-dependency event, and the panel answers it', () => {
    const bridge = read('../src/accounts/profile-request.ts');
    expect(bridge).toContain("export const PLAYER_PROFILE_EVENT = 'futasaku:player-profile'");
    expect(mountSource).toContain('PLAYER_PROFILE_EVENT');
    expect(mountSource).toContain("`/v1/players/${encodeURIComponent(playerId)}/profile`");
    expect(mountSource).toContain('profile.openVisitor(null, opener)');
  });
});
