import { describe, expect, it } from 'vitest';
import { allCoords, coordKey, DIRECTIONS, addCoord, parseKey } from '../../src/engine/index.js';
import {
  CLEAR_ZONE,
  MATERIAL_NAMES,
  MATERIAL_TOKENS,
  flameBox,
  flameTongues,
  inClearZone,
  rockPebbles,
  materialFor,
  materialLook,
  materialsOf,
  mossTufts,
  strengthLift,
  tileVariant,
} from '../src/logic/materials.js';
import { THEMES, THEME_IDS, contrast, resolveColors } from '../src/logic/themes.js';
import { CVD_KINDS, deltaE, simulate } from '../src/logic/colorcheck.js';

const HEX = /^#[0-9a-f]{6}$/i;
const KEYS = allCoords(4).map(coordKey);

describe('material tokens and the registry', () => {
  it('every palette defines every material token', () => {
    for (const id of THEME_IDS) {
      const m = materialsOf(id);
      expect(Object.keys(m.colors).sort()).toEqual([...MATERIAL_TOKENS].sort());
      for (const v of Object.values(m.colors)) expect(v).toMatch(HEX);
    }
  });

  it('the registry names the board materials (a new one can be added later)', () => {
    expect([...MATERIAL_NAMES].sort()).toEqual(['empty', 'fire', 'gold', 'moss', 'rock']);
    expect(materialFor({ owner: 0, strength: 3 }, 'normal')).toBe('moss');
    expect(materialFor({ owner: 1, strength: 3 }, 'rich')).toBe('fire');
    expect(materialFor(null, 'rock')).toBe('rock');
    expect(materialFor(null, 'rich')).toBe('gold');
    expect(materialFor(null, 'normal')).toBe('empty');
  });

  it('intensity: full in Soil, slightly lighter in Moss night, minimal in Ink', () => {
    const [soil, moss, ink] = (['soil', 'moss', 'ink'] as const).map((id) => materialsOf(id).intensity);
    expect(soil).toBe(1);
    expect(moss).toBeLessThan(1);
    expect(moss).toBeGreaterThanOrEqual(0.6);
    expect(ink).toBeLessThanOrEqual(0.35);
    expect(materialLook('soil', 'normal', false)).toMatchObject({ textures: true, facets: true, cracks: true });
    expect(materialLook('ink', 'normal', false)).toMatchObject({ textures: false, facets: false, cracks: false });
  });

  it('Low detail uses no textures in any palette; rim and shadow stay; Reduce motion stops the glow pulse and breathing', () => {
    for (const id of THEME_IDS) {
      const low = materialLook(id, 'low', false);
      expect(low).toMatchObject({ textures: false, facets: false, cracks: false, motion: false });
      expect(low.rim).toBeGreaterThan(0);
      expect(low.shadow).toBeGreaterThan(0);
    }
    expect(materialLook('soil', 'normal', false).motion).toBe(true);
    expect(materialLook('soil', 'normal', true).motion).toBe(false);
  });
});

describe('strength reads as height', () => {
  it('a stronger tile sits higher, with more rim light and shadow, and brighter; 1-3 px', () => {
    for (let s = 1; s <= 9; s++) {
      const a = strengthLift(s, 9);
      expect(a.lift).toBeGreaterThanOrEqual(1);
      expect(a.lift).toBeLessThanOrEqual(3);
      if (s > 1) {
        const b = strengthLift(s - 1, 9);
        expect(a.lift).toBeGreaterThan(b.lift);
        expect(a.rim).toBeGreaterThan(b.rim);
        expect(a.shadow).toBeGreaterThan(b.shadow);
        expect(a.bright).toBeGreaterThan(b.bright);
      }
    }
    expect(strengthLift(1, 9).lift).toBe(1);
    expect(strengthLift(9, 9).lift).toBe(3);
  });
});

describe('per-tile variation (no stamped look, no flicker)', () => {
  it('the same coordinate always gives the same result', () => {
    for (const k of KEYS) {
      expect(tileVariant(k)).toEqual(tileVariant(k));
      expect(flameTongues(k, 5)).toEqual(flameTongues(k, 5));
      expect(rockPebbles(k)).toEqual(rockPebbles(k));
      expect(mossTufts(k)).toEqual(mossTufts(k));
    }
  });

  it('neighbours differ', () => {
    let pairs = 0;
    for (const k of KEYS.slice(0, 20)) {
      for (const d of DIRECTIONS) {
        const n = coordKey(addCoord(parseKey(k), d));
        expect(JSON.stringify(flameTongues(n, 5))).not.toBe(JSON.stringify(flameTongues(k, 5)));
        expect(JSON.stringify(rockPebbles(n))).not.toBe(JSON.stringify(rockPebbles(k)));
        expect(JSON.stringify(mossTufts(n))).not.toBe(JSON.stringify(mossTufts(k)));
        pairs++;
      }
    }
    expect(pairs).toBe(120);
  });

  it('the variation is subtle: small turns, tufts and seams stay in the rim area', () => {
    for (const k of KEYS) {
      const v = tileVariant(k);
      expect(Math.abs(v.turn)).toBeLessThanOrEqual(8);
      for (const t of mossTufts(k)) expect(Math.hypot(t.x, t.y)).toBeLessThanOrEqual(0.95);
    }
  });
});

