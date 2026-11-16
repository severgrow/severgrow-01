// READY TRAINING TICKETS (owner, 2026-11-13: "after going to play offline/practice match/hard it takes
// few seconds to start ... it should be way quicker and snappy").
//
// A Practice game that can pay Seeds is dealt from a server-issued Training ticket (its seed), and the
// start used to WAIT for that round trip (up to 3 s, 8 s for a new guest) before the board appeared.
// Now a ticket is fetched AHEAD and taken at the tap, so the deal starts at once. Bounded and reusable:
//   * one ticket per (tier, tier level): opening the menu again or switching tier fetches nothing, and
//     a tier whose level moves keeps the old level's ticket for when it comes back (nothing is wasted,
//     so the server's ticket budget is spent at about one per game, exactly as before);
//   * a ticket belongs to the ACCOUNT that was issued it: another player's ticket is never used (the
//     server would refuse its proof) and is dropped; sign-out clears the shelf (signout-reset.ts);
//   * expired tickets are dropped, never used. With no ready ticket the start waits as it always did.
import type { KeyValue } from '../../../server/src/client.js';

export const TICKET_SHELF_KEY = 'severgrow.seeds.ticket-shelf.v1';
/** A ticket this close to its expiry is not used (the proof is sent after the game). */
const EXPIRY_MARGIN_MS = 60 * 60_000;

export type ShelfTicket = {
  playerId: string; tier: string; tierLevel: number; botLevel: number; id: string; seed: number; expiresAt: number;
};
export type ShelfWant = { tier: string; tierLevel: number };

const read = (kv: KeyValue | null): ShelfTicket[] => {
  try {
    const parsed = JSON.parse(kv?.get(TICKET_SHELF_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is ShelfTicket => !!t && typeof t === 'object' && typeof (t as ShelfTicket).id === 'string'
        && typeof (t as ShelfTicket).playerId === 'string' && Number.isSafeInteger((t as ShelfTicket).seed)
        && Number.isInteger((t as ShelfTicket).botLevel) && typeof (t as ShelfTicket).tier === 'string'
        && Number.isInteger((t as ShelfTicket).tierLevel) && Number.isFinite((t as ShelfTicket).expiresAt))
      : [];
  } catch { return []; }
};
const write = (kv: KeyValue | null, tickets: ShelfTicket[]): void => {
  try { kv?.set(TICKET_SHELF_KEY, JSON.stringify(tickets)); } catch { /* storage blocked: the start waits as before */ }
};
/** This player's tickets that can still be used. */
const usable = (kv: KeyValue | null, playerId: string, now: number) =>
  read(kv).filter((t) => t.playerId === playerId && t.expiresAt > now + EXPIRY_MARGIN_MS);

/** Take (and remove) this player's ready ticket for this tier at this level, or null. */
export const takeShelfTicket = (kv: KeyValue | null, playerId: string | null, tier: string, tierLevel: number, now = Date.now()): ShelfTicket | null => {
  if (!playerId) return null;
  const mine = usable(kv, playerId, now);
  const at = mine.findIndex((t) => t.tier === tier && t.tierLevel === tierLevel);
  const taken = at >= 0 ? mine.splice(at, 1)[0]! : null;
  // Another player's tickets and expired ones go with this write.
  write(kv, mine);
  return taken;
};

/**
 * TAKE A TICKET NOW, OR SHORTLY (owner, 2026-11-15: "find a way for it to be instant ... its just
 * offline practice match, shouldnt me loading long").
 *
 * The deal is played from a ticket's seed — the server replays the proof from `ticket.seed`
 * (`server/src/seeds/service.ts`, `verifyTrainingProof`) — so a ticket must be in hand BEFORE the
 * board is dealt, or the win cannot be paid. This is the one call the tap makes: the ticket if the
 * shelf has it (no network at all), otherwise the remainder of the fill that already started at
 * boot / when the Practice picker opened. `fillTicketShelf` is single-flight per (account, tier,
 * level), so this never posts a second request for a ticket already on its way — the tap waits on
 * the EARLIEST request, not a fresh one.
 *
 * Never throws, never waits longer than `deadlineMs`. A fill that loses the race keeps running and
 * leaves its ticket on the shelf for the next match, so a slow network wastes nothing.
 */
export const ensureShelfTicket = async (
  kv: KeyValue | null,
  playerId: string | null,
  want: ShelfWant,
  pick: (tierLevel: number) => number,
  request: (botLevel: number) => Promise<{ id: string; seed: number; playerId: string; expiresAt?: number } | null>,
  deadlineMs: number,
  now = Date.now(),
): Promise<ShelfTicket | null> => {
  const ready = takeShelfTicket(kv, playerId, want.tier, want.tierLevel, now);
  if (ready || !playerId) return ready;
  const fill = fillTicketShelf(kv, playerId, [want], pick, request, now).catch(() => undefined);
  await Promise.race([
    fill,
    new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, deadlineMs))),
  ]);
  return takeShelfTicket(kv, playerId, want.tier, want.tierLevel, now);
};

/** The wanted (tier, level) pairs this player has no usable ticket for. */
export const shelfNeeds = (kv: KeyValue | null, playerId: string, wanted: readonly ShelfWant[], now = Date.now()): ShelfWant[] => {
  const mine = usable(kv, playerId, now);
  return wanted.filter((w) => !mine.some((t) => t.tier === w.tier && t.tierLevel === w.tierLevel));
};

/** Fills already on their way, by `${playerId}:${tier}:${tierLevel}` — shared, never duplicated. */
const inFlight = new Map<string, Promise<void>>();
/**
 * Fetch a ticket for each wanted (tier, level) this player has none for, one request per pair at a
 * time, never throwing. `request` issues a ticket for a bot level and says whose it is; `pick` chooses
 * the bot for the tier's level (Hard rotates the rivals in, logic/difficulty.ts opponentFor).
 *
 * A pair already being fetched is AWAITED, not skipped: the tap joins the request that the boot or the
 * Practice picker started (`ensureShelfTicket`), and a caller that only started the fill ignores the
 * wait. Skipping it instead made that caller resolve with no ticket at all — an unpaid match.
 */
export const fillTicketShelf = async (
  kv: KeyValue | null,
  playerId: string | null,
  wanted: readonly ShelfWant[],
  pick: (tierLevel: number) => number,
  request: (botLevel: number) => Promise<{ id: string; seed: number; playerId: string; expiresAt?: number } | null>,
  now = Date.now(),
): Promise<void> => {
  if (!playerId) return;
  await Promise.all(shelfNeeds(kv, playerId, wanted, now).map(async (need) => {
    const key = `${playerId}:${need.tier}:${need.tierLevel}`;
    const running = inFlight.get(key);
    if (running) return running;
    const started = (async () => {
      try {
        const botLevel = pick(need.tierLevel);
        const ticket = await request(botLevel).catch(() => null);
        // Issued to someone else (the account changed while it was on its way): not this shelf's.
        if (!ticket || ticket.playerId !== playerId) return;
        const kept = read(kv).filter((t) => !(t.playerId === playerId && t.tier === need.tier && t.tierLevel === need.tierLevel));
        write(kv, [...kept, { playerId, ...need, botLevel, id: ticket.id, seed: ticket.seed, expiresAt: ticket.expiresAt ?? now + 6 * 86_400_000 }]);
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, started);
    return started;
  }));
};
