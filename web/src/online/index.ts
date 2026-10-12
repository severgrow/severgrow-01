// FUTASAKU online client layer (Phase 3 + 3b). No duel screens yet —
// identity, sync, draft, driver seam, and seat perspective mapping.

export { DUEL_CLIENT_VERSION, DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
export type { DuelSession, FetchLike, KeyValue } from '../../../server/src/client.js';

export { emptyClock, noteServerNow, correctedNow, remainingMs, formatRemaining } from './clock.js';
export type { ClockState } from './clock.js';

export { createIdentityStore, IDENTITY_STORAGE_KEY } from './identity.js';
export type { IdentityStore, IdentityStatus } from './identity.js';

export { shadowFromView, fruitKnownFromView, PLACEHOLDER_ID_BASE } from './shadow.js';

export { createDraftEngine, draftStorageKey } from './draft.js';
export type { DraftEngine, DraftSnapshot } from './draft.js';

export { createFakeChannel, createNoopChannel } from './channel.js';
export type { FakeChannelController } from './channel.js';

export { createSyncEngine, POLL_ACTIVE_MS, POLL_HIDDEN_MS } from './sync.js';
export type { SyncEngine, SyncEngineOptions } from './sync.js';

export { submitWithRetries, newRequestId } from './retries.js';
export type { SubmitOutcome, RetrySubmitOptions } from './retries.js';

export { createOnlineDriver } from './driver.js';
export type { OnlineDriver, OnlineDriverOptions, LocalDriverMarker } from './driver.js';

export { presenceLabel, presenceFromPeers } from './presence.js';

export {
  createPerspective,
  offlinePerspective,
  onlinePerspective,
  homesOnScreen,
  previewCameraFrame,
  classicHexKeys,
  SHARED_FIELDS,
  PRIVATE_FIELDS,
  PERSONAL_SETTINGS,
} from './perspective.js';
export type {
  Perspective,
  PerspectiveLabels,
  PerspectiveOptions,
  SharedField,
  PrivateField,
  PersonalSetting,
} from './perspective.js';

export type {
  ConnectionStatus,
  PresenceStatus,
  MatchPing,
  PresenceSnapshot,
  MatchChannel,
  MatchDriverSnapshot,
  OnlineIdentityRecord,
  SyncedView,
} from './types.js';
