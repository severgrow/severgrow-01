// FUTASAKU online client layer (Phases 3–5): identity, sync, draft, driver,
// seat perspective, lobby, and OnlineSession on the shared board.

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

export { duelApiUrl, onlineBuildEnabled, publicAppOrigin } from './config.js';

export {
  FIRST_ONLINE_CARD_KEY,
  WARN_LAST_MS,
  parseJoinHash,
  inviteLink,
  shareInviteText,
  lobbyBucket,
  sortLobbyEntries,
  toLobbyRow,
  trimLobbyList,
  yourTurnCount,
  pageTitleForLobby,
  friendlyJoinError,
  matchStatusLabel,
} from './lobby.js';
export type { LobbyBucket, LobbyRow } from './lobby.js';

export { installOnlineLobby } from './lobby-ui.js';
export type { LobbyUiHooks, OnlineLobbyController } from './lobby-ui.js';

export { ONLINE_CSS } from './online-css.js';

export { presenceWord, deadlineTone, turnWord, fillDuelHud } from './duel-hud.js';
export type { DuelHudModel } from './duel-hud.js';

export { duelUiFromSnapshot, playScreenAction, renderDuelHud } from './duel-bridge.js';
export type { DuelUiModel } from './duel-bridge.js';

export { OnlineSession, onlineSessionFromPayload, catchUpStepsFromDriver } from './duel-session.js';
export type { OnlinePlayResult } from './duel-session.js';

export { stepsFromEvent, stepsFromEvents, syncStep } from './steps-from-events.js';

export { isOnlineDuel, getOnlineSession, setOnlineSession, onlinePathsActive } from './duel-runtime.js';

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
