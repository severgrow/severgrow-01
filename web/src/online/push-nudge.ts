// A cheap "look now" for the server's push decision. Fire-and-forget by construction: the caller
// never awaits it on a turn, a render or a tap's success path, and every failure is swallowed.
//
// Why a throttle: the duel polls every ~2 s. Without one, every poll would be a request. One look
// per 20 s is far more than enough (the server dedupes the events anyway), and it never stacks.
import type { DuelClient } from '../../../server/src/client.js';

export type PushNudger = Readonly<{ nudge: () => void }>;

export const createPushNudger = (deps: {
  send: () => Promise<unknown>;
  now?: () => number;
  gapMs?: number;
}): PushNudger => {
  const now = deps.now ?? (() => Date.now());
  const gapMs = deps.gapMs ?? 20_000;
  let last = Number.NEGATIVE_INFINITY;
  let inFlight = false;
  return {
    nudge() {
      const at = now();
      if (inFlight || at - last < gapMs) return;
      last = at;
      inFlight = true;
      void deps.send()
        .catch(() => undefined)
        .finally(() => { inFlight = false; });
    },
  };
};

// One throttled nudger per client object. A duel and the lobby each have their own client, so each
// gets its own cheap budget; the server's per-player limit remains the real control. The token is
// held mutably: a link-code sign-in replaces the identity on the SAME client, and the next look must
// use the new token, never the old account's.
const nudgers = new WeakMap<object, { token: string | null; nudger: PushNudger }>();

export const nudgePush = (client: DuelClient, token: string | null): void => {
  if (!token) return;
  let holder = nudgers.get(client);
  if (!holder) {
    const created = { token, nudger: null as unknown as PushNudger };
    created.nudger = createPushNudger({
      send: () => (created.token ? client.pushNudge(created.token) : Promise.resolve(0)),
    });
    holder = created;
    nudgers.set(client, holder);
  }
  holder.token = token;
  holder.nudger.nudge();
};
