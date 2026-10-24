/**
 * Territory challenge copy (docs/TERRITORY-CHALLENGES.md).
 *
 * It lives in the online layer, beside `seed-icon.ts`, because the product calls the currency by its
 * own word — the same word the Territory wallet already shows. `src/strings.ts` is scanned by
 * `web/tests/seed-words.test.ts`, which keeps the retired seed/plant vocabulary out of the game's
 * shared strings; the currency label has always lived on this side of that boundary.
 *
 * One sentence per state, one primary key, and the same words on the map, the sheet and the list.
 *
 * 2026-10-24 pass, owner's words: "dont say 'staked' just challenged you - make it cost 50 seeds no
 * 100 - simple vocab everywhere easy to understand at first glance". So:
 *   - "staked" is gone from every line. One player *challenges* your ground; that is the whole idea
 *     and it is a word everyone already knows.
 *   - no cell coordinates: "3,-10" is the machine's name for the ground, not a sentence.
 *   - short sentences, one idea each, and the stake is always read from the world's own price.
 */
export const CHALLENGE = Object.freeze({
  title: 'Territory challenge',
  listLabel: 'Challenges',
  incoming: 'INCOMING',
  outgoing: 'OUTGOING',
  /** the challenger's sheet: who holds it and what it costs, then one key */
  sendLine: (name: string, stake: number) => `${name} holds this ground. Challenge it for ${stake} Seeds?`,
  sendKey: 'CHALLENGE',
  /** the defender's sheet: who challenged you and what is at stake, then ACCEPT / DECLINE */
  defendLine: (name: string, stake: number) => `${name} challenged you for this ground. ${stake} Seeds on it. Answer?`,
  acceptKey: 'ACCEPT',
  declineKey: 'DECLINE',
  /** Declining is the one irreversible key: the first press only arms it. */
  declineConfirm: 'TAP AGAIN TO DECLINE',
  waitLine: (name: string) => `You challenged ${name}. They have 24 h to answer.`,
  duelLine: 'Win the duel, take the ground.',
  openDuelKey: 'OPEN DUEL',
  confirmLine: (name: string) => `${name} won the duel. Take the ground?`,
  drawLine: 'A draw. The ground stays where it is.',
  drawKey: 'CONFIRM DRAW',
  takeKey: 'TAKE THE GROUND',
  resolvedLine: (name: string | null) => (name ? `${name} took this ground.` : 'The ground stayed where it was.'),
  closedLine: 'This challenge is over.',
  notNow: 'NOT NOW',
  close: 'CLOSE',
  remaining: (left: string) => `${left} left`,
  stakeMeta: (stake: number, left: string) => `${stake} SEEDS · ${left} LEFT`,
  /** The offer's meta line: what it costs and the one thing it buys. */
  sendMeta: (stake: number) => `${stake} SEEDS · 24 H TO ANSWER`,
  /** The confirm's meta line: the stake is already committed, so only the amount is news. */
  stakeOnly: (stake: number) => `${stake} SEEDS`,
  /** The rail's cap: anything past it is counted, never silently dropped. */
  more: (count: number) => `+${count} MORE`,
  /** A polite screen-reader line for a player who cannot see the rail appear. */
  incomingAnnounce: (name: string) => `${name} challenged your ground.`,
  /** The menu key's spoken line, without the challenger's name (the menu has not read it). */
  incomingAnnounceCount: (count: number) => (count === 1
    ? '1 challenge is waiting for your answer.'
    : `${count} challenges are waiting for your answer.`),
  noFunds: (stake: number) => `You need ${stake} Seeds to challenge.`,
  busy: 'Someone already challenged this ground.',
  sendFailed: 'The challenge did not send. No Seeds were taken.',
  answerFailed: 'That answer did not send. Try again.',
  confirmFailed: 'That result is not confirmed yet. Try again.',
  settled: 'The ground is yours.',
  resultSettled: 'The result is settled.',
  alreadySettled: 'That result was already confirmed.',
  sent: (stake: number) => `Challenge sent. Your ${stake} Seeds are held until they answer.`,
  duel: 'DUEL',
  ready: 'READY TO CLAIM',
  settledShort: 'SETTLED',
  forfeited: 'FORFEITED',
  stale: 'STALE',
  closedShort: 'CLOSED',
  declinedShort: 'DECLINED',
} as const);
