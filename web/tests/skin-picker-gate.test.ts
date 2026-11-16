// THE SKIN PICKER'S ADMIN GATE (owner, 2026-11-16): "from the live version - except for my account
// RYK - hide the skins in the planet for now ... don't show the selection of skins or background in
// the planet for any players except for the admin account RYK."
//
// Guard, not internals: a player who is not the admin must get NO section in the planet's colour
// pane (skins AND background are the same one section) and the product defaults — Forest (grass +
// tree) for their own tiles, Ash (ash + volcano) for the opponent's — even when this device (or the
// account, from before the gate) stored another set. The admin must still see all three rows.
//
// The /test/ route is stubbed so the switch's plumbing exists regardless of the account: the gate
// under test is the ACCOUNT, not the route.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('location', {
  pathname: '/test/', hostname: 'futasaku.com', search: '', href: 'https://futasaku.com/test/',
});
vi.stubGlobal('window', { addEventListener: () => undefined });
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});

/** A claim stored BEFORE the gate existed: the exact case the owner says must show the new defaults. */
data.set('severgrow.board-skin.v1', JSON.stringify({ mine: 'water', theirs: 'toxic', background: 'cocoa' }));

// --- the smallest DOM mountSkinSwitch needs (the suite runs in node; no jsdom here) ---------------
type FakeEl = {
  tag: string; id: string; className: string; textContent: string; hidden: boolean;
  dataset: Record<string, string>; style: Record<string, string>; attrs: Record<string, string>;
  children: FakeEl[];
  append(...nodes: FakeEl[]): void;
  appendChild(node: FakeEl): void;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  addEventListener(): void;
  classList: { toggle(name: string, on: boolean): void };
  querySelector(selector: string): FakeEl | null;
  querySelectorAll(selector: string): FakeEl[];
};
const descendants = (node: FakeEl): FakeEl[] => node.children.flatMap((child) => [child, ...descendants(child)]);
const matches = (node: FakeEl, selector: string): boolean => {
  const id = /^#([\w-]+)$/.exec(selector);
  if (id) return node.id === id[1];
  const attr = /^([\w-]+)\[([\w-]+)\]$/.exec(selector);
  return !!attr && node.tag === attr[1] && node.dataset[attr[2]!.replace(/^data-/, '')] !== undefined;
};
const makeEl = (tag: string): FakeEl => {
  const el: FakeEl = {
    tag, id: '', className: '', textContent: '', hidden: false,
    dataset: {}, style: {}, attrs: {}, children: [],
    append: (...nodes) => { el.children.push(...nodes); },
    appendChild: (node) => { el.children.push(node); },
    setAttribute: (key, value) => { el.attrs[key] = value; },
    getAttribute: (key) => el.attrs[key] ?? null,
    addEventListener: () => undefined,
    classList: {
      toggle: (name, on) => {
        const names = new Set(el.className.split(/\s+/).filter(Boolean));
        if (on) names.add(name); else names.delete(name);
        el.className = [...names].join(' ');
      },
    },
    querySelector: (selector) => descendants(el).find((node) => matches(node, selector)) ?? null,
    querySelectorAll: (selector) => descendants(el).filter((node) => matches(node, selector)),
  };
  return el;
};
const doc = { head: makeEl('head'), createElement: makeEl };
vi.stubGlobal('document', doc);

const { mountSkinSwitch, connectSkinSwitch } = await import('../src/online/skin-switch.js');
const { DEFAULT_SKIN, planetOwnSkin, planetSkinFor, skinChoice, skinPickerVisible } = await import('../src/ui/skinChoice.js');
const { faSides } = await import('../src/ui/forestAsh.js');

const ME = '11111111-1111-4111-8111-111111111111';
const signInAs = (displayName: string) => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: ME, displayName, kind: 'account',
}));
const signOut = () => data.delete('severgrow.duel.identity.v1');
const pane = () => makeEl('div');

beforeEach(() => signOut());

