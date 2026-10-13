// The install invitation's memory and its trigger rule. Pure and host-agnostic: the page hands in
// stored text and the outcome of a finished game, and this module says whether to invite. It never
// touches the DOM or storage itself, so the counting rule is unit-tested directly.
//
// COUNTING RULE (one rule, applied to every finished game — offline OR online; the tutorial is
// never counted, because it never calls `finished`):
//   • The invitation is offered on the game-over screen at game 1, but only when the player WON it.
//   • If game 1 was lost or drawn, it is offered at game 2 instead, whatever that game's outcome.
//   • After that it is offered at 5, 10, 15 … games.
// It is never offered twice in one session, never when the app already runs installed, and never
// after the player chooses "Don't show again" (that choice is kept on the device forever).

export type InstallPromptMemory = {
  /** Finished games counted so far (offline + online; never the tutorial). */
  games: number;
  /** True once the invitation has been shown at least once on this device. */
  shown: boolean;
  /** The player chose "Don't show again": never invite again on this device. */
  never: boolean;
};

export const INSTALL_PROMPT_KEY = 'severgrow.install-prompt.v1';

export const EMPTY_INSTALL_PROMPT: InstallPromptMemory = Object.freeze({
  games: 0,
  shown: false,
  never: false,
});

/** The outcome of one finished game, from the human's point of view. */
export type GameOutcome = 'won' | 'lost' | 'draw';

/** Reads a saved memory, repairing anything missing or malformed (never throws). */
export const parseInstallPrompt = (raw: string | null): InstallPromptMemory => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const out: InstallPromptMemory = { ...EMPTY_INSTALL_PROMPT };
  if (!saved || typeof saved !== 'object') return out;
  const rec = saved as Record<string, unknown>;
  const games = rec.games;
  if (typeof games === 'number' && Number.isInteger(games) && games >= 0) out.games = games;
  out.shown = rec.shown === true;
  out.never = rec.never === true;
  return out;
};

export const serializeInstallPrompt = (memory: InstallPromptMemory): string => JSON.stringify(memory);

/** The memory after counting one finished game. Never changes `memory`. */
export const countGame = (memory: InstallPromptMemory): InstallPromptMemory => ({
  ...memory,
  games: memory.games + 1,
});

export type PromptConditions = {
  /** The app already runs installed (standalone): hide forever, whatever the memory says. */
  installed: boolean;
  /** The invitation is already on screen (or was shown) this session: never twice in one session. */
  shownThisSession: boolean;
};

/**
 * Whether the game that was just counted into `after` should raise the invitation.
 * `after.games` is that game's 1-based number; `after.shown` is the saved "shown before" flag.
 */
export const shouldInvite = (
  after: InstallPromptMemory,
  outcome: GameOutcome,
  conditions: PromptConditions,
): boolean => {
  if (conditions.installed || conditions.shownThisSession || after.never) return false;
  const n = after.games;
  if (n === 1) return outcome === 'won';
  if (n === 2) return !after.shown; // only when the first game was lost or drawn
  return n % 5 === 0;
};

/** Which face of the invitation to show, decided only by what the browser can actually do. */
export type InstallVariant = 'native' | 'ios' | 'manual';

/**
 * `native` when the captured `beforeinstallprompt` can open the browser's own dialog (Chrome /
 * Android / desktop Chromium). Otherwise the player gets short instructions: `ios` names the
 * Share icon; `manual` is the generic browser-menu wording. There is never a dead button.
 */
export const installVariant = (usage: { ios: boolean; hasNativePrompt: boolean }): InstallVariant =>
  usage.hasNativePrompt ? 'native' : usage.ios ? 'ios' : 'manual';

/**
 * The invitation's whole memory, with the counting rule applied on each finished game. Both the
 * offline and the online finish paths call `finished()`, so an online-only player is counted too.
 */
export class InstallInvitation {
  private memory: InstallPromptMemory;
  private shownThisSession = false;

  constructor(
    saved: string | null,
    private readonly host: {
      /** True when the app is already installed (checked live, not stored). */
      installed: () => boolean;
      /** Persists the memory (the page's own key/value store). */
      save: (memory: InstallPromptMemory) => void;
    },
  ) {
    this.memory = parseInstallPrompt(saved);
  }

  /** Games counted so far (offline + online). Exposed for the browser test hook. */
  get games(): number {
    return this.memory.games;
  }

  get never(): boolean {
    return this.memory.never;
  }

  /**
   * Count one finished game and report whether the invitation should open now. Call this for
   * OFFLINE and ONLINE finishes alike — but never for a tutorial step (a tutorial is not a game).
   */
  finished(outcome: GameOutcome): boolean {
    this.memory = countGame(this.memory);
    const invite = shouldInvite(this.memory, outcome, {
      installed: this.host.installed(),
      shownThisSession: this.shownThisSession,
    });
    if (invite) {
      this.shownThisSession = true;
      this.memory = { ...this.memory, shown: true };
    }
    this.host.save(this.memory);
    return invite;
  }

  /** The player chose "Don't show again": kept forever on this device. */
  neverAgain(): void {
    this.memory = { ...this.memory, shown: true, never: true };
    this.host.save(this.memory);
  }
}
