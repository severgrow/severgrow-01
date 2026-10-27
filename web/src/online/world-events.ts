// Events the Territory screen tells the rest of the page about, without knowing who listens.

/** Dispatched on `document` after a tile is grown (claimed) on the map; detail `{ cellId }`. */
export const WORLD_CLAIMED_EVENT = 'futasaku:world-claimed';
