import type { KeyValue } from '../../../../server/src/client.js';
const KEY = 'severgrow.matchChat.read.v1';
/** Device-private unread cursor, no message text or token. Bounded to 50 participant seats. */
export const chatReadCursor = (
  storage: KeyValue | null,
  matchId: string,
  seat: number,
) => {
  const key = `${matchId}:${seat}`;
  const entries = (): [string, number][] => {
    try {
      const parsed: unknown = JSON.parse(storage?.get(KEY) ?? '[]');
      return Array.isArray(parsed)
        ? parsed
            .filter(
              (v): v is [string, number] =>
                Array.isArray(v) &&
                typeof v[0] === 'string' &&
                Number.isSafeInteger(v[1]) &&
                v[1] >= 0,
            )
            .slice(-50)
        : [];
    } catch {
      return [];
    }
  };
  return {
    load: () => entries().find(([id]) => id === key)?.[1] ?? 0,
    save: (sequence: number) => {
      try {
        storage?.set(
          KEY,
          JSON.stringify(
            [...entries().filter(([id]) => id !== key), [key, sequence]].slice(
              -50,
            ),
          ),
        );
      } catch {
        /* private browsing: unread still works for this session */
      }
    },
  };
};
