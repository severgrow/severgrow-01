// THE SKINS GATE (owner, 2026-11-20: "when this and 12 skins are done - we unlock the skins to all
// players"). The gate is now SIGNED-IN ACCOUNTS, not the owner alone, and guests still never get
// skins. Guard, not internals:
//   - a guest gets no section, no gap, no server request, and the product board;
//   - a signed-in account gets the SKINS pane (Colour first, then the ten real skins) and keeps its
//     own stored choice;
//   - the old four-id stored shape still loads, and the default board is unchanged.
//
// The /test/ route is stubbed so the switch's plumbing exists regardless of the account: the gate
// under test is the ACCOUNT, not the route.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeDom } from './helpers/fake-dom.js';

vi.stubGlobal('location', {
  pathname: '/test/', hostname: 'futasaku.com', search: '', href: 'https://futasaku.com/test/',
});
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});
const { pane } = installFakeDom();

const ME = '11111111-1111-4111-8111-111111111111';
const STORED = 'severgrow.board-skin.v1';
const signInAs = (displayName: string) => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: ME, displayName, kind: 'account',
}));
const signOut = () => data.delete('severgrow.duel.identity.v1');

/** A fresh module graph for one case, so the module-level stored read runs exactly once. */
const load = async () => {
  vi.resetModules();
  const switchModule = await import('../src/online/skin-switch.js');
  const model = await import('../src/ui/skinChoice.js');
  const art = await import('../src/ui/forestAsh.js');
  return { switchModule, model, art };
};

beforeEach(() => { vi.resetModules(); data.clear(); signOut(); });

