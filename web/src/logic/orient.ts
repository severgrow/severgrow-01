// Step 3 item 1: the board's orientation on screen. The engine's hex grid is drawn with its
// points facing left and right ("pointy" hexes, the old look) or rotated 90 degrees so the
// points face up and down ("flat" hexes), whichever gives bigger tiles for the screen. A pure
// rendering mapping: board units (the old pointy layout) to screen units and back. Text,
// landmarks, textures and the light stay upright: everything is drawn in screen units.
export type Orient = 'pointy' | 'flat';

let cur: Orient = 'pointy';
export const getOrient = (): Orient => cur;
export const setOrient = (o: Orient) => {
  cur = o;
};

/** Board units (pointy layout) to screen units: flat turns the picture a quarter turn. */
export const toScreen = (x: number, y: number) => (cur === 'pointy' ? { x, y } : { x: y + 0, y: -x + 0 });
/** Screen units back to board units. */
export const toBoard = (x: number, y: number) => (cur === 'pointy' ? { x, y } : { x: -y + 0, y: x + 0 });
