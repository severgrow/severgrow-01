// NO PURE WHITE (owner, 2026-11-08: "no white anywhere in game, create off white color close to white but
// a bit cream and replace anything that is white with it and make sure future changes apply to it too").
// Every white the player sees is this warm off-white. web/tests/off-white.test.ts scans the game's
// source and fails on any pure white (#fff, #ffffff, white, rgb(255,255,255)), except a MASK, where white
// means "fully shown", not a colour.
export const OFF_WHITE = '#f2ede4';
/** The same colour as an rgb triplet, for rgba(...). */
export const OFF_WHITE_RGB = '242, 237, 228';
