// A skin as plain JSON (an art pack's skin.json): the SkinDef with its mask paths as templates
// instead of functions, so a pack made in the Art Lab drops into the game unchanged:
//   const skin = skinFromJson(await (await fetch('art/skin.json')).json(), 'art');
//   new SkinBoardView(svg, handlers, skin);
import type { SkinDef } from './types.js';

export type SkinJson = Omit<SkinDef, 'masks' | 'root'> & {
  /** `{o}` is the orientation (flat / pointy), `{nn}` the strength 01-09 */
  masks: { coverage: string; clarityNumber: string; clarityGold: string };
};

export const MASK_TEMPLATES: SkinJson['masks'] = {
  coverage: 'masks/{o}/coverage_{nn}.png',
  clarityNumber: 'masks/{o}/clarity_number_zone.png',
  clarityGold: 'masks/{o}/clarity_gold_zone.png',
};

const fill = (t: string, o: string, n = 0) => t.replace('{o}', o).replace('{nn}', String(n).padStart(2, '0'));

export const skinFromJson = (j: SkinJson, root: string): SkinDef => ({
  ...j,
  root,
  masks: {
    coverage: (n, o) => fill(j.masks.coverage, o, n),
    clarityNumber: (o) => fill(j.masks.clarityNumber, o),
    clarityGold: (o) => fill(j.masks.clarityGold, o),
  },
});

/**
 * Every file the skinned board asks for by name (folders aside), per the skin: the masks, ground
 * textures, tints, homes, scars, motes and the network style. A pack is complete when its manifest
 * lists all of them (folders such as props/ and tiles/ are optional by design).
 */
export const namedFiles = (skin: SkinDef): string[] => {
  const out = new Set<string>();
  for (const o of ['flat', 'pointy'] as const) {
    for (let n = 1; n <= 9; n++) out.add(skin.masks.coverage(n, o));
    out.add(skin.masks.clarityNumber(o));
    out.add(skin.masks.clarityGold(o));
  }
  for (const m of Object.values(skin.materials)) {
    for (const b of m.base) out.add(b);
    if (m.overlay) out.add(m.overlay);
    if (m.cutoff) out.add(m.cutoff);
  }
  for (const layers of skin.homes) for (const l of layers) out.add(l.src);
  for (const s of skin.scars ?? []) out.add(s);
  for (const m of skin.ambient?.motes ?? []) out.add(m.src);
  for (const n of skin.network) if (n.strip) out.add(n.strip);
  out.add(skin.networkStyle);
  return [...out].sort();
};
