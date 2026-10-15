// A short, permanent tag that tells two players with the same nature name apart: "MapleFox #7QK2".
// Derived from the player id (never stored, never chosen), so it is the same on every device and
// never changes. Pure: shared by the server and the web app.

/** Crockford base32 without I, L, O, U — no look-alike characters. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const PLAYER_TAG_LENGTH = 4;
export const PLAYER_TAG_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}$/;

/** "7QK2" for a player id. 32^4 ≈ 1M tags per nature name. */
export const playerTag = (playerId: string): string => {
  let h = 2166136261;
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  let out = '';
  for (let i = 0; i < PLAYER_TAG_LENGTH; i++) {
    out += ALPHABET[h % 32];
    h = Math.floor(h / 32);
  }
  return out;
};

/** "MapleFox #7QK2"; a name with no id stays as it is. */
export const taggedName = (name: string, playerId: string | null | undefined): string =>
  playerId ? `${name} #${playerTag(playerId)}` : name;