describe('legibility', () => {
  it('ADVERSARIAL 1: flame tongues never cover the number or the marker, even at strength 9', () => {
    for (const k of KEYS) {
      for (let st = 1; st <= 9; st++) {
        const flames = flameTongues(k, st);
        expect(flames.length).toBeGreaterThanOrEqual(3);
        for (const fl of flames) {
          const b = flameBox(fl);
          for (let i = 0; i <= 10; i++) {
            for (let j = 0; j <= 10; j++) {
              const x = b.x0 + ((b.x1 - b.x0) * i) / 10;
              const y = b.y0 + ((b.y1 - b.y0) * j) / 10;
              expect(inClearZone(x, y), `${k} s${st}`).toBe(false);
            }
          }
        }
      }
    }
    expect(CLEAR_ZONE.halfWidth).toBeGreaterThanOrEqual(0.35);
  });

  it('rock carries a few smaller stones of different sizes, all inside the hex', () => {
    for (const k of KEYS) {
      const ps = rockPebbles(k);
      expect(ps.length).toBeGreaterThanOrEqual(4);
      expect(ps.length).toBeLessThanOrEqual(7);
      expect(new Set(ps.map((p) => p.size)).size).toBeGreaterThan(1);
      for (const p of ps) expect(Math.hypot(p.x, p.y) + p.size).toBeLessThanOrEqual(0.86);
    }
  });

  it('numbers stay readable: dark ink on light moss, light ink on dark crust, in every palette', () => {
    for (const id of THEME_IDS) {
      const c = resolveColors(THEMES[id]);
      const m = materialsOf(id).colors;
      expect(contrast(c.youInk, m.moss), `${id} moss`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.youInk, m.mossTop), `${id} moss top`).toBeGreaterThanOrEqual(4.5);
      // fire burns bright, so its numbers are dark: readable on the hot core and the flames
      expect(contrast(m.fireInk, m.fire), `${id} fire`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.fireInk, m.fireHot), `${id} fire hot`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('fire burns coral-red to orange-red, never yellow or amber (amber is gold)', () => {
    for (const id of THEME_IDS) {
      const c = resolveColors(THEMES[id]);
      const m = materialsOf(id).colors;
      for (const seam of [m.fire, m.fireHot, m.fireTip]) {
        expect(deltaE(seam, c.gold), seam).toBeGreaterThan(30);
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(seam.slice(i, i + 2), 16)) as [number, number, number];
        const hue = (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
        expect(hue, `${seam} hue`).toBeLessThan(25); // red-orange; amber starts near 40
      }
    }
  });

  it('rock is stone, not ice; cut-off moss dries grey-brown and fire burns out to ash', () => {
    for (const id of THEME_IDS) {
      const c = resolveColors(THEMES[id]);
      const m = materialsOf(id).colors;
      const [r, , b] = [1, 3, 5].map((i) => parseInt(m.rock.slice(i, i + 2), 16));
      expect(b!).toBeLessThanOrEqual(r! + 4);
      expect(deltaE(m.rock, c.hexFill)).toBeGreaterThan(15);
      for (const p of [m.moss, m.fireDeep]) expect(deltaE(m.rock, p)).toBeGreaterThan(12);
      expect(deltaE(m.mossDry, m.moss)).toBeGreaterThan(30);
      expect(deltaE(m.fireAsh, m.fire)).toBeGreaterThan(40);
    }
  });

  it('ADVERSARIAL 2: the players stay apart under all three colour-blind simulations (colour, plus material lightness)', () => {
    for (const id of THEME_IDS) {
      const m = materialsOf(id).colors;
      for (const kind of ['normal', ...CVD_KINDS] as const) {
        const sim = (x: string) => (kind === 'normal' ? x : simulate(x, kind));
        // the moss against the fire's deep red edges, and against its bright flames
        expect(deltaE(sim(m.moss), sim(m.fireDeep)), `${id} ${kind}`).toBeGreaterThan(30);
        expect(deltaE(sim(m.moss), sim(m.fire)), `${id} ${kind} seam`).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
