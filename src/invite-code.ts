// The two code lengths: ONE source of truth each, read by BOTH the server (server/src/config.ts,
// which re-exports them as `inviteCodeLength` / `linkCodeLength`) and the player-facing format hints
// (src/strings.ts). Deliberately dependency-free so the shared copy module (src/strings.ts) needs no
// engine or server imports for two numbers — and so the two layers can never disagree.
//
// The two concepts are DIFFERENT and must never share a constant:
//
//   * INVITE_CODE_LENGTH (4) — a MATCH INVITE code. It is shared and read aloud/typed to join a
//     friend's private duel. Guessing one only lets a stranger join somebody's duel: low harm. A
//     short code is still safe because invite codes are PERMANENT (the unique index on
//     `matches.invite_code` spans every match ever created — a finished duel never releases its
//     code), so it depends on the bounded collision retry in `MatchService` (see docs/BACKEND.md).
//
//   * LINK_CODE_LENGTH (8) — a DEVICE LINK code (the Settings "Use my matches on another browser"
//     path). Redeeming one mints a NEW TOKEN FOR ANOTHER PLAYER: full account takeover of that
//     player and every match they own. High harm, so it must NOT be shortened. There is also no
//     upside to shortening it — a link code is generated and entered once, on the same device, by
//     copy/paste. Nobody reads it aloud, so readability buys nothing and only weakens the secret.
//
// To lengthen either code later, change the value HERE — the server config and the matching hint
// both derive from these constants.
export const INVITE_CODE_LENGTH = 4;
export const LINK_CODE_LENGTH = 8;
