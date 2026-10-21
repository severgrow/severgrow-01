// ONE lobby action at a time (0.6 polish).
//
// The duel server already ignores a duplicate find/create/join request, but the client used to send
// it: two taps on "Find opponent", "Create a duel" or "Join" dispatched two requests, because the
// only thing stopping the second was the first one settling. This guard is the client half of the
// rule: while a request is in flight the next tap is refused before it can reach the network, the
// control paints a pending state through `onPending`, and the lock is released on success, failure
// and timeout (a hung request must not leave the lobby dead until a reload).
//
// It is deliberately DOM-free and timer-injectable through the normal globals, so its behaviour is
// proved in web/tests/lobby-action-guard.test.ts without a browser. `lobby-ui.ts` owns the paint.
export type LobbyActionOutcome<T> =
  | { started: false }
  | { started: true; value: T; timedOut?: false }
  | { started: true; timedOut: true };

export type LobbyActionOptions = {
  /** How long a request may hold the lobby before the guard releases it. */
  timeoutMs?: number;
};

export type LobbyActionGuard = {
  /**
   * Run `task` unless another lobby action is already in flight. Refusing is not an error: the
   * caller's UI is already showing the first action's pending state, and no request was sent.
   */
  run<T>(action: string, task: () => Promise<T>, options?: LobbyActionOptions): Promise<LobbyActionOutcome<T>>;
  /** True while any action holds the guard. */
  isBusy(): boolean;
  /** The action that holds the guard, or null. */
  current(): string | null;
};

export type LobbyActionGuardOptions = {
  /** Called with the action as it starts, and null once it settles (or times out). */
  onPending?: (action: string | null) => void;
  /** Default hold before a hung request is abandoned; a single call may override it. */
  timeoutMs?: number;
};

const TIMEOUT = Symbol('lobby action timeout');
/** A find/create/join is a short request; 20s is far past any healthy round trip. */
const DEFAULT_TIMEOUT_MS = 20_000;

export const createLobbyActionGuard = (options: LobbyActionGuardOptions = {}): LobbyActionGuard => {
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let current: string | null = null;
  // Every run owns a token; releasing invalidates it, so a late settlement of an abandoned request
  // can never release (or re-paint) a newer action.
  let token = 0;

  const release = (mine: number, timer: ReturnType<typeof setTimeout> | undefined): boolean => {
    if (mine !== token) return false;
    token += 1;
    current = null;
    if (timer !== undefined) clearTimeout(timer);
    options.onPending?.(null);
    return true;
  };

  return {
    isBusy: () => current !== null,
    current: () => current,
    async run<T>(action: string, task: () => Promise<T>, runOptions: LobbyActionOptions = {}): Promise<LobbyActionOutcome<T>> {
      if (current !== null) return { started: false };
      const mine = ++token;
      current = action;
      options.onPending?.(action);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(TIMEOUT), runOptions.timeoutMs ?? defaultTimeout);
        });
        const value = await Promise.race([task(), timeout]);
        release(mine, timer);
        return { started: true, value };
      } catch (error) {
        const stillMine = release(mine, timer);
        // A timed-out request is not a failure of the lobby: the guard lets go and the caller can
        // try again. A real failure is thrown unchanged so the screen can show its own line.
        if (error === TIMEOUT && stillMine) return { started: true, timedOut: true };
        throw error;
      }
    },
  };
};
