// THE SKINS GATE ON THE LIVE ROOT (owner, 2026-11-20: unlock to signed-in accounts). The live root
// and /test/ are built from the same source, so the route cannot decide — the ACCOUNT must. This
// pins both halves on the live path ('/' on futasaku.com):
//   - a guest gets no section and the product defaults;
//   - any signed-in account keeps the picker on the live root (including the old admin account,
//     which is no longer special).
// `SKIN_SWITCH` is read when the modules load, so each case imports a fresh copy (vi.resetModules).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeDom } from './helpers/fake-dom.js';

vi.stubGlobal('location', { pathname: '/', hostname: 'www.futasaku.com', search: '', href: 'https://www.futasaku.com/' });
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});
installFakeDom();

const ME = '11111111-1111-4111-8111-111111111111';
const signInAs = (displayName: string) => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: ME, displayName, kind: 'account',
}));

afterEach(() => vi.resetModules());

describe('the skins picker on the live root', () => {
  it('is invisible to a guest, who wears the product defaults', async () => {
    data.clear();
    data.set('severgrow.board-skin.v1', JSON.stringify({ mine: 'water', theirs: 'toxic', background: 'cocoa' }));
    const { mountSkinSwitch } = await import('../src/online/skin-switch.js');
    const { skinChoice, skinPickerVisible, DEFAULT_SKIN } = await import('../src/ui/skinChoice.js');
    const box = document.createElement('div');
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible()).toBe(false);
    const section = box.querySelector('#world-skin-switch');
    expect(section, 'the Colour tile is still reachable').not.toBeNull();
    expect(section!.querySelector('[data-group="planet"]')!.querySelectorAll<HTMLButtonElement>('.world-skin-tile')).toBeDefined();
    expect([...(section!.querySelector('[data-group="planet"]')!.querySelectorAll<HTMLButtonElement>('.world-skin-tile'))].filter((t) => !t.hidden), 'no skin unlocked').toHaveLength(1);
    expect((section!.querySelector('[data-group="game"]') as HTMLElement).hidden).toBe(true);
    expect(skinChoice()).toMatchObject({ mine: DEFAULT_SKIN.mine, theirs: DEFAULT_SKIN.theirs, mineGame: 'forest', theirsGame: 'ash' });
  });

  it('is any signed-in account\'s, with the two appearances and the board row', async () => {
    data.clear();
    signInAs('Cedar');
    const { mountSkinSwitch } = await import('../src/online/skin-switch.js');
    const { skinPickerVisible } = await import('../src/ui/skinChoice.js');
    const box = document.createElement('div');
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible(), 'the live root is open to accounts now').toBe(true);
    const section = box.querySelector('#world-skin-switch');
    expect(section).not.toBeNull();
    expect(section!.querySelector('[data-group="planet"]')!.querySelectorAll('.world-skin-tile')).toHaveLength(11);
    expect(section!.querySelector('[data-group="game"]')!.querySelectorAll('.world-skin-tile')).toHaveLength(10);
    expect(section!.querySelector('[data-group="board"]')!.querySelectorAll('.world-skin-tile')).toHaveLength(6);
  });

  it('the old admin account still has it, and is no longer the only one', async () => {
    data.clear();
    signInAs('RYK');
    const { mountSkinSwitch } = await import('../src/online/skin-switch.js');
    const { skinPickerVisible } = await import('../src/ui/skinChoice.js');
    const box = document.createElement('div');
    mountSkinSwitch(box as unknown as HTMLElement);
    expect(skinPickerVisible()).toBe(true);
    expect(box.querySelector('#world-skin-switch')).not.toBeNull();
  });
});
