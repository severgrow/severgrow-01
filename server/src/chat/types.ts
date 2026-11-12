/** Public chat contract. No sender identities or private engine state leave the API. */
export const QUICK_PHRASES = ['good-luck', 'nice-move', 'gg'] as const;
export type QuickPhrase = (typeof QUICK_PHRASES)[number];
export type ChatContent =
  | { text: string; phrase: null }
  | { text: null; phrase: QuickPhrase };
export type ChatMessage = ChatContent & {
  id: string;
  sequence: number;
  mine: boolean;
  createdAt: number;
  requestId: string;
};
export type ChatPage = {
  messages: ChatMessage[];
  hasMore: boolean;
  canSend: boolean;
  turnRevision: number;
  muted: boolean;
  /** The other participant muted chat for this match. The fact only, no reason or timestamp. */
  opponentMuted: boolean;
  blocked: boolean;
  blockedByMe: boolean;
};
export type ChatOperation =
  | { kind: 'history'; after?: number; before?: number }
  | {
      kind: 'send';
      content: ChatContent;
      requestId: string;
      turnRevision: number;
    }
  | { kind: 'mute'; value: boolean }
  | { kind: 'block'; value: boolean }
  | { kind: 'report'; messageId: string; reason: 'abuse' | 'spam' | 'other' };
export type ChatResult = ChatPage & { sent?: ChatMessage };
export type ChatStore = {
  execute(
    playerId: string,
    matchId: string,
    operation: ChatOperation,
    now: number,
  ): Promise<ChatResult>;
};
