// THE ART LAB (futasaku.com/art): slot rules, upload checks, the art pack round trip, and the
// promise that the game never loads the lab.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGET, CARD, CARD_SHEET, SKIN_TIERS, SLOTS, defaults, minUpload, slotById, spritePx, targetSize } from '../src/art-lab/slots.js';
import { budgetVerdict, checkUpload, contrast, seamScore, solidOutsideHex } from '../src/art-lab/checks.js';
import type { ImageMeta } from '../src/art-lab/checks.js';
import { emptyState, exportPack, importPack, manifestOf, skinJsonOf, skinOf, slotStatus, tierFiles } from '../src/art-lab/pack.js';
import type { LabState, SystemFiles } from '../src/art-lab/pack.js';
import { unzip, zip } from '../src/art-lab/zip.js';
import { namedFiles } from '../src/ui/skin/pack-json.js';

const meta = (o: Partial<ImageMeta>): ImageMeta => ({ width: 512, height: 512, mime: 'image/png', bytes: 1000, anyTransparent: true, solidOutsideHex: 0, ...o });
const bytes = (s: string) => new TextEncoder().encode(s);

describe('slots: one per brief item, sizes from the code', () => {
  it('covers the brief items 1-17 with unique ids and unique pack paths', () => {
    expect(new Set(SLOTS.map((s) => s.n))).toEqual(new Set(Array.from({ length: 17 }, (_, i) => i + 1)));
    expect(new Set(SLOTS.map((s) => s.id)).size).toBe(SLOTS.length);
    const paths = SLOTS.filter((s) => s.count.max > 0).flatMap((s) => Array.from({ length: s.count.max }, (_, i) => s.path(i, s.fileSettings ? `${i}_x` : undefined)));
    expect(new Set(paths).size).toBe(paths.length);
  });
  it('makes textures and hex art at the skin tiers, cards at today\'s card size', () => {
    expect(targetSize(slotById('ground')!, 'lo')).toEqual([SKIN_TIERS.lo.texPx, SKIN_TIERS.lo.texPx]);
    expect(targetSize(slotById('ground')!, 'hi')).toEqual([SKIN_TIERS.hi.texPx, SKIN_TIERS.hi.texPx]);
    expect(targetSize(slotById('rock')!, 'hi')).toEqual([SKIN_TIERS.hi.hexPx, SKIN_TIERS.hi.hexPx]);
    expect(targetSize(slotById('card-moss')!, 'lo')).toEqual([CARD_SHEET.w, CARD_SHEET.h]);
    expect(targetSize(slotById('card-back')!, 'lo')).toEqual([CARD.w, CARD.h]);
    // a prop 18 board units across, where a hex (60 units) is 512 px: 154 px (even)
    expect(spritePx(18, 'hi')).toBe(154);
    expect(targetSize(slotById('p1-props')!, 'hi', { size: 30 })).toEqual([256, 256]);
    expect(minUpload(slotById('p1-props')!, { size: 30 })).toEqual([256, 256]);
  });
  it('every colour or number setting has a usable default', () => {
    for (const s of SLOTS) for (const set of [...s.settings, ...(s.fileSettings ?? [])]) {
      if (set.type === 'range') expect(set.default >= set.min && set.default <= set.max, `${s.id}.${set.key}`).toBe(true);
      if (set.type === 'colour') expect(set.default).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('checks on every upload (plain English)', () => {
  const ground = slotById('ground')!, rock = slotById('rock')!, card = slotById('card-moss')!, prop = slotById('p1-props')!;
  it('refuses formats the game cannot use', () => {
    expect(checkUpload(rock, meta({ mime: 'image/gif' })).errors).toEqual(['This must be a PNG, JPG or WebP picture.']);
  });
  it('refuses too small, warns between the phone and the big-screen size', () => {
    expect(checkUpload(ground, meta({ width: 800, height: 800, anyTransparent: false })).errors[0]).toBe('This must be at least 1024×1024, best 2048×2048. Yours is 800×800.');
    const v = checkUpload(ground, meta({ width: 1024, height: 1024, anyTransparent: false }));
    expect(v.errors).toEqual([]);
    expect(v.warnings[0]).toContain('Best: 2048×2048');
    expect(checkUpload(ground, meta({ width: 2048, height: 2048, anyTransparent: false }))).toEqual({ errors: [], warnings: [], notes: [] });
  });
  it('wants the right shape', () => {
    expect(checkUpload(rock, meta({ width: 512, height: 400 })).errors[0]).toBe('This must be square. Yours is 512×400.');
    expect(checkUpload(card, meta({ width: 800, height: 800, anyTransparent: false })).errors[0]).toContain("card's shape, 256×356");
  });
  it('hex art must be see-through around the hex; textures must be solid', () => {
    expect(checkUpload(rock, meta({ solidOutsideHex: 0.6 })).errors[0]).toBe('This must be see-through around the hex: about 60% of the corners outside the hex are solid.');
    expect(checkUpload(prop, meta({ anyTransparent: false }), { size: 18 }).errors[0]).toBe('This needs a see-through background (a PNG or WebP with transparency).');
    expect(checkUpload(ground, meta({ width: 2048, height: 2048, anyTransparent: true })).errors[0]).toBe('This must be solid: a ground texture cannot have see-through areas.');
  });
  it('one card is accepted for a suit and repeated for all nine', () => {
    const v = checkUpload(card, meta({ width: CARD.w, height: CARD.h, anyTransparent: false }));
    expect(v.errors).toEqual([]);
    expect(v.notes[0]).toContain('used for all nine');
  });
  it('flags hard edges on seamless textures', () => {
    expect(checkUpload(ground, meta({ width: 2048, height: 2048, anyTransparent: false, seam: 4 })).warnings[0]).toContain('3×3 tiling preview');
  });
  it('icons want SVG', () => {
    expect(checkUpload(slotById('icon-moss')!, meta({ mime: 'image/svg+xml' })).errors).toEqual([]);
    expect(checkUpload(slotById('icon-moss')!, meta({ mime: 'image/png', width: 20, height: 20 })).errors[0]).toContain('SVG');
  });
  it('judges the phone download', () => {
    expect(budgetVerdict(900).level).toBe('ok');
    expect(budgetVerdict(BUDGET.warnKB + 1).level).toBe('warn');
    expect(budgetVerdict(BUDGET.maxKB + 1)).toEqual({ level: 'over', text: `${BUDGET.maxKB + 1} KB: too heavy for phones (keep it under ${BUDGET.maxKB} KB).` });
  });
});

describe('measurements', () => {
  const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
    return d;
  };
  it('a seamless texture scores about 1, a seam far more', () => {
    const wave = img(64, 64, (x, y) => { const v = 128 + 60 * Math.sin((2 * Math.PI * x) / 64) + 40 * Math.cos((2 * Math.PI * y) / 64); return [v, v, v, 255]; });
    expect(seamScore(wave, 64, 64)).toBeLessThan(1.6);
    const ramp = img(64, 64, (x) => [x * 4, x * 4, x * 4, 255]);
    expect(seamScore(ramp, 64, 64)).toBeGreaterThan(10);
  });
  it('measures solid corners outside the hex', () => {
    expect(solidOutsideHex(img(32, 32, () => [0, 0, 0, 255]), 32, 32)).toBe(1);
    const disc = img(32, 32, (x, y) => [0, 0, 0, (x - 15.5) ** 2 + (y - 15.5) ** 2 <= 15 ** 2 ? 255 : 0]);
    expect(solidOutsideHex(disc, 32, 32)).toBe(0);
  });
  it('contrast ratio (number ink on its plate)', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('the art pack', () => {
  const system: SystemFiles = new Map();
  for (const o of ['flat', 'pointy']) {
    for (let n = 1; n <= 9; n++) system.set(`masks/${o}/coverage_0${n}.png`, { lo: bytes(`c${o}${n}lo`), hi: bytes(`c${o}${n}hi`) });
    for (const z of ['number', 'gold']) system.set(`masks/${o}/clarity_${z}_zone.png`, { lo: bytes(`${z}lo`), hi: bytes(`${z}hi`) });
  }
  const filled = (): LabState => {
    const s = emptyState('Moss & Ember');
    const put = (id: string, n: number, settings: Record<string, string | number | boolean> = {}) => {
      const fileDefaults = defaults(slotById(id)!.fileSettings);
      s.slots[id]!.files = Array.from({ length: n }, (_, i) => ({ name: `${id}-${i}.png`, source: 'designer' as const, mime: 'image/webp', lo: bytes(`${id}${i}lo`), hi: bytes(`${id}${i}hi`),
        settings: { ...fileDefaults, ...settings, ...(id.endsWith('-tiles') ? { strength: i + 1 } : {}) } }));
    };
    put('ground', 2); put('rock', 3); put('gold', 2);
    put('p1-tiles', 9); put('p2-base', 2); put('p2-overlay', 1);
    put('p1-props', 2, { size: 20, minStrength: 3, anim: 'sway' }); put('p1-cutoff', 1);
    put('p1-home', 2, { size: 64, dx: 0, dy: 0, opacity: 1, anim: 'glow', turn: true }); put('p2-home', 1, { size: 60, dx: 0, dy: 0, opacity: 1, anim: 'none', turn: true });
    put('p1-scar', 1); put('p2-scar', 1); put('p2-links', 1);
    put('motes', 1, { player: 'Player 2', kind: 'rise', minStrength: 6, size: 6 });
    for (const c of ['card-moss', 'card-ash', 'card-dew', 'card-ember', 'card-back', 'card-back-frame', 'card-bomb', 'planet-land']) {
      s.slots[c]!.files = [{ name: `${c}.webp`, source: 'designer', mime: 'image/webp', lo: bytes(c), settings: {} }];
    }
    s.slots['p2-links']!.settings.body = '#ff8800';
    return s;
  };

  it('exports and reopens the same state', () => {
    const s = filled();
    const again = importPack(exportPack(s, system));
    expect(again).toEqual(s);
  });
  it('the same art always makes the same zip', () => {
    expect(exportPack(filled(), system)).toEqual(exportPack(filled(), system));
  });
  it('has every file the board asks for, in both tiers, at the game\'s folder layout', () => {
    const s = filled();
    const files = new Map(unzip(exportPack(s, system)).map((e) => [e.name, e.data]));
    const skin = skinOf(s, 'art');
    for (const tier of ['lo', 'hi']) for (const f of namedFiles(skin)) expect(files.has(`${tier}/${f}`), `${tier}/${f}`).toBe(true);
    // painted tiles keep the s<strength>_ names the board reads
    expect(files.has('lo/tiles/p1/s9_09.webp')).toBe(true);
    // the hi tier carries the hi pictures
    expect(new TextDecoder().decode(files.get('hi/textures/empty_ground_01.webp'))).toBe('ground0hi');
    for (const c of ['cards/moss.webp', 'cards/back.webp', 'cards/bomb.webp', 'planet/land.webp', 'skin.json', 'manifest.json', 'README.md']) expect(files.has(c), c).toBe(true);
    const m = JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
    expect(m.tiers.lo).toEqual([...tierFiles(s, system).lo.keys()].sort());
    expect(m).toEqual(manifestOf(tierFiles(s, system)));
  });
  it('the skin is the game\'s SkinDef: props by name, homes as layers, links and plates from the sliders', () => {
    const j = skinJsonOf(filled());
    expect(j.owners).toEqual(['p1', 'p2']);
    expect(j.props.p1!.rules![0]).toEqual({ match: '01_p1-props-0', size: 20, minStrength: 3, anim: 'sway' });
    expect(j.homes[0]!.map((l) => l.anim)).toEqual(['glow', 'glow']);
    expect(j.network[1]!.body).toBe('#ff8800');
    expect(j.network[1]!.strip).toBe('network/p2/strip.webp');
    expect(j.tiles).toEqual({ p1: { dir: 'tiles/p1/', base: '#2f5a32' } });
    expect(j.materials.p1!.base).toEqual(j.materials.empty!.base);
    expect(j.ambient!.motes[0]!.material).toBe('p2');
  });
  it('knows what is done, kept from today, missing or a placeholder', () => {
    const s = emptyState();
    expect(slotStatus(slotById('ground')!, s.slots.ground)).toBe('missing');
    expect(slotStatus(slotById('motes')!, s.slots.motes)).toBe('placeholder');
    s.slots.ground!.files = [{ name: 'g', source: 'current', mime: 'image/webp', lo: bytes('g'), settings: {} }];
    expect(slotStatus(slotById('ground')!, s.slots.ground)).toBe('current');
    s.slots.ground!.files.push({ name: 'h', source: 'designer', mime: 'image/webp', lo: bytes('h'), settings: {} });
    expect(slotStatus(slotById('ground')!, s.slots.ground)).toBe('done');
  });
  it('refuses what is not a pack, in plain words', () => {
    expect(() => importPack(bytes('hello'))).toThrow('This is not a zip file.');
    expect(() => importPack(zip([{ name: 'a.txt', data: bytes('x') }]))).toThrow('no pack.json');
  });
});

describe('the game never loads the lab', () => {
  const root = resolve(__dirname, '../src');
  const graph = (entry: string) => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+['"](\.[^'"]+)['"]/g)) {
        const spec = (m[1] ?? m[2] ?? m[3])!.replace(/\?.*$/, '');
        const base = resolve(dirname(file), spec);
        for (const c of [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, resolve(base, 'index.ts')]) if (c.endsWith('.ts') && existsSync(c)) walk(c);
      }
    };
    walk(entry);
    return [...seen];
  };
  it('main.ts reaches no art-lab module and no skin pack loader', () => {
    const files = graph(resolve(root, 'main.ts'));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => f.includes('/art-lab/'))).toEqual([]);
  });
  it('the lab is its own page: its own entry, hidden from search engines', () => {
    const html = readFileSync(resolve(__dirname, '../art/index.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('src/art-lab/main.ts');
    // its own build pass, into dist/art only; the game's build has no lab entry
    expect(readFileSync(resolve(__dirname, '../vite.art.config.ts'), 'utf8')).toContain("'./dist/art'");
    expect(readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8')).not.toContain('art/index.html');
    // the game's offline worker never caches the lab
    expect(readFileSync(resolve(__dirname, '../public/futa04-sw.js'), 'utf8')).toMatch(/\/art\//);
  });
});

import { boardMoves, playGame, positionHash, readPositionHash } from '../src/art-lab/generator.js';
describe('the generator: real bot games from a seed', () => {
  it('plays a whole game to the end, the same every time', () => {
    const a = playGame(4821), b = playGame(4821);
    expect(a.steps.at(-1)!.state.phase).toBe('GAME_OVER');
    expect(a.steps.length).toBe(b.steps.length);
    expect(JSON.stringify(a.steps.at(-1)!.state.board)).toBe(JSON.stringify(b.steps.at(-1)!.state.board));
    expect(boardMoves(a).length).toBeGreaterThan(10);
  });
  it('plays the small campaign board too', () => {
    const g = playGame(7, 'small');
    expect(Object.keys(g.steps[0]!.state.board).length).toBeLessThan(Object.keys(playGame(7).steps[0]!.state.board).length);
    expect(g.steps.at(-1)!.state.phase).toBe('GAME_OVER');
  });
  it('a position is shareable as "seed, move"', () => {
    expect(positionHash(4821, 37, 'standard')).toBe('#seed=4821&move=37');
    expect(readPositionHash('#seed=4821&move=37&board=small')).toEqual({ seed: 4821, move: 37, size: 'small' });
    expect(readPositionHash('#seed=x')).toBeNull();
  });
});
