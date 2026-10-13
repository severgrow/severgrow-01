// The invite-code length: ONE source of truth, read by BOTH the server (server/src/config.ts,
// which re-exports it as `inviteCodeLength`) and the player-facing format hint (src/strings.ts).
// Deliberately dependency-free so the shared copy module (src/strings.ts) needs no engine or
// server imports for one number — and so the two can never disagree.
//
// Codes are PERMANENT: the unique index on `matches.invite_code` spans every match ever created (a
// finished duel never releases its code), so short codes are only safe together with the bounded
// collision retry in `MatchService` (see docs/BACKEND.md). To lengthen the codes later, change
// THIS value — the server config and the hint both derive from it.
export const INVITE_CODE_LENGTH = 4;
