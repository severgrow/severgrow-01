import type { KeyValue } from '../../../../server/src/client.js';
import type { ChatContent } from '../../../../server/src/chat/types.js';
import { contentFrom, validId } from '../../../../server/src/chat/rules.js';
export type SavedChatDraft = {
  draft: string;
  outgoing: { content: ChatContent; requestId: string } | null;
};
export type ChatDraftStore = {
  load(): SavedChatDraft;
  save(value: SavedChatDraft): void;
};
const KEY = 'severgrow.matchChat.drafts.v1';
/** Device-local drafts only; bounded to 20 match seats. No tokens, no automatic sends. */
export const chatDraftStore = (
  storage: KeyValue | null,
  matchId: string,
  seat: number,
): ChatDraftStore => {
  const key = `${matchId}:${seat}`;
  const read = (): [string, SavedChatDraft][] => {
    try {
      const rows: unknown = JSON.parse(storage?.get(KEY) ?? '[]');
      if (!Array.isArray(rows)) return [];
      return rows.slice(-20).flatMap((row): [string, SavedChatDraft][] => {
        if (
          !Array.isArray(row) ||
          typeof row[0] !== 'string' ||
          !row[1] ||
          typeof row[1].draft !== 'string'
        )
          return [];
        const saved = row[1];
        let outgoing: SavedChatDraft['outgoing'] = null;
        if (saved.outgoing && validId(saved.outgoing.requestId)) {
          try {
            outgoing = {
              requestId: saved.outgoing.requestId,
              content: contentFrom(saved.outgoing.content),
            };
          } catch {
            /* invalid local payload */
          }
        }
        return [[row[0], { draft: saved.draft.slice(0, 560), outgoing }]];
      });
    } catch {
      return [];
    }
  };
  return {
    load: () =>
      read().find(([id]) => id === key)?.[1] ?? { draft: '', outgoing: null },
    save(value) {
      try {
        const rows = read().filter(([id]) => id !== key);
        if (value.draft || value.outgoing) rows.push([key, value]);
        storage?.set(KEY, JSON.stringify(rows.slice(-20)));
      } catch {
        /* Storage restrictions never block play or sending. */
      }
    },
  };
};
