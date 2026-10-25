import type { ChatDraftStore } from './draft-store.js';
import type { DuelClient } from '../../../../server/src/client.js';
import type {
  ChatContent,
  ChatMessage,
  ChatResult,
} from '../../../../server/src/chat/types.js';
import type { MatchChannel, MatchDriverSnapshot } from '../types.js';
export type Outgoing = {
  content: ChatContent;
  requestId: string;
  state: 'pending' | 'failed';
  code: string | null;
};
export type ChatState = {
  messages: ChatMessage[];
  outgoing: Outgoing | null;
  draft: string;
  unread: number;
  unreadFrom: number | null;
  open: boolean;
  loading: boolean;
  error: boolean;
  ready: boolean;
  canSend: boolean;
  muted: boolean;
  blocked: boolean;
  blockedByMe: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  preview: ChatMessage | null;
};
type Client = Pick<DuelClient, 'chatHistory' | 'chatSend' | 'chatAction'>;
export const createChatController = (o: {
  client: Client;
  token: string;
  matchId: string;
  channel: MatchChannel;
  snapshot: () => MatchDriverSnapshot;
  onChange: (state: ChatState) => void;
  draftStore?: ChatDraftStore;
  readCursor?: { load: () => number; save: (sequence: number) => void };
}) => {
  const saved = o.draftStore?.load();
  const state: ChatState = {
    messages: [],
    outgoing: saved?.outgoing
      ? { ...saved.outgoing, state: 'failed', code: null }
      : null,
    draft: saved?.draft ?? '',
    unread: 0,
    unreadFrom: null,
    open: false,
    loading: false,
    error: false,
    ready: false,
    canSend: false,
    muted: false,
    blocked: false,
    blockedByMe: false,
    hasOlder: false,
    hasNewer: false,
    preview: null,
  };
  const persistDraft = () =>
    o.draftStore?.save({
      draft: state.draft,
      outgoing: state.outgoing
        ? {
            content: state.outgoing.content,
            requestId: state.outgoing.requestId,
          }
        : null,
    });
  const abort = new AbortController();
  let readThrough = o.readCursor?.load() ?? 0;
  let stopped = false,
    initial = true,
    cursor = 0,
    refreshing = false,
    dirty = false,
    mutation = false;
  let turnRevision = -1,
    generation = 0;
  let unsubscribe: (() => void) | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null,
    lastHint = 0;
  const emit = () => {
    if (!stopped) o.onChange({ ...state, messages: [...state.messages] });
  };
  const syncTurn = () => {
    const s = o.snapshot();
    state.canSend =
      state.ready &&
      !state.blocked &&
      s.status === 'active' &&
      s.serverPhase !== 'GAME_OVER' &&
      s.view.actor !== s.seat &&
      s.turnStartRevision === turnRevision &&
      s.connection === 'online' &&
      (s.remainingMs === null || s.remainingMs > 0);
  };
  const apply = (r: ChatResult, older = false) => {
    if (stopped) return;
    const known = new Set(state.messages.map((m) => m.id));
    const fresh = r.messages.filter((m) => !known.has(m.id));
    if (!older) {
      const incoming = fresh.filter(
        (m) => !m.mine && m.sequence > Math.max(cursor, readThrough),
      );
      if (incoming.length && ((!state.open && state.unread === 0) || initial))
        state.unreadFrom = incoming[0]!.sequence;
      if (!state.open) state.unread += incoming.length;
      if (!initial && incoming.length && !state.open && !r.muted && !r.blocked)
        state.preview = incoming.at(-1)!;
    }
    if (
      state.outgoing &&
      [...r.messages, ...(r.sent ? [r.sent] : [])].some(
        (m) => m.mine && m.requestId === state.outgoing!.requestId,
      )
    ) {
      if (
        state.outgoing.content.text !== null &&
        state.draft.trim().normalize('NFC') ===
          state.outgoing.content.text.normalize('NFC')
      )
        state.draft = '';
      state.outgoing = null;
      persistDraft();
    }
    const combined = new Map(
      [...state.messages, ...r.messages, ...(r.sent ? [r.sent] : [])].map(
        (m) => [m.id, m],
      ),
    );
    const sorted = [...combined.values()].sort(
      (a, b) => a.sequence - b.sequence,
    );
    // Bounded DOM/memory. Loading older pages drops newer cached rows; cursor remains high-water.
    state.messages = older ? sorted.slice(0, 160) : sorted.slice(-160);
    if (!older)
      cursor = Math.max(
        cursor,
        ...r.messages.map((m) => m.sequence),
        r.sent?.sequence ?? 0,
      );
    state.hasNewer = (state.messages.at(-1)?.sequence ?? 0) < cursor;
    if (initial || older) state.hasOlder = r.hasMore;
    if (!older && sorted.length > 160) state.hasOlder = true;
    state.muted = r.muted;
    state.blocked = r.blocked;
    state.blockedByMe = r.blockedByMe;
    if (r.muted || r.blocked) state.preview = null;
    if (state.open) {
      readThrough = cursor;
      o.readCursor?.save(cursor);
    }
    turnRevision = o.snapshot().turnStartRevision;
    state.ready = true;
    state.error = false;
    syncTurn();
  };
  const refresh = async () => {
    if (stopped) return;
    if (refreshing || mutation) {
      dirty = true;
      return;
    }
    refreshing = true;
    state.loading = true;
    emit();
    try {
      do {
        dirty = false;
        const requestedGeneration = generation;
        const r = await o.client.chatHistory(
          o.token,
          o.matchId,
          initial ? {} : { after: cursor },
          abort.signal,
        );
        if (stopped) return;
        if (requestedGeneration !== generation) {
          dirty = true;
          if (mutation) break;
          continue;
        }
        const latestPage = initial;
        apply(r);
        initial = false;
        if (!latestPage && r.hasMore && r.messages.length) dirty = true;
      } while (dirty && !stopped);
    } catch {
      if (!stopped) {
        state.error = true;
        state.ready = false;
        syncTurn();
      }
    } finally {
      refreshing = false;
      state.loading = false;
      emit();
    }
  };
  const hint = () => {
    if (stopped || hintTimer) return;
    const delay = Math.max(0, 1000 - (Date.now() - lastHint));
    if (delay === 0) {
      lastHint = Date.now();
      void refresh();
    } else
      hintTimer = setTimeout(() => {
        hintTimer = null;
        lastHint = Date.now();
        void refresh();
      }, delay);
  };
  const flushDirty = () => {
    if (dirty && !stopped) void refresh();
  };
  const send = async (content?: ChatContent) => {
    syncTurn();
    if (
      stopped ||
      !state.canSend ||
      mutation ||
      state.outgoing?.state === 'pending'
    )
      return;
    if (!state.outgoing) {
      const body = content ?? { text: state.draft.trim(), phrase: null };
      if (body.text !== null && !body.text.trim()) return;
      state.outgoing = {
        content: body,
        requestId: crypto.randomUUID(),
        state: 'pending',
        code: null,
      };
    } else state.outgoing.state = 'pending';
    const outgoing = state.outgoing;
    persistDraft();
    generation++;
    mutation = true;
    emit();
    try {
      const r = await o.client.chatSend(
        o.token,
        o.matchId,
        outgoing.content,
        outgoing.requestId,
        turnRevision,
        abort.signal,
      );
      if (stopped) return;
      apply(r);
      if (
        outgoing.content.text !== null &&
        state.draft.trim() === outgoing.content.text
      )
        state.draft = '';
      state.outgoing = null;
    } catch (error) {
      if (stopped) return;
      outgoing.state = 'failed';
      outgoing.code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : null;
      // Refresh turn/policy after rejection; keep the draft and stable request ID for explicit retry.
      dirty = true;
    } finally {
      mutation = false;
      if (!stopped) persistDraft();
      emit();
      flushDirty();
    }
  };
  const action = async (
    kind: 'mute' | 'block' | 'report',
    body:
      | { value: boolean }
      | { messageId: string; reason: 'abuse' | 'spam' | 'other' },
  ) => {
    if (stopped || mutation) return false;
    generation++;
    mutation = true;
    try {
      const r = await o.client.chatAction(
        o.token,
        o.matchId,
        kind,
        body,
        abort.signal,
      );
      if (stopped) return false;
      apply(r);
      return true;
    } catch {
      if (!stopped) state.error = true;
      return false;
    } finally {
      mutation = false;
      emit();
      flushDirty();
    }
  };
  return {
    state: () => state,
    start() {
      unsubscribe = o.channel.subscribe(o.matchId, {
        onPing: () => undefined,
        onPresence: () => undefined,
        onChat: hint,
        onReconnect: () => void refresh(),
      });
      void refresh();
    },
    stop() {
      stopped = true;
      if (hintTimer) clearTimeout(hintTimer);
      abort.abort();
      unsubscribe?.();
      unsubscribe = null;
      state.messages = [];
      state.draft = '';
      state.outgoing = null;
    },
    turnChanged() {
      const prev = turnRevision;
      if (state.ready) turnRevision = o.snapshot().turnStartRevision;
      syncTurn();
      emit();
      if (o.snapshot().turnStartRevision !== prev) void refresh();
    },
    refresh,
    setOpen(value: boolean) {
      state.open = value;
      state.preview = null;
      if (value) {
        if (state.unread === 0) state.unreadFrom = null;
        state.unread = 0;
        readThrough = cursor;
        o.readCursor?.save(cursor);
      }
      emit();
      if (value) void refresh();
    },
    draft(value: string) {
      state.draft = value;
      persistDraft();
    },
    dismissPreview() {
      state.preview = null;
      emit();
    },
    discard() {
      if (state.outgoing?.state === 'failed') {
        state.outgoing = null;
        persistDraft();
        emit();
      }
    },
    send,
    action,
    async latest() {
      if (refreshing || mutation || stopped) return;
      refreshing = true;
      state.loading = true;
      emit();
      try {
        const requestedGeneration = generation;
        const r = await o.client.chatHistory(
          o.token,
          o.matchId,
          {},
          abort.signal,
        );
        if (stopped) return;
        if (requestedGeneration !== generation) {
          dirty = true;
          return;
        }
        state.messages = [];
        apply(r);
        state.hasOlder = r.hasMore;
      } catch {
        if (!stopped) state.error = true;
      } finally {
        refreshing = false;
        state.loading = false;
        emit();
        flushDirty();
      }
    },
    async older() {
      if (refreshing || mutation || stopped || !state.messages.length) return;
      refreshing = true;
      state.loading = true;
      emit();
      try {
        const requestedGeneration = generation;
        const r = await o.client.chatHistory(
          o.token,
          o.matchId,
          { before: state.messages[0]!.sequence },
          abort.signal,
        );
        if (requestedGeneration !== generation) {
          dirty = true;
          return;
        }
        apply(r, true);
      } catch {
        if (!stopped) state.error = true;
      } finally {
        refreshing = false;
        state.loading = false;
        emit();
        flushDirty();
      }
    },
  };
};
export type ChatController = ReturnType<typeof createChatController>;
