// MATCH NOTIFICATIONS — the ONE Settings switch, and nothing else in the game depends on it.
//
// Rules this module keeps:
//   * off by default, per DEVICE, and only ever turned on by a deliberate tap (the browser requires
//     a user gesture for permission anyway);
//   * no permission prompt on first visit, and no prompt anywhere except this switch;
//   * every browser API is treated as absent-able (Safari before Home Screen install, denied
//     permission, no service worker, an older server with no `/v1/health` `push` block);
//   * a failure leaves the switch OFF and says one quiet line. It never throws, never blocks a turn
//     and never touches the board — the caller of `sync()` is a Settings open, not a render path.
//
// The SERVER decides who is notified (server/src/push/). The page only registers this browser's
// endpoint under the signed-in identity; a different account signing in on the same phone drops the
// subscription, so it can never inherit the previous account's notifications.
import type { DuelClient, KeyValue } from '../../../server/src/client.js';
import type { IdentityStore } from './identity.js';

export const PUSH_ENABLED_KEY = 'severgrow.push.enabled.v1';
export const PUSH_ROW_ID = 'push-row';
export const PUSH_NOTE_ID = 'push-note';

/**
 * The opt-in is per DEVICE *and* per identity: the stored value is the player id it was enabled
 * for (`'1'` is a legacy value from before this rule, adopted by the current identity). A different
 * account signing in on the same phone must never inherit the previous account's notifications.
 */
export const pushFlagApplies = (stored: string | null, playerId: string | null): boolean => {
  if (stored === null) return false;
  if (playerId === null) return false;
  return stored === '1' || stored === playerId;
};

export type PushPlatform = Readonly<{
  notification: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  secure: boolean;
  permission: NotificationPermission | 'none';
  /** iOS/iPadOS: Web Push exists only for a Home Screen install (Safari 16.4+). */
  ios: boolean;
  standalone: boolean;
}>;

export type PushSupport = 'supported' | 'install-first' | 'denied' | 'unsupported';

/** The honest state of THIS browser. Pure, so every absent/denied path is a unit test. */
export const pushSupport = (platform: PushPlatform): PushSupport => {
  if (!platform.notification || !platform.serviceWorker || !platform.pushManager || !platform.secure) return 'unsupported';
  if (platform.permission === 'denied') return 'denied';
  if (platform.ios && !platform.standalone) return 'install-first';
  return 'supported';
};

