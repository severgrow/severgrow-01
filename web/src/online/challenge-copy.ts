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
 *
 * 2026-10-28 pass, owner's words: "i accepted the territory challenge, but i had to pay 50 seeds too
 * — only challenging player should be paying 50 — the defending one have to be saying 'respond to
 * keep your tile in 23:59 (timer)'". The ledger was already right (the defender is never debited);
 * the sheet was not: it printed the challenger's stake above ACCEPT, which reads as a price.
 *
 * So the two sides now speak differently, because they are doing different things:
 *   - THE CHALLENGER paid 50 Seeds. Their lines say so (`sendLine`, `sendMeta`, `sent`) and their
 *     confirm sheet still shows the amount that is in play (`stakeOnly`).
 *   - THE DEFENDER pays nothing, ever. Their sheet is about time, not money: the countdown is the
 *     news, the tile is what is at risk, and the one action is to answer. No defender-facing string
 *     may carry a figure + "Seeds" — `web/tests/territory-defender-copy.test.ts` enforces it.
 *   - AT ZERO the server forfeits the tile to the challenger (`expireChallenges`), so instead of
 *     still asking for an answer the sheet says exactly that (`deadlineLine`), and the defender is
 *     never told they were charged (`defendMeta`).
 */
export const CHALLENGE = Object.freeze({
  title: 'Territory challenge',
  listLabel: 'Challenges',
  incoming: 'INCOMING',
  outgoing: 'OUTGOING',
  /** the challenger's sheet: who holds it and what it costs, then one key */
  sendLine: (name: string, stake: number) => `${name} holds this ground. Challenge it for ${stake} Seeds?`,
  sendKey: 'CHALLENGE',
  /** The tile bar's key on contested ground: it opens that challenge's own sheet. */
  viewKey: 'VIEW CHALLENGE',
  /**
   * The DEFENDER's sheet: who challenged the tile, and the live countdown — the thing they have to
   * answer. The countdown is passed in already floored by `remainingLabel`, and the sheet re-reads it
   * every second while it is open, so it ticks. Nothing here is a price.
   */
  defendLine: (name: string, left: string) => `${name} challenged your tile. Answer within ${left} to keep it.`,
  /**
   * The defender's meta line: the one fact the owner's report was actually about. They are never
   * charged; only the challenger escrows Seeds. Uppercase because the sheet's meta line is set in
   * caps, and deliberately number-free so it can never be read as an amount.
   */
  defendMeta: 'NO SEEDS TO PAY',
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
  /**
   * The deadline itself, when it has passed with no answer. This sentence is the server's rule
   * (`expireChallenges`: the tile moves to the challenger, their own stake returns, the defender is
   * never charged). `web/tests/territory-defender-copy.test.ts` fails if the two ever disagree.
   */
  deadlineLine: (name: string) => `The deadline passed. ${name} takes this ground.`,
  /** The challenger's offer's meta line: what they paid and the answer window. */
  sendMeta: (stake: number) => `${stake} SEEDS · 24 H TO ANSWER`,
  /**
   * The CHALLENGER's confirm meta: the amount they escrowed is the news there. The defender's
   * confirm sheet uses `defendMeta` instead — they never had a stake to read back.
   */
  stakeOnly: (stake: number) => `${stake} SEEDS`,
  /** The rail's cap: anything past it is counted, never silently dropped. */
  more: (count: number) => `+${count} MORE`,
  /** A polite screen-reader line for a player who cannot see the rail appear. */
  incomingAnnounce: (name: string) => `${name} challenged your ground.`,
  /** The menu key's spoken line, without the challenger's name (the menu has not read it). */
  incomingAnnounceCount: (count: number) => (count === 1
    ? '1 challenge is waiting for your answer.'
    : `${count} challenges are waiting for your answer.`),
  /** The crossed swords on a contested tile: the glyph's one spoken name, who and which side. */
  markerFrom: (name: string) => `Challenge on this tile. ${name} challenged you.`,
  markerTo: (name: string) => `Challenge on this tile. You challenged ${name}.`,
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
