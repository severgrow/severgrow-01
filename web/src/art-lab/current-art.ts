// TODAY'S ART as the lab's starting point (owner: "pre-filled with the current game art, so the
// designer sees today's look and replaces pieces"). It imports the game's own files, so the lab
// always starts from what players see now. Every file is marked `current` in the checklist.
// What today's board has no art for (props, links art, overlays, motes, scars) starts empty: the
// skin falls back to its colours, and the checklist says "placeholder".
import ground from '../assets/board/empty_ground_01.webp?url';
import rock1 from '../assets/board/rock_hex_01.webp?url';
import rock2 from '../assets/board/rock_hex_02.webp?url';
import rock3 from '../assets/board/rock_hex_03.webp?url';
import rock4 from '../assets/board/rock_hex_04.webp?url';
import rock5 from '../assets/board/rock_hex_05.webp?url';
import goldAtlas from '../assets/futasaku-gold-frames.webp?url';
import moss from '../assets/cards/moss.webp?url';
import ash from '../assets/cards/ash.webp?url';
import dew from '../assets/cards/dew.webp?url';
import ember from '../assets/cards/ember.webp?url';
import bomb from '../assets/cards/bomb.webp?url';
import back from '../assets/cards/back.webp?url';
import backFrame from '../assets/cards/back-frame.webp?url';
import { DEFAULT_ART_SPRITES } from '../ui/defaultArtSprites.js';
import { goldFrameCrop } from '../ui/goldframes.js';
import { SUIT_SVG } from '../ui/icons.js';
import { decode, render } from './convert.js';
import type { Decoded } from './convert.js';
import { emptyState } from './pack.js';
import type { LabFile, LabState, SystemFiles } from './pack.js';
import { TIERS, defaults, slotById, targetSize } from './slots.js';
import type { Slot } from './slots.js';

const fetchBlob = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.blob();
};

/** One of today's pictures as a lab file (both tiers made from it). */
const fileFrom = async (slot: Slot, d: Decoded, name: string, settings: Record<string, string | number | boolean> = {}): Promise<LabFile> => {
  const fs = { ...defaults(slot.fileSettings), ...settings };
  const [lw, lh] = targetSize(slot, 'lo', fs);
  const lo = await render(d, slot, lw, lh);
  const file: LabFile = { name, source: 'current', mime: lo.mime, lo: lo.bytes, settings: fs };
  if (slot.rule.tiered) {
    const [hw, hh] = targetSize(slot, 'hi', fs);
    file.hi = (await render(d, slot, hw, hh)).bytes;
  }
  return file;
};

const crop = async (url: string, x: number, y: number, w: number, h: number): Promise<Decoded> => {
  const b = await createImageBitmap(await fetchBlob(url), x, y, w, h);
  return { bitmap: b, mime: 'image/png', bytes: 0 };
};

/** The lab state of today's game art. `progress` reports how far along it is (0..1). */
export const currentArt = async (progress: (f: number) => void = () => {}): Promise<LabState> => {
  const s = emptyState("Today's art");
  const jobs: [string, () => Promise<LabFile>][] = [];
  const add = (id: string, url: string, name: string, settings?: Record<string, string | number | boolean>) =>
    jobs.push([id, async () => fileFrom(slotById(id)!, await decode(await fetchBlob(url)), name, settings)]);
  add('ground', ground, 'empty_ground_01.webp');
  [rock1, rock2, rock3, rock4, rock5].forEach((u, i) => add('rock', u, `rock_hex_0${i + 1}.webp`));
  // bonus hexes are a metal frame today: its three looks, cropped from the game's atlas
  for (let v = 0; v < 3; v++) jobs.push(['gold', async () => {
    const c = goldFrameCrop('', v);
    const side = Math.max(c.w, c.h);
    return fileFrom(slotById('gold')!, await crop(goldAtlas, c.x - (side - c.w) / 2, c.y - (side - c.h) / 2, side, side), `gold_frame_0${v + 1}.webp`);
  }]);
  // nine painted tiles per player: variety mixed by position, all at strength 1 (today's look)
  DEFAULT_ART_SPRITES.slice(0, 9).forEach((u, i) => add('p1-tiles', u, `meadow_0${i + 1}.webp`, { strength: 1 }));
  DEFAULT_ART_SPRITES.slice(9, 18).forEach((u, i) => add('p2-tiles', u, `ashen_0${i + 1}.webp`, { strength: 1 }));
  add('p1-home', DEFAULT_ART_SPRITES[18]!, 'garden.webp', { size: 68 });
  add('p2-home', DEFAULT_ART_SPRITES[19]!, 'fortress.webp', { size: 68 });
  const cards: [string, string][] = [['card-moss', moss], ['card-ash', ash], ['card-dew', dew], ['card-ember', ember], ['card-bomb', bomb], ['card-back', back], ['card-back-frame', backFrame]];
  for (const [id, u] of cards) add(id, u, `${id.slice(5)}.webp`);
  let done = 0;
  const results = await Promise.all(jobs.map(async ([id, job]) => {
    try { return [id, await job()] as const; } catch { return [id, null] as const; } finally { progress(++done / jobs.length); }
  }));
  for (const [id, f] of results) if (f) s.slots[id]!.files.push(f);
  // the suit symbols are code today (ui/icons.ts): kept as SVG files
  (['moss', 'ash', 'dew', 'ember'] as const).forEach((n, i) => {
    s.slots[`icon-${n}`]!.files = [{ name: `${n}.svg`, source: 'current', mime: 'image/svg+xml', lo: new TextEncoder().encode(SUIT_SVG[i]!), settings: {} }];
  });
  // today's ground also reads as the planet's unexplored, fog and free ground (seamless already)
  const planet = slotById('planet-land')!;
  try {
    const d = await decode(await fetchBlob(ground));
    for (const id of ['planet-void', 'planet-fog', 'planet-land']) {
      const r = await render(d, planet, 512, 512);
      s.slots[id]!.files = [{ name: 'empty_ground_01.webp', source: 'current', mime: r.mime, lo: r.bytes, settings: {} }];
    }
    s.slots['planet-void']!.settings.strength = 0.35;
    s.slots['planet-fog']!.settings.strength = 0.5;
    s.slots['planet-land']!.settings.strength = 0.7;
  } catch { /* the planet keeps its own colours */ }
  return s;
};

/** The strength masks every pack carries (restored from the skin system into /art/system/). */
export const systemFiles = async (base = './system'): Promise<SystemFiles> => {
  const out: SystemFiles = new Map();
  const names = [...Array.from({ length: 9 }, (_, i) => `coverage_0${i + 1}.png`), 'clarity_number_zone.png', 'clarity_gold_zone.png'];
  await Promise.all(['flat', 'pointy'].flatMap((o) => names.map(async (n) => {
    const p = `masks/${o}/${n}`;
    const [lo, hi] = await Promise.all(TIERS.map(async (t) => new Uint8Array(await (await fetchBlob(`${base}/${t}/${p}`)).arrayBuffer())));
    out.set(p, { lo: lo!, hi: hi! });
  })));
  return out;
};
