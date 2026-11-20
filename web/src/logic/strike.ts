// THE STRIKE'S ONE TIMING CURVE (owner, 2026-10-31: "it's confusing when bomb is used since you
// don't know what happened — it should be clear on replay that bomb/blast was used").
//
// A Bomb beat shows the Bomb card itself — the game's own card art — landing on the tile it hit; a
// warm burst goes off over the cells it covers, and only then do the struck tiles go. No words: the
// card IS the explanation, in the game's own art.
//
// WHY THIS LIVES IN `logic/`: the recorded replay paints it on a canvas (`replay/strike.ts`) and the
// live game plays it over the board (`ui/effects.ts`, `ui/live-strike.ts`). Both must be the same
// beat, so the curve is here — pure, no DOM, no assets, no imports — and both sides import it. A
// second copy of these numbers is exactly how the replay and the game drift apart (the owner,
// 2026-11-20: the replay's Bomb "looks good and that could be in the game reused").
//
// Compositor rule: everything a caller builds from this is `transform`/`opacity` only.

/** When, inside a strike beat (0 … 1 of its duration), each part happens. */
export const STRIKE_TIMING = Object.freeze({
  /** The card lands (scale and fade in, with a small overshoot). */
  landEnd: 0.16,
  /** The burst goes off; the struck tiles start to go at this moment. */
  burst: 0.36,
  /** The burst has faded. */
  burstEnd: 0.72,
  /** The card leaves. */
  cardOutStart: 0.42,
  cardOutEnd: 0.64,
});

/**
 * The card's long side, in hex RADII (30 board units = one radius): 2.15 radii is a card a little
 * taller than a tile, which is what makes it read as the explanation of the covered cells. The
 * canvas painter and the live card both size from this one number.
 */
export const STRIKE_CARD_HEIGHT = 2.15;

/** The card art's own aspect (256 x 356), the shape the canvas painter draws. */
export const STRIKE_ART_ASPECT = 256 / 356;

/** Where in the landing the scale overshoots (the replay's 0.72 → 1.06 → 1). */
export const STRIKE_OVERSHOOT_AT = 0.7;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const strikeEase = (x: number) => 1 - (1 - clamp01(x)) ** 3;

export type StrikeLook = {
  /** The card(s): how solid, how big (1 = resting size) and how far above their place (in hex radii). */
  card: { alpha: number; scale: number; lift: number };
  /** The burst over the struck cells: 0 … 1. */
  burst: number;
};

/** The strike's look at a fraction `p` (0 … 1) of its beat. Pure. */
export const strikeLook = (p: number): StrikeLook => {
  const T = STRIKE_TIMING;
  const land = clamp01(p / T.landEnd);
  const out = clamp01((p - T.cardOutStart) / (T.cardOutEnd - T.cardOutStart));
  const cardAlpha = p < T.cardOutStart ? strikeEase(land) : 1 - strikeEase(out);
  // 0.72 → 1.06 → 1 on the way in, then a slight swell as it goes
  const inScale = land < STRIKE_OVERSHOOT_AT
    ? 0.72 + (1.06 - 0.72) * (land / STRIKE_OVERSHOOT_AT)
    : 1.06 - 0.06 * ((land - STRIKE_OVERSHOOT_AT) / (1 - STRIKE_OVERSHOOT_AT));
  const scale = p < T.cardOutStart ? inScale : 1 + 0.12 * strikeEase(out);
  const lift = (1 - strikeEase(land)) * 0.5;
  const b = p < T.burst ? 0 : p < T.burst + 0.06 ? (p - T.burst) / 0.06 : 1 - clamp01((p - T.burst - 0.06) / (T.burstEnd - T.burst - 0.06));
  return { card: { alpha: clamp01(cardAlpha), scale, lift }, burst: clamp01(b) };
};

/** The overshoot the landing adds, READ from the curve (never a second hand-picked 1.06). */
export const STRIKE_OVERSHOOT = strikeLook(STRIKE_TIMING.landEnd * STRIKE_OVERSHOOT_AT).card.scale - 1;

export type StrikeBox = { left: number; top: number; width: number; height: number };