describe('the skin picker belongs to the admin account alone', () => {
  it('shows a player who is not RYK no section at all — no skins, no background, no gap', () => {
    signInAs('Cedar');
    const box = pane();
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible(), 'a non-admin may not see the picker').toBe(false);
    expect(box.children, 'nothing is appended to the colour pane, so there is no gap').toHaveLength(0);
    expect(box.querySelector('#world-skin-switch'), 'no skin section').toBeNull();
    expect(descendants(box).some((node) => /Board \(test\)|Your tiles|Their tiles/.test(node.textContent)), 'nothing announced').toBe(false);
  });

  it('shows the admin RYK all three rows (skins AND background), as before', () => {
    signInAs('RYK');
    const box = pane();
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible()).toBe(true);
    const section = box.querySelector('#world-skin-switch');
    expect(section, 'the admin keeps the picker').not.toBeNull();
    const labels = section!.querySelectorAll('button[data-field]').map((b) => b.dataset.field);
    expect(new Set(labels), 'your tiles, their tiles, the board background').toEqual(new Set(['mine', 'theirs', 'background']));
    expect(labels.filter((field) => field === 'mine')).toHaveLength(4);
    expect(labels.filter((field) => field === 'theirs')).toHaveLength(4);
    expect(labels.filter((field) => field === 'background'), 'classic + the five painted grounds').toHaveLength(6);
  });

  it('gives a non-admin the product defaults even when this device stored another set', () => {
    signInAs('Cedar');
    // The stored choice is the pre-gate case: water / toxic / cocoa. Skins must not win; the
    // background is deliberately NOT pinned (the owner asked for default skins only).
    expect(skinChoice()).toEqual({ mine: DEFAULT_SKIN.mine, theirs: DEFAULT_SKIN.theirs, background: 'cocoa' });
    expect(DEFAULT_SKIN.mine, 'own tiles: Forest, the nine grass grounds + home-tree').toBe('forest');
    expect(DEFAULT_SKIN.theirs, 'opponent tiles: Ash, the nine ash grounds + home-volcano').toBe('ash');
    expect([...faSides()], 'the board wears exactly those two').toEqual(['forest', 'ash']);
  });

  it('never even reads a non-admin\'s stored skin from the server', async () => {
    signInAs('Cedar');
    const worldSkin = vi.fn(async () => 'water');
    await connectSkinSwitch({ worldSkin } as unknown as Parameters<typeof connectSkinSwitch>[0], 'tok', () => undefined);
    expect(worldSkin, 'no request is spent on a picker this player cannot see').not.toHaveBeenCalled();
    expect(skinChoice().mine, 'the stored server skin can never pull the board off Forest').toBe('forest');
  });

  // OWNER CHANGED THE RULE (2026-11-16: "random skins on all players tiles - should never happen";
  // asked, he chose "everyone sees chosen skins"). The planet shows each player's CHOSEN skin to every
  // viewer, and plain colour for a player who chose none. No Forest/Ash defaults on anyone's land.
  // This replaces the 2026-11-15 rule (non-admins: own Forest, everyone else Ash).
  it('paints every player\'s land in the skin THAT player chose, for every viewer', () => {
    signInAs('Cedar');
    expect(planetSkinFor(ME, ME, 'water'), 'my own chosen Water').toBe('water');
    expect(planetSkinFor('other-owner', ME, 'toxic'), 'their chosen Toxic').toBe('toxic');
    expect(planetSkinFor('other-owner', ME, undefined), 'nobody chose: plain colour').toBeNull();
    expect(planetSkinFor('other-owner', ME, null)).toBeNull();
    signInAs('RYK');
    expect(planetSkinFor('other-owner', ME, 'water'), 'the admin sees the same').toBe('water');
    expect(planetSkinFor('other-owner', ME, undefined)).toBeNull();
    signOut();
    expect(planetSkinFor('other-owner', null, 'ash'), 'a signed-out visitor sees the same').toBe('ash');
    expect(planetSkinFor('other-owner', null, undefined)).toBeNull();
  });

  it('fills only the ADMIN\'s own unchosen land from this device (a choice not yet saved); never anyone else\'s', () => {
    signInAs('Cedar');
    expect(planetOwnSkin(), 'a non-admin\'s own land is never filled with the board default').toBeUndefined();
    signOut();
    expect(planetOwnSkin()).toBeUndefined();
    signInAs('RYK');
    expect(planetOwnSkin(), 'the admin sees the pick he just made').toBe(skinChoice().mine);
  });

  it('is applied by the shared planet itself, so every planet view follows it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/sphere/planet.ts', import.meta.url), 'utf8');
    expect(src, 'claims pass through the rule inside the planet').toMatch(/planetSkinFor\(/);
    expect(src, 'the own-land fill comes from the rule').toMatch(/planetOwnSkin\(\)/);
    expect(src, 'no unconditional board-default fill').not.toMatch(/ownSkin:\s*faSides\(\)\[0\]/);
  });
});
