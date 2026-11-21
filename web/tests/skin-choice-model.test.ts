// THE TWO-AXIS SKIN CHOICE (owner, 2026-11-20). The model must express a PLANET appearance and a
// GAME appearance: a real skin sets both in one tap, Slab ('colour') sets the planet only and needs
// a match skin next. These tests pin:
//   - the normaliser (the ONE place the invariant is enforced),
//   - the old stored shape loading unchanged,
//   - the default board being EXACTLY today's board,
//   - corrupt values falling back safely, and
//   - the signed-in gate (guests are pinned, accounts keep their choice).
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

const ME = '11111111-1111-4111-8111-111111111111';
const STORED = 'severgrow.board-skin.v1';
const signIn = (displayName = 'Cedar') => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: ME, displayName, kind: 'account',
}));

/** A fresh module graph for one case, so the module-level stored read runs exactly once. */
const load = async (stored?: unknown, signedIn = true) => {
  vi.resetModules();
  data.clear();
  if (stored !== undefined) data.set(STORED, JSON.stringify(stored));
  if (signedIn) signIn();
  const model = await import('../src/ui/skinChoice.js');
  const art = await import('../src/ui/forestAsh.js');
  const tile = await import('../src/ui/tileSkins.js');
  return { model, art, tile };
};

beforeEach(() => vi.resetModules());

describe('the default look is exactly today\'s board', () => {
  it('with nothing stored, a signed-in player wears Forest against Ash on slate', async () => {
    const { model, art } = await load();
    expect(model.skinChoice()).toEqual({
      mine: 'forest', theirs: 'ash', mineGame: 'forest', theirsGame: 'ash', background: 'slate',
    });
    expect(model.skinChoice(), 'the exported default is the same value').toEqual(model.DEFAULT_SKIN);
    expect([...art.faSides()], 'the board wears Forest against Ash').toEqual(['forest', 'ash']);
    expect(art.faBackground()).toBe('slate');
  });

  it('an old choice of Forest/Ash with no game fields still paints Forest/Ash', async () => {
    const { model, art } = await load({ mine: 'forest', theirs: 'ash' });
    expect(model.skinChoice().mineGame).toBe('forest');
    expect(model.skinChoice().theirsGame).toBe('ash');
    expect([...art.faSides()]).toEqual(['forest', 'ash']);
  });
});

describe('back-compatibility with the stored four-id choice', () => {
  it('loads a pre-model choice as both the planet and the match appearance', async () => {
    const { model, art } = await load({ mine: 'water', theirs: 'toxic', background: 'cocoa' });
    expect(model.skinChoice()).toEqual({
      mine: 'water', theirs: 'toxic', mineGame: 'water', theirsGame: 'toxic', background: 'cocoa',
    });
    expect([...art.faSides()], 'the board keeps the skin it wore before this change').toEqual(['water', 'toxic']);
    expect(art.faBackground()).toBe('cocoa');
  });

  it('falls back safely, never crashes, on corrupt or unknown values', async () => {
    const { model, art } = await load({ mine: 'nope', theirs: 42, mineGame: 'colour', background: 'x' });
    expect(model.skinChoice()).toEqual(model.DEFAULT_SKIN);
    expect([...art.faSides()]).toEqual(['forest', 'ash']);
  });

  it('a corrupt stored string is not a choice', async () => {
    vi.resetModules();
    data.clear();
    signIn();
    data.set(STORED, '{not json');
    const model = await import('../src/ui/skinChoice.js');
    expect(model.skinChoice()).toEqual(model.DEFAULT_SKIN);
  });
});