describe('the skins picker belongs to signed-in accounts', () => {
  it('gives a guest the Colour tile only: no real skins, no match row, no request', async () => {
    data.set(STORED, JSON.stringify({ mine: 'water', theirs: 'toxic', background: 'cocoa' }));
    const { switchModule, model, art } = await load();
    const box = pane();
    switchModule.mountSkinSwitch(box as unknown as HTMLElement);
    expect(model.skinPickerVisible(), 'a guest may not use skins').toBe(false);
    const section = box.querySelector('#world-skin-switch');
    expect(section, 'the key still opens a pane: the twenty colours are not skins').not.toBeNull();
    const planet = section!.querySelector('[data-group="planet"]')!;
    expect(planet.querySelectorAll('.world-skin-tile').filter((t) => !t.hidden), 'only Colour is offered').toHaveLength(1);
    expect(planet.querySelector('.world-skin-tile')!.dataset.value).toBe('colour');
    expect(section!.querySelector('[data-group="game"]')!.hidden, 'no match skins for a guest').toBe(true);
    expect(section!.querySelector('[data-group="board"]')!.hidden).toBe(true);
    expect(section!.querySelector('.world-skin-locked')!.hidden).toBe(false);
    expect([...art.faSides()], 'a guest wears the product board').toEqual(['forest', 'ash']);
    expect(model.planetOwnSkin()).toBeUndefined();
    const worldSkin = vi.fn(async () => 'water');
    await switchModule.connectSkinSwitch({ worldSkin } as unknown as Parameters<typeof switchModule.connectSkinSwitch>[0], 'tok');
    expect(worldSkin, 'no request is spent on a guest').not.toHaveBeenCalled();
  });

  it('gives a signed-in account the SKINS pane: Colour first, then the ten real skins', async () => {
    signInAs('Cedar');
    const { switchModule, model } = await load();
    expect(model.skinPickerVisible()).toBe(true);
    const box = pane();
    switchModule.mountSkinSwitch(box as unknown as HTMLElement);
    const section = box.querySelector('#world-skin-switch');
    expect(section, 'a signed-in account keeps the picker').not.toBeNull();
    expect(section!.getAttribute('aria-label')).toBe('Skins');
    const planet = section!.querySelector('[data-group="planet"]')!;
    const tiles = planet.querySelectorAll('.world-skin-tile');
    expect(tiles, 'Colour + ten real skins').toHaveLength(11);
    expect(tiles[0]!.dataset.value, 'COLOUR comes first, as the plain option').toBe('colour');
    expect(tiles.slice(1).map((t) => t.dataset.value)).toEqual([
      'forest', 'ash', 'water', 'toxic', 'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis',
    ]);
    const game = section!.querySelector('[data-group="game"]')!;
    expect(game.querySelectorAll('.world-skin-tile'), 'ten real skins, never Colour').toHaveLength(10);
    expect(game.querySelectorAll('.world-skin-tile').some((t) => t.dataset.value === 'colour'), 'Colour is planet-only').toBe(false);
    expect(section!.querySelector('[data-group="board"]')!.querySelectorAll('.world-skin-tile'), 'the backdrop keeps its own row').toHaveLength(6);
  });

  it('shows the two appearances as distinct states with their own labels', async () => {
    signInAs('Cedar');
    const { switchModule, model } = await load();
    const box = pane();
    switchModule.mountSkinSwitch(box as unknown as HTMLElement);
    const section = box.querySelector('#world-skin-switch')!;
    expect(section!.querySelector('[data-group="planet"]')!.querySelector('.world-skin-value')!.textContent).toBe('Land: Forest');
    expect(section!.querySelector('[data-group="game"]')!.querySelector('.world-skin-value')!.textContent).toBe('Tiles: Forest');
    model.chooseSkin({ mine: 'water' });
    expect(section!.querySelector('[data-group="planet"]')!.querySelector('.world-skin-value')!.textContent).toBe('Land: Water');
    expect(section!.querySelector('[data-group="game"]')!.querySelector('.world-skin-value')!.textContent, 'one tap, both').toBe('Tiles: Water');
  });

  it('a real skin sets the planet AND the match; the colour tile is planet-only', async () => {
    signInAs('Cedar');
    const { switchModule, model, art } = await load();
    const box = pane();
    switchModule.mountSkinSwitch(box as unknown as HTMLElement);
    model.chooseSkin({ mine: 'carrara' });
    expect(model.skinChoice().mine).toBe('carrara');
    expect(model.skinChoice().mineGame, 'one tap, both appearances').toBe('carrara');
    expect(sectionPlanetPressed(box, 'carrara')).toBe(true);
    expect(sectionGamePressed(box, 'carrara'), 'the match row follows the same tap').toBe(true);
    // The six new recipes are on the other branch; this board must still have a real side.
    expect(['forest', 'ash', 'water', 'toxic']).toContain([...art.faSides()][0]);
  });

  it('a signed-in account keeps a stored six-id choice (the unlock must not pin it away)', async () => {
    data.set(STORED, JSON.stringify({ mine: 'carrara', theirs: 'ash', mineGame: 'carrara', theirsGame: 'ash', background: 'slate' }));
    signInAs('Cedar');
    const { model } = await load();
    expect(model.skinChoice().mine).toBe('carrara');
    expect(model.skinChoice().mineGame).toBe('carrara');
  });

  it('still loads the old four-id choice, unchanged', async () => {
    data.set(STORED, JSON.stringify({ mine: 'water', theirs: 'toxic', background: 'cocoa' }));
    signInAs('Cedar');
    const { model, art } = await load();
    expect(model.skinChoice()).toEqual({
      mine: 'water', theirs: 'toxic', mineGame: 'water', theirsGame: 'toxic', background: 'cocoa',
    });
    expect([...art.faSides()]).toEqual(['water', 'toxic']);
  });

  it('never pins a signed-in account back to Forest/Ash', async () => {
    data.set(STORED, JSON.stringify({ mine: 'toxic', theirs: 'water', background: 'cocoa' }));
    signInAs('Cedar');
    const { model, art } = await load();
    expect(model.skinChoice().mine).toBe('toxic');
    expect([...art.faSides()]).toEqual(['toxic', 'water']);
    expect(art.faBackground()).toBe('cocoa');
  });

  it('syncs the account\'s own four-id skin for any signed-in player', async () => {
    signInAs('Cedar');
    const { switchModule, model } = await load();
    const worldSkin = vi.fn(async () => 'water');
    await switchModule.connectSkinSwitch({ worldSkin } as unknown as Parameters<typeof switchModule.connectSkinSwitch>[0], 'tok');
    expect(worldSkin).toHaveBeenCalledTimes(1);
    expect(model.skinChoice().mine).toBe('water');
  });

  // OWNER RULE (2026-11-16: "random skins on all players tiles - should never happen"): the planet
  // shows each player's CHOSEN skin to every viewer, and plain colour for a player who chose none.
  it('paints every player\'s land in the skin THAT player chose, for every viewer', async () => {
    signInAs('Cedar');
    const { model } = await load();
    expect(model.planetSkinFor(ME, ME, 'water')).toBe('water');
    expect(model.planetSkinFor('other-owner', ME, 'toxic')).toBe('toxic');
    expect(model.planetSkinFor('other-owner', ME, undefined)).toBeNull();
    signOut();
    expect(model.planetSkinFor('other-owner', null, 'ash')).toBe('ash');
    expect(model.planetSkinFor('other-owner', null, undefined)).toBeNull();
  });

  it('fills only the signed-in viewer\'s own planet land, and only with a set the planet paints', async () => {
    signInAs('Cedar');
    const { model } = await load();
    model.chooseSkin({ mine: 'toxic' });
    expect(model.planetClaimSkin(ME, ME, 'water'), 'the pick wins over the stored Water').toBe('toxic');
    expect(model.planetClaimSkin('other-owner', ME, 'water')).toBe('water');
    model.chooseSkin({ mine: 'carrara' });
    expect(model.planetOwnSkin(), 'six-id art is not in the planet renderer yet').toBeUndefined();
    signOut();
    expect(model.planetOwnSkin()).toBeUndefined();
  });

  it('is applied by the shared planet itself, so every planet view follows it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/sphere/planet.ts', import.meta.url), 'utf8');
    expect(src, 'claims pass through the rule inside the planet').toMatch(/planetClaimSkin\(/);
    expect(src, 'a pick repaints the planet').toMatch(/onSkinChoice\(/);
    expect(src, 'the own-land fill comes from the rule').toMatch(/planetOwnSkin\(\)/);
  });

  it('announces a change to the pane so its marks can never lie', async () => {
    signInAs('Cedar');
    const { switchModule, model } = await load();
    const box = pane();
    switchModule.mountSkinSwitch(box as unknown as HTMLElement);
    const section = box.querySelector('#world-skin-switch')!;
    model.chooseSkin({ mineGame: 'toxicon' as never }); // unknown value is coerced, never crashes
    expect(section!.querySelector('[data-group="game"]')!.querySelector('.world-skin-value')).not.toBeNull();
    model.chooseSkin({ mineGame: 'voxel' });
    expect(sectionPlanetPressed(box, 'voxel'), 'a match-only change does not pretend to change the planet').toBe(false);
    expect(sectionGamePressed(box, 'voxel')).toBe(true);
  });
});

const sectionPlanetPressed = (box: ReturnType<typeof pane>, value: string): boolean => {
  const group = box.querySelector('#world-skin-switch')?.querySelector('[data-group="planet"]');
  return group?.querySelector(`.world-skin-tile[data-value="${value}"]`)?.getAttribute('aria-pressed') === 'true';
};
const sectionGamePressed = (box: ReturnType<typeof pane>, value: string): boolean => {
  const group = box.querySelector('#world-skin-switch')?.querySelector('[data-group="game"]');
  return group?.querySelector(`.world-skin-tile[data-value="${value}"]`)?.getAttribute('aria-pressed') === 'true';
};
