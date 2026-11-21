// THE OWNER-COLOUR INNER RIM (owner, 2026-11-20: the owner's colour on the planet is "a thin inner
// rim on a skinned tile"). This file is IDENTICAL on both skins branches: the picker asks for the
// ring, the painters draw it, and both must resolve the same geometry or a tile looks different on
// the planet, the board and the replay.
//
// THE RULE, STATED SO IT CANNOT DRIFT:
//   * the rim is a band just INSIDE the hexagon's boundary — never an outline outside it (that is
//     what made the owner's land read as "colour on tiles and skin on top"), and never a tint of the
//     skin's own art (the picture stays the picture);
//   * it is thin: a fraction of the hexagon's circumradius, clamped to 1.5–3 CSS px, so it survives a
//     phone at 46 px and never becomes a frame on a desktop;
//   * its colour is the owner's own palette colour, verbatim — the rim IS how ownership reads once
//     the tile wears a skin.
//
// GEOMETRY. Both fractions are of the CIRCUMRADIUS (centre to corner), which is the radius every
// painter thinks in: `hexRadiusPx` is that radius on screen. The band starts `insetFraction` inside
// the boundary and is `widthFraction` thick. A painter that works in the hexagon's APOTHEM (centre to
// edge — the planet shader's normalised `e` is an apothem) must divide both fractions by cos(30°);
// see sphere/renderer.ts, which does exactly that through `e`.
//
// IT MUST ALWAYS FIT. The px clamps are a floor and a ceiling, not a promise: a hexagon small enough
// that a 1.5 px ring would cross its middle gets the largest ring that still stays in its outer
// `maxBandFraction` of the apothem. That is why the rim can be zero-width at a microscopic radius —
// there is no inside to paint — and the painter must simply draw nothing there.

export const OWNER_RIM = Object.freeze({
  /** How far inside the hex boundary the rim's outer edge starts, as a fraction of the radius. */
  insetFraction: 0.06,
  /** The band's thickness as a fraction of the radius. */
  widthFraction: 0.045,
  /** Never thinner than this on a phone, never fatter than this on a desktop. */
  minWidthPx: 1.5,
  maxWidthPx: 3,
  /** The band (inset + width) never reaches further in than this fraction of the APOTHEM. */
  maxBandFraction: 0.4,
});

/** The apothem/circumradius ratio, for painters that measure inward from an edge rather than a corner. */
export const HEX_APOTHEM_RATIO = Math.cos(Math.PI / 6);

export type OwnerRimPx = Readonly<{ colour: string; insetPx: number; widthPx: number }>;

/**
 * Resolve one tile's rim: the ring a painter draws inside the hexagon boundary, in CSS pixels.
 * Pure and total: a missing/zero/NaN radius yields a zero-width ring rather than a throw, so a tile
 * painted before layout settles simply shows no ring. The returned band always fits inside the
 * hexagon (see `maxBandFraction`).
 */
export const ownerRimFor = (colour: string, hexRadiusPx: number): OwnerRimPx => {
  const radius = Number.isFinite(hexRadiusPx) && hexRadiusPx > 0 ? hexRadiusPx : 0;
  let inset = Math.max(1, radius * OWNER_RIM.insetFraction);
  let width = Math.min(OWNER_RIM.maxWidthPx, Math.max(OWNER_RIM.minWidthPx, radius * OWNER_RIM.widthFraction));
  // A hexagon too small for the minimum ring gets the largest ring that still fits.
  const room = radius * HEX_APOTHEM_RATIO * OWNER_RIM.maxBandFraction;
  const total = inset + width;
  if (total > room) {
    const scale = room / total;
    inset *= scale;
    width *= scale;
  }
  return { colour, insetPx: inset, widthPx: width };
};