describe('the normaliser is the one place the invariant lives', () => {
  const base = {
    mine: 'forest' as const, theirs: 'ash' as const,
    mineGame: 'forest' as const, theirsGame: 'ash' as const, background: 'slate' as const,
  };

  it('a real skin sets the planet AND the match', async () => {
    const { model } = await load();
    const next = model.normaliseSkinChoice({ mine: 'carrara' }, base);
    expect(next.mine).toBe('carrara');
    expect(next.mineGame, 'one tap, both appearances').toBe('carrara');
    // The interaction itself (chooseSkin) must not keep an old match skin when the planet moves.
    model.chooseSkin({ mine: 'carrara' });
    expect(model.skinChoice().mineGame).toBe('carrara');
  });

  it('colour is planet-only and keeps the match skin the player already had', async () => {
    const { model } = await load();
    const next = model.normaliseSkinChoice({ mine: 'colour' }, base);
    expect(next.mine).toBe('colour');
    expect(next.mineGame, 'the board still has a real skin').toBe('forest');
  });

  it('colour with no match skin chosen leaves it null, so the UI must ask', async () => {
    const { model } = await load();
    const next = model.normaliseSkinChoice({ mine: 'colour' }, { ...base, mineGame: null });
    expect(next.mineGame).toBeNull();
    expect(model.awaitingGameSkin(next)).toBe(true);
    // Painting still gets a valid board skin.
    expect(model.gameSkinFor(next, 'mine')).toBe('forest');
    expect(model.gameSkinFor(next, 'theirs')).toBe('ash');
  });

  it('a chosen match skin on a colour planet is kept verbatim', async () => {
    const { model } = await load();
    const next = model.normaliseSkinChoice({ mine: 'colour', mineGame: 'voxel' }, base);
    expect(next.mineGame).toBe('voxel');
    expect(model.awaitingGameSkin(next)).toBe(false);
  });

  it('an explicit null clears the match skin, so Colour must ask for a new one', async () => {
    const { model } = await load();
    model.chooseSkin({ mine: 'forest' });
    expect(model.skinChoice().mineGame).toBe('forest');
    model.chooseSkin({ mine: 'colour', mineGame: null });
    expect(model.skinChoice().mine).toBe('colour');
    expect(model.skinChoice().mineGame).toBeNull();
    expect(model.awaitingGameSkin(model.skinChoice())).toBe(true);
  });

  it('never produces a game appearance of "colour", and follows the planet when the stored game is missing', async () => {
    const { model } = await load();
    const planets = ['forest', 'ash', 'water', 'toxic', 'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis', 'colour', 'bogus', null, 7, undefined];
    const games = ['forest', 'ash', 'water', 'toxic', 'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis', 'colour', 'bogus', null, 9, undefined];
    const real = new Set(['forest', 'ash', 'water', 'toxic', 'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis']);
    for (const p of planets) for (const g of games) {
      const next = model.normaliseSkinChoice({ mine: p, theirs: p, mineGame: g, theirsGame: g } as never, base);
      for (const side of ['mine', 'theirs'] as const) {
        const planet = next[side];
        expect([...real, 'colour']).toContain(planet);
        const game = side === 'mine' ? next.mineGame : next.theirsGame;
        if (game !== null) expect(game).not.toBe('colour');
        // An old save (no game fields) must still paint: a real planet supplies its own match skin.
        if (planet !== 'colour' && !real.has(g as string)) expect(game, `${side}: a real skin sets both`).toBe(planet);
      }
    }
  });

  it('a full restore keeps a match skin that had diverged from the planet', async () => {
    const { model } = await load();
    model.chooseSkin({ mine: 'carrara' });
    model.chooseSkin({ mineGame: 'voxel' });
    const before = model.skinChoice();
    expect(before.mine).toBe('carrara');
    expect(before.mineGame).toBe('voxel');
    // Opening the colour sheet then cancelling restores the whole choice, not just the planet.
    model.chooseSkin({ mine: 'colour' });
    model.chooseSkin(before);
    expect(model.skinChoice().mine).toBe('carrara');
    expect(model.skinChoice().mineGame).toBe('voxel');
  });

  it('choosing a real skin applies it to the board in one tap', async () => {
    const { model, art } = await load();
    model.chooseSkin({ mine: 'water' });
    expect(model.skinChoice().mineGame).toBe('water');
    expect([...art.faSides()][0], 'the next match wears Water').toBe('water');
  });

  it('a game skin for the six recipes paints through the tile-skin path, not the atlas', async () => {
    const { model, art, tile } = await load();
    model.chooseSkin({ mine: 'carrara' });
    expect(model.skinChoice().mine).toBe('carrara');
    expect(model.skinChoice().mineGame).toBe('carrara');
    // THE MERGE'S SEAM: a recipe never reaches the territory painter's atlas (which has no cell
    // for it); it paints the side through ui/tileSkins.ts instead.
    expect(['forest', 'ash', 'water', 'toxic']).toContain([...art.faSides()][0]);
    expect(tile.tileSkinFor(0), 'the recipe is the board paint').toBe('carrara');
    expect(tile.tileSkinFor(1)).toBeNull();
  });
});