export type SubscriptionLike = Readonly<{
  endpoint: string;
  toJSON(): { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
}>;

/** The exact body the server validates: endpoint + the browser's p256dh/auth keys. */
export const subscriptionBody = (subscription: SubscriptionLike): { endpoint: string; keys: { p256dh: string; auth: string } } | null => {
  try {
    const json = subscription.toJSON();
    const endpoint = typeof json.endpoint === 'string' && json.endpoint ? json.endpoint : subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (typeof endpoint !== 'string' || !endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
    return { endpoint, keys: { p256dh, auth } };
  } catch {
    return null;
  }
};

const b64uBytes = (value: string): Uint8Array | null => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

/** A registration as this module uses it (structural: no DOM types in the pure helpers). */
type PushRegistration = {
  pushManager: {
    getSubscription(): Promise<SubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<SubscriptionLike>;
  };
};

export type EnableDeps = Readonly<{
  requestPermission: () => Promise<NotificationPermission>;
  /** Mint/load the online identity deliberately (the tap is the gesture). */
  ensureIdentity: () => Promise<{ ok: true; token: string } | { ok: false }>;
  pushConfig: () => Promise<{ enabled: boolean; publicKey: string | null }>;
  registration: () => Promise<PushRegistration>;
  subscribeServer: (token: string, body: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<number>;
  setFlag: (on: boolean) => void;
}>;

/**
 * Turn the device ON. Every failure is `{ ok: false }` with one player-readable line; nothing here
 * throws. The order matters: permission → identity → server availability → browser subscription →
 * server registration. The local flag is written only after the server accepted the endpoint.
 */
export const enablePush = async (deps: EnableDeps): Promise<{ ok: boolean; message?: string }> => {
  try {
    const permission = await deps.requestPermission();
    if (permission !== 'granted') return { ok: false, message: 'Notifications are blocked in this browser.' };
    const identity = await deps.ensureIdentity();
    if (!identity.ok) return { ok: false, message: 'Could not reach your online identity.' };
    const config = await deps.pushConfig();
    if (!config.enabled || !config.publicKey) return { ok: false, message: 'Notifications are not available right now.' };
    const key = b64uBytes(config.publicKey);
    if (!key || key.length !== 65) return { ok: false, message: 'Notifications are not available right now.' };
    const registration = await deps.registration();
    const subscription = (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const body = subscriptionBody(subscription);
    if (!body) return { ok: false, message: 'This browser did not give a usable subscription.' };
    await deps.subscribeServer(identity.token, body);
    deps.setFlag(true);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not turn on notifications.' };
  }
};

export type DisableDeps = Readonly<{
  registration: () => Promise<PushRegistration>;
  /** Best-effort: a failure to tell the server must not leave the switch looking ON. */
  unsubscribeServer: (token: string, endpoint: string) => Promise<unknown>;
  token: () => string | null;
  setFlag: (on: boolean) => void;
}>;

/** Turn the device OFF: the server row first (when we can), then the browser subscription. */
export const disablePush = async (deps: DisableDeps): Promise<void> => {
  try {
    const subscription = await (await deps.registration()).pushManager.getSubscription();
    const token = deps.token();
    if (subscription && token) await deps.unsubscribeServer(token, subscription.endpoint).catch(() => undefined);
    if (subscription) {
      const unsubscribe = (subscription as { unsubscribe?: () => Promise<boolean> }).unsubscribe;
      if (typeof unsubscribe === 'function') await unsubscribe.call(subscription).catch(() => undefined);
    }
  } catch {
    // A browser that cannot unsubscribe is still turned off locally and on the server when possible.
  } finally {
    deps.setFlag(false);
  }
};

export type PushMountHooks = Readonly<{
  client: DuelClient;
  identity: IdentityStore;
  storage: KeyValue | null;
  /** Test seam. */
  platform?: () => PushPlatform;
}>;

const platformOf = (): PushPlatform => {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean; platform?: string; maxTouchPoints?: number }) | undefined;
  const ua = nav?.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
  const notification = (globalThis as { Notification?: { permission?: NotificationPermission } }).Notification;
  return {
    notification: typeof notification !== 'undefined',
    serviceWorker: typeof nav !== 'undefined' && 'serviceWorker' in nav,
    pushManager: typeof (globalThis as { PushManager?: unknown }).PushManager !== 'undefined',
    secure: (globalThis as { isSecureContext?: boolean }).isSecureContext === true,
    permission: notification?.permission ?? 'none',
    ios,
    standalone: nav?.standalone === true ||
      (typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(display-mode: standalone)').matches),
  };
};

/**
 * Build the Settings row and the behaviour behind it. Returns `sync()`: the Settings sheet calls it
 * on open (never on a render path), and the lobby calls it when the identity changes.
 */
export const mountPushNotifications = (hooks: PushMountHooks): { sync: () => Promise<void> } => {
  if (typeof document === 'undefined') return { sync: async () => undefined };
  const storage = hooks.storage;
  const flagValue = (): string | null => {
    try { return storage?.get(PUSH_ENABLED_KEY) ?? null; } catch { return null; }
  };
  const writeFlag = (on: boolean): void => {
    try {
      if (!on) storage?.remove(PUSH_ENABLED_KEY);
      else {
        // Owner-stamped, so another account on this phone reads it as OFF (see `pushFlagApplies`).
        const owner = hooks.identity.peek()?.playerId;
        storage?.set(PUSH_ENABLED_KEY, owner ?? '1');
      }
    } catch { /* a blocked store leaves the switch off; the server copy still exists */ }
  };
  const enabledFor = (playerId: string | null): boolean => pushFlagApplies(flagValue(), playerId);

  // One row, inserted after Large text (the last accessibility row in the essentials). Reuse the
  // sheet's own `.row` styling; no new CSS, no new colours.
  let row = document.getElementById(PUSH_ROW_ID) as HTMLLabelElement | null;
  let note = document.getElementById(PUSH_NOTE_ID) as HTMLParagraphElement | null;
  if (!row) {
    row = document.createElement('label');
    row.className = 'row';
    row.id = PUSH_ROW_ID;
    row.hidden = true;
    const text = document.createElement('span');
    text.textContent = 'Match notifications';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'push-toggle';
    row.append(text, input);
    note = document.createElement('p');
    note.className = 'muted small';
    note.id = PUSH_NOTE_ID;
    note.hidden = true;
    const anchor = document.querySelector('#sheet-settings [data-setting="largeText"]')?.closest('label');
    const parent = anchor?.parentElement ?? document.querySelector('#sheet-settings .sheet-body');
    if (parent && anchor) {
      anchor.after(note);
      anchor.after(row);
    } else if (parent) {
      parent.append(row, note);
    }
  }
  const input = row.querySelector('input') as HTMLInputElement | null;
  if (!input || !note) return { sync: async () => undefined };

  const say = (message: string): void => {
    note!.textContent = message;
    note!.hidden = message.length === 0;
  };

  // A registration that never arrives must not leave the switch stuck: `serviceWorker.ready` waits
  // forever when no worker was ever registered (a failed install, an unsupported browser).
  const registration = (): Promise<PushRegistration> => {
    const ready = navigator.serviceWorker.ready as Promise<unknown> as Promise<PushRegistration>;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('No service worker.')), 5000);
    });
    return Promise.race([ready, timeout]);
  };
  const token = (): string | null => hooks.identity.peek()?.token ?? null;
  let busy = false;
  let lastRegister = 0;

  /**
   * Re-register an EXISTING browser subscription under the current identity. This is what makes the
   * identity scoping real: after a link-code sign-in the same phone re-points its endpoint to the
   * new account, so the old one stops hearing about this device's matches.
   */
  const registerExisting = async (): Promise<void> => {
    const me = hooks.identity.peek();
    if (!me || !enabledFor(me.playerId) || busy) return;
    const now = Date.now();
    if (now - lastRegister < 60_000) return;
    lastRegister = now;
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (!subscription) { writeFlag(false); return; }
      const body = subscriptionBody(subscription);
      if (!body) return;
      await hooks.client.pushSubscribe(me.token, body);
    } catch {
      // Offline, an older server, a browser that removed the subscription: the switch stays as it
      // is and the next Settings open tries again. Nothing is shown mid-game.
    }
  };

  /**
   * A DIFFERENT account just signed in on this phone. Drop the browser subscription immediately (the
   * push service then answers 410 to the old account's next send, and the server removes the row), so
   * the previous account can receive nothing more from this device. The new account starts OFF:
   * notifications are opt-in per device AND per identity.
   */
  const dropDeviceForOtherAccount = async (): Promise<void> => {
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      const unsubscribe = (subscription as { unsubscribe?: () => Promise<boolean> } | null)?.unsubscribe;
      if (subscription && typeof unsubscribe === 'function') await unsubscribe.call(subscription).catch(() => undefined);
    } catch {
      // No worker or no subscription: nothing to drop.
    }
    writeFlag(false);
  };

  const setEnabled = async (on: boolean): Promise<void> => {
    if (busy) return;
    busy = true;
    input.disabled = true;
    say('');
    try {
      if (on) {
        const platform = (hooks.platform ?? platformOf)();
        const support = pushSupport(platform);
        if (support !== 'supported') {
          input.checked = false;
          say(support === 'install-first'
            ? 'Add FUTASAKU to your Home Screen, then turn this on.'
            : support === 'denied'
              ? 'Notifications are blocked in this browser’s settings.'
              : 'This browser cannot show notifications.');
          return;
        }
        const result = await enablePush({
          requestPermission: () => Notification.requestPermission(),
          ensureIdentity: async () => {
            const status = await hooks.identity.ensure();
            return status.ok ? { ok: true as const, token: status.identity.token } : { ok: false as const };
          },
          pushConfig: () => hooks.client.pushConfig(),
          registration,
          subscribeServer: (tok, body) => hooks.client.pushSubscribe(tok, body),
          setFlag: writeFlag,
        });
        input.checked = result.ok;
        say(result.message ?? 'On for this device.');
      } else {
        await disablePush({
          registration,
          unsubscribeServer: (tok, endpoint) => hooks.client.pushUnsubscribe(tok, endpoint),
          token,
          setFlag: writeFlag,
        });
        input.checked = false;
        say('');
      }
    } catch {
      input.checked = false;
      writeFlag(false);
      say('Could not change notifications.');
    } finally {
      busy = false;
      input.disabled = false;
    }
  };

  if (!row.dataset.pushBound) {
    row.dataset.pushBound = '1';
    input.addEventListener('change', () => { void setEnabled(input.checked); });
  }

  return {
    async sync(): Promise<void> {
      try {
        const config = await hooks.client.pushConfig();
        if (!config.enabled) { row!.hidden = true; note!.hidden = true; return; }
        // No registration at all (the /test/ copy registers no worker, or a local http dev page): there
        // is nothing to receive a push, so do not offer a switch that can only fail.
        const registered = await navigator.serviceWorker.getRegistration().catch(() => undefined);
        if (!registered) { row!.hidden = true; note!.hidden = true; return; }
        row!.hidden = false;
        const platform = (hooks.platform ?? platformOf)();
        const support = pushSupport(platform);
        const me = hooks.identity.peek();
        const stored = flagValue();
        // A different account on this phone is not the one that opted in.
        const foreign = stored !== null && stored !== '1' && stored !== (me?.playerId ?? null);
        if (foreign) await dropDeviceForOtherAccount();
        // A legacy boolean flag is adopted by the identity that owns the device now.
        if (!foreign && stored === '1' && me) {
          try { storage?.set(PUSH_ENABLED_KEY, me.playerId); } catch { /* keep it on for this visit */ }
        }
        const on = !foreign && enabledFor(me?.playerId ?? null);
        input.checked = on;
        input.disabled = support !== 'supported';
        say(support === 'install-first'
          ? 'Add FUTASAKU to your Home Screen, then turn this on.'
          : support === 'denied'
            ? 'Notifications are blocked in this browser’s settings.'
            : support === 'unsupported'
              ? 'This browser cannot show notifications.'
              : on ? 'On for this device.' : '');
        if (on) void registerExisting();
      } catch {
        // No health answer (offline / older server): keep the row hidden rather than guess.
        row!.hidden = true;
        note!.hidden = true;
      }
    },
  };
};