/**
 * Where a strike card of `cardW` x `cardH` sits for a target hex: centred on the hex, and nudged
 * inside the viewport so the WHOLE card (with its overshoot) is always on screen — a card cut by the
 * edge of the screen was the owner's Bomb bug (2026-11-20: "with cutted top and bottom").
 */
export const fitStrikeLanding = (hex: StrikeBox, view: StrikeBox, cardW: number, cardH: number) => {
  const margin = 4;
  const scale = Math.min(1, (view.width - 2 * margin) / cardW, (view.height - 2 * margin) / cardH);
  // the widest the card ever gets is its landing size times the landing overshoot
  const halfW = (cardW * scale * (1 + STRIKE_OVERSHOOT)) / 2 + margin;
  const halfH = (cardH * scale * (1 + STRIKE_OVERSHOOT)) / 2 + margin;
  const cx = hex.left + hex.width / 2;
  const cy = hex.top + hex.height / 2;
  const x = Math.min(view.left + view.width - halfW, Math.max(view.left + halfW, cx));
  const y = Math.min(view.top + view.height - halfH, Math.max(view.top + halfH, cy));
  return { x, y, scale, width: cardW * scale, height: cardH * scale };
};

/**
 * The card's own box at a Bomb's landing, in px, from the target hex's box.
 *
 * `STRIKE_CARD_HEIGHT` radii is the replay's size; the hex's long side is one diameter (two radii),
 * so the answer is 1.075 long sides — the card overhangs its tile top and bottom exactly as it does
 * in the replay. The WIDTH follows the hand card's own aspect, so the flyer paints the same picture
 * the player picked up (no squash, no extra `background-size: cover` crop).
 */
export const strikeCardSize = (hex: StrikeBox, cardAspect: number) => {
  const height = STRIKE_CARD_HEIGHT * (Math.max(hex.width, hex.height) / 2);
  return { width: height * cardAspect, height };
};

/**
 * One keyframe of a landing card, in the vocabulary the compositor can animate. `transform` and
 * `opacity` only — the DOM's own `Keyframe` type is not used here because this module is pure
 * (tests/ imports it from the DOM-free root project); the caller hands it to `Element.animate`.
 */
export type StrikeFrame = { offset: number; transform: string; opacity: number };

const frameOf = (offset: number, x: number, y: number, scale: number, alpha: number): StrikeFrame => ({
  offset,
  transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`,
  opacity: +alpha.toFixed(3),
});

/**
 * A Bomb card's flight onto its tile, on the strike's own clock.
 *
 * The card is created at its LANDING size and centred on the hex, so a frame is simply a translate
 * from the hand plus a scale. `p < landEnd` is the flight (from the hand's own size to the landing
 * size, arriving with the curve's overshoot); from `landEnd` on, every frame is `strikeLook(p)`
 * exactly — the same scale curve, the same tiny lift, the same fade-out as the replay. Reduce motion
 * never reaches this builder (the caller fades instead).
 */
export const strikeFlightFrames = (o: { dx: number; dy: number; startScale: number; liftPx: number }): StrikeFrame[] => {
  const T = STRIKE_TIMING;
  const stops = [0, T.landEnd * STRIKE_OVERSHOOT_AT, T.landEnd, T.cardOutStart, (T.cardOutStart + T.cardOutEnd) / 2, T.cardOutEnd, 1];
  return stops.map((p) => {
    const look = strikeLook(p);
    if (p < T.landEnd) {
      // the flight: eased travel, the hand's size → the landing size, plus the curve's overshoot
      const land = p / T.landEnd;
      const travel = strikeEase(land);
      const over = land < STRIKE_OVERSHOOT_AT
        ? land / STRIKE_OVERSHOOT_AT
        : 1 - (land - STRIKE_OVERSHOOT_AT) / (1 - STRIKE_OVERSHOOT_AT);
      const scale = o.startScale + (1 - o.startScale) * travel + STRIKE_OVERSHOOT * over;
      // a small arc, read from the curve's own lift (0.5 radii at p = 0, 0 at the landing)
      const arc = o.liftPx * look.card.lift * travel;
      return frameOf(p, o.dx * (1 - travel), o.dy * (1 - travel) - arc, scale, 1);
    }
    return frameOf(p, 0, -o.liftPx * look.card.lift, look.card.scale, look.card.alpha);
  });
};