describe('the gate: signed-in accounts only', () => {
  it('a guest sees no picker and is pinned to the product look, whatever was stored', async () => {
    const { model, art } = await load({ mine: 'water', theirs: 'toxic', background: 'cocoa' }, false);
    expect(model.skinPickerVisible()).toBe(false);
    expect(model.skinChoice()).toMatchObject({ mine: 'forest', theirs: 'ash', mineGame: 'forest', theirsGame: 'ash' });
    expect([...art.faSides()], 'a guest wears the product board').toEqual(['forest', 'ash']);
    expect(model.planetOwnSkin()).toBeUndefined();
  });

  it('a guest may choose the plain Colour look, but real skins stay pinned', async () => {
    const { model } = await load(undefined, false);
    model.chooseSkin({ mine: 'colour' });
    expect(model.skinChoice().mine, 'Colour is not a skin').toBe('colour');
    expect(model.skinChoice().mineGame, 'the guest board stays the product board').toBe('forest');
    model.chooseSkin({ mine: 'carrara' });
    expect(model.skinChoice().mine, 'a real skin is still locked').toBe('forest');
    model.chooseSkin({ mineGame: 'voxel' });
    expect(model.skinChoice().mineGame, 'a real match skin is still locked').toBe('forest');
  });

  it('a signed-in account sees the picker and keeps its stored choice', async () => {
    const { model } = await load({ mine: 'carrara', theirs: 'ash', mineGame: 'carrara', background: 'slate' });
    expect(model.skinPickerVisible()).toBe(true);
    expect(model.skinChoice().mine).toBe('carrara');
    expect(model.planetOwnSkin(), 'a new skin is not sent to the four-id planet renderer yet').toBeUndefined();
  });

  it('the server\'s four-id answer never overwrites a newer six-id local choice', async () => {
    const { model } = await load({ mine: 'carrara', theirs: 'ash', mineGame: 'carrara' });
    const issued = model.skinRevision();
    expect(model.adoptServerSkin('water', issued)).toBe(false);
    expect(model.skinChoice().mine).toBe('carrara');
  });

  it('the server\'s answer is adopted when the local choice is one it can express', async () => {
    const { model, art } = await load({ mine: 'forest', theirs: 'ash' });
    const issued = model.skinRevision();
    expect(model.adoptServerSkin('water', issued)).toBe(true);
    expect(model.skinChoice().mine).toBe('water');
    expect([...art.faSides()][0]).toBe('water');
  });
});

describe('contrast partners reach the board painter', () => {
  it('a same-skin collision paints the opponent with the fixed partner, without rewriting the choice', async () => {
    const { model, art, tile } = await load({
      mine: 'forest', theirs: 'forest', mineGame: 'forest', theirsGame: 'forest', background: 'slate',
    });
    // Stored choice stays as chosen — collision is paint-only (skin-contrast.ts).
    expect(model.skinChoice().mineGame).toBe('forest');
    expect(model.skinChoice().theirsGame).toBe('forest');
    expect([...art.faSides()], 'opponent tiles wear Ash in this view').toEqual(['forest', 'ash']);
    expect(tile.tileSides(), 'atlas collision clears the recipe sides').toEqual([null, null]);
  });

  it('a recipe collision paints the partner on the tile-skin path', async () => {
    const { model, art, tile } = await load({
      mine: 'voxel', theirs: 'voxel', mineGame: 'voxel', theirsGame: 'voxel', background: 'slate',
    });
    expect(model.skinChoice().theirsGame).toBe('voxel');
    // Voxel has no atlas cell; both sides fall back through atlasSkinFor, while recipes paint here.
    expect([...art.faSides()][0]).toBe('forest');
    expect([...tile.tileSides()]).toEqual(['voxel', 'brushed']);
  });
});
