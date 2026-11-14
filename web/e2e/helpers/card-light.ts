// Read a hand card's computed `box-shadow` as layers, so a suite can state the RULE it is checking
// instead of pinning one literal colour to the exact byte.
//
// The owner's rule (2026-11-14): "the colors of cards when its time to tap them should be more
// intense - and then dropping a lot when its time to throw". A tappable hand is lit in each card's
// own suit ink, several soft outer layers deep; the same hand in the Throw step keeps only a
// whisper of it. `web/src/player/smart-cockpit.ts` owns both, and these helpers let the browser
// suites prove the difference in the painted style rather than trusting a substring.

export type ShadowLayer = {
  /** `rgb(r, g, b)` of the layer's colour. */
  readonly rgb: readonly [number, number, number];
  /** Colour alpha, 0..1 (1 when the colour carries none). */
  readonly alpha: number;
  /** Blur radius in px. */
  readonly blur: number;
  /** Spread in px (can be negative). */
  readonly spread: number;
  readonly inset: boolean;
};

/** Split a computed `box-shadow` into its layers (colours contain commas, so depth is tracked). */
const splitLayers = (value: string): string[] => {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
  }
  out.push(value.slice(start));
  return out.map((part) => part.trim()).filter(Boolean);
};

const colourOf = (layer: string): { rgb: [number, number, number]; alpha: number } => {
  const rgba = /rgba?\(([^)]+)\)/.exec(layer);
  if (rgba) {
    const parts = rgba[1]!.split(/[,/\s]+/).filter(Boolean).map(Number);
    return { rgb: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], alpha: parts[3] ?? 1 };
  }
  const srgb = /color\(srgb\s+([^)]+)\)/.exec(layer);
  if (srgb) {
    const parts = srgb[1]!.split(/[,/\s]+/).filter(Boolean).map(Number);
    return { rgb: [(parts[0] ?? 0) * 255, (parts[1] ?? 0) * 255, (parts[2] ?? 0) * 255], alpha: parts[3] ?? 1 };
  }
  return { rgb: [0, 0, 0], alpha: 0 };
};

/** Every layer of a computed `box-shadow` (`'none'` gives an empty list). */
export const shadowLayers = (value: string): ShadowLayer[] => {
  if (!value || value === 'none') return [];
  return splitLayers(value).map((layer) => {
    const lengths = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(layer);
    const { rgb, alpha } = colourOf(layer);
    return {
      rgb: [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])] as const,
      alpha,
      blur: Number(lengths?.[3] ?? 0),
      spread: Number(lengths?.[4] ?? 0),
      inset: /\binset\b/.test(layer),
    };
  });
};

/** The outer (non-inset) layers — the light a card casts around its silhouette. A near-black
 *  layer is the card's DEPTH shadow, not light: including it would read the same optical weight
 *  for a lit card and a quiet one, which is exactly the difference the owner asked to see. */
const LIGHT_FLOOR = 60;
export const isLight = (layer: ShadowLayer): boolean => Math.max(...layer.rgb) >= LIGHT_FLOOR;
export const outerGlow = (value: string): ShadowLayer[] =>
  shadowLayers(value).filter((layer) => !layer.inset && isLight(layer));

/** The strongest alpha any outer layer reaches: how lit the card reads. */
export const peakGlow = (value: string): number => Math.max(0, ...outerGlow(value).map((layer) => layer.alpha));

/** The colour of the outer layer that carries the most light (the card's dominant halo). */
export const peakColour = (value: string): readonly [number, number, number] => {
  const layers = outerGlow(value);
  if (!layers.length) return [0, 0, 0];
  return layers.reduce((best, layer) => (layer.alpha > best.alpha ? layer : best)).rgb;
};

/** The widest blur any outer layer reaches: how far the light travels. */
export const reachOf = (value: string): number => Math.max(0, ...outerGlow(value).map((layer) => layer.blur));

/** Hue in degrees (0-360) of an `rgb` triple; 0 for greys. */
export const hueOf = ([r, g, b]: readonly [number, number, number]): number => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
};

/** Hue of a CSS colour string in any of the forms `getComputedStyle` can return. */
export const hueOfCss = (colour: string): number => hueOf(colourOf(colour).rgb);

/** The shortest angular distance between two hues, 0..180 degrees. */
export const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
