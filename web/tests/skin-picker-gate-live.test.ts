// THE ADMIN GATE ON THE LIVE ROOT (owner, 2026-11-16): "from the live version - except for my
// account RYK - hide the skins in the planet for now." The live root and /test/ are built from the
// same futa05 source, so the route can no longer decide — the account must. This pins both halves on
// the live path ('/' on futasaku.com):
//   - a player who is not the admin gets no section and the product defaults;
//   - the admin RYK keeps the picker on the live root (the switch's plumbing is enabled for him).
// `SKIN_SWITCH` is read when the modules load, so each case imports a fresh copy (vi.resetModules).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('location', { pathname: '/', hostname: 'www.futasaku.com', search: '', href: 'https://www.futasaku.com/' });
vi.stubGlobal('window', { addEventListener: () => undefined });
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});

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
vi.stubGlobal('document', { head: makeEl('head'), createElement: makeEl });

const ME = '11111111-1111-4111-8111-111111111111';
const signInAs = (displayName: string) => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: ME, displayName, kind: 'account',
}));

afterEach(() => vi.resetModules());

describe('the skin picker on the live root', () => {
  it('is invisible to a player who is not RYK, and they wear the product defaults', async () => {
    data.clear();
    data.set('severgrow.board-skin.v1', JSON.stringify({ mine: 'water', theirs: 'toxic', background: 'cocoa' }));
    signInAs('Cedar');
    const { mountSkinSwitch } = await import('../src/online/skin-switch.js');
    const { skinChoice, skinPickerVisible, DEFAULT_SKIN } = await import('../src/ui/skinChoice.js');
    const box = makeEl('div');
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible()).toBe(false);
    expect(box.children, 'no section, no gap').toHaveLength(0);
    expect(skinChoice()).toEqual({
      mine: DEFAULT_SKIN.mine, theirs: DEFAULT_SKIN.theirs, background: DEFAULT_SKIN.background, tileMine: null, tileTheirs: null,
    });
  });

  it('is the admin RYK\'s on the live root, with all five rows', async () => {
    data.clear();
    signInAs('RYK');
    const { mountSkinSwitch } = await import('../src/online/skin-switch.js');
    const { skinPickerVisible } = await import('../src/ui/skinChoice.js');
    const box = makeEl('div');
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible(), 'the live path is what the owner asked to keep for himself').toBe(true);
    const section = box.querySelector('#world-skin-switch');
    expect(section).not.toBeNull();
    const labels = section!.querySelectorAll('button[data-field]').map((b) => b.dataset.field);
    expect(new Set(labels)).toEqual(new Set(['mine', 'theirs', 'tileMine', 'tileTheirs', 'background']));
  });
});
