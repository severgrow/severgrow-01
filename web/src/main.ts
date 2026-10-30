// first: the release channel (the test copy keeps its own storage)
import { IS_TEST, IS_FUTA04, FEATURES } from './channel.js';
import { mountMatchChat } from './online/chat/view.js';
import { getOnlineSession, isOnlineDuel, setOnlineSession } from './online/duel-runtime.js';
import { hideLobbySurfaces } from './online/lobby-exit.js';
import { TURN_REPLAY } from './online/replay-copy.js';
import { runRematch } from './online/rematch.js';
// Futasaku in the browser. You (player 1) against the computer. All rules come from the
// engine in src/engine; this file only draws, animates and listens. The game state
// lives in a Session; the board on screen is shown through an AnimQueue whose last
// step always matches the real state, so animations can never leave it wrong.
import { allNeighbors, apply, bloomGroups, coordKey, hexDistance, homeCoord, isStrangled, legalActions, newGame, newMatch, parseKey, planMegaBomb, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Tile, View } from '../../src/engine/index.js';
import { COACH_STEPS, TUTORIAL_SEED, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import type { Advice, TipId } from '../../src/playtest/coach.js';
import { cutLoss } from './analysis.js';
import { cardName, hexName, moveCards } from './names.js';
import { AnimQueue, captionFor } from './logic/anim.js';
import type { Step } from './logic/anim.js';
import { buildReplay } from './replay/timeline.js';
import type { ReplayInput, ReplayModel } from './replay/timeline.js';
import { mountReplay } from './replay/player.js';
import type { ReplayHandle } from './replay/player.js';
import type { ReplayPayload } from '../../server/src/protocol.js';
import { displayEventForPlay } from './player/display-readout.js';
import { bloomNoRoom } from './logic/bloom-room.js';
import type { DisplayEvent } from './player/display-readout.js';
import { createTheirsDim, replayedByOpponent } from './player/replay-display.js';
import { outcomeCue } from './player/outcome-light.js';
import type { OutcomeLight } from './player/atmosphere.js';
import { gameHighlights } from './logic/highlights.js';
import { harvestFigure, harvestSvg } from './logic/harvest.js';
import type { HarvestFigure } from './logic/harvest.js';
import { EMPTY_SEL, futa04OneTap, growControls, heldMoveWord, isBoardAction, kindCards, kindOf, moveButtons, onlyChoice, playNow, playNowBlast, shortKindLabel, sproutKind, targetHexes, targetKinds, usableCards } from './logic/interaction.js';
import type { Sel } from './logic/interaction.js';
import { fruitCardState, fruitOffer, hexTapIntent } from './logic/fruitcard.js';
import { ONBOARDING_LEVELS, guideKey, onboardGuide, revealTierFor } from './logic/onboarding.js';
import { whyNotTap, placedHexKeys } from './logic/tap-why.js';
import {
  DESK_IDLE,
  comboFor,
  deskClick,
  deskTrace,
  deskHover,
  deskShape,
  drawNext,
  bloomEndpoints,
  drawStarts,
  endpointBloom,
  naturalBloomStart,
  hexAtPoint,
  hexesAlong,
  keyStep,
  onlyPlacement,
  paintDragBegin,
  paintEnter,
  paintGhost,
  paintMatch,
  paintProblem,
  paintRetarget,
  paintTap,
  proximity,
  suggestBloom,
  unavailable,
} from './logic/draw.js';
import type { Combo, Desk, Ghost as DrawGhost, Meld, Pt } from './logic/draw.js';
import { TIPS, TIPS_KEY, bloomHintGroups, markTip, parseTips } from './logic/tips.js';
import type { TipId as FirstTip } from './logic/tips.js';
import { breakdownPart, finalTurns } from './logic/endgame.js';
import { breakdownOf, raceShare, raceWords } from './logic/race.js';
import { ambientPlan } from './logic/ambient.js';
import { REPLAY_BEAT_MS, REPLAY_SPEED, actorOf, involvedKeys, nudgeToward, replayDurationScale } from './logic/opponent.js';
import { shareCard } from './ui/sharecard.js';
import { feel, observeLongTasks, perfStart, perfStep } from './logic/perf.js';
import { dragExceeded, installPress, PRESS_SELECTOR, shouldSkipPress } from './logic/press.js';
import { attachSchedulerPause, scheduler } from './logic/scheduler.js';
import { mountHiddenPause } from './ui/hidden-pause.js';
import { clearTiming, mark as markTiming, timingEnabled, timingLog } from './logic/timing.js';
import { deckMoment, splashPlan, sporesHome } from './logic/candy.js';
import { CUT_REPLAY_SPEED, cutPlan } from './logic/cut.js';
import type { CutInput } from './logic/cut.js';
import { EASE, BREATH, MOTION, PINNED, breathAmpStep, breathPeriodOf, breathPhaseOf, motionAllowed } from './logic/motion.js';
import { boardHasSettled, resultHoldStalled } from './logic/result-hold.js';
import { liftOf, settleOvershootOf, shadowOf, weightOf } from './logic/card-weight.js';
import { enterSurface, exitSurface, resetSurface } from './ui/interface-motion.js';
import { BOARD_MARGIN, HEIGHTS, SLIM_HUD, boardUnits, computeLayout, fanSlots, setBoardShape, setFixedBoardOrient, setSlimHud, THUMB } from './logic/layout.js';
import type { Thumb } from './logic/layout.js';
import { comboGroups, handOrder, nextSort } from './logic/hand.js';
import { guideTarget } from './logic/guide.js';
import { howToReferenceHtml } from './logic/howto-reference.js';
import { mountInstallPrompt } from './logic/install.js';
import { mountAppWindowButton } from './logic/app-window.js';
import { STATS_KEY, parseStats, recordResult, statsLine } from './logic/stats.js';
import { PLAY_KEY, parsePlay, recordPlay } from './logic/play-record.js';
import { botSeed } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';
// LEVEL_INFO is deliberately NOT imported: its names (the classic bot levels' labels) were only
// ever shown on the finish subtitle and in the game log, and the owner removed level and chapter
// names everywhere on 2026-10-16. The module and its test remain until he decides whether to keep
// the names for some future surface.
import {
  DIFFICULTIES, DIFFICULTY_STEP_KEY, defaultDifficultyForLevel, matchLabel, parseDifficultyStep, stepAfterGame, stepLevelFor,
} from './logic/difficulty.js';
import type { DifficultyId } from './logic/difficulty.js';
import { describe, moveSummary, resultReason, resultTitle } from './logic/log.js';
import { SAVE_KEY, decodeSave, encodeSave } from './logic/persist.js';
import { tapAgainPlays, throwFlight, throwPileAction } from './logic/throw-pile.js';
import { undoIntent } from './logic/undo.js';
import {
  goalReachable, lessonAllows, lessonBeat, openingDisplay, lessonFor, lessonLocked, lessonOffersBloom, lessonOpening,
  presentedLessonBeat, suggestMove, LESSONS,
} from './lessons/lessons.js';
import type { Beat, Lesson } from './lessons/lessons.js';
import { FINAL_LESSON } from './lessons/final.js';
import { SEEDS_INTRO } from './online/seed-icon.js';
import { scriptedOpponentAction } from './lessons/opponent.js';
import { tapAnswer } from './lessons/answer.js';
import { litTarget, litTargetAndQuiet, tapOf } from './lessons/lesson-view.js';
import { LESSON_BREATH_ID } from './player/lesson-breath.js';
import { LESSON_META_KEY, decodeLessonMeta, encodeLessonMeta, lessonResumable } from './lessons/lesson-save.js';
import {
  LESSON_MASTERY_KEY, LESSON_VERSION, actionKindOf, decodeMastery, displayTier, encodeMastery,
  helloSeen, recordAction, recordHello,
} from './lessons/mastery.js';
import type { ActionKind, LessonTier, Mastery, PowerKind } from './lessons/mastery.js';
import { createIdleWatch } from './lessons/idle.js';
import { lessonVoiceFor } from './lessons/lesson-voice.js';
import { SMALL_HOMES } from './lessons/authored.js';
import type { Loaded } from './logic/persist.js';
// Campaign mode (the primary offline experience). Progress and the campaign match save are separate
// from the classic save; `overridesForMatch` is the offline-only seam that lets a level pass terrain.
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_LEVELS,
  campaignLevelById,
  completedCount,
  currentLevel,
  isCompleted,
  isUnlocked,
  nextCampaignLevel,
  parseProgress,
  serializeProgress,
  CAMPAIGN_PROGRESS_KEY,
} from '../../src/campaign/index.js';
import type { CampaignLevel, CampaignProgress } from '../../src/campaign/index.js';
import {
  CAMPAIGN_SAVE_KEY,
  LAST_MODE_KEY,
  campaignEntry,
  decodeCampaignSave,
  encodeCampaignSave,
  isReplay,
  offlineSaveKey,
  overridesForMatch,
  parseLastMode,
  progressAfterMatch,
  resumeOffersPlace,
  tutorialLevels,
  TUTORIAL_LEVEL_COUNT,
} from './logic/campaign.js';
import type { CampaignMatchKind } from './logic/campaign.js';
import { fetchAccountHighestLevel, syncAccountProgress } from './logic/account-progress.js';
import {
  freeTurnGuide, migrateTutorialProgress, nextTutorialChapter, previousTutorialChapter,
  tutorialAccepts, tutorialChapter, tutorialFeedback, tutorialTrackFor,
  tutorialLesson, tutorialLessons, tutorialOpponentAction, tutorialStateAt,
  TUTORIAL_CHAPTER_COUNT,
} from './logic/tutorial-script.js';
import {
  GATE_MENU_SELECTORS, GATE_SHEET_SELECTORS, GATE_WINDOW_SELECTORS,
  allowedSelectorsForLesson, mountTutorialGate,
} from './logic/tutorial-gate.js';
import type { TutorialGate } from './logic/tutorial-gate.js';
import { matchIntel, openingPublicDiscard } from './logic/match-intel.js';
import type { GlassSurface, IntelGuide, IntelTabId } from './player/glass-surface.js';
import { intelTips, nearestRule, ruleCards } from './logic/intel-guide.js';
import { cancelStarterRitual, isStarterRitualPlaying, playStarterRitual } from './player/starter-ritual.js';
import { offlineRitualKey, onlineRitualKey, playsStarterRitual, starterRitualView } from './logic/starter-ritual.js';
import type { StarterRitualView } from './logic/starter-ritual.js';
import { previewMove } from './logic/preview.js';
import { STUCK_MS, hintFor, hintWeight, isRoutineHint } from './logic/hint.js';
import type { Hint, HintCtx } from './logic/hint.js';
import { CONFIRM_MODES, forecastMove, ghostLinks, needsConfirm, riskLines } from './logic/forecast.js';
import { hapticFor, settleFor, undoPitches } from './logic/feedback.js';
import { pileCountState, pileStates, stackLayers } from './logic/piles.js';
import { renderPileMeter } from './player/pile-meter.js';
import { effectBudget, idleTarget, moveTier, pitchLadder, tierBanner } from './logic/juice.js';
import type { Budget, Tier } from './logic/juice.js';
import { Session } from './logic/session.js';
import type { Played } from './logic/session.js';
import { SETTINGS_KEY, EFFECTS, SPEEDS, parseSettings, speedFactor } from './logic/settings.js';
import { LAB_CATEGORIES, LAB_PRESETS, withLabPreset } from './logic/lab-presets.js';
import type { LabCategory, LabPreset } from './logic/lab-presets.js';
import { GLOW_SETTINGS } from './logic/topglow.js';
import type { Settings } from './logic/settings.js';
import { THEMES, THEME_IDS, cssVars, resolveColors, themeOf } from './logic/themes.js';
import { DETAILS, MATERIAL_TOKENS, materialLook, materialsOf } from './logic/materials.js';

/** The one look (Ink and glow colours, organic shapes). */
const theme = () => themeOf(settings.palette);
const look = () => materialLook(settings.palette, settings.materialDetail, settings.reduceMotion);
import { opportunities, weakSpots } from './logic/weakspots.js';
import { BoardView, NO_OVERLAY, S, centerOf } from './ui/board.js';
import { glintSeedStone, setSeedStoneStrength } from './ui/seedstone.js';
import { duelSeedsMessage, paintSeedReward, seedReward } from './ui/seed-reveal.js';
let DesignView: typeof BoardView = BoardView;
const branding = typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05')
  ? await import('./player/branding.js') : null;
if (branding && (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)) {
  document.documentElement.classList.add('home-screen-app');
}
branding?.mountBranding();
if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test') {
  await import('./ui/design-v2.css');
  DesignView = (await import('./ui/designBoard.js')).DesignBoardView;
}
// V3 art is archived on this branch; always use the default painted board for Futa04.
const defaultArt = IS_FUTA04 ? await import('./ui/defaultArtBoard.js') : null;
import type { Overlay } from './ui/board.js';
import { askBot } from './ui/botClient.js';
import { anim, cardFace, createEffects, heavyShakeFrames, removeAfter, shakeFrames, suitClass } from './ui/effects.js';
import { mountDragLayer } from './ui/drag-layer.js';
import { PILE_GRAB_PX } from './logic/drag.js';
import { fillIcons, ICONS } from './ui/icons.js';
import { getPixelGrid, setPixelGrid } from './ui/geom.js';
import { onPhotosReady, photosForOrientation, warmPhotos } from './ui/photo.js';
import { getOrient, getRotation, homeRotation, setOrient, setRotation } from './logic/orient.js';
import { SOUND_REMOVED, Sound, vibrate } from './ui/sound.js';
import { TurnPill } from './ui/turnpill.js';
import { bannerOpts, turnTone } from './logic/turnbanner.js';
import { BLOOM, CAMPAIGN, FRUIT, GAME_TITLE, HELP, HOME, INSTALL, LESSON, MENU, ONBOARD, ONLINE, OPP, PAUSE, PILES, REPLAY, RESULT, SETTINGS, SHOW_MENU_TAGLINE, SPROUT, TAP_WHY, TUTORIAL, TUTORIAL_REPLAY } from '../../src/strings.js';
import { homeSides } from './logic/home.js';
import { landmarkMotion, strangleFinish } from './logic/landmark.js';
import { pulseLandmark } from './ui/landmarks.js';
import { debugLines, isDebug } from './logic/debug.js';
import { NOTES_KEY, emptyNotes, noteEvent, notesSummary } from './logic/playnotes.js';
import type { NoteEvent, Notes } from './logic/playnotes.js';
import { NOTHING_TO_PLAY, emptyReason, opponentBeats, skipPlan } from './logic/emptyturn.js';
// The finish card's leading action per mode (online rematch / next level / try again), decided in
// one pure place so the whole matrix is unit-tested (owner direction, 2026-10-16).
import { finishLead, territoryLinkVisible } from './logic/finish-actions.js';
import type { Beats } from './logic/emptyturn.js';
// The product menu shows the world map only when this build really has an online endpoint to read
// it from (the same predicate the lobby uses), so the entry can never open a dead screen.
import { onlineBuildEnabled } from './online/config.js';
import { accountsConfiguredInThisBuild, paintEarlyAccountKey, signedInNickname } from './accounts/menu-key.js';
import { paintBetaLine } from './feedback/beta-line.js';
import { queueSeedProof } from './online/seed-rewards.js';
import { requestTrainingTicket, settleQueuedSeedsOnBoot, settleSeedProof } from './online/seed-settle.js';
import { SEEDS_IDENTITY_UNVERIFIED, SEEDS_NOT_VERIFIED } from './online/seed-icon.js';
import { settledSeedsMessage } from './ui/seed-reveal.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';

const HUMAN: Player = 0;
const BOT: Player = 1;
if (IS_FUTA04) setFixedBoardOrient('flat');
const BOOT_PARAMS = new URLSearchParams(location.search);
// the test copy's DESIGN version (Lab -> DESIGN): the same game, drawn with the V2 illustrated skin
const DESIGN_MODE = IS_TEST && BOOT_PARAMS.get('design') === '1';
if (DESIGN_MODE) document.documentElement.classList.add('design-v2');

// ---------- small helpers ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: the page still works, it just won't remember */
    }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* the in-memory Lab still works */ }
  },
};
const systemReduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- settings ----------

// The Futasaku channels keep Settings to the essentials (owner, 2026-10-23); see parseSettings.
let settings: Settings = parseSettings(store.get(SETTINGS_KEY), systemReduce(), IS_FUTA04);
if (IS_FUTA04) document.documentElement.classList.add('settings-essentials', 'futasaku-product');
let stats = parseStats(store.get(STATS_KEY));
const SEEN_KEY = 'severgrow.seen';
const SMOOTH_KEY = 'severgrow.smoother';
/** Polish pass 3: the tile card stays open (pinned) after a tap or long-press, so its buttons can be used. */
let cardPinned = false;
/** v0.5: first-time tips for Fruit and Strengthen, remembered in the browser. */
let tipsSeen = parseTips(store.get(TIPS_KEY));
let tipOpen: FirstTip | null = null;
const saveSettings = () => store.set(SETTINGS_KEY, JSON.stringify(settings));
const LAB_BASE_KEY = 'severgrow.lab.base.v1';
const LAB_ACTIVE_KEY = 'severgrow.lab.active.v1';
const savedLabBase = store.get(LAB_BASE_KEY);
let labBaseline: Settings | null = (() => {
  try {
    const value = JSON.parse(savedLabBase ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? parseSettings(savedLabBase, systemReduce()) : null;
  } catch { return null; }
})();
// The Futasaku channels have no Lab any more (owner, 2026-10-23). A player who left an experiment on
// gets their own essentials back once, from the setup saved before the experiment.
if (IS_FUTA04 && labBaseline) {
  const base = labBaseline;
  settings = { ...settings, sound: base.sound, vibration: base.vibration, reduceMotion: base.reduceMotion, largeText: base.largeText };
  labBaseline = null;
  store.remove(LAB_BASE_KEY);
  store.remove(LAB_ACTIVE_KEY);
  store.set(SETTINGS_KEY, JSON.stringify(settings));
}
let labActiveId = labBaseline ? store.get(LAB_ACTIVE_KEY) : null;
let labCategory: LabCategory = LAB_PRESETS.find((preset) => preset.id === labActiveId)?.category ?? 'surface';
// A previous automatic "Smoother mode" could leave this preview on Low effects. Restore
// the normal visual level once; an explicit Reduce motion/device preference still applies.
if (IS_FUTA04 && store.get(SMOOTH_KEY) && settings.effects === 'low') {
  settings = { ...settings, effects: 'normal' };
  saveSettings();
}
/** Animation time scale (0 = no animations). */
/** overhaul item 19: Replay plays the opponent's turn slower than live */
let replaying = false;
/** overhaul item 20: after replaying the biggest cut, the result screen comes back */
let reopenGameOver = false;
/**
 * The replay's PLAYBACK RATE (0.6 = 60% of live speed), and the biggest cut's (half speed). The
 * rate is turned into a duration multiplier in exactly one place (`replayDurationScale`), because
 * `timeScale` is a DURATION scale (it multiplies every wait and animation), never a speed.
 */
let replaySpeed = REPLAY_SPEED;
/** True only for the in-game replay of the enemy's turn: it gets a readable beat between actions. */
let replayBeats = false;
// Reduce-motion kills movement via motion(); do not also stretch wait timers.
const timeScale = () => speedFactor(settings.speed) * (replaying ? replayDurationScale(replaySpeed) : 1);
/** The one motion gate: Reduce motion, or a zero time scale, means no movement. */
const motionOn = () => motionAllowed(settings.reduceMotion, timeScale());
/** How much things move (0 when motion is not allowed). */
const motion = () => (motionOn() ? theme().style.motion : 0);
/** Sequential grow: gap after each tile's land beat (legacy wave uses this as distance step). */
const BLOOM_STAGGER_MS = 80;
// Motion pass (owner, 2026-10-15): slow enough to see, fast enough to feel snappy. Measured with
// web/e2e/motion-audit.ts (median on screen, before → after): grow 1 tile 683 → ~500ms, grow 3
// tiles 1270 → ~900ms, strengthen 570 → ~420ms, Blast ≥ 640ms (was 430), turn hand-over 325 →
// 260ms, the opponent's hidden draw 125 → 200ms (it was a blink).
/** A multi-tile grow: the next tile starts when the previous one is this far through its pop. */
const GROW_OVERLAP = PINNED.growOverlap;
/** After the last tile of a grow has landed, how long it holds before the next step. */
const GROW_HOLD_MS = PINNED.growHold;
const BLAST_MIN_MS = 640;
const TURN_HANDOVER_MS = 260;
const OPP_DRAW_MS = 200;
/**
 * True while the LIVE enemy turn is being replayed (not a catch-up after being away). The player
 * must be able to SEE which tiles arrived, so it plays at the offline game's own pace — one tile
 * at a time — even with Reduce motion (nothing moves; the tiles simply appear one after another).
 */
let liveReveal = false;
/** When the live reveal began, for the minimum readable hold (a turn with no grow must not blink). */
let revealStartedAt = 0;
/** Bumped by `settleStep`: the reveal watchdog treats any bump as proof the replay is progressing. */
let revealProgress = 0;
/**
 * The shortest the gate stays shut for a LIVE enemy turn. A turn that grew nothing (a hidden draw
 * and a discard) has almost no steps; without this it would swap the board in one frame.
 */
const MIN_LIVE_REVEAL_MS = PINNED.liveReveal;
/** An enemy turn is on screen right now: every input entry point must refuse until it drains. */
const onlineReveal = (): boolean => isOnlineDuel() && getOnlineSession()?.isRevealing === true;
/**
 * The match is over on the server. A TERMINAL status outranks the reveal gate everywhere: an
 * animation may never withhold the end screen or refuse a tap once the duel has been decided
 * (that is how the losing device used to sit on the board while the winner already had their
 * screen).
 */
const onlineTerminal = (): boolean => isOnlineDuel() && getOnlineSession()?.finished === true;
/** The one gate every input entry point reads: shut for a live enemy turn, open once decided. */
const onlineGateShut = (): boolean => onlineReveal() && !onlineTerminal();
/** Says, calmly and at most once every 1.5s, why a tap did nothing while the enemy turn plays. */
let revealNoticeAt = 0;
const revealWaitNotice = () => {
  const now = Date.now();
  if (now - revealNoticeAt < 1500) return;
  revealNoticeAt = now;
  caption(ONLINE.statusRevealWait, null, 'info');
};

/**
 * Online Draw: the card is decided by the server, so the tap would otherwise wait with no feedback.
 * A card-back flip started on the tap itself makes that wait read as intentional; the real card
 * still arrives with the normal draw animation when the response lands. Skipped for Reduce motion
 * and the Skip speed, like every other movement.
 */
function drawFlipCue(): void {
  if (settings.reduceMotion || settings.speed === 'skip') return;
  const back = $('deck').querySelector<HTMLElement>('.pile-card');
  if (!back) return;
  anim(back, [
    { transform: 'rotateY(0deg)' },
    { transform: 'rotateY(-180deg)' },
    { transform: 'rotateY(-360deg)' },
  ], { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)', transformOrigin: 'center' } as KeyframeAnimationOptions);
}

// ---------- game state ----------

type CoachProgress = { step: number; taught: TipId[]; known: string[]; choice: number; summaryDone: boolean; tutorial?: { chapter: number; step: number; version?: 2 | 3; track?: string } };
const freshCoach = (): CoachProgress => ({ step: 0, taught: [], known: [], choice: 0, summaryDone: false });

let session: Session | null = null;
let coach: CoachProgress = freshCoach();
let glassSurface: GlassSurface | null = null;
let tutorialGate: TutorialGate | null = null;
let intelState: State | null = null;
let tutorialDisplayKey = '';
let tutorialTransitionPending = false;
/** Free-play Match Intel bulb: idle 6s → blink 3s (separate from LED turn cues). */
let freePlayBulbIdleTimer = 0;
let freePlayBulbBlinkTimer = 0;
let freePlayBulbArmed = false;
let freePlayBulbBlinking = false;
let tutorialIdleTimer = 0;
let tutorialPraiseTimer = 0;
let tutorialStatus: string | null = null;
let tutorialTargetSelector = '';
let tutorialLookTapCleanup: (() => void) | null = null;
let tutorialRoutineThrowKey = '';
/** Praise only on a few milestones — not every guided step. */
const TUTORIAL_PRAISE_IDS = new Set([
  'grow', 'bloom-set', 'cut', 'bomb', 'win-place', 'discard-bloom',
]);
let log: string[] = [];
let queue = new AnimQueue({});
let shownScores: [number, number] = [0, 0];
/**
 * The Throw pile exactly as the player has SEEN it. The engine view can already hold the
 * opponent's discarded card while its card is still in the air; the pile top (and its count)
 * must only change when that card arrives. `settleStep` advances this on the discard step and
 * on the final sync, so a skipped/aborted flight still settles on the true pile.
 */
let shownDiscard: Card[] = [];
const hiddenCards = new Set<number>();
let scars: { key: string; owner: Player; age: number; tile?: Tile }[] = [];
const removedTiles = new WeakMap<Step, Map<string, Tile>>();
const outcomeSteps = new WeakMap<Step, { tone: 'good' | 'bad'; strength: number }>();
const displaySteps = new WeakMap<Step, DisplayEvent>();
/**
 * The cockpit display's "this is the opponent's move" dim (owner ask 2026-10-15). Owned here so
 * every path that begins an online replay (begin) and every path that drains one (clear) can lift
 * it; the sink is the cockpit's own `dim`, so there is no inline style write anywhere else.
 */
const theirsDim = createTheirsDim((on) => smartCockpit?.dim(on));
let inspectKey: string | null = null;
let focusKey: string | null = null;
let showOpps = false;
let gameOverDismissed = false;
/** The online match whose result has already been counted for the install invitation (once each). */
let onlineResultNoted: string | null = null;
let botBusy = false;
let epoch = 0;
let pumping = false;
let cardRects = new Map<number, DOMRect>();
/** Where the committed throw's ghost was when released (null: use the hand card's own box). */
let dragThrowFrom: DOMRect | null = null;
/**
 * The Throw pile stays swollen while the throw it accepted is still in flight (owner, 2026-10-25).
 * The class is otherwise driven by the selection, but the selection ends the moment the move
 * commits — so the flight holds it for its own duration, and the boomerang lands on the rect the
 * player is actually looking at, not a settled rect it never touched. Cleared on landing,
 * fast-forward, cancel and a new game.
 */
let throwSwellHeld = false;

/**
 * A precise, bounded timeline of the animation pump and every reveal boundary, with a
 * `performance.now()` stamp. It exists so a two-seat test can name the exact branch that leaked
 * instead of guessing (read it with `__severgrow.animLog()`). It never drives the game.
 */
type AnimMark = { t: number; ev: string } & Record<string, number | string | boolean>;
const animMarks: AnimMark[] = [];
const ANIM_LOG_MAX = 4000;
const animLog = (ev: string, data: Record<string, number | string | boolean> = {}): void => {
  animMarks.push({ t: Math.round(performance.now() * 10) / 10, ev, ...data });
  if (animMarks.length > ANIM_LOG_MAX) animMarks.splice(0, animMarks.length - ANIM_LOG_MAX);
};
// An exception anywhere in the pump (an animation target missing after a re-render, say) must be
// visible, because in the old shape it left `pumping` true forever and the gate shut.
window.addEventListener('error', (e) => animLog('window:error', { message: String((e as ErrorEvent).message ?? '').slice(0, 300) }));
window.addEventListener('unhandledrejection', (e) =>
  animLog('window:unhandledrejection', { reason: String((e as PromiseRejectionEvent).reason).slice(0, 300) }),
);

// Sound is removed for now (owner, 2026-10-27): the one switch is SOUND_REMOVED in ui/sound.ts.
const sound = new Sound(SOUND_REMOVED);
const boardHandlers = { tap: (k: string) => onHexTap(k), inspect: (k: string | null) => onInspect(k), hold: (k: string) => pinCard(k) };
const boardSvg = $('board') as unknown as SVGSVGElement;
const board = defaultArt ? new defaultArt.DefaultArtBoardView(boardSvg, boardHandlers)
  : DESIGN_MODE ? new DesignView(boardSvg, boardHandlers) : new BoardView(boardSvg, boardHandlers);
/** Material pass 2: the "Your turn" / "Bot's turn" pill and its faint edge wash. */
const pill = new TurnPill($('turn-pill'), $('edge-wash'));
const announceTurn = (player: Player, label?: string) => {
  const o = bannerOpts(settings);
  document.body.dataset.turn = player === HUMAN ? 'you' : 'opponent';
  pill.show(player, o, label);
  const tone = turnTone(player, o);
  if (tone && settings.sound) sound.turn(tone.notes, tone.gain, tone.ms);
};
const { flash, cutFlash, flinch, sparks, drift, ring, stream, scar, boardWrapPoint, floatText, caption, banner, flyCard, throwBoomerang, flyBack, oppDraw, oppThrow, particles } = createEffects(board, () => timeScale(), () => motion());

/** Pause and dim the ambient skin loops (lava, fireflies, sway) so a cut or blast reads. */
function quietAmbient(on: boolean) {
  document.documentElement.classList.toggle('moment-quiet', on);
}
/** One heartbeat on the active home (an existing landmark animation, a single iteration). */
function beatHome(p: Player, my: number) {
  const home = board.homeEls[p];
  if (!home || motion() === 0) return;
  home.classList.remove('turn-beat');
  void home.getBoundingClientRect();
  home.classList.add('turn-beat');
  setTimeout(() => { if (my === epoch) home.classList.remove('turn-beat'); }, 1000);
}

const save = () => {
  if (isOnlineDuel()) return; // online matches live on the server + device identity, not the offline save
  if (!session) return;
  // A Tutorial replay is deliberately UNSAVED (owner, 2026-10-24): it may neither overwrite the
  // campaign's resume save nor become "the match" a reload resumes. Replaying a lesson can never
  // move the player's place, so there is nothing here worth keeping.
  if (tutorialReplay) return;
  const encoded = encodeSave({
    seed: session.state.seed,
    actions: session.log,
    coach,
    level: gameLevel,
    base: session.base,
    // The training tier the game came from, so a reloaded game still earns its carry-over.
    ...(gameDifficulty ? { difficulty: gameDifficulty } : {}),
  });
  // A campaign match saves under its OWN key together with the level it belongs to: the classic
  // offline save is never overwritten by a campaign game, and a campaign match resumes as the level
  // it actually is (the level's config is carried by the save's base state).
  if (campaignLevel) {
    store.set(offlineSaveKey(campaignLevel), encodeCampaignSave(campaignLevel.id, encoded));
    store.set(LAST_MODE_KEY, 'campaign');
    return;
  }
  store.set(offlineSaveKey(null), encoded);
  store.set(LAST_MODE_KEY, 'classic');
};

// ---------- the look ----------

function applyTheme() {
  const t = theme();
  const root = document.documentElement;
  root.dataset.theme = t.id;
  for (const [k, v] of Object.entries(cssVars(t))) root.style.setProperty(k, v);
  const mat = materialsOf(t.id);
  for (const k of MATERIAL_TOKENS) root.style.setProperty(`--m-${k}`, mat.colors[k]);
  const lk = look();
  root.style.setProperty('--m-intensity', String(lk.intensity));
  root.style.setProperty('--m-rim', String(lk.rim));
  root.classList.toggle('mat-textures', lk.textures);
  root.classList.toggle('mat-motion', lk.motion);
  if (lk.textures && !IS_FUTA04) warmPhotos();
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  sound.setReduceMotion(settings.reduceMotion);
  // overhaul Part 3: the decorations, all behind one switch (and quiet with Reduce motion)
  root.classList.toggle('eye-candy', settings.eyeCandy);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolveColors(t).bg);
  drawSpores(t.style.spores && !settings.reduceMotion);
  sound.tune(t.style.soundBase, t.style.soundWave);
  if (session) {
    board.setup(session.state.config, session.state.terrain, t.style, look(), t.id);
    lastAmbBoard = null;
  }
  lastBoard = null;
  drawLogo();
  render();
}

/** Seven faint spores at fixed, spread-out places (no randomness needed). */
function drawSpores(on: boolean) {
  const box = $('spores');
  if (!on) return box.replaceChildren();
  if (box.childElementCount) return;
  for (let i = 0; i < 7; i++) {
    const m = document.createElement('i');
    m.style.left = `${(i * 37 + 9) % 100}%`;
    m.style.top = `${100 + ((i * 23) % 30)}%`;
    m.style.setProperty('--t', `${46 + ((i * 13) % 30)}s`);
    m.style.setProperty('--d', `${-((i * 11) % 40)}s`);
    box.appendChild(m);
  }
}

/**
 * Part 3 B: the opening splash: a vein grows from a root to a tile and the game's name appears.
 * Once per visit, about 1.6s, never blocks a tap (a tap ends it), still with Reduce motion.
 */
function showSplash() {
  let shown = false;
  try {
    shown = sessionStorage.getItem('severgrow.splash') === '1';
    sessionStorage.setItem('severgrow.splash', '1');
  } catch {
    shown = true;
  }
  const plan = splashPlan({ reduceMotion: settings.reduceMotion, on: settings.eyeCandy, shownThisVisit: shown });
  if (!plan.show) return;
  const c = resolveColors(theme());
  const box = $('splash');
  box.innerHTML = `<svg viewBox="0 0 220 120" width="260" height="142" aria-hidden="true">
    <path class="sp-vein" d="M40 92 C 70 92, 80 50, 110 52 S 160 30, 182 30" stroke="${c.you}" stroke-width="5" stroke-linecap="round" fill="none" pathLength="100"/>
    <circle cx="40" cy="92" r="13" fill="${c.you}"/><circle cx="40" cy="92" r="6" fill="${c.bg}"/>
    <polygon class="sp-tile" points="182,16 194,23 194,37 182,44 170,37 170,23" fill="${c.you}"/>
  </svg><p class="sp-name">${GAME_TITLE}</p>`;
  box.classList.toggle('still', !plan.animated);
  box.style.setProperty('--sp-ms', `${plan.ms}ms`);
  box.hidden = false;
  const end = () => {
    box.classList.add('out');
    setTimeout(() => (box.hidden = true), 320);
    document.removeEventListener('pointerdown', end, true);
  };
  document.addEventListener('pointerdown', end, true);
  setTimeout(end, plan.ms);
}

/** Part 3 F: the menu's terrarium: a glass dome with a little living board inside (Eye candy). */
function drawTerrarium() {
  const box = $('terrarium');
  if (!settings.eyeCandy) return box.replaceChildren();
  const c = resolveColors(theme());
  const hex = (x: number, y: number, r: number, fill: string, cls = '') => {
    const p = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return `<polygon class="${cls}" points="${p}" fill="${fill}"/>`;
  };
  const tiles = [
    [86, 104, c.you, 'tr-moss'],
    [104, 104, c.you, 'tr-moss d1'],
    [95, 89, c.you, 'tr-moss d2'],
    [122, 104, c.bot, 'tr-lava'],
    [131, 89, c.bot, 'tr-lava d1'],
  ] as const;
  box.innerHTML = `<svg viewBox="0 0 220 140" width="220" height="140" aria-hidden="true">
    <ellipse cx="110" cy="122" rx="78" ry="10" fill="#000" opacity=".25"/>
    <path d="M36 118 Q36 22 110 22 Q184 22 184 118 Z" class="tr-glass"/>
    <rect x="30" y="112" width="160" height="12" rx="6" class="tr-base"/>
    ${tiles.map(([x, y, f, cls]) => hex(x, y, 9.5, f, cls)).join('')}
    <path d="M86 104 L95 89 L104 104" stroke="${c.you}" stroke-width="2" fill="none" opacity=".7"/>
    <circle class="tr-spore" cx="80" cy="70" r="1.6" fill="${c.text}"/><circle class="tr-spore d1" cx="130" cy="60" r="1.3" fill="${c.text}"/><circle class="tr-spore d2" cx="105" cy="48" r="1.2" fill="${c.text}"/>
    <path d="M52 40 Q70 28 92 27" class="tr-shine"/>
  </svg>`;
}

function drawLogo() {
  if (branding) { branding.drawLogo(); return; }
  drawTerrarium();
  const c = resolveColors(theme());
  $('logo').innerHTML = `<svg viewBox="0 0 120 84" width="132" height="92" aria-hidden="true">
    <g stroke="${c.you}" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M60 50 L34 30"/><path d="M60 50 L86 30"/><path d="M60 50 L60 74" stroke-dasharray="2 6"/>
    </g>
    <polygon points="32,12 43,18.5 43,31.5 32,38 21,31.5 21,18.5" fill="${c.you}"/>
    <polygon points="88,12 99,18.5 99,31.5 88,38 77,31.5 77,18.5" fill="${c.bot}"/>
    <circle cx="60" cy="50" r="12" fill="${c.you}"/><circle cx="60" cy="50" r="5.5" fill="${c.bg}"/>
  </svg>`;
}

// ---------- screens and sheets ----------

let openSheet: HTMLElement | null = null;
/** The screen last shown. Boot finishes after `load` (it awaits async UI mounts), so a late
 *  redundant `showScreen('menu')` must not reset a menu the player has already interacted with. */
let shownScreen: 'menu' | 'levels' | 'campaign' | 'game' | null = null;
const TRAINING_REWARD_TICKET_KEY = 'severgrow.seeds.training-ticket.v1';
let trainingRewardTicketId: string | null = null;
let seedRewardMessage = '';
/**
 * The PLAY submenu (product menu only). It is not one of the four screens: it is a doorway that
 * replaces the menu, exactly as the online hub does. Opening anything else closes it.
 */
function closePlayMenu() {
  $('play-menu').hidden = true;
  syncBrandMark();
}
function openPlayMenu() {
  $('play-menu').hidden = false;
  $('menu').hidden = true;
  resetSurface($('menu'));
  enterSurface($('play-menu'), { travel: 6 });
  // The menu is still the screen underneath the submenu. Keeping that fact (rather than nulling
  // it) lets a redundant late boot `showScreen('menu')` leave the player's open submenu alone.
  shownScreen = 'menu';
  syncBrandMark();
}
/**
 * One leader per screen (owner direction, 2026-10-15): the ONE action that carries the cream fill,
 * everything else the quiet ghost contour. No third button treatment exists on these screens.
 */
function setLead(btn: HTMLElement, lead: boolean) {
  btn.classList.toggle('primary', lead);
  btn.classList.toggle('ghost', !lead);
}
/**
 * The saved-game resume — "Continue", or the campaign's "Resume". On the LEGACY channels it is the
 * main menu's way back into a saved match and is recomputed EVERY time the menu is shown, outside
 * the "the screen did not change" guard, so a fresh boot, reload and submenu return all agree with
 * storage. On the PRODUCT channels (owner decision, 2026-10-19) the main menu has NO resume at all:
 * the player enters the level and is asked there. Returns whether the button is shown, for the rest
 * of the menu's own layout.
 */
function syncMenuResume(): boolean {
  const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
  const campaignCanContinue = FEATURES.campaign && !!campaignResume();
  const resumeCampaign = campaignCanContinue && parseLastMode(store.get(LAST_MODE_KEY)) === 'campaign';
  const resumeClassic = !!saved && saved.state.phase !== 'GAME_OVER' && !resumeCampaign;
  const canContinue = resumeCampaign || resumeClassic;
  // Owner decision (2026-10-19): NO continue/resume button on the product main menu. A saved match
  // is offered when the player enters its level from PLAY (see askCampaignStart), never here.
  const showContinue = canContinue && !FEATURES.campaign;
  const btn = $('menu-continue');
  btn.hidden = !showContinue;
  btn.classList.remove('version-btn');
  const continueLabel = resumeCampaign ? CAMPAIGN.resume : resumeClassic && saved!.coach?.tutorial ? 'Continue tutorial' : 'Continue';
  btn.textContent = continueLabel;
  btn.setAttribute('aria-label', continueLabel);
  return showContinue;
}
/**
 * Every control of the product menu that depends only on compile-time channel flags, the saved-game
 * storage and `src/strings.ts` — never the network. Extracted from `showScreen` so boot can lay the
 * menu out in its SYNCHRONOUS prefix (before the first `await`): a first-time tester then sees a way
 * to play with the first paint, not after the async player mounts. LOG IN is painted here too, from
 * what the device already knows (owner, 2026-10-22: it used to arrive up to a second after the other
 * keys); the accounts module re-checks Google in the background and owns the key once it mounts.
 * `canContinue` is the saved-game resume decision (see `syncMenuResume`), passed in so the caller
 * keeps recomputing it on every menu show.
 */
function layoutMenu(canContinue: boolean) {
  // ---- the product menu (owner direction, 2026-10-15, option 'split') ----
  // On the product channels the menu is EXACTLY PLAY, TERRITORY and SETTINGS (owner decision,
  // 2026-10-19). PLAY is its single leading action. LOG IN, Continue and Tutorial are not part of
  // it; the legacy channels keep the flat menu they are used to.
  const online = onlineBuildEnabled();
  $('menu-play').hidden = !FEATURES.campaign;
  $('menu-play').textContent = MENU.play;
  $('menu-play').setAttribute('aria-label', MENU.play);
  $('play-title').textContent = MENU.playTitle;
  // The bottom row is a GROUP (owner brief, 2026-10-21): LOG IN (or the player's name) on the left,
  // Settings on the right. Its spoken name comes from the one strings module.
  $('menu-foot').setAttribute('aria-label', MENU.footerLabel);
  paintEarlyAccountKey($('menu-login') as HTMLButtonElement, accountsConfiguredInThisBuild());
  paintBetaLine(document.getElementById('menu-beta'));
  // The account key's words are owned by the accounts module, not by this layout pass: a signed-out
  // guest sees MENU.login, a signed-in player sees their NAME, and both are the SAME key (one entry,
  // one flow, one place). Writing MENU.login here would stomp the name on every return to the menu.
  // The label of the Territory entry is its own node (owner brief, 2026-10-20): the entry also
  // carries the player's Seeds and tile counts, painted by web/src/online/lobby-ui.ts from ONE
  // menu-show read. Writing the button's textContent here would wipe both read-outs, so this pass
  // writes the label.
  $('menu-world-label').textContent = MENU.world;
  $('menu-world').setAttribute('aria-label', MENU.world);
  // The world map is a TOP-LEVEL entry of this menu, never one of PLAY's children. It appears
  // only when the build has an online endpoint to read the map from.
  $('menu-world').hidden = !(FEATURES.campaign && online);
  if (FEATURES.campaign) {
    setLead($('menu-play'), true);
    setLead($('menu-continue'), false);
    setLead($('menu-world'), false);
    // Inside PLAY exactly one entry leads: LEVEL <n>, the campaign (owner, 2026-10-22). Play online
    // and Practice match are the next tier down and the back control is the quietest of all.
    const cmp = $('menu-campaign');
    cmp.hidden = false;
    // The entry and the press now come from ONE decision (campaignEntry), so the label can no longer
    // disagree with what opens. With every built level complete there is no next level to name, so
    // the entry opens the chapter list instead of claiming LEVEL <n>.
    const entry = campaignEntry(campaignProgress, campaignResume()?.level ?? null);
    // The caption UNDER the LEVEL <n> entry in the PLAY submenu (owner review, 2026-10-23). It used
    // to sit on the main menu as "CAMPAIGN — LEVEL 1", which read as a mode of its own competing with
    // PLAY. The entry already says the level number, so this line says what the entry cannot: how far
    // through that level's chapter the player is. It is painted from the SAME `entry` decision, so it
    // can never describe a different level from the one the entry opens; when the entry opens the
    // chapter list instead there is no level to describe, so the line stands down rather than being
    // invented. Read-only, out of the tab order, and silent (aria-live=off in the markup).
    const target = entry.kind === 'list' ? null : entry.kind === 'ask' ? entry.next : entry.level;
    // Owner direction (2026-10-23): the caption counts the ten LESSON levels (1-10 are the
    // tutorial), not the campaign chapter - "lessons" is only true of those. It is shown only while
    // the entry still opens a lesson; once all ten are won the entry opens level 11, which is not a
    // lesson, so the line retires itself rather than sitting there as permanent "10 of 10"
    // furniture describing a word that no longer applies.
    const readout = $('play-readout');
    const lessonsDone = LESSONS.filter((l) => campaignProgress.completed.includes(`c1-${String(l.level).padStart(2, '0')}`)).length;
    const lessonsTotal = LESSONS.length;
    const stillTeaching = !!target && lessonsDone < lessonsTotal && lessonFor(target.number) !== null;
    readout.textContent = stillTeaching ? CAMPAIGN.lessonsCompleted(lessonsDone, lessonsTotal) : '';
    readout.hidden = !stillTeaching;
    if (entry.kind === 'list') {
      cmp.textContent = MENU.levels;
      cmp.setAttribute('aria-label', MENU.levelsAria);
    } else {
      const current = entry.kind === 'ask' ? entry.next.number : entry.level.number;
      cmp.textContent = MENU.level(current);
      cmp.setAttribute('aria-label', MENU.levelAria(current));
    }
    $('menu-online').hidden = !online;
    // LEVEL <n> carries the cream fill inside PLAY (owner, 2026-10-22: "highlight 'level n'
    // instead" of Play online); Play online is a quiet ghost key like Practice match.
    setLead($('menu-online'), false);
    setLead(cmp, true);
    // There is deliberately NO "Levels" entry (owner, 2026-10-16): the player does not get access to
    // the whole list. LEVEL <n> above starts the next level they have NOT completed, and that is the
    // only way in. The list still renders; the finish card's "Back to campaign" is where the campaign
    // hands off to it once no next level is left.
    $('menu-new').textContent = MENU.training;
    $('menu-new').setAttribute('aria-label', `${MENU.training}. Play against the computer.`);
    setLead($('menu-new'), false);
    $('levels-heading').textContent = MENU.trainingTitle;
  } else {
    // Every other channel keeps the flat menu it is used to: one "Play offline" that opens the
    // picker, and no submenu at all. Untouched, so their own suites need no change.
    $('menu-campaign').hidden = true;
    $('play-readout').hidden = true;
    $('menu-new').hidden = false;
    $('menu-new').textContent = 'Play offline';
    $('menu-new').setAttribute('aria-label', 'Play offline');
    $('menu-new').classList.toggle('primary', !canContinue);
    $('menu-new').classList.toggle('ghost', canContinue);
    $('levels-heading').textContent = 'Choose difficulty';
  }
  $('menu-tutorial').classList.remove('primary');
  $('menu-tutorial').classList.add('ghost');
  // The Tutorial is HIDDEN on the product channels (owner, 2026-10-19): levels 1-10 ARE the tutorial
  // now, so a second guided run in the menu would teach the same thing twice and confuse the order.
  // The code path is kept intact and the entry still exists on non-campaign channels, so the old
  // guided run can come back by flipping this one line.
  $('menu-tutorial').hidden = FEATURES.campaign;
  // Continue is HIDDEN on the product channels (owner decision, 2026-10-19): there is NO resume on
  // the main menu. The player enters the level from PLAY and is asked there (askCampaignStart).
  // Hidden, not deleted, so the legacy channels keep their Continue; `[hidden]` is display:none,
  // so it leaves no gap in the button column.
  $('menu-continue').hidden = FEATURES.campaign || !canContinue;
  // Rename the one tutorial entry from src/strings.ts (single source).
  $('menu-tutorial').textContent = HELP.tutorial;
  $('menu-tutorial').setAttribute('aria-label', HELP.tutorial);
  // Laid out: every key is now in its final state, so the column may show (style.css).
  $('menu').dataset.laidOut = '1';
}
function showScreen(name: 'menu' | 'levels' | 'campaign' | 'game') {
  // Any screen that is not the match itself means the ritual's moment is over. This is the last
  // safety net for a navigation route that bypasses teardown or beginSession.
  if (name !== 'game') {
    cancelStarterRitual();
    // Invalidate a startGame still waiting on the ritual, so it cannot paint into the next screen.
    startGameGeneration++;
    pregameHold = false;
  }
  const same = shownScreen === name;
  // A redundant call to show the menu must not tear down the submenu the player has just opened.
  // (Boot finishes after async mounts and used to reset the screen here; the back key closes it.)
  if (same && name === 'menu' && !$('play-menu').hidden) return;
  shownScreen = name;
  closePlayMenu();
  $('menu').hidden = name !== 'menu';
  $('levels').hidden = name !== 'levels';
  $('campaign').hidden = name !== 'campaign';
  $('game').hidden = name !== 'game';
  // An invitation deferred out of a live match is offered here, now that a menu owns the screen.
  if (name !== 'game') drainInstallInvite();
  // A full-screen change gets the same quiet arrival as a surface, EXCEPT the game: the board is
  // the live object and must never slide or fade under the player's finger. Hiding a screen resets
  // its surface animation, so nothing can finish on a screen the player has already left.
  for (const [id, key] of [['menu', 'menu'], ['levels', 'levels'], ['campaign', 'campaign']] as const) {
    const el = $(id);
    if (name === key) enterSurface(el, { travel: 6 });
    else resetSurface(el);
  }
  // The plate is fixed to the viewport (not inside #game), so leaving the board must take it too.
  if (name !== 'game') hideLessonPlate();
  // EVERY lobby screen leaves with any screen change, the Territory map included (owner report,
  // 2026-10-28: accepting a challenge left the map painted over the duel). This is the safety net:
  // it knows the same one list the lobby uses, so no entry point — present or future — can leave a
  // lobby screen stacked on the board. The visible screen's own exit beat is started by
  // `leaveForMatch()` before this runs, and `hideLobbySurfaces` lets a closing screen finish it.
  hideLobbySurfaces();
  if (name === 'levels') {
    renderLevelGrid();
  }
  if (name === 'campaign') {
    renderCampaignScreen();
  }
  if (name === 'menu') {
    // The resume is recomputed on EVERY menu show — outside the `!same` guard below — so a fresh
    // boot, a reload or a return from a submenu can never leave the player without their way back
    // into a saved match (see syncMenuResume).
    const canContinue = syncMenuResume();
    if (!same) {
      // ---- the menu's own layout: re-rendered only when the screen actually changed ----
      layoutMenu(canContinue);
    }
  }
  hideGameOver();
  render();
  // The seat anchor is placed whenever the map band becomes visible; from then on only a layout
  // or resize moves it (`applyLayout` schedules it when its key changes).
  if (name === 'game' && IS_FUTA04) requestAnimationFrame(placeOppSeat);
  if (name === 'menu') window.dispatchEvent(new Event('futasaku:menu'));
}

function syncTutorialMenuExit() {
  const exitBtn = document.getElementById('gm-exit-tutorial') as HTMLButtonElement | null;
  const resumeBtn = document.getElementById('gm-resume') as HTMLButtonElement | null;
  if (!exitBtn) return;
  const inTutorial = !!coach.tutorial;
  exitBtn.hidden = !inTutorial;
  exitBtn.textContent = TUTORIAL.exit;
  if (resumeBtn) {
    resumeBtn.classList.toggle('primary', !inTutorial);
    resumeBtn.classList.toggle('ghost', inTutorial);
  }
}

/** The pause menu's Resign belongs to an open online duel only; it is reached with one confirm. */
function syncResignMenu() {
  const btn = document.getElementById('gm-resign') as HTMLButtonElement | null;
  if (btn) btn.hidden = !(isOnlineDuel() && !!onlineResign);
}

/**
 * The pause panel's mode word, in the corner plate opposite Settings. It is a read-out, never a
 * control: the title already says "Paused" (or LEVEL n in a campaign match), so this names the
 * KIND of match instead of repeating it.
 */
function syncMenuMode() {
  const el = document.getElementById('gm-mode');
  if (!el) return;
  // In a campaign the corner names the level itself (the heading no longer does): the player still
  // knows exactly where they are, without a second level title competing with "Paused".
  el.textContent = campaignLevel
    ? CAMPAIGN.levelLabel(campaignLevel.number)
    : isOnlineDuel() ? PAUSE.duelMode : PAUSE.practiceMode;
  // A duel's clock does not stop because this plate is open. Say so, in one quiet line.
  const clock = document.getElementById('gm-clock-note');
  if (clock) {
    clock.textContent = PAUSE.clockRuns;
    clock.hidden = !isOnlineDuel();
  }
}

let lessonChromeOn = false;
/** Keep #hud-menu crisp/tappable for the whole tutorial (gate + focus dim + free play). */
function syncTutorialChrome() {
  // Onboarding still borrows the tutorial window, which pads the map. A lesson must not: its words
  // sit in the cockpit, and the board stays the size of a normal match.
  const lessonOn = !!lessonActive() && !guidanceOff();
  const on = !!coach.tutorial || onboardingActive();
  document.documentElement.classList.toggle('futa04-tutorial', on);
  document.documentElement.classList.toggle('futa04-lesson', lessonOn);
  if (lessonOn) {
    const root = document.documentElement.style;
    root.removeProperty('--tutorial-pad-top');
    root.removeProperty('--tutorial-pad-bottom');
    root.removeProperty('--tutorial-glass-h');
  }
  if (!lessonOn) hideLessonPlate();
  if (lessonChromeOn && !lessonOn) {
    if (lessonHoldingScore) { lessonHoldingScore = false; smartCockpit?.holdScore?.(false); }
    else smartCockpit?.led?.(null);
  }
  lessonChromeOn = lessonOn;
  syncTutorialMenuExit();
}

/** The control that opened the current sheet, so closing it gives the keyboard back. */
let sheetOpener: HTMLElement | null = null;

/** Closing (Escape, scrim, Close) returns focus to the control that opened the sheet. */
function restoreSheetFocus() {
  const target = sheetOpener;
  sheetOpener = null;
  // A sheet chained on top, or the lesson glass, owns focus now. Only a sheet that is actually
  // painted counts: the install prompt keeps a `.sheet` inside itself while it is hidden.
  const chained = [...document.querySelectorAll<HTMLElement>('.sheet')].some((el) => !el.hidden && !!el.getClientRects().length);
  if (chained || glassSurface?.isOpen()) return;
  // The opener may have gone with the screen it lived on (a campaign sheet, a new game): then
  // there is nothing honest to focus and the page keeps whatever focus it has.
  if (target?.isConnected && target.getClientRects().length) target.focus();
}

/**
 * A sheet opened ON TOP of another one returns to it when it closes (0.6 polish). Settings can be
 * opened from the main menu and from the pause panel; closing it must land where the player came
 * from, with the keyboard on the control they pressed (main menu → main menu, pause → pause).
 * A stack, because one surface may chain more than once (a report form over Settings, say), and a
 * root sheet starts a fresh chain.
 */
const sheetReturns: { to: string; focus: HTMLElement | null }[] = [];

/** The one opener/closer of a sheet. `sheet()` decides where a close RETURNS before calling this. */
/**
 * THE VEIL (owner, 2026-10-23): on the Futasaku channels, while a sheet (the pause panel, or one it
 * opened) or the finish card is up over a match, the match is blurred and darkened beneath the dark
 * glass (html.game-veiled in style.css). Called wherever either of them opens or closes.
 */
function syncVeil() {
  const inMatch = !$('game').hidden;
  const over = !!openSheet || !$('gameover').hidden;
  document.documentElement.classList.toggle('game-veiled', IS_FUTA04 && inMatch && over);
  syncBrandMark();
}

/**
 * WHICH SURFACE OWNS THE MARK (owner, 2026-10-24: "have nearly every page have the logo somewhere"
 * — but never two on one). Exactly one surface carries it:
 *   - the main menu: the big logo (#logo);
 *   - a match or a submenu (and any sheet opened over either): the crisp corner badge
 *     (#hud-brand), which is app-level and above the veils so pausing can never blur it;
 *   - the finish plate: its own centred cap (#go-brand), the corner standing down;
 *   - the online hub / waiting / join screens: their existing header mark (#online-brand).
 * A sheet opened from the MAIN MENU changes nothing: the menu's big logo is still the screen's mark
 * (the sheet only veils it), so the badge does not appear and the screen never shows two.
 */
function syncBrandMark() {
  if (!branding) return;
  const online = ['online-hub', 'online-waiting', 'online-join', 'online-world-screen']
    .some((id) => !!document.getElementById(id) && !document.getElementById(id)!.hidden);
  const result = !$('gameover').hidden;
  const inMatch = !$('game').hidden;
  const submenu = !$('levels').hidden || !$('play-menu').hidden;
  branding.setBrandMark(!result && !online && (inMatch || submenu));
}

let sheetExit = 0;
let closingSheet: HTMLElement | null = null;
function openSheetNow(id: string | null, wasOpen: boolean) {
  if (id && glassSurface?.isOpen()) {
    glassSurface.hide();
    $('futa04-help-button').setAttribute('aria-expanded','false');
  }
  // Remember the opener once per chain: opening Settings from the pause menu must still give the
  // keyboard back to the control that opened the pause menu, not to a button the sheet replaced.
  if (id && !wasOpen && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    sheetOpener = document.activeElement;
  }
  const previous = openSheet;
  const next = id ? $(id) : null;
  openSheet = next;
  // A DIFFERENT sheet replaces the old one: hide it at once (a fading ghost over the new surface
  // would be a second, false surface). Only a real close gets the exit choreography.
  if (next && previous && previous !== next) {
    resetSurface(previous);
    previous.hidden = true;
  }
  // the in-game menu pauses the game; How to play and Settings opened from it keep it paused
  if (id === 'sheet-menu') {
    setPaused(true);
    syncTutorialMenuExit();
    syncResignMenu();
    syncMenuMode();
    if (FEATURES.slimHeader) fillMenuStatus();
  }
  else if (id === null) setPaused(false);
  syncVeil();
  if (next) {
    // A sheet now covers the board: any finger that was on it has stopped meaning anything there
    // (and on the iPhone its lift may never reach the board): release the map, the tile press and
    // the painting stroke, so nothing is left half-pressed when the sheet closes.
    camera?.release();
    board.releasePress();
    if (draw.ptr) draw.ptr = null;
    sheetExit++; // any pending close is now stale
    if (closingSheet && closingSheet !== next) {
      resetSurface(closingSheet);
      closingSheet.hidden = true;
      closingSheet = null;
    }
    closingSheet = null;
    $('scrim').hidden = false;
    next.hidden = false;
    if (id === 'sheet-settings') syncSettingsForm();
    if (id === 'sheet-history') renderHistory();
    if (id === 'sheet-howto') renderHowTo();
    // The backdrop only changes density; it never travels. The surface becomes present.
    enterSurface($('scrim'), { travel: 0, scale: 1, duration: 150 });
    // A PLATE (owner, 2026-10-26: "we worked on animations of opening menus ... not the
    // settings/paused menu — did we do anything there at all?"). It did animate, and it animates on
    // every sheet — but the shared open curve (`easeOpen`, cubic-bezier(0.22,1,0.36,1)) is so
    // front-loaded that ~87% of the movement lands in the first ~50ms: about three frames. On a
    // compact card like Match Intel that still reads as a breath. On a full-height plate the centre
    // of the panel barely moves and it covers the very backdrop you would compare it against, so the
    // eye catches only the fade and the plate looks like it was simply there.
    // The cure stays inside the one vocabulary (open ≤ 320ms, travel ≤ 16px, scale ≥ 95%): a plate
    // takes the STRONGEST arrival the tokens allow, so its edges move ~10px a side instead of ~7px
    // and the size change is a clear 5%. Same one breath, just spent where a big surface can show it.
    enterSurface(next);
    next.querySelector<HTMLElement>('[data-close], button:not([hidden])')?.focus();
  } else if (wasOpen) {
    // CLOSING. Pause is released NOW (the game resumes and an online clock is never "frozen" by a
    // fading panel); the plate simply takes 150ms to leave. The node stays inert and untappable
    // while it fades, then hidden, and focus returns to the control that opened the chain.
    const token = ++sheetExit;
    const closing = previous;
    closingSheet = closing;
    const scrim = $('scrim');
    const finishClose = () => {
      // A stale close must not touch a surface the player has already reopened. (A different
      // surface replacing it is handled at the OPEN path, which resets and hides the old node.)
      if (token !== sheetExit) return;
      if (closing) closing.hidden = true;
      if (closingSheet === closing) closingSheet = null;
      scrim.hidden = true;
      restoreSheetFocus();
    };
    const leave = closing ? exitSurface(closing, { onDone: finishClose }) : null;
    const leaveScrim = exitSurface(scrim, { travel: 0, scale: 1, onDone: () => undefined });
    // With motion off the surface calls back at once. A scrim that cannot animate only loses its
    // own fade; it must never shorten the surface's exit.
    if (!leave) finishClose();
    else if (!leaveScrim) scrim.hidden = true;
  } else {
    $('scrim').hidden = true;
  }
  if (IS_FUTA04) {
    document.documentElement.classList.toggle('futa04-information-blocked', !!openSheet);
    updateFuta04Help();
  }
  if (coach.tutorial) {
    syncTutorialGate();
    // Opening a sheet hides the glass; closing restores the current lesson window.
    if (!openSheet) {
      tutorialDisplayKey = '';
      render();
    }
  }
}

/**
 * Show `id` (null closes), returning a chained sheet to its opener first. The rule at the door:
 * while something is open and a DIFFERENT sheet is asked for, remember the one below and the
 * control that asked for the next one; on close, land back on it and restore that control's focus.
 */
function sheet(id: string | null) {
  if (id === null && openSheet && sheetReturns.length > 0) {
    const back = sheetReturns.pop()!;
    openSheetNow(back.to, true);
    // The opener may have been removed with the screen that held it; focus only a painted control.
    if (back.focus?.isConnected && back.focus.getClientRects().length) back.focus.focus();
    return;
  }
  if (!openSheet) sheetReturns.length = 0;
  if (id && openSheet && openSheet.id !== id) {
    sheetReturns.push({
      to: openSheet.id,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  }
  openSheetNow(id, !!openSheet);
}

/** Close the WHOLE chain (a chained confirmation must not hand back to the pause plate when the
 *  action it confirmed is about to replace the screen). Focus is left to the new screen. */
function closeAllSheets(): void {
  sheetReturns.length = 0;
  sheetOpener = null;
  openSheetNow(null, !!openSheet);
}

/** Legacy channels (no glass surface) still show the reference in the old sheet. */
function renderHowTo() {
  $('howto-body').innerHTML = howToReferenceHtml(session?.state.config);
}

/** New matches choose one of five named tiers; the tier's map and bot level go in with the match. */
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
  if (t && (t.dataset.tip === 'fruit' || t.dataset.tip === 'strengthen' || (IS_FUTA04 && t.dataset.tip === 'draw'))) showTip(t.dataset.tip);
});

/**
 * The pending one-game carry-over (a win steps the tier's next game up, a loss steps it down). It
 * lives in the browser, is read by the ONE tier that earned it, and is cleared the moment that
 * tier's next game starts. Restored from `d282dfd` and pointed at the three TRAINING tiers.
 */
const readDifficultyStep = () => parseDifficultyStep(store.get(DIFFICULTY_STEP_KEY));
/** Records the level a finished game earned, or clears THIS tier's pending step when it earned none. */
const writeDifficultyStep = (id: DifficultyId, level: Level | null) => {
  if (level !== null) store.set(DIFFICULTY_STEP_KEY, JSON.stringify({ id, level }));
  else if (readDifficultyStep()?.id === id) store.remove(DIFFICULTY_STEP_KEY);
};

function renderLevelGrid() {
  $('level-grid').replaceChildren(
    ...DIFFICULTIES.map((tier) => {
      const b = document.createElement('button');
      b.type = 'button';
      const selected = store.get('severgrow.difficulty') ?? defaultDifficultyForLevel(settings.level);
      b.className = `btn big level-tile difficulty-tile${selected === tier.id ? ' primary on' : ' ghost'}`;
      b.dataset.difficulty = tier.id;
      // Visible label is CAPS via CSS; keep the spoken name title-case.
      const spoken = tier.label.charAt(0) + tier.label.slice(1).toLowerCase();
      b.setAttribute('aria-label', `${spoken}. Play a practice match against the computer at this difficulty.`);
      b.textContent = tier.label;
      b.addEventListener('click', () => {
        sound.unlock();
        const seed = randomSeed();
        // The carry-over is spent here: this game plays it, the next one is back to the tier's own
        // level unless a finished game moves it again. A step earned by ANOTHER tier stays put.
        const pending = readDifficultyStep();
        const level = stepLevelFor(pending, tier.id as DifficultyId) ?? tier.level;
        if (pending?.id === tier.id) writeDifficultyStep(tier.id as DifficultyId, null);
        store.set('severgrow.difficulty', tier.id);
        settings = { ...settings, level };
        saveSettings();
        startGame(seed, level, null, null, tier.id as DifficultyId);
      });
      return b;
    }),
  );
}

// ---------- campaign screen ----------

/** The saved unfinished campaign match: the level it belongs to and its replayed state, or null. */
function campaignResume(): { level: CampaignLevel; saved: Loaded<CoachProgress> } | null {
  const raw = decodeCampaignSave(store.get(CAMPAIGN_SAVE_KEY));
  if (!raw) return null;
  const level = campaignLevelById(raw.levelId);
  if (!level) return null;
  // A save can only resume a level the record actually opened. A stale or edited save pointing at a
  // level the player has not reached is ignored, so it cannot become a shortcut past the order rule.
  if (!isUnlocked(campaignProgress, level)) return null;
  // ...and it can only be offered on the player's PLACE (owner, 2026-10-24). A save on a level
  // behind progress is a replay in progress: offering it here is exactly how a replay of level 1
  // used to make the campaign "resume" level 1 and strand the player behind their own progress.
  if (!resumeOffersPlace(campaignProgress, level)) return null;
  const saved = decodeSave<CoachProgress>(raw.match);
  if (!saved || saved.state.phase === 'GAME_OVER') return null;
  return { level, saved };
}

/** One level tile: completed, the current level, an unlocked level, or locked. */
function campaignTile(level: CampaignLevel, currentId: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'campaign-tile';
  b.dataset.level = level.id;
  const unlocked = isUnlocked(campaignProgress, level);
  const completed = isCompleted(campaignProgress, level.id);
  b.dataset.state = completed ? 'completed' : !unlocked ? 'locked' : level.id === currentId ? 'current' : 'open';
  b.disabled = !unlocked;
  const num = document.createElement('span');
  num.className = 'ct-num';
  num.textContent = String(level.number).padStart(2, '0');
  // Level NAMES are gone (owner, 2026-10-16: numbers only). The tile is the number alone; the name
  // span is not created at all, so no empty node is left behind for CSS to size around.
  b.append(num);
  const label = CAMPAIGN.levelLabel(level.number);
  if (completed) {
    const mark = document.createElement('span');
    mark.className = 'ct-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    b.append(mark);
    b.setAttribute('aria-label', `${label}. ${CAMPAIGN.completed}.`);
  } else if (!unlocked) {
    b.setAttribute('aria-label', `${label}. ${CAMPAIGN.locked}.`);
  } else if (b.dataset.state === 'current') {
    b.setAttribute('aria-label', `${label}. ${CAMPAIGN.current}.`);
  } else {
    b.setAttribute('aria-label', label);
  }
  b.addEventListener('click', () => {
    sound.unlock();
    startCampaignLevel(level);
  });
  return b;
}

/** The campaign screen: a compact chapter list drawn from the level data. Nothing here is static. */
function renderCampaignScreen() {
  $('campaign-heading').textContent = CAMPAIGN.heading;
  const total = CAMPAIGN_LEVELS.length;
  $('campaign-progress').textContent = CAMPAIGN.progress(completedCount(campaignProgress), total);
  const resume = campaignResume();
  const hint = $('campaign-resume-hint');
  hint.hidden = !resume;
  if (resume) hint.textContent = CAMPAIGN.resumeHint;
  $('campaign-continue').textContent = resume ? CAMPAIGN.resume : CAMPAIGN.play;
  const here = currentLevel(campaignProgress).id;
  $('campaign-chapters').replaceChildren(
    ...CAMPAIGN_CHAPTERS.map((chapter) => {
      const block = document.createElement('section');
      block.className = 'campaign-chapter';
      block.dataset.chapter = chapter.id;
      const head = document.createElement('div');
      head.className = 'campaign-chapter-head';
      const words = CAMPAIGN.chapters[chapter.id];
      const name = document.createElement('h3');
      name.className = 'campaign-chapter-name';
      // Chapter TITLES are gone too (owner, 2026-10-16): the chapter number only. The subtitle keeps
      // describing the ground ahead without naming it.
      name.textContent = CAMPAIGN.chapterName(chapter.number);
      const sub = document.createElement('p');
      sub.className = 'campaign-chapter-sub';
      sub.textContent = words?.subtitle ?? '';
      head.append(name, sub);
      const grid = document.createElement('div');
      grid.className = 'campaign-grid';
      grid.append(...chapter.levels.map((level) => campaignTile(level, here)));
      block.append(head, grid);
      return block;
    }),
  );
  orientCampaignList();
}

/**
 * THE LIST OPENS ON THE PLAYER'S PLACE (owner, 2026-10-24). The current tile is painted already;
 * this brings it into view, so returning from a finished level always shows the level the player is
 * working on, not the top of chapter I. The chapters column is the scroller on the product screen
 * (the head's Back and Continue stay put); a channel where the column fits falls back to the screen.
 */
function orientCampaignList() {
  const chapters = $('campaign-chapters');
  const tile = chapters.querySelector<HTMLElement>('.campaign-tile[data-state="current"]');
  if (!tile) return;
  const screen = $('campaign');
  const scroller = chapters.scrollHeight > chapters.clientHeight + 1 ? chapters : screen;
  const r = tile.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  // Centre the tile in the visible column. Reading the rects first forces the layout, so this is
  // exact even though the list was just rebuilt; the assignment is instant (no animation to outrun).
  scroller.scrollTop += r.top - box.top - Math.max(0, (box.height - r.height) / 2);
}

// ---------- the Tutorial (Settings → Tutorial) ----------
// Owner (2026-10-24): "the first 9 levels are replayable as 'Tutorial' - available in settings -
// plays the levels 1-9 levels exactly like in campaing." So this is an ENTRY POINT to the same
// CAMPAIGN_LEVELS, never a parallel copy: the tiles are built from `tutorialLevels()` (references to
// the campaign's own level objects) and start through the same `startGame` seam with the level's own
// seed, bot and config. The ONE difference is the flag: a tutorial match writes nothing.
function renderTutorialSheet() {
  $('tutorial-title').textContent = TUTORIAL_REPLAY.title;
  $('tutorial-hint').textContent = TUTORIAL_REPLAY.hint;
  $('tutorial-levels').replaceChildren(
    ...tutorialLevels().map((level) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'campaign-tile';
      b.dataset.level = level.id;
      const num = document.createElement('span');
      num.className = 'ct-num';
      num.textContent = String(level.number).padStart(2, '0');
      b.append(num);
      b.setAttribute('aria-label', TUTORIAL_REPLAY.levelAria(level.number));
      b.addEventListener('click', () => {
        sound.unlock();
        startTutorialLevel(level);
      });
      return b;
    }),
  );
}

/**
 * Opens a campaign level AS A TUTORIAL REPLAY. No unlock check on purpose: the Tutorial is offered
 * from Settings at any progress, and it cannot move progress in either direction — the record and
 * the resume save are both left alone (progressAfterMatch / save), so there is nothing to protect
 * with the campaign's order rule. It is the same level object the campaign plays, untouched.
 */
function startTutorialLevel(level: CampaignLevel) {
  if (level.number < 1 || level.number > TUTORIAL_LEVEL_COUNT) return;
  closeAllSheets();
  gameOverDismissed = true;
  void startGame(level.seed, level.botLevel, null, level, null, true);
}

/** Fills the Settings sheet's words from src/strings.ts (SETTINGS). The markup carries keys
 * (`data-copy`), never copy, so the screen can be re-organised in one place (src/strings.ts). */
function applySettingsCopy() {
  for (const el of document.querySelectorAll<HTMLElement>('#sheet-settings [data-copy]')) {
    const value = SETTINGS[el.dataset.copy as keyof typeof SETTINGS];
    if (typeof value === 'string') el.textContent = value;
  }
}

/**
 * The Settings plate's honest bottom edge (owner, 2026-10-26: at 320x568 the last row was cut
 * through the middle with no cue). The fade and the visible scrollbar are shown only while there
 * is something below the fold — never over a sheet that actually fits, and never when the player
 * has reached the end. `sheet-settings .sheet-fade` in style.css does the painting.
 */
let settingsScrollBound = false;
function syncSettingsScroll(): void {
  const panel = $('sheet-settings');
  const body = panel.querySelector<HTMLElement>('.sheet-body');
  if (!body) return;
  const more = panel.scrollHeight - panel.clientHeight - panel.scrollTop > 2;
  panel.dataset.scroll = more ? '1' : '0';
}
function bindSettingsScroll(): void {
  if (settingsScrollBound) return;
  settingsScrollBound = true;
  const panel = $('sheet-settings');
  panel.addEventListener('scroll', syncSettingsScroll, { passive: true });
  window.addEventListener('resize', syncSettingsScroll, { passive: true });
  const body = panel.querySelector<HTMLElement>('.sheet-body');
  if (body && typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSettingsScroll).observe(body);
}

function syncSettingsForm() {
  // The Tutorial entry exists only where campaign levels do (the product channels). Hidden, not
  // removed, so the legacy sheet keeps the shape it has always had.
  $('settings-tutorial').hidden = !FEATURES.campaign;
  // Phones whose browser cannot vibrate (all iPhones) get an honest label, not a dead switch.
  const vib = document.querySelector<HTMLInputElement>('[data-setting="vibration"]')!;
  vib.disabled = !('vibrate' in navigator);
  $('vibration-label').textContent = vib.disabled ? SETTINGS.vibrationOff : SETTINGS.vibration;
  // On the Futasaku channels a phone that cannot vibrate does not show the row at all (owner, 2026-10-23).
  $('vibration-row').hidden = IS_FUTA04 && vib.disabled;
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
    input.checked = !!settings[input.dataset.setting as keyof Settings];
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-volume]')) input.value = String(settings[input.dataset.volume as 'sfxVolume' | 'musicVolume']);
  segmented('speed-seg', SPEEDS, settings.speed, (sp) => (sp === 'skip' ? 'Off' : cap(sp)), (sp) => {
    settings.speed = sp;
    if (sp === 'skip') fastForward();
  });
  segmented('palette-seg', THEME_IDS, settings.palette, (id) => THEMES[id].name, (id) => {
    settings.palette = id;
    applyTheme();
  });
  segmented('effects-seg', EFFECTS, settings.effects, cap, (e) => {
    settings.effects = e;
    sound.setEffects(e);
  });
  segmented('detail-seg', DETAILS, settings.materialDetail, cap, (d) => {
    settings.materialDetail = d;
    applyTheme();
  });
  segmented('glow-seg', GLOW_SETTINGS, settings.topGlow, cap, (g) => {
    settings.topGlow = g;
    render();
  });
  // "Confirm moves" (overhaul item 8): Smart asks only for risky moves; low-risk moves play at once with Undo
  segmented('confirm-seg', CONFIRM_MODES, settings.confirmPolicy, (x) => (x === 'smart' ? 'Smart' : cap(x)), (x) => {
    settings.confirmPolicy = x;
  });
  renderSettingsLab();
  bindSettingsScroll();
  syncSettingsScroll();
}

/** The Lab edits existing settings only. Every recipe starts from the saved
 * pre-Lab setup, so trying several recipes never accumulates hidden changes. */
function applyLab(preset: LabPreset) {
  if (!labBaseline) {
    labBaseline = { ...settings };
    store.set(LAB_BASE_KEY, JSON.stringify(labBaseline));
  }
  settings = { ...withLabPreset(labBaseline, preset), level: settings.level };
  labActiveId = preset.id;
  store.set(LAB_ACTIVE_KEY, preset.id);
  finishLabChange();
}

function restoreLab() {
  if (!labBaseline) return;
  settings = { ...labBaseline, level: settings.level };
  labBaseline = null;
  labActiveId = null;
  store.remove(LAB_BASE_KEY);
  store.remove(LAB_ACTIVE_KEY);
  finishLabChange();
  $('lab-surprise').focus();
}

function finishLabChange() {
  saveSettings();
  sound.enabled = settings.sound;
  sound.setEffects(settings.effects);
  sound.setReduceMotion(settings.reduceMotion);
  if (settings.sound || settings.music) sound.unlock();
  sound.setMix(settings);
  sound.setMusic(settings.music);
  applyTheme();
  syncSettingsForm();
}

function renderSettingsLab() {
  const section = $('settings-lab') as HTMLDetailsElement;
  if (!section.open) return;
  const categories = $('lab-categories');
  const cards = $('lab-cards');
  categories.replaceChildren(...LAB_CATEGORIES.map((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.labCategory = category.id;
    button.setAttribute('aria-pressed', String(labCategory === category.id));
    button.textContent = category.label;
    button.addEventListener('click', () => {
      labCategory = category.id;
      renderSettingsLab();
      categories.querySelector<HTMLButtonElement>(`[data-lab-category="${category.id}"]`)?.focus();
    });
    return button;
  }));
  const selected = LAB_PRESETS.filter((preset) => preset.category === labCategory);
  cards.setAttribute('aria-label', `${labCategory} experiments`);
  cards.replaceChildren(...selected.map((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lab-card';
    button.dataset.labPreset = preset.id;
    const active = labActiveId === preset.id && Object.entries(preset.values).every(([key, value]) => settings[key as keyof Settings] === value);
    button.setAttribute('aria-pressed', String(active));
    const number = document.createElement('span');
    number.className = 'lab-card-number';
    number.textContent = String(LAB_PRESETS.indexOf(preset) + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'lab-card-copy';
    const title = document.createElement('strong');
    title.textContent = preset.title;
    const note = document.createElement('small');
    note.textContent = preset.note;
    copy.append(title, note);
    const readout = document.createElement('span');
    readout.className = 'lab-card-readout';
    readout.textContent = preset.readout;
    button.append(number, copy, readout);
    button.addEventListener('click', () => {
      applyLab(preset);
      cards.querySelector<HTMLButtonElement>(`[data-lab-preset="${preset.id}"]`)?.focus();
    });
    return button;
  }));
  const active = LAB_PRESETS.find((preset) => preset.id === labActiveId);
  const matching = active && Object.entries(active.values).every(([key, value]) => settings[key as keyof Settings] === value);
  $('lab-status').textContent = !labBaseline ? 'Your current setup is untouched.' : matching ? `${active.title} is on. Your original setup is saved.` : 'Custom mix is on. Your original setup is saved.';
  ($<HTMLButtonElement>('lab-restore')).disabled = !labBaseline;
}

const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);

/** A row of radio-like buttons for one setting; picking one saves and redraws the form. */
function segmented<T extends string>(id: string, values: readonly T[], current: T, label: (v: T) => string, pick: (v: T) => void) {
  $(id).replaceChildren(
    ...values.map((val) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg-btn${current === val ? ' on' : ''}`;
      b.dataset.value = val;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(current === val));
      b.textContent = label(val);
      b.addEventListener('click', () => {
        pick(val);
        saveSettings();
        syncSettingsForm();
      });
      return b;
    }),
  );
}

// ---------- starting games ----------

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;

/**
 * True while the pre-game ritual owns the screen. The game is already prepared underneath, but its
 * input and the bot stay shut until the ritual resolves — and the flag is cleared on every exit path.
 */
let pregameHold = false;
/** A new match supersedes an older `startGame` that may still be waiting on the ritual. */
let startGameGeneration = 0;

function beginSession(state: State, c: CoachProgress | null, log: readonly Action[] = [], base: State | null = null, holdForRitual = false) {
  turnWasMine = null; // a new game never opens with a hand-off cue
  // A match started from anywhere supersedes a ritual belonging to an older one.
  cancelStarterRitual();
  startGameGeneration++;
  pregameHold = holdForRitual;
  epoch++;
  resetLessonRuntime();
  hideLessonPlate();
  handSettled = true;
  tutorialTransitionPending = false;
  tutorialDisplayKey = '';
  glassSurface?.hide();
  intelState=null;
  for (const w of [...waiters]) w();
  // A previous match may still be counting its score when New Game is tapped.
  // Its next scheduler frame must never write into this match's scoreboard.
  scoreUnsub?.();
  scoreUnsub = null;
  perfUnsub?.();
  perfUnsub = null;
  for (const id of ['score-you', 'score-bot']) $(id).getAnimations().forEach(animation => animation.cancel());
  pumping = false;
  // A new match starts with a settled pile, whatever the previous one was doing.
  releaseThrowSwell();
  session = new Session(state, HUMAN, log, base);
  bloomPick = [];
  // A lesson never offers a power before the level that teaches it (Bloom from level 5).
  { const l = lessonNow && campaignLevel?.number === lessonNow.level ? lessonNow : null; session.allow = l ? (a) => lessonAllows(l, a) : null; }
  finalShown = false;
  lastDeckSeen = -1;
  goCounted = false;
  goSeedSettled = false;
  goSeedSlot = false;
  goSeedShown = null;
  // A new game's card must never be painted by the previous game's settle (see settleSeedsForCard).
  goSeedsSettleRun += 1;
  replaying = false;
  coach = c ? { ...c, choice: 0 } : freshCoach(); // the coach shows only its best move
  queue = new AnimQueue(state.board);
  const v = viewFor(state, HUMAN);
  shownScores = [v.score, v.opponentScore];
  shownDiscard = [...v.discard];
  hiddenCards.clear();
  scars = [];
  inspectKey = null;
  focusKey = null;
  gameOverDismissed = false;
  botBusy = false;
  board.setup(state.config, state.terrain, theme().style, look(), theme().id);
  lastAmbBoard = null;
  applyLayout();
  lastBoard = null;
  showScreen('game');
  smartCockpit?.reset(v.score,v.opponentScore);
  outcomeLight?.reset();
  scheduleBot();
}


/** Part 3 G: the opening deal: the hand flies in from the deck, card by card (Eye candy). */
function dealIn() {
  handSettled = false;
  if (!settings.eyeCandy || motion() === 0 || timeScale() === 0) { handSettled = true; return; }
  requestAnimationFrame(() => {
    const from = $('deck').getBoundingClientRect();
    const flying: Animation[] = [];
    document.querySelectorAll<HTMLElement>('#hand .card').forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const animation = anim(card, [{ translate: `${from.left - r.left}px ${from.top - r.top}px`, rotate: '-12deg', opacity: 0 }, { translate: '0 0', rotate: '0deg', opacity: 1 }], { duration: 420 * timeScale(), delay: i * 70 * timeScale(), easing: 'cubic-bezier(.2,.8,.3,1.05)', fill: 'backwards' });
      if (animation) flying.push(animation);
    });
    if (!flying.length) { handSettled = true; if (lessonNow) render(); return; }
    // The real signal: every deal animation has finished (delay included). The light waits for it.
    // Only a lesson reads this flag, so only a lesson repaints here: a late repaint in a normal
    // game could hide the How-to sheet the player is reading.
    void Promise.all(flying.map((a) => a.finished.catch(() => undefined))).then(() => {
      handSettled = true;
      if (lessonNow) render();
    });
  });
}

/** The test copy's phone extras (thumb layout settings, idle tip): null in the live build. */
/** The test copy's step guidance (the step's word on the map, the step's controls as the hero). */
let placeTeachingPanel: typeof import('./player/overlay-placement.js').placeTeachingPanel | null = null;
let futa04Help: ReturnType<typeof import('./player/help.js').mountHelp> | null = null;
let smartCockpit: ReturnType<typeof import('./player/smart-cockpit.js').mountSmartCockpit> | null = null;
/** The lesson's live breath on the lit thing (a card, a pile, a key) — see player/lesson-breath.ts. */
let lessonBreath: ReturnType<typeof import('./player/lesson-breath.js').mountLessonBreath> | null = null;
let outcomeLight: OutcomeLight | null = null;
let guideMod: ReturnType<typeof import('./player/guide.js').mountGuide> | null = null;
let thumbMod: { side: (w: number, h: number) => 'right' | 'left' | null; tip: (t: string | null, thumbOn: boolean) => void } | null = null;
/** The replay button: hidden in the test copy (its code stays). */
const REPLAY_BUTTON = FEATURES.replay;
/** The test copy: the weak-spot corner icons are gone (their signals live on the map and the tile card). */
if (!FEATURES.weakTools) for (const id of ['tool-weak', 'tool-targets']) document.getElementById(id)?.remove();
// product channels: the header keeps only the menu button and the score bar; the scores, the turn
// and History move into the pause panel's read-out (no player marks there: the colours say who is who)
if (FEATURES.slimHeader) {
  setSlimHud(true);
  document.documentElement.classList.add('slim-hud');
  // The read-out is part of the panel's markup (index.html): reveal it and label the opponent's
  // side. Nothing is built here, so the panel has ONE author and the legacy channels never see it.
  const status = document.getElementById('gm-status');
  if (status) {
    status.hidden = false;
    const bot = status.querySelector('.gm-bot small');
    if (bot) bot.textContent = OPP.label; // the plain word beside a score ("Opponent"), not the possessive
  }
  // History is a quiet row of the action column, not a second control inside the read-out.
  const history = document.getElementById('gm-history');
  if (history) {
    history.hidden = false;
    history.addEventListener('click', () => sheet('sheet-history'));
  }
}
/** The test copy's menu: the scores and the turn, as the header used to show them. */
function fillMenuStatus() {
  const you = document.getElementById('gm-score-you');
  if (!you) return;
  you.textContent = $('score-you').textContent;
  $('gm-score-bot').textContent = $('score-bot').textContent;
  const turn = $('gm-turn');
  turn.className = `gm-turn ${$('turn').className}`;
  turn.innerHTML = $('turn').innerHTML;
  // The copied pill carries the match label ("Level 1") under the turn word. In a campaign the
  // corner read-out above "Paused" already says it (syncMenuMode runs first), so the plate showed
  // LEVEL 1 twice. Drop the copy only when it repeats the corner word; a practice match keeps its
  // difficulty ("Medium"), which the corner ("Practice") does not say.
  const modeWord = document.getElementById('gm-mode')?.textContent?.trim().toLowerCase() ?? '';
  const matchWord = turn.querySelector('small');
  if (matchWord && modeWord && matchWord.textContent?.trim().toLowerCase() === modeWord) matchWord.remove();
  // Which level this is lives in the corner read-out, not in the heading: the heading anchors the
  // state (Paused / Match menu), and a campaign level names itself in the mode line. Owner brief,
  // 2026-10-22: a pause should read as one state, not as a page with a level title.
  const title = document.getElementById('gm-title');
  if (title) title.textContent = isOnlineDuel() ? PAUSE.matchTitle : PAUSE.title;
  const resume = document.getElementById('gm-resume');
  if (resume) {
    const words = isOnlineDuel() ? PAUSE.returnToMatch : PAUSE.resume;
    resume.textContent = words;
    resume.setAttribute('aria-label', words);
  }
  // Restart is the current match's own key offline. A server duel cannot be restarted from one
  // side, so the key is simply absent there; Resign is the honest way out (with its confirm).
  const restart = document.getElementById('gm-new');
  if (restart) {
    const words = campaignLevel ? PAUSE.restartLevel : PAUSE.restartMatch;
    restart.textContent = words;
    restart.setAttribute('aria-label', words);
    restart.hidden = isOnlineDuel() || !!coach.tutorial;
  }
  const main = document.getElementById('gm-main');
  if (main) {
    main.textContent = PAUSE.mainMenu;
    // In a real-time duel "Main menu" would be a second, unexplained way to forfeit; the live
    // module's own "Leave real time" carries that confirm. So the quiet key steps aside there.
    main.hidden = document.documentElement.classList.contains('live-on');
  }
  // The two compact helpers and the lead are painted from the one strings module, so the i18n pass
  // changes them in one file (the markup carries the no-JS fallback, as every other key does).
  // They are icon tools: the spoken label is the full name, the word under the icon its short form.
  const tool = (id: string, label: string, word: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('aria-label', label);
    const w = el.querySelector('.gm-tool-word');
    if (w) w.textContent = word;
  };
  tool('gm-howto', HELP.howToTitle, PAUSE.howToShort);
  tool('gm-history', PAUSE.history, PAUSE.historyShort);
}
/** The thumb layout in use (test copy, phones in portrait), or null. */
let thumbLayout: Thumb | null = null;
/** Thumb layout v2, smart overlap: how far (px) the board reaches under the fan right now. */
let thumbOverlap = 0;
let overlapFor: unknown = null;
// the Lab (test copy only: this import is dropped from the live build)
let lab: {
  camera: ReturnType<typeof import('./player/camera.js').installCamera>;
  overrides: () => Partial<RulesConfig>;
  thinking: (on: boolean) => void;
  watchingChanged: (w: { level: number; pause: number } | null) => void;
} | null = null;
let camera: ReturnType<typeof import('./player/camera.js').installCamera> | null = null;
// Literal build guards keep player enhancements out of the legacy bundle.
declare const __CHANNEL__: string;
async function mountPlayerEnhancements() {
  const loads: Promise<unknown>[] = [];
  // Card art: start decode before fonts/thumb/camera finish so the crossfade can land early.
  if (typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05')) {
    void import('./player/cards.js').then((m) => m.preloadCardArt());
  }
  if (typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'test' || __CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05')) {
    placeTeachingPanel = (await import('./player/overlay-placement.js')).placeTeachingPanel;
    loads.push(import('./player/player-css.js').then(async (m) => {
      const style = document.createElement('style'); style.id = 'player-styles'; style.textContent = m.PLAYER_CSS; document.head.append(style);
      const onlineCss = await import('./online/online-css.js');
      if (!document.getElementById('online-styles')) {
        const os = document.createElement('style');
        os.id = 'online-styles';
        os.textContent = onlineCss.ONLINE_CSS;
        document.head.append(os);
      }
      layoutKey = ''; applyLayout(); if (session) render();
    }));
    loads.push(import('./player/thumb.js').then((t) => {
      thumbMod = t.mountThumb({
        relayout: () => {
          layoutKey = '';
          render();
          applyLayout();
        },
        reduceMotion: () => settings.reduceMotion,
      });
      layoutKey = '';
      applyLayout();
      if (session) render();
      // the step guidance (its setting sits under the phone layout rows)
      return import('./player/guide.js').then((g) => {
        guideMod = g.mountGuide({ reduceMotion: () => settings.reduceMotion });
        if (session) render();
      });
    }));
    camera = (await import('./player/camera.js')).installCamera(board.svg, $('board-wrap'), { reduceMotion: () => settings.reduceMotion, changed: () => smartCockpit?.sync() });
  }
  if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test') {
    loads.push(import('./player/fonts.js').then((f) => f.applyFont()));
    loads.push(import('./lab-mode/panel.js').then((m) => {
      lab = m.mountLab({
        sheet,
        play: (_o, level) => startGame(randomSeed(), level as Level),
        watch: (level, green, pause) => startGame(randomSeed(), level as Level, { level: green as Level, pause }),
        setWatch: (w) => {
          watching = w ? { level: w.level as Level, pause: w.pause } : null;
          document.body.classList.toggle('lab-watching', !!watching);
          render();
          scheduleBot();
        },
        board: board.svg,
        boardWrap: $('board-wrap'),
        camera,
      });
    }));
  }

  if (typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05')) {
    loads.push(import('./player/fonts.js').then((f) => f.applyFont('new')));
  }

  await Promise.all(loads);
  if (typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa-test' || __CHANNEL__ === 'futa05')) {
    outcomeLight = (await import('./player/atmosphere.js')).mountAtmosphere();
    (await import('./player/information.js')).mountInformation();
    (await import('./player/cards.js')).mountCards();
    glassSurface = (await import('./player/glass-surface.js')).mountGlassSurface(() => {
      $('futa04-help-button').setAttribute('aria-expanded','false');
      $('futa04-help-button').focus();
    });
    tutorialGate = mountTutorialGate({
      onBlocked: onTutorialBlocked,
      onBlockedTap: tutorialTapAnywhere,
      isPaintDragging: () => !!draw.ptr || draw.shape.length > 0,
    });
    futa04Help = (await import('./player/help.js')).mountHelp({ sheet, onBulb: toggleMatchIntel });
    smartCockpit = (await import('./player/smart-cockpit.js')).mountSmartCockpit({
      heldMove: () => session ? heldMoveWord(session.sel, session.view.hand.find((c) => c.id === session!.sel.card)?.suit === null) : null,
    });
    lessonBreath = (await import('./player/lesson-breath.js')).mountLessonBreath();
    layoutKey = '';
    if (session) render();
  }
}

/**
 * Thumb layout v2, smart overlap (test copy only): the board may reach under the fan's band by
 * up to 15% of its height, but only where every hex under a card is empty or rock, far from
 * anything that could be played there this turn (my network: 4 hexes, a Bloom's reach; the
 * opponent's: 1), with no tile, home, gold hex, target highlight or Bloom painting under a card.
 * Worked out when the board changes (not every frame); a change re-lays the page with a short
 * crossfade. Anything that would end up under a card cancels it at once.
 */
/**
 * The test copy's smart camera (lab-mode/camera.ts): what it needs on every render. DEFAULT_TILE
 * is the classic board's tile (hexagon radius 3) on this screen with the current layout.
 */
function feedCamera(v: View) {
  if (!session || !camera) return;
  const r = board.svg.getBoundingClientRect();
  if (r.width === 0) return;
  // the classic board's drawing area (board units, logic/layout.ts boardUnits for radius 3)
  const halfLong = Math.sqrt(3) * S * 3 + (Math.sqrt(3) / 2) * S + 2;
  const halfShort = 1.5 * S * 3 + S + 2;
  const flat = getOrient() === 'flat';
  const cw = 2 * (flat ? halfShort : halfLong);
  const chh = 2 * (flat ? halfLong : halfShort);
  // (on phones the map runs on under the cards: the window above them is what counts)
  const winH = r.height - (parseFloat(getComputedStyle($('board-wrap')).getPropertyValue('--cam-under')) || 0);
  const defaultTile = Math.sqrt(3) * S * Math.min(r.width / cw, winH / chh);
  const shown = queue.board;
  const tiles = Object.entries(shown).flatMap(([k, t]) => (t ? [{ key: k, owner: t.owner, ...centerOf(k) }] : []));
  const last = session.state.history?.at(-1);
  const recent = !last ? [] : last.t === 'Bloom' ? last.hexes.map((c) => centerOf(coordKey(c))) : 'coord' in last && last.coord ? [centerOf(coordKey(last.coord as { q: number; r: number }))] : [];
  const centres = new Map(Object.keys(v.board).map((k) => [k, centerOf(k)] as const));
  camera.update(
    {
      tiles,
      me: HUMAN,
      recent,
      turnKey: `${session.state.turnNumber}`,
      defaultTile,
      canMove: !busy() && !draw.shape.length && !draw.ptr && draw.desk.phase === 'idle',
    },
    centres,
  );
}

function checkOverlap(v: View) {
  if (!session || !thumbLayout) return;
  const { w, h } = gameViewport();
  const cfg = session.state.config;
  const maxHand = cfg.handSize + 1;
  const side = thumbLayout.side;
  // things under a card right now (highlights, a Bloom being painted) cancel it whatever the board
  const live = new Set<string>([...(session.sel.card !== null || session.sel.kind !== null ? targetHexes(v, session.legal, session.sel) : []), ...draw.shape]);
  const key = session.state;
  if (overlapFor === key && live.size === 0) return;
  overlapFor = key;
  const st = session.state;
  const mine: { q: number; r: number }[] = [];
  const theirs: { q: number; r: number }[] = [];
  for (const [k, t] of Object.entries(st.board)) if (t) (t.owner === HUMAN ? mine : theirs).push(parseKey(k));
  const forbidden = (k: string) => {
    const c = parseKey(k);
    if (st.board[k] || st.terrain[k] === 'rich' || live.has(k)) return true;
    return mine.some((m) => hexDistance(m, c) <= 4) || theirs.some((m) => hexDistance(m, c) <= 1);
  };
  const base = computeLayout({ w, h, ...safeArea() }, cfg.boardRadius, maxHand, side, 0);
  // only worth it when the board is held back by the height (else it can't grow)
  let pick = 0;
  // (while the camera is zoomed in, the fan stays below the board: the visible window decides)
  const camWhole = !camera || camera.isWhole();
  if (camWhole && base.board.w < base.zone.w - 1) {
    const most = Math.floor(base.board.h * THUMB.overlapMax);
    for (const f of [1, 0.75, 0.5, 0.25]) {
      const o = Math.floor(most * f);
      if (o < 8) continue;
      const l = computeLayout({ w, h, ...safeArea() }, cfg.boardRadius, maxHand, side, o);
      if (l.orient !== getOrient()) continue;
      const u = boardUnits(cfg.boardRadius, l.orient);
      const t = l.thumb!;
      const cards = fanSlots(t, maxHand).map((p) => ({ x: l.dock.x + p.x, y: l.dock.y + p.y, a: (-p.rot * Math.PI) / 180 }));
      const R = S * 0.95 * l.scale;
      const hw = t.card.w / 2 + R;
      const hh = t.card.h / 2 + R + THUMB.lift;
      const under = (k: string) => {
        const c = centerOf(k);
        const x = l.board.x + (c.x - u.x0) * l.scale;
        const y = l.board.y + (c.y - u.y0) * l.scale;
        return cards.some((cd) => {
          const dx = x - cd.x;
          const dy = y - cd.y;
          const rx = dx * Math.cos(cd.a) - dy * Math.sin(cd.a);
          const ry = dx * Math.sin(cd.a) + dy * Math.cos(cd.a);
          return Math.abs(rx) <= hw && Math.abs(ry) <= hh;
        });
      };
      // the piles sit at the dock's top left: they may lie over the map only where the cards may
      const pl = { x: l.dock.x + t.piles.x, y: l.dock.y + t.piles.y, w: t.piles.w, h: t.piles.h };
      const underPiles = (k: string) => {
        const c = centerOf(k);
        const x = l.board.x + (c.x - u.x0) * l.scale;
        const y = l.board.y + (c.y - u.y0) * l.scale;
        return x > pl.x - R && x < pl.x + pl.w + R && y > pl.y - R && y < pl.y + pl.h + R;
      };
      if (Object.keys(st.board).every((k) => !forbidden(k) || (!under(k) && !underPiles(k)))) {
        pick = o;
        break;
      }
    }
  }
  if (pick !== thumbOverlap) {
    thumbOverlap = pick;
    layoutKey = '';
    // a short crossfade while the board takes its new size
    const wrap = $('board-wrap');
    wrap.classList.remove('relayout-fade');
    void wrap.offsetWidth;
    wrap.classList.add('relayout-fade');
    requestAnimationFrame(() => render());
  }
}

/** The real draw pile, measured at the moment of exit, so the deck lands on it rather than on a guess. */
const drawPileRect = (): DOMRect | null => {
  const pile = document.querySelector<HTMLElement>('#deck .pile-card') ?? document.getElementById('deck');
  const rect = pile?.getBoundingClientRect();
  return rect && rect.width > 1 && rect.height > 1 ? rect : null;
};

/** One home tile as painted: the ritual places each dealt card beside its owner's own home. */
const homeTileRect = (seat: Player): DOMRect | null => {
  if (!session) return null;
  try {
    const key = coordKey(homeCoord(seat, session.state.config));
    const hex = document.querySelector<SVGGraphicsElement>(`#board .hex-cell[data-key="${key}"] .hex`);
    const rect = hex?.getBoundingClientRect();
    return rect && rect.width > 1 && rect.height > 1 ? rect : null;
  } catch {
    return null;
  }
};

/** One entry point for the ritual's presentation everywhere a match begins. */
async function runStarterRitual(view: StarterRitualView): Promise<void> {
  await playStarterRitual({
    view,
    reduceMotion: settings.reduceMotion,
    tempo: settings.speed,
    youLabel: 'You',
    opponentLabel: OPP.label,
    deckTarget: drawPileRect,
    // Display seat 0 is always the local player (moss/tree), online and offline alike.
    homeRects: () => ({ you: homeTileRect(HUMAN), opponent: homeTileRect(BOT) }),
  });
}

/**
 * Cold first visit only: one short, bounded wait for the board art that the first lesson composes.
 * The pictures are already downloading from the module that draws them while the menu is up, so on
 * a fast connection this measures 0-3 ms (decode only). Its real job is the slow one: there the cap
 * bounds the wait and play starts anyway, with the board filling in exactly as it did before. No
 * spinner, no separate loading screen, no overlay, nothing while the page is hidden. It runs once
 * per visit and leaves no timer behind.
 */
const WARMED_KEY = 'severgrow.board-warmed.v1';
const FIRST_WARM_CAP_MS = 800;
let firstWarm: Promise<void> | null = null;
let warmDiag: { cold: boolean; waitedMs: number } | null = null;

function warmFirstBoard(): Promise<void> {
  if (warmDiag) return firstWarm ?? Promise.resolve();
  if (firstWarm) return firstWarm;
  if (!defaultArt || store.get(WARMED_KEY)) {
    warmDiag = { cold: false, waitedMs: 0 };
    return Promise.resolve();
  }
  if (document.hidden) {
    // Nothing runs while the page is hidden: the art still loads, the board takes it as it comes.
    warmDiag = { cold: true, waitedMs: 0 };
    return Promise.resolve();
  }
  const t0 = performance.now();
  firstWarm = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      warmDiag = { cold: true, waitedMs: Math.round(performance.now() - t0) };
      store.set(WARMED_KEY, '1');
      resolve();
    };
    const timer = window.setTimeout(finish, FIRST_WARM_CAP_MS);
    void defaultArt!.boardArtReady.then(finish);
  });
  return firstWarm;
}

async function startGame(
  seed: number,
  level: Level = settings.level,
  watch: { level: Level; pause: number } | null = null,
  /**
   * THE SEAM. Only the offline campaign screen passes a level here. `campaignLevel` is what makes
   * `save()` use the campaign's own key; every other caller (classic, tutorial, rematch, a URL seed)
   * leaves it null, so no other match can carry a campaign board. Online never calls this at all —
   * its board comes from the server.
   */
  campaign: CampaignLevel | null = null,
  /**
   * The TRAINING tier this offline game came from, or null. It is what the one-game carry-over is
   * recorded against when the game ends; online never calls this at all, so it stays null there.
   */
  difficulty: DifficultyId | null = null,
  /**
   * A TUTORIAL replay (Settings → Tutorial): the SAME campaign level and opening, played without
   * touching progress or the resume save. Default false, so no other caller can become one.
   */
  tutorial = false,
) {
  let generation = ++startGameGeneration;
  // The first lesson board on a cold first visit waits (briefly, capped) for its own art. Repeat
  // visits, the side menu and every non-lesson game skip this entirely.
  if (campaign) {
    await warmFirstBoard();
    if (generation !== startGameGeneration) return;
  }
  // A server-issued ticket makes a new Training result verifiable. An offline start stays playable
  // with its local seed, but cannot claim spendable Seeds without a prior ticket.
  let ticketId: string | null = null;
  if (difficulty && onlineBuildEnabled() && !IS_TEST) {
    const ticket = await Promise.race([
      // Issued through the seed module, not the online lobby: a training game started before the
      // hub had mounted (or after its chunk failed to load) used to begin with no ticket at all,
      // which meant no proof and no payment for a game the player had already played.
      requestTrainingTicket(level),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    if (generation !== startGameGeneration) return;
    if (ticket) { seed = ticket.seed; ticketId = ticket.id; }
  }
  trainingRewardTicketId = ticketId;
  if (ticketId) store.set(TRAINING_REWARD_TICKET_KEY, JSON.stringify({ seed, id: ticketId }));
  else store.remove(TRAINING_REWARD_TICKET_KEY);
  seedRewardMessage = difficulty && onlineBuildEnabled() && !ticketId
    ? 'Seed rewards unavailable for this match' : '';
  drawPileAnchorKey = '';
  watching = IS_TEST ? watch : null;
  thumbOverlap = 0;
  overlapFor = null;
  if (IS_TEST) {
    document.body.classList.toggle('lab-watching', !!watching);
    lab?.watchingChanged(watching);
  }
  store.set(SEEN_KEY, '1');
  gameLevel = level;
  gameDifficulty = difficulty;
  campaignLevel = campaign;
  tutorialReplay = !!campaign && tutorial;
  // Read the place BEFORE the match can change it (see `campaignReplay`).
  campaignReplay = !!campaign && isReplay(campaignProgress, campaign);
  lessonNow = campaign ? lessonFor(campaign.number) : null;
  lessonSeen = new Set();
  lessonAnswerText = '';
  lessonShownKey = '';
  if (lessonNow) saveLessonMeta();
  // Campaign first (the only production source of overrides), then the test copy's Lab experiment,
  // otherwise {} — the classic game's own configuration.
  const overrides = overridesForMatch(campaign, IS_TEST, IS_TEST && lab ? lab.overrides() : {});
  // Futasaku 0.4 starts from the engine's versioned match setup, so the client and the server
  // verifier agree on who moves first. The classic live channel keeps its historical player-0 start.
  // Levels 1-10 open from their lesson's authored position (the engine's own cards and board).
  const opening = lessonNow ? lessonOpening(lessonNow) : IS_FUTA04 ? newMatch(seed, overrides) : newGame(seed, overrides);
  const opponentStarts = opening.startingPlayer === BOT;
  const state: State = opening;
  log = [
    campaign
      ? `${CAMPAIGN.started(campaign.number)}. ${opponentStarts ? `${OPP.label} goes first.` : 'You go first.'}`
      : `New ${matchLabel({ campaign: null, difficulty, botLevel: level })} practice match. ${opponentStarts ? `${OPP.label} goes first.` : 'You go first.'}`,
  ];
  // The pre-game ritual is the product's own opening for every match — practice, a campaign level
  // from 10 on (that is where the hand-held lessons end), and online. Levels 1-9 keep their authored
  // openings and skip it. The board/session is prepared BEFORE the ritual so the player sees the
  // real match behind it and the first legal tap is available the instant it leaves.
  const playRitual = playsStarterRitual(IS_FUTA04, campaign?.number ?? null);
  // A campaign match always keeps its opening as the replay base: the save must replay under the
  // LEVEL's config (its authored board), never under the default config.
  beginSession(state, null, [], campaign || opponentStarts ? state : null, playRitual);
  // A lesson's stage card waits for the ritual below: the ceremony owns the screen until it
  // resolves, and level 10's send-off is the last beat before the first move. Levels 1-9 have no
  // ritual, so their stage starts here, exactly as it always has.
  if (lessonNow && !playRitual) startLessonStage();
  // beginSession freshens the generation token for THIS match; another entry starting a match now
  // would supersede it and the checks below would stop this older start from touching that one.
  generation = startGameGeneration;
  save();
  if (playRitual) {
    const view = starterRitualView(
      offlineRitualKey(seed),
      opening.startingPlayer ?? opening.turnPlayer,
      HUMAN,
    );
    try {
      await runStarterRitual(view);
    } catch {
      /* presentation can never hold the match */
    } finally {
      if (generation === startGameGeneration) pregameHold = false;
    }
    if (generation !== startGameGeneration) return;
    // The hand has NOT been dealt yet: `dealIn()` below starts it. `beginSession` set
    // `handSettled = true` (it cannot know a ritual is coming), so without this the send-off would
    // paint during this render and then sit there while the cards flew in — a beat with the hand
    // still moving, which is exactly what a lesson must never show. Holding the gate makes the
    // send-off the last beat before the first move, as intended.
    handSettled = false;
    render(); // lift the ritual gate and draw the controls in their real, playable state
    // Every lesson still opens with its stage card, level 10 included: `lessons-3` pins that
    // contract for all ten levels, and the ceremony precedes it rather than replacing it.
    if (lessonNow) startLessonStage();
  }
  dealIn();
  firstToolTips();
  announceTurn(state.turnPlayer);
  // The bot was held while the cards were on screen; start its clock only now (live's rule), for
  // THIS match, before the door to the next one is opened.
  if (playRitual) scheduleBot();
  // Only then release the restart guard. The flags are released by the new session, not by a timer,
  // so a double tap can never start two games: a press that arrives while `restarting` is still set
  // is dropped, and the match it would have replaced has already had its bot scheduled.
  restarting = false;
  resultAdvance = false;
}

/** Opens a campaign level as a fresh, reproducible match. The fixed seed makes the start identical. */
function startCampaignLevel(level: CampaignLevel) {
  // ONE door, and it checks the order itself: a level is only startable when every level before it
  // has been won. The tiles already disable locked levels, but a guard here means no future caller
  // (a deep link, a test hook, a stale save) can skip the campaign by starting a level directly.
  if (!isUnlocked(campaignProgress, level)) return showScreen('campaign');
  gameOverDismissed = true;
  void startGame(level.seed, level.botLevel, null, level);
}

function clearFreePlayBulbNudge() {
  clearTimeout(freePlayBulbIdleTimer);
  clearTimeout(freePlayBulbBlinkTimer);
  freePlayBulbIdleTimer = 0;
  freePlayBulbBlinkTimer = 0;
  freePlayBulbArmed = false;
  freePlayBulbBlinking = false;
  document.getElementById('futa04-help-button')?.classList.remove('free-play-bulb-blink');
}

/** FreeTurn only: after 6s idle, blink the Match Intel bulb for 3s; repeat until a move starts. */
function syncFreePlayBulbNudge() {
  if (!tutorialFreePlayActive() || !session || $('game').hidden) {
    clearFreePlayBulbNudge();
    return;
  }
  const moveActive = document.documentElement.classList.contains('futa04-move-active');
  const waiting = myTurn() && !busy() && !moveActive && session.state.phase !== 'GAME_OVER';
  if (!waiting) {
    clearFreePlayBulbNudge();
    return;
  }
  if (freePlayBulbArmed || freePlayBulbBlinking) return;
  freePlayBulbArmed = true;
  freePlayBulbIdleTimer = window.setTimeout(() => {
    freePlayBulbArmed = false;
    if (!tutorialFreePlayActive() || !session || !myTurn() || busy()) return;
    if (document.documentElement.classList.contains('futa04-move-active')) return;
    const btn = document.getElementById('futa04-help-button');
    if (!btn || btn.hidden) {
      syncFreePlayBulbNudge();
      return;
    }
    freePlayBulbBlinking = true;
    btn.classList.add('free-play-bulb-blink');
    freePlayBulbBlinkTimer = window.setTimeout(() => {
      btn.classList.remove('free-play-bulb-blink');
      freePlayBulbBlinking = false;
      syncFreePlayBulbNudge();
    }, 3000);
  }, 6000);
}

/** Bulb tap during free play: stop blink and restart the 6s idle wait (do not open tutorial glass). */
function noteFreePlayBulbInteraction() {
  if (!tutorialFreePlayActive()) return;
  clearFreePlayBulbNudge();
  syncFreePlayBulbNudge();
}

function clearTutorialTimers() {
  tutorialRoutineThrowKey = '';
  clearTimeout(tutorialIdleTimer);
  clearTimeout(tutorialPraiseTimer);
  clearFreePlayBulbNudge();
  tutorialStatus = null;
  tutorialTargetSelector = '';
  tutorialLookTapCleanup?.();
  tutorialLookTapCleanup = null;
  glassSurface?.setIdleHard?.(false);
}

function releaseTutorialLock() {
  clearTutorialTimers();
  tutorialGate?.clear();
  glassSurface?.hide();
  tutorialDisplayKey = '';
  tutorialTransitionPending = false;
  document.documentElement.classList.remove('futa04-tutorial');
}

/** Dead taps stay silent — the gate already swallows them; never flash a "locked" toast. */
function onTutorialBlocked() {
  /* no-op */
}

let lastTapAnywhere = 0;
/** On an explanation (Next) step, a tap anywhere the step does not use moves on. */
function tutorialTapAnywhere() {
  const progress = coach.tutorial;
  if (!progress || openSheet || busy() || tutorialTransitionPending) return;
  if (tutorialLesson(progress.chapter, progress.step)?.action !== 'Next') return;
  const now = performance.now();
  if (now - lastTapAnywhere < 350) return;
  lastTapAnywhere = now;
  tutorialNext();
}

function syncTutorialGate() {
  if (!tutorialGate) return;
  const progress = coach.tutorial;
  if (!progress || !session) {
    tutorialGate.clear();
    return;
  }
  const lesson = tutorialLesson(progress.chapter, progress.step);
  // Free play: no input lock — bulb and board stay fully usable.
  if (lesson?.action === 'FreeTurn') {
    tutorialGate.clear();
    return;
  }
  // Pause menu / sheets stay fully usable; menu button stays reachable.
  if (openSheet) {
    tutorialGate.set({
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS, ...GATE_SHEET_SELECTORS],
    }, 'step');
    return;
  }
  if (lesson?.autoDiscard) {
    tutorialGate.set(allowedSelectorsForLesson(null, '', 'busy'), 'busy');
    return;
  }
  const lockedBusy = busy() || tutorialTransitionPending
    || lesson?.action === 'Opponent'
    || (!!lesson && !myTurn());
  if (lockedBusy) {
    tutorialGate.set(allowedSelectorsForLesson(lesson ?? null, '', 'busy'), 'busy');
    glassSurface?.hideFocus?.();
    return;
  }
  if (!lesson) {
    tutorialGate.set(allowedSelectorsForLesson(null, '', 'busy'), 'busy');
    return;
  }
  const allow = allowedSelectorsForLesson(lesson, tutorialTargetSelector, 'step');
  tutorialGate.set(allow, 'step');
}

function exitTutorial() {
  releaseTutorialLock();
  store.remove(SAVE_KEY);
  coach = freshCoach();
  releaseThrowSwell();
  session = null;
  showScreen('menu');
  // Drop tutorial query so Back / reload does not re-enter the lock.
  try {
    const url = new URL(location.href);
    if (url.searchParams.has('tutorial') || url.searchParams.has('chapter')) {
      url.searchParams.delete('tutorial');
      url.searchParams.delete('chapter');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch { /* ignore */ }
}

/** Saves from before the core run / extra lessons split restart their chapter (see continueGame). */
const TUTORIAL_VERSION = 3 as const;

function startTutorial(chapter = 0, track = tutorialTrackFor(chapter)) {
  clearTutorialTimers();
  const state = tutorialChapter(chapter);
  log = ['A small match, played to learn.'];
  gameLevel = 7;
  gameDifficulty = null; // the tutorial is its own match, never one of the training tiers
  campaignLevel = null; // the guided run is not a campaign level
  tutorialReplay = false;
  campaignReplay = false;
  tipOpen = null;
  beginSession(state, { ...freshCoach(), tutorial: { chapter, step: 0, version: TUTORIAL_VERSION, track } }, [], state);
  save();
  announceTurn(HUMAN);
  syncTutorialGate();
  // So the browser Back button can leave the lock without trapping the player.
  try {
    if (history.state?.futasakuTutorial !== true) {
      history.pushState({ futasakuTutorial: true, chapter }, '', location.href);
    }
  } catch { /* ignore */ }
}

/** The full tutorial ('core') — the one guided run the main menu starts from its top. */
function startTutorialFromMenu() {
  if (!$('menu-continue').hidden && !window.confirm('Start the tutorial? Your saved game will be replaced.')) return;
  startTutorial(0, 'core');
}

/**
 * The campaign's ONE entry point — the campaign screen's own leading action, and (owner direction,
 * 2026-10-16) where the guided run now hands the player off. With nothing saved it opens the
 * player's CURRENT level (level 1 for a new player, their own level for one who has progressed).
 * With an unfinished saved match it ASKS first (owner decision, 2026-10-19), naming the level being
 * entered. There is deliberately no second way to start a level.
 */
function enterCampaign() {
  const entry = campaignEntry(campaignProgress, campaignResume()?.level ?? null);
  // No level is left: the chapter list is the only honest destination, and it carries the resume
  // hint and the finished-campaign state the menu cannot show in one line.
  if (entry.kind === 'list') return showScreen('campaign');
  if (entry.kind === 'start') return startCampaignLevel(entry.level);
  // ANY saved match asks first (owner decision, 2026-10-19): the player tapped a level, so the
  // question is about that level — continue it or start it over (or, if the save belongs to a
  // different level, resume that one or start the next). Nothing resumes silently from here.
  return askCampaignStart(entry.next, entry.saved);
}

/** The saved match the ask sheet is currently about, or null when it is closed. */
let campaignAsk: { next: CampaignLevel; saved: CampaignLevel } | null = null;

function askCampaignStart(next: CampaignLevel, saved: CampaignLevel) {
  campaignAsk = { next, saved };
  // Owner decision (2026-10-19): entering a level with an unfinished save always asks. When the
  // save belongs to THAT level, the two answers are "continue this level" and "start it over";
  // when it belongs to a different level, they are "resume the saved level" and "start this one".
  const sameLevel = saved.id === next.id;
  $('csa-title').textContent = CAMPAIGN.askTitle(saved.number, next.number);
  $('csa-body').textContent = CAMPAIGN.askBody(saved.number, next.number);
  $('csa-resume').textContent = sameLevel ? CAMPAIGN.askContinue(saved.number) : CAMPAIGN.askResume(saved.number);
  $('csa-start').textContent = sameLevel ? CAMPAIGN.askRestart(next.number) : CAMPAIGN.askStart(next.number);
  sheet('sheet-campaign-start');
  // `sheet()` focuses the close control when one exists; here the point of the sheet is the choice,
  // so Resume leads with focus as well as with the primary weight.
  $('csa-resume').focus();
}

function completeTutorial() {
  const my = epoch;
  releaseTutorialLock();
  smartCockpit?.event({ message: 'NICE.', priority: 97, duration: 850, mode: 'green' });
  window.setTimeout(() => { if (my === epoch) smartCockpit?.event({ message: '点', priority: 98, duration: 650, mode: 'amber' }); }, 900);
  window.setTimeout(() => {
    if (my !== epoch) return;
    store.remove(SAVE_KEY);
    coach = freshCoach();
    tutorialGate?.clear();
    glassSurface?.hide();
    // Owner direction (2026-10-16): "after tutorial it takes you to level 1". Finishing the guided
    // run now hands the player to a REAL level through the campaign's own entry point, rather than
    // back to a menu. A player who has already progressed lands on their current level, not on a
    // level they beat long ago. The legacy channels (no campaign) keep the menu they always had.
    if (FEATURES.campaign) return enterCampaign();
    showScreen('menu');
  }, 1750);
}

/** The fade through black while the tutorial swaps the board: in, out (ms). */
const CURTAIN_IN = 160;
const CURTAIN_OUT = 240;

/**
 * Runs `swap` (a new chapter or position on the board) behind a short fade through black, so
 * the hand and board never jump. Skipped with Speed off or when the game is not on screen; if
 * the tutorial is left during the fade, nothing is swapped in.
 */
function tutorialCurtain(swap: () => void) {
  if (timeScale() <= 0 || $('game').hidden) return swap();
  let el = document.getElementById('tutorial-curtain');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tutorial-curtain';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--curtain-in', `${CURTAIN_IN}ms`);
    el.style.setProperty('--curtain-out', `${CURTAIN_OUT}ms`);
    document.body.append(el);
  }
  const curtain = el;
  const owner = coach.tutorial;
  curtain.classList.add('on');
  window.setTimeout(() => {
    if (coach.tutorial === owner) swap();
    // two frames: the new board is painted before the curtain starts to lift
    requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove('on')));
  }, CURTAIN_IN);
}

/** Next chapter of the track, or the end of the track (null). */
function advanceTutorialChapter(chapter: number | null, track = 'core') {
  if (chapter === null || chapter >= TUTORIAL_CHAPTER_COUNT) return completeTutorial();
  clearTutorialTimers();
  tutorialGate?.set(allowedSelectorsForLesson(null, '', 'busy'), 'busy');
  tutorialCurtain(() => {
    const state = tutorialChapter(chapter);
    log = [`Tutorial chapter ${chapter + 1}.`];
    beginSession(state, { ...freshCoach(), tutorial: { chapter, step: 0, version: TUTORIAL_VERSION, track } }, [], state);
    save();
    announceTurn(HUMAN);
    syncTutorialGate();
  });
}

/** If the next lesson is Throw but Grow is still open, skip Grow silently. */
function ensureTutorialThrowPhase() {
  if (!session || session.state.actor !== HUMAN) return;
  const progress = coach.tutorial;
  if (!progress) return;
  const lesson = tutorialLesson(progress.chapter, progress.step);
  if (lesson?.action !== 'Discard') return;
  const run = () => {
    if (!session || !coach.tutorial || session.state.phase !== 'ACT' || session.state.actor !== HUMAN) return;
    const end = session.legal.find(a => a.t === 'EndAct');
    if (!end) return;
    // The app skips a Grow the lesson has no use for; not a move the player made (see Session.play).
    const played = session.play(end, HUMAN, { auto: true });
    if (played) afterPlay(played, HUMAN, null);
  };
  if (busy()) void idle().then(run);
  else run();
}

function tutorialAdvanceStep() {
  const progress = coach.tutorial;
  if (!progress) return;
  progress.step++;
  tutorialDisplayKey = '';
  tutorialStatus = null;
  const next = tutorialLesson(progress.chapter, progress.step);
  if (next?.reseat) {
    tutorialCurtain(() => {
      const state = tutorialChapter(progress.chapter, next.reseat);
      beginSession(state, { ...coach, tutorial: { ...progress } }, [], state);
      save();
      announceTurn(HUMAN);
    });
    return;
  }
  if (next) {
    if (next.rewind) tutorialRewind(progress.step);
    ensureTutorialThrowPhase();
    armTutorialIdle();
    return;
  }
  tutorialStatus = tutorialFeedback('chapter-done');
  tutorialTransitionPending = true;
  const my = epoch;
  window.setTimeout(() => {
    if (my !== epoch) return;
    tutorialStatus = null;
    void idle().then(() => { if (my === epoch) advanceTutorialChapter(nextTutorialChapter(progress.chapter, progress.track), progress.track); });
  }, 900);
}

/**
 * A rewind step: once the last move has finished playing, take it back with Undo (its tiles sink
 * back into the hand). The step stays locked until the rewind is done.
 */
function tutorialRewind(step: number) {
  const owner = coach.tutorial;
  tutorialTransitionPending = true;
  const my = epoch;
  void idle().then(() => window.setTimeout(() => {
    if (coach.tutorial !== owner || owner?.step !== step) return;
    if (my === epoch && session?.canUndo) undoMove();
    tutorialTransitionPending = false;
    tutorialDisplayKey = '';
    render();
  }, 500));
}

function tutorialNext() {
  const progress = coach.tutorial;
  if (!progress) return;
  const lesson = tutorialLesson(progress.chapter, progress.step);
  if (!lesson || lesson.action !== 'Next') return;
  tutorialAdvanceStep();
  render();
}

/** Jump to an authored tutorial beat — always rebuilds engine state so Previous can't desync. */
function tutorialSeek(chapter: number, step: number) {
  clearTutorialTimers();
  tutorialDisplayKey = '';
  tutorialStatus = null;
  tutorialTransitionPending = false;
  const track = coach.tutorial?.track;
  tutorialCurtain(() => {
    const state = tutorialStateAt(chapter, step);
    beginSession(state, { ...freshCoach(), tutorial: { chapter, step, version: TUTORIAL_VERSION, ...(track ? { track } : {}) } }, [], state);
    save();
    announceTurn(HUMAN);
    ensureTutorialThrowPhase();
    syncTutorialGate();
  });
}

function tutorialPrevious() {
  const progress = coach.tutorial;
  if (!progress) return;
  if (progress.step > 0) {
    tutorialSeek(progress.chapter, progress.step - 1);
    return;
  }
  const prev = previousTutorialChapter(progress.chapter, progress.track);
  if (prev !== null) {
    const last = Math.max(0, tutorialLessons(prev).length - 1);
    tutorialSeek(prev, last);
  }
}

/** Start the first legal Bloom / Blast recipe (tutorial bypasses the multi-recipe menu). */
function tutorialAssistBloom(action: 'Bloom' | 'MegaBomb'): boolean {
  if (!session) return false;
  if (action === 'Bloom' && session.sel.kind?.startsWith('bloom-') && !session.sel.kind.startsWith('bloom-mega-')) {
    glassSurface?.nudge();
    return true;
  }
  const kinds = moveButtons(session.view, session.legal, EMPTY_SEL, true);
  if (action === 'MegaBomb') {
    const mega = kinds.find(k => k.kind.startsWith('bloom-mega-'));
    if (!mega) return false;
    bloomMenu = false;
    session.tapKind(mega.kind);
    smartCockpit?.hint('BLAST');
    render();
    return true;
  }
  const bloom = kinds.find(k => k.kind.startsWith('bloom-') && !k.kind.startsWith('bloom-mega-'));
  if (!bloom) return false;
  beginBloomKind(bloom.kind);
  smartCockpit?.hint('BLOOM');
  render();
  return true;
}

/** Look-and-tap: target tap AND Next both advance; Bloom/Blast on the glow starts the recipe. */
function armTutorialLookTap(lesson: { action: string }, selector: string) {
  tutorialLookTapCleanup?.();
  tutorialLookTapCleanup = null;
  if (!selector) return;
  if (lesson.action === 'Next') {
    // Arm immediately — do not wait for the delayed NEXT button. Home / look steps
    // must advance from either tapping the glow target or pressing NEXT.
    const onTap = (event: Event) => {
      const el = event.target as Element | null;
      if (!el || typeof el.closest !== 'function') return;
      if (!el.closest(selector)) return;
      event.preventDefault();
      event.stopPropagation();
      tutorialNext();
    };
    document.addEventListener('click', onTap, true);
    tutorialLookTapCleanup = () => document.removeEventListener('click', onTap, true);
    return;
  }
  if (lesson.action === 'Bloom' || lesson.action === 'MegaBomb') {
    const onTap = (event: Event) => {
      const el = event.target as Element | null;
      if (!el || typeof el.closest !== 'function') return;
      // Glow is the bloom control — don't steal taps once painting has started.
      if (session?.sel.kind?.startsWith('bloom-')) return;
      if (!el.closest('#smart-bloom-button, #smart-bloom, #moves button[data-kind], #moves .bloom-toggle')) return;
      event.preventDefault();
      event.stopPropagation();
      tutorialAssistBloom(lesson.action as 'Bloom' | 'MegaBomb');
    };
    document.addEventListener('click', onTap, true);
    tutorialLookTapCleanup = () => document.removeEventListener('click', onTap, true);
  }
}

function armTutorialIdle() {
  clearTimeout(tutorialIdleTimer);
  glassSurface?.setIdleHard?.(false);
  if (!coach.tutorial) return;
  tutorialIdleTimer = window.setTimeout(() => {
    if (!coach.tutorial) return;
    glassSurface?.setIdleHard?.(true);
    tutorialDisplayKey = '';
    render();
  }, 6000);
}

function tutorialAfterPlay(p: Played, by: Player) {
  const progress = coach.tutorial;
  if (!progress) return;
  const lesson = tutorialLesson(progress.chapter, progress.step);
  if (!lesson) return;
  if (lesson.action === 'FreeTurn') {
    if (by === HUMAN && (p.after.turnPlayer !== HUMAN || p.after.phase === 'GAME_OVER')) {
      progress.step++;
      tutorialTransitionPending = true;
      const my = epoch;
      // the free turn is done: on to the rest of the track (the button tour), or the end
      void idle().then(() => { if (my === epoch) advanceTutorialChapter(nextTutorialChapter(progress.chapter, progress.track), progress.track); });
    }
    return;
  }
  if (lesson.action === 'Next') return;
  if (lesson.action === 'Opponent') {
    if (by !== BOT || (p.after.actor !== HUMAN && p.after.phase !== 'GAME_OVER')) return;
  } else if (by !== HUMAN || !tutorialAccepts(lesson, p.action, p.before)) return;
  clearTimeout(tutorialIdleTimer);
  const doPraise = TUTORIAL_PRAISE_IDS.has(lesson.id);
  tutorialStatus = doPraise ? tutorialFeedback('praise', lesson) : null;
  tutorialDisplayKey = '';
  clearTimeout(tutorialPraiseTimer);
  const advance = () => {
    tutorialStatus = null;
    tutorialAdvanceStep();
    render();
  };
  if (doPraise) tutorialPraiseTimer = window.setTimeout(advance, 600);
  else advance();
}

/** Resumes a saved campaign match as the level it belongs to (its board comes from the save's base). */
function continueCampaignMatch(r: { level: CampaignLevel; saved: Loaded<CoachProgress> }) {
  // A lesson resumes only under the very lesson it was started with; a changed lesson starts over.
  const lesson = lessonFor(r.level.number);
  if (lesson) {
    const meta = decodeLessonMeta(store.get(LESSON_META_KEY));
    if (!lessonResumable(meta, lesson)) return startCampaignLevel(r.level);
    lessonSeen = new Set(meta!.seen);
  }
  lessonNow = lesson;
  lessonAnswerText = '';
  lessonShownKey = '';
  log = [CAMPAIGN.started(r.level.number)];
  watching = null;
  if (IS_TEST) {
    document.body.classList.remove('lab-watching');
    lab?.watchingChanged(null);
  }
  campaignLevel = r.level;
  tutorialReplay = false;
  campaignReplay = isReplay(campaignProgress, r.level);
  gameLevel = r.saved.level;
  gameDifficulty = null; // a campaign level is not a training tier: it never writes a carry-over
  store.set(LAST_MODE_KEY, 'campaign');
  beginSession(r.saved.state, r.saved.coach, r.saved.actions, r.saved.base ?? null);
  if (lessonNow) startLessonStage();
}

function continueGame() {
  // Continue resumes whichever offline match the player last played: the campaign match when one is
  // unfinished and newer, otherwise the classic saved game (unchanged).
  if (FEATURES.campaign && parseLastMode(store.get(LAST_MODE_KEY)) === 'campaign') {
    const campaign = campaignResume();
    if (campaign) return continueCampaignMatch(campaign);
  }
  const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
  if (!saved) return startGame(randomSeed());
  const lesson = saved.coach?.tutorial;
  if (lesson) {
    if (lesson.version !== TUTORIAL_VERSION) {
      // v3 split the tutorial into a core run and extra lessons and trimmed some steps:
      // restart the saved chapter from its first step, in the track it now belongs to.
      // Old 10-chapter saves map to the matching chapter by lesson family.
      const chapter = lesson.version === 2 && tutorialLesson(lesson.chapter, 0)
        ? lesson.chapter
        : migrateTutorialProgress(lesson).chapter;
      return advanceTutorialChapter(chapter, tutorialTrackFor(chapter));
    }
  }
  log = ['Welcome back.'];
  watching = null;
  if (IS_TEST) {
    document.body.classList.remove('lab-watching');
    lab?.watchingChanged(null);
  }
  gameLevel = saved.level;
  // A resumed training game keeps its tier, so finishing it still earns the one-game carry-over.
  gameDifficulty = saved.difficulty ?? null;
  try {
    const ticket = JSON.parse(store.get(TRAINING_REWARD_TICKET_KEY) ?? 'null') as { seed?: number; id?: string } | null;
    trainingRewardTicketId = gameDifficulty && ticket?.seed === saved.seed && typeof ticket.id === 'string' ? ticket.id : null;
  } catch { trainingRewardTicketId = null; }
  campaignLevel = null; // a resumed classic match is never a campaign match
  tutorialReplay = false;
  campaignReplay = false;
  store.set(LAST_MODE_KEY, 'classic');
  beginSession(saved.state, saved.coach, saved.actions, saved.base);
}

// ---------- the coach ----------

let adviceMemo: { key: string; state: State; advice: Advice | null } | null = null;
function currentAdvice(): Advice | null {
  if (isOnlineDuel()) return null; // tutorial coach / hidden-deck hints off online
  if (!session || coach.tutorial || session.state.actor !== HUMAN || session.state.phase === 'GAME_OVER') return null;
  const key = `${coach.choice}|${coach.step}`;
  if (adviceMemo && adviceMemo.state === session.state && adviceMemo.key === key) return adviceMemo.advice;
  // The coach is part of the teaching, not a preference (owner, 2026-10-17: "keep the advice
  // always on in Match Intel"). Its switch is gone from Settings, so nothing can turn it off.
  const advice = coachAdvice({ view: session.view, step: coach.step, enabled: true, taught: coach.taught, known: coach.known }, coach.choice);
  adviceMemo = { key, state: session.state, advice };
  return advice;
}

// ---------- playing moves ----------

function rememberRemoved(steps: readonly Step[], before: State) {
  for (const s of steps) if (s.k === 'sever' || s.k === 'remove' || s.k === 'megaBomb') {
    const keys = s.k === 'megaBomb' ? s.destroyed : s.keys;
    const former = new Map<string, Tile>();
    for (const key of keys) {
      const tile = before.board[key];
      if (tile) former.set(key, { ...tile });
    }
    removedTiles.set(s, former);
  }
}

function afterPlay(p: Played, by: Player, advice: Advice | null) {
  const taught = by === HUMAN ? lessonActive() : null;
  if (taught) {
    // Level 6 teaches Surround with ordinary Grow placements until the final one; count those as
    // the Surround action, or its light could never fade within the lesson.
    const rawKind = actionKindOf(p.before, p.action, p.after);
    const kind = rawKind === 'grow' && taught.goals.some((g) => g.t === 'strangle') && lessonTierKind === 'surround'
      ? 'surround' : rawKind;
    if (kind) {
      lessonMastery = recordAction(lessonMastery, kind, {
        level: taught.level,
        ...(kind === lessonTierKind ? { tier: lessonTierShown } : {}),
        newActions: taught.newActions,
      });
      saveLessonMastery();
    }
    // A correct action ends the moment: the next step starts from zero wrong taps, and a hello
    // that was on screen has done its job.
    lessonWrongInStep = 0;
    lessonEscalated = false;
    lessonHelloNow = null;
    clearTimeout(lessonHelloTimer);
    lessonHelloTimer = 0;
  }
  let displayEvent = IS_FUTA04 ? displayEventForPlay(p.before,p.after,p.steps,HUMAN) : null;
  if (displayEvent?.flavour && coach.tutorial && coach.tutorial.chapter<5) {
    const {flavour: _flavour,...quiet}=displayEvent;
    displayEvent=quiet;
  }
  log.unshift(describe(p.before, p.action, p.after, HUMAN));
  if (p.after.phase === 'GAME_OVER' && p.after.result) {
    log.unshift(`${resultTitle(p.after.result, HUMAN)}. ${resultReason(p.after.result, HUMAN)}`);
    if (p.before.phase !== 'GAME_OVER' && !watching && !coach.tutorial) {
      stats = recordResult(stats, p.after.result, HUMAN, gameLevel);
      store.set(STATS_KEY, JSON.stringify(stats));
      // The install invitation counts EVERY finished game — offline here, online at the finish
      // screen — and never a tutorial step (the guard above already excludes the tutorial).
      noteFinishedForInstall(p.after.result.winner === HUMAN ? 'won' : p.after.result.winner === null ? 'draw' : 'lost');
      // Player stats in the profile: this game's moves join the record (logic/play-record.ts).
      store.set(PLAY_KEY, JSON.stringify(recordPlay(parsePlay(store.get(PLAY_KEY)), p.after.history ?? [], HUMAN)));
      // The one-game carry-over, earned by this finished game: a win steps the training tier's next
      // game one bot level UP, a loss one DOWN (and never outside the tier). Anything else clears
      // that tier's pending step. Online duels and campaigns carry a null tier, so they never write.
      if (gameDifficulty) {
        const winner = p.after.result.winner;
        const outcome = winner === HUMAN ? 'win' : winner === null ? 'draw' : 'loss';
        writeDifficultyStep(gameDifficulty, stepAfterGame(gameDifficulty, gameLevel, outcome));
      }
      // Campaign progress: a win unlocks the next level and marks this one completed; a loss
      // removes nothing. Its own record — the classic stats above are never reshaped by it.
      // A TUTORIAL replay returns the SAME record (progressAfterMatch), so a replay can never
      // mark a level, unlock anything, or rewrite the record on its way through.
      if (campaignLevel) {
        const kind: CampaignMatchKind = tutorialReplay ? 'tutorial' : 'campaign';
        const after = progressAfterMatch(campaignProgress, kind, campaignLevel, {
          won: p.after.result.winner === HUMAN,
          score: p.after.result.scores[HUMAN],
          turns: p.after.turnNumber,
        });
        if (after !== campaignProgress) {
          campaignProgress = after;
          saveCampaignProgress();
        }
      }
      if (onlineBuildEnabled() && session) {
        // Levels 1-9 (lessons) pay no Seeds. Level 10, the final lesson, pays 100 once (owner,
        // 2026-10-24): it is a real game from one authored opening (lessons/final.ts), which the
        // server replays like a Campaign level, so its win sends a proof under the id `lesson-10`.
        const finalLessonWon = lessonNow?.level === FINAL_LESSON.level && p.after.result.winner === HUMAN;
        const proof = finalLessonWon
          ? { kind: 'campaign' as const, levelId: FINAL_LESSON.id, actions: [...session.log], botVersion: CURRENT_BOT_VERSION }
          : campaignLevel && !lessonNow && !tutorialReplay && p.after.result.winner === HUMAN
          ? { kind: 'campaign' as const, levelId: campaignLevel.id, actions: [...session.log], botVersion: CURRENT_BOT_VERSION }
          : gameDifficulty && trainingRewardTicketId
            ? { kind: 'training' as const, ticketId: trainingRewardTicketId, actions: [...session.log], botVersion: CURRENT_BOT_VERSION }
            : null;
        if (proof) {
          queueSeedProof(store, proof);
          // NOTHING is claimed until the server has answered. The card used to be handed a line
          // saying the Seeds were "pending verification", and it stayed there for the whole session
          // when the settle could not run (a hung request, a lobby that never mounted, or a proof
          // refused with 400). Owner report, 2026-10-25: a card must never rest on a claim nobody
          // has written a receipt for.
          seedRewardMessage = '';
          const key = proof.kind === 'campaign' ? `campaign:${proof.levelId}` : `training:${proof.ticketId}`;
          settleSeedsForCard(key);
        }
      }
    }
  }
  log = log.slice(0, 300);
  if (by === HUMAN && !coach.tutorial) {
    coach.step++;
    if (advice?.tip && !coach.taught.includes(advice.tip.id)) coach.taught.push(advice.tip.id);
    if (advice) coach.known = advice.known;
    coach.choice = 0;
  }
  for (const s of p.steps) if (s.k === 'draw' && s.player === HUMAN && s.card) hiddenCards.add(s.card.id);
  rememberRemoved(p.steps, p.before);
  const cue = IS_FUTA04 ? outcomeCue(p.steps, HUMAN) : null;
  if (cue) outcomeSteps.set(cue.step, cue);
  if (displayEvent) {
    const anchor = cue?.step ?? p.steps.find(step=>step.k==='sync');
    if (anchor) displaySteps.set(anchor,displayEvent);
  }
  markMoment(p.steps, p.before);
  queue.push(p.steps);
  tutorialAfterPlay(p,by);
  // the opponent's turn starts: work it out now, so its pace is known when its turn is shown
  if (p.after.phase === 'DRAW' && p.after.turnPlayer === BOT) void planBotTurn(p.after).then((plan) => (botPlan = plan));
  save();
  if (!p.before.deckFinal && p.after.deckFinal) smartCockpit?.event({message:p.after.deckFinal.remaining === 2 ? 'FINAL TURNS' : 'FINAL TURN',priority:75,duration:1500,mode:'amber'});
  else if (p.before.deckFinal?.remaining === 2 && p.after.deckFinal?.remaining === 1) smartCockpit?.event({message:'LAST TURN',priority:75,duration:1500,mode:'amber'});
  render();
  void pump();
  scheduleBot();
}

/** The player plays `a` (from Confirm, a single tap, or the coach). */
/**
 * An offline finish, counted for the install invitation. Levels 1-3 (lessons) never invite, and
 * levels 4-10 wait until their finish card is closed (`flushInstallInvite`): the invitation never
 * covers a lesson's win. Every other mode counts at once, as before.
 */
function noteFinishedForInstall(outcome: 'won' | 'lost' | 'draw', later = false) {
  const taughtLevel = later ? undefined : lessonActive()?.level;
  if (taughtLevel !== undefined) {
    if (taughtLevel > 3) pendingInstallOutcome = outcome;
    return;
  }
  installPrompt.noteFinished(outcome);
}
/**
 * Offer the deferred invitation once the player is OUT of a match.
 *
 * The deferral exists so the invitation never covers a lesson's win, but a player who closes the
 * finish card and goes straight into the next level had it open over a LIVE match: the badge stands
 * down behind that modal (one mark per screen), so the lesson ran with no logo at all and the
 * invitation covered the board. While a game or its finish card is on screen the outcome is kept,
 * and `drainInstallInvite` offers it the moment the player is back on a menu.
 */
function flushInstallInvite() {
  const outcome = pendingInstallOutcome;
  pendingInstallOutcome = null;
  if (!outcome) return;
  window.setTimeout(() => {
    if (!inPlayableScreen()) { noteFinishedForInstall(outcome, true); return; }
    pendingInstallOutcome = outcome; // offered by the next drain, on a menu
  }, 900);
}

/** True while a match or its result owns the screen — never a place for the invitation. */
const inPlayableScreen = (): boolean => !$('game').hidden || !$('gameover').hidden;

/** Offers an invitation that was deferred out of a live match, once the player is back on a menu. */
function drainInstallInvite() {
  if (!pendingInstallOutcome || inPlayableScreen()) return;
  flushInstallInvite();
}

function humanPlay(a: Action, opts: { auto?: boolean; flightFrom?: DOMRect } = {}) {
  bloomPick = []; // a move is made: nothing stays held toward a Bloom
  // Was this throw made from the picked card? Then the Throw pile is swollen right now, and the
  // swell belongs to the flight, not only to the selection.
  const fromPickedPile = a.t === 'Discard' && !!session && session.pending?.t === 'Discard' && session.pending.card === a.card;
  // The » step, taken once in a lesson, is taught: from then on the game moves on by itself.
  if (isOnlineDuel()) {
    void humanPlayOnline(a, opts.flightFrom);
    return;
  }
  if (!session || (coach.tutorial && tutorialTransitionPending)) return;
  const lesson=coach.tutorial && tutorialLesson(coach.tutorial.chapter,coach.tutorial.step);
  if (lesson && lesson.action !== 'Next' && !tutorialAccepts(lesson,a,session.state)) {
    if (!settings.reduceMotion) glassSurface?.nudge();
    tutorialStatus = tutorialFeedback('wrong', lesson);
    tutorialDisplayKey = '';
    render();
    return;
  }
  fastForward();
  const advice = currentAdvice();
  rememberCardRects();
  let p: Played | null;
  try {
    p = session.play(a, HUMAN, opts.auto === undefined ? {} : { auto: opts.auto });
  } catch (error) {
    // A five/six-card Bloom's exact tile assignment is validated on demand by `apply`, and a
    // half-chosen shape can reach here through a preview/commit. Painting must NEVER take the
    // page down: refuse calmly, keep the painted shape on screen, and say why (same refusal
    // language a rejected tap uses).
    console.error('move refused', error);
    board.shake(settings.reduceMotion);
    if (settings.sound) sound.illegal();
    if (a.t === 'Bloom') {
      draw = { ...draw, msg: "That shape can't be placed" };
      paintDraw();
    } else {
      caption("That move can't be placed", null, 'info');
    }
    return;
  }
  if (!p) return;
  // The throw is already in the engine and the log; only now does the discard step learn which
  // flight it gets, and that it may continue from where the released ghost was.
  if (a.t === 'Discard' && p.steps.some((step) => step.k === 'discard' && step.player === HUMAN)) {
    if (opts.flightFrom) dragThrowFrom = opts.flightFrom;
    if (fromPickedPile) holdThrowSwell();
  }
  inspectKey = null;
  guideGoal = null;
  afterPlay(p, HUMAN, advice);
  // v0.6: after a Fruit card, another one in hand stays picked, its targets lit (until the throw)
  if (a.t === 'PlayFruit' && session.state.phase === 'ACT') {
    const next = session.legal.find((x) => x.t === 'PlayFruit');
    if (next) {
      session.tapCard(next.card);
      render();
    }
  }
}

/** Online: Draw commits, Grow drafts locally, Throw sends the batch. */
async function humanPlayOnline(a: Action, flightFrom?: DOMRect) {
  const os = getOnlineSession();
  // Same affordance as offline: a throw from the picked card keeps the swollen pile it aimed at.
  const fromPickedPile = a.t === 'Discard' && !!session && session.pending?.t === 'Discard' && session.pending.card === a.card;
  if (!os || !session || os.finished) return;
  // THE GATE. The enemy's finished turn is still being shown: nothing may be played, and — just
  // as important — nothing may fast-forward it away. Skipping is the Skip control's job alone.
  if (os.isRevealing) return revealWaitNotice();
  markTiming(
    a.t === 'Draw' ? 'draw:tap' : a.t === 'EndAct' || a.t === 'Discard' ? 'throw:tap' : 'move:tap',
    { action: a.t },
  );
  if (a.t === 'Draw') drawFlipCue();
  fastForward();
  rememberCardRects();
  inspectKey = null;
  guideGoal = null;
  const result = await os.play(a);
  if (!result.ok) {
    // A refused move must never be silent: the two-phone playtest read an unexplained refusal as
    // "painting is broken". Keep the painted shape on screen and say why it could not be placed
    // (the shared info line above the board), with the same shake a refused tap gets. Committing
    // gestures (Throw / Draw) still resync the board, because their failure means the board moved.
    caption(result.message, null, 'info');
    if (a.t === 'Bloom' || a.t === 'MegaBomb' || a.t === 'Sprout') {
      draw = { ...draw, msg: result.message };
      board.shake(settings.reduceMotion);
      if (settings.sound) sound.illegal();
      paintDraw();
      render();
      return;
    }
    os.refresh();
    // The move did not land: drop the stale taps so the board and the picks agree again.
    syncSessionFromOnline(true);
    paintOnlineHudFromSession();
    render();
    return;
  }
  // A move landed: clear the selection, exactly as the offline Session.play() does.
  syncSessionFromOnline(true);
  if (result.played) {
    // Mid-turn / Draw: animate locally; do not run the bot scheduler.
    let displayEvent = IS_FUTA04 ? displayEventForPlay(result.played.before, result.played.after, result.played.steps, HUMAN) : null;
    log.unshift(describe(result.played.before, result.played.action, result.played.after, HUMAN));
    markMoment(result.played.steps, result.played.before);
    if (a.t === 'Discard' && result.played.steps.some((step) => step.k === 'discard' && step.player === HUMAN)) {
      if (flightFrom) dragThrowFrom = flightFrom;
      if (fromPickedPile) holdThrowSwell();
    }
    queue.push(result.played.steps);
    if (displayEvent) smartCockpit?.event(displayEvent);
  }
  if (result.catchUp.length) {
    replaying = true;
    replaySpeed = 2;
    queue.push(result.catchUp);
    armRevealWatchdog(result.catchUp);
  }
  if (result.finished) gameOverDismissed = false;
  paintOnlineHudFromSession();
  render();
  void pump().then(() => {
    if (replaying) {
      replaying = false;
      replaySpeed = REPLAY_SPEED;
    }
  });
  if (a.t === 'PlayFruit' && session.state.phase === 'ACT') {
    const next = session.legal.find((x) => x.t === 'PlayFruit');
    if (next) {
      session.tapCard(next.card);
      render();
    }
  }
}

/**
 * The duel HUD painter, cached after its first (bundled) import. A reveal ends by calling
 * `paintOnlineHudFromSession()` from a synchronous path, and the turn word must be honest in that
 * very frame — an `import().then()` repaint left the word one sample stale at the boundary.
 */
let duelHudPaint: ((os: NonNullable<ReturnType<typeof getOnlineSession>>) => void) | null = null;
function paintOnlineHudFromSession() {
  const os = getOnlineSession();
  if (!os) return;
  // Waiting on the opponent? Poll faster so their finished turn replays almost at once.
  os.driver.sync().setWaiting(!os.myTurn);
  if (duelHudPaint) {
    duelHudPaint(os);
    return;
  }
  void import('./online/index.js').then(({ duelUiFromSnapshot, renderDuelHud }) => {
    duelHudPaint = (s) => {
      const hud = document.getElementById('duel-hud');
      const ui = duelUiFromSnapshot(s.driver.snapshot(), s.canUndo, s.isRevealing);
      renderDuelHud(hud, ui);
      // The same two words the offline bar reads (You : Opponent) — one source, src/strings.ts.
      const you = document.getElementById('score-you-label');
      const bot = document.getElementById('score-bot-label');
      if (you) you.textContent = ONLINE.scoreYou;
      if (bot) bot.textContent = ONLINE.scoreOpponent;
    };
    duelHudPaint(os);
  });
}

/**
 * The opponent's whole turn, worked out at its start (Step 2): each action is the same one the
 * bot would pick step by step (its View and seeded randomness only), so knowing them early only
 * sets the pace: an empty turn (draw, end, throw) is quick, about EMPTY_TURN_MS.
 */
type BotPlan = { keys: string[]; actions: Action[]; beats: Beats };
/** Where a game is: the same turn, phase and number of events means the same position. */
const posKey = (s: State) => `${s.seed}|${s.turnNumber}|${s.phase}|${s.actor}|${s.history?.length ?? 0}`;
let botPlan: BotPlan | null = null;
/** The opponent's empty turn is on show: the draw, throw and next turn start are quick. */
let quickShow: Beats | null = null;
const askFor = (st: State) => {
  const taught = lessonActive();
  if (taught) {
    if ('script' in taught.opponent) {
      const action = scriptedOpponentAction(st, taught.opponent.script);
      if (action) return Promise.resolve(action);
    } else {
      const lvl = taught.opponent.bot;
      return askBot(viewFor(st, BOT), lvl, botSeed(st.seed, lvl, st.turnNumber, st.history?.length ?? 0));
    }
  }
  const lesson=coach.tutorial && tutorialLesson(coach.tutorial.chapter,coach.tutorial.step);
  if (lesson?.action==='Opponent') {
    const action=tutorialOpponentAction(legalActions(viewFor(st,BOT)));
    if (action) return Promise.resolve(action);
  }
  return askBot(viewFor(st, BOT), gameLevel, botSeed(st.seed, gameLevel, st.turnNumber, st.history?.length ?? 0));
};
async function planBotTurn(from: State): Promise<BotPlan> {
  const keys: string[] = [];
  const actions: Action[] = [];
  let s = from;
  while (s.phase !== 'GAME_OVER' && s.actor === BOT && s.turnPlayer === BOT && actions.length < 40) {
    const a = await askFor(s);
    keys.push(posKey(s));
    actions.push(a);
    s = apply(s, a);
  }
  return { keys, actions, beats: opponentBeats(actions, timeScale()) };
}

function scheduleBot() {
  if (isOnlineDuel()) return; // online: no computer opponent
  if (pregameHold || isStarterRitualPlaying()) return; // the ritual is still the only thing on screen
  if (!session || botBusy || tutorialTransitionPending) return;
  const st = session.state;
  if (st.phase === 'GAME_OVER') return;
  // the Lab's "Watch a game" (test copy only): a second opponent plays my seat
  if (st.actor !== BOT) return void (IS_TEST && watching && scheduleWatch());
  botBusy = true;
  const my = epoch;
  void (async () => {
    await idle();
    if (my !== epoch || !session) return;
    const started = performance.now();
    thinking = true;
    if (IS_TEST) lab?.thinking(true);
    renderHud();
    const st = session.state;
    if (st.phase === 'DRAW' && st.turnPlayer === BOT && botPlan?.keys[0] !== posKey(st)) botPlan = await planBotTurn(st);
    const i = botPlan ? botPlan.keys.indexOf(posKey(st)) : -1;
    const action = i >= 0 ? botPlan!.actions[i]! : await askFor(st);
    // A short think before the bot's turn and before each tile move; housekeeping is quick.
    const grows = action.t === 'Bloom' || action.t === 'Sprout';
    const beat = i >= 0 ? botPlan!.beats.think[i]! : (grows ? 300 : 90) * timeScale();
    quickShow = i >= 0 && botPlan!.beats.quick ? botPlan!.beats : null;
    const left = beat - (performance.now() - started);
    if (left > 0) await wait(left, my);
    thinking = false;
    if (IS_TEST) lab?.thinking(false);
    pill.botMoved();
    if (my !== epoch || !session) return;
    const p = session.play(action, BOT);
    botBusy = false;
    if (p) afterPlay(p, BOT, null);
    else render();
  })();
}
/** The Lab's "Watch a game": the level playing my seat and the pause after each move (null: I play). */
let watching: { level: Level; pause: number } | null = null;
function scheduleWatch() {
  if (!session || botBusy || !watching) return;
  botBusy = true;
  const my = epoch;
  // something on my side (a skipped animation, a new deal) can restart the step: try again
  const retry = () => {
    botBusy = false;
    if (watching && session) setTimeout(scheduleBot, 60);
  };
  void (async () => {
    await idle();
    if (my !== epoch || !session || !watching) return retry();
    const st = session.state;
    const lvl = watching.level;
    const action = await askBot(viewFor(st, HUMAN), lvl, botSeed(st.seed ^ 0x9e3779b9, lvl, st.turnNumber, st.history?.length ?? 0));
    const grows = action.t === 'Bloom' || action.t === 'Sprout';
    await wait(((grows ? 300 : 90) + (watching?.pause ?? 0)) * timeScale(), my);
    if (my !== epoch || !session || !watching || session.state !== st) return retry();
    const p = session.play(action, HUMAN);
    botBusy = false;
    if (p) afterPlay(p, HUMAN, null);
    else render();
  })();
}
let thinking = false;
/** Which side the header capsule last showed (for its cross-fade). */
let lastTurnKey = '';
/** Whether the ? tip is open. */
/** The bot level of the game being played (kept with the saved game). */
let gameLevel: Level = 7;
/**
 * The TRAINING tier the current OFFLINE game came from (null: a match started outside the tiers —
 * a URL seed, the lab, a campaign level, the tutorial, or any online duel). It is what the
 * one-game carry-over is recorded against when the game ends.
 */
let gameDifficulty: DifficultyId | null = null;
/** The match as the player knows it: its campaign level, or its difficulty (never the bot level). */
function currentMatchLabel(): string {
  return matchLabel({ campaign: campaignLevel?.number ?? null, difficulty: gameDifficulty, botLevel: gameLevel });
}
/**
 * The campaign level of the ACTIVE match, or null for a classic / tutorial match. It is the only
 * production source of match overrides (see `overridesForMatch`), and it is cleared by every other
 * way a match can start, so a campaign board can never leak into a classic or online game.
 */
let campaignLevel: CampaignLevel | null = null;
/**
 * True while the match on screen is a TUTORIAL replay (Settings → Tutorial, owner 2026-10-24): the
 * same campaign level, played inertly. It never writes the progress record or the resume save, and
 * its finish card returns to the Tutorial. Every other way a match starts clears it.
 */
let tutorialReplay = false;
/**
 * True when the ACTIVE campaign match is a replay: a level already behind the player's place when it
 * was started. Read once, at match start, because the result moves the place: after a normal clear
 * the finished level is behind it too, and the finish card must still say "Next level".
 */
let campaignReplay = false;
/** The lesson of the campaign level on screen (levels 1-10), or null. Set with `campaignLevel`. */
let lessonNow: Lesson | null = null;
/** The explanations already read in this level (saved beside the level's match). */
let lessonSeen = new Set<string>();
let lessonBeatNow: Beat | null = null;
let lessonShownKey = '';
let lessonAnswerText = '';
let lessonAnswerTimer = 0;
/** Counts every answer given (tests: a new answer, not one still on screen). */
let lessonAnswerSeq = 0;
let lessonIdle = false;
/** The step the idle count was last started for (history length and phase of my turn). */
let lessonIdleStep = '';
/** 0 = no idle step, 1 = 6 s WHISPER, 2 = 12 s GUIDE, 3 = 20 s light guide. */
let lessonIdleStage: 0 | 1 | 2 | 3 = 0;
/** Two wrong taps on this same step raise the tier for this moment only. */
let lessonWrongInStep = 0;
let lessonEscalated = false;
/** The tier and action last painted, so a completed action spends the right spotlight budget. */
let lessonTierShown: LessonTier = 'silent';
let lessonTierKind: ActionKind | null = null;
let lessonShownBeatId = '';
/** A power hello currently on screen: kept visible until the next action, then never again. */
let lessonHelloNow: PowerKind | null = null;
let lessonHelloTimer = 0;
/** Per-action counts, keyed to the lesson version. */
let lessonMastery: Mastery = decodeMastery(store.get(LESSON_MASTERY_KEY), LESSON_VERSION);
let lessonPowerSeen = new Set<PowerKind>(lessonMastery.hellos);
/** The short stage intro before the board accepts a move. */
let lessonStageUntil = 0;
let lessonStageTimer = 0;
/** True when the opening hand has stopped moving (the first light waits for it). */
let handSettled = true;
/** When the explanation on screen appeared: a tap in its first moments is not "tap anywhere". */
let lessonExplainAt = 0;
/**
 * How long a lesson explanation must stay up before a dismissing tap may take it away (owner,
 * 2026-10-21: "make sure the window can't be skipped for 3s — always shows for at least 3s").
 * It applies to DISMISSAL only: a tap on the lit target is a MOVE and still acts on the first tap.
 */
const LESSON_READ_MS = 3000;
/**
 * How many times a tap was refused by the reading floor. Each refusal is acknowledged on screen (see
 * `lessonAckFloor`), and the count is exposed to the tests so "every tap did something or was
 * answered" can include a refusal that pulsed the caption.
 */
let lessonFloorAcks = 0;

/** Acknowledge a tap the reading floor refused: one quiet pulse of the caption, never words. */
function lessonAckFloor() {
  lessonFloorAcks++;
  if (settings.reduceMotion) return;
  const plate = document.getElementById('lesson-plate');
  // A pulse on the caption itself: it says the tap landed, and that the sentence is staying. No
  // layout, no new CSS, and reduce-motion opts out.
  plate?.animate?.(
    [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
    { duration: 220, easing: 'ease-out' },
  );
}
let lessonHoldingScore = false;
let lessonExplainId = '';
/** The lesson's box explains; the cockpit display carries the action (levels 1-10 only). */
/**
 * The player has tapped » once in a lesson, so the first end-of-turn is theirs (never auto-skipped
 * before they have seen the "tap »" line). The key keeps its old name: devices already taught stay
 * taught.
 */
/** Only » is left this Grow and auto-skip is on: autoAdvance ends it without a tap. */
function lessonEndsByItself(): boolean {
  return !!session && session.view.phase === 'ACT' && myTurn()
    && skipPlan(session.legal, session.view.hand.length, settings.autoSkip).kind === 'auto';
}
const lessonIdleWatch = createIdleWatch((stage) => {
  lessonIdleStage = stage;
  lessonIdle = stage > 0;
  lessonShownKey = '';
  if (lessonActive() && myTurn() && !busy() && !lessonStageActive()) render();
});
/** The level 4+ finish waits to invite an install until the finish card is closed. */
let pendingInstallOutcome: 'won' | 'lost' | 'draw' | null = null;
/** The campaign progress record (level 1 open; a win unlocks the next; a loss removes nothing). */
let campaignProgress: CampaignProgress = parseProgress(store.get(CAMPAIGN_PROGRESS_KEY));
const saveCampaignProgress = () => store.set(CAMPAIGN_PROGRESS_KEY, serializeProgress(campaignProgress));
/**
 * An ACCOUNT's place lives on the server (owner report, 2026-10-25: level 35 on the phone, level 1
 * on the desktop). Campaign progress is still device-local for a guest; for a signed-in account one
 * authenticated read of the furthest verified clear RAISES this device's record to match. It never
 * lowers it, never runs for a guest, and a failed read leaves the local game exactly as it was with
 * no error shown. The reconciliation itself is pure and unit-tested (`reconcileProgress`).
 */
async function syncAccountLevel(): Promise<void> {
  if (!FEATURES.campaign) return;
  const before = campaignProgress;
  const after = await syncAccountProgress(campaignProgress, {
    storage: store,
    fetchHighest: fetchAccountHighestLevel,
  });
  if (after === before) return;
  campaignProgress = after;
  saveCampaignProgress();
  // The menu's LEVEL <n> entry is painted from progress; repaint it in place so a boot that was
  // already showing level 1 now names the account's real level, without a reload or a replay.
  if (shownScreen === 'menu') layoutMenu(syncMenuResume());
  else if (shownScreen === 'campaign') renderCampaignScreen();
  else if (shownScreen === 'levels') renderLevelGrid();
}
// A sign-in finishes by reloading (the accounts module's own flow), so boot covers it; this event is
// the belt-and-braces path if that flow ever stops reloading.
window.addEventListener('futasaku:identity', () => { void syncAccountLevel(); });
let lastBoard: unknown = null;
let lastOverlay = '';
let coachWhyOpen = false;
/** The move the coach's arrow is guiding to (null: no arrow). */
let guideGoal: Action | null = null;

// ---------- the animation player ----------

const waiters = new Set<() => void>();
/** Waits ms, but returns at once if the animations are skipped (epoch changes). */
const wait = (ms: number, my = epoch) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || my !== epoch) return resolve();
    const done = () => {
      clearTimeout(t);
      waiters.delete(done);
      resolve();
    };
    const t = setTimeout(done, ms);
    waiters.add(done);
  });
// Step 7: the pause menu. While it is open the opponent's moves and the animations wait
// (the step in progress finishes; the next one starts after "Back to the game").
let paused = false;
/** True while a Restart is being handed to startGame, so a double tap cannot start two matches. */
let restarting = false;
/** True while a result's leading action is opening the next match, so it cannot advance twice. */
let resultAdvance = false;
/** v0.7: the list of Bloom choices is open (when there are two or more) */
let bloomMenu = false;
let unpauseWaiters: (() => void)[] = [];
const whilePaused = () => new Promise<void>((resolve) => (paused ? unpauseWaiters.push(resolve) : resolve()));
function setPaused(on: boolean) {
  if (paused === on) return;
  paused = on;
  document.body.classList.toggle('paused', on);
  syncBreathHold();
  if (!on) {
    const w = unpauseWaiters;
    unpauseWaiters = [];
    for (const r of w) r();
  }
}
let idleWaiters: (() => void)[] = [];
const idle = () => new Promise<void>((resolve) => (queue.pending === 0 && !pumping ? resolve() : idleWaiters.push(resolve)));
const flushIdle = () => {
  const w = idleWaiters;
  idleWaiters = [];
  for (const r of w) r();
};

/** Hold the swollen Throw pile for the flight its selection started. */
function holdThrowSwell(): void {
  if (!IS_FUTA04) return;
  throwSwellHeld = true;
  document.getElementById('discard')?.classList.add('futa04-throw-target');
}

/** Let the Throw pile settle again. Safe to call anywhere, any number of times. */
function releaseThrowSwell(): void {
  throwSwellHeld = false;
  document.getElementById('discard')?.classList.remove('futa04-throw-target');
}

/** Shows everything still queued at once and stops running effects. */
function fastForward() {
  if (queue.pending === 0 && !pumping) return;
  animLog('fast-forward', { pending: queue.pending, pumping, epoch });
  disarmRevealWatchdog();
  epoch++;
  // A skipped flight never plays the boomerang; forget its take-off with the animations it belonged to.
  dragThrowFrom = null;
  releaseThrowSwell();
  replaying = false;
  liveReveal = false;
  quietAmbient(false);
  board.focus(null);
  for (const w of [...waiters]) w();
  // Finish our own one-off effects (never the endless CSS decorations like the root pulse, and
  // never the lesson's lit breath, which must outlive the move it sits on).
  for (const a of document.getAnimations()) {
    if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) continue;
    if (a.id === LESSON_BREATH_ID) continue;
    const t = a.effect instanceof KeyframeEffect ? a.effect.target : null;
    if (!(t instanceof Element) || !t.closest('.l-fx, .l-tiles, .l-veins, .flyer, #board-wrap, #hand, .hud')) continue;
    try {
      a.finish();
    } catch {
      a.cancel();
    }
  }
  board.fx.replaceChildren();
  document.querySelectorAll('.flyer').forEach((f) => f.remove());
  for (const s of queue.skipAll()) settleStep(s, false);
  pumping = false;
  if (getOnlineSession()) {
    getOnlineSession()!.endReveal();
    theirsDim.clear();
    paintOnlineHudFromSession();
  }
  render();
  flushIdle();
  // A bot turn that was waiting on the animations carries on.
  if (botBusy && !thinking) {
    botBusy = false;
    scheduleBot();
  }
}

/** Book-keeping for a step that is shown (with or without animation). */
function settleStep(s: Step, animated: boolean) {
  revealProgress++; // one step really landed: the reveal watchdog must not treat this as a stall
  markTiming('tile', { k: s.k, animated });
  const displayEvent = displaySteps.get(s);
  if (displayEvent && animated) smartCockpit?.event(displayEvent);
  displaySteps.delete(s);
  const cue = outcomeSteps.get(s);
  if (cue && animated) outcomeLight?.pulse(cue.tone, cue.strength);
  outcomeSteps.delete(s);
  if (s.k === 'draw' && s.card) hiddenCards.delete(s.card.id);
  // The Throw pile advances on the discard's arrival (and the closing sync catches up a skipped
  // flight to the true pile), never on the render that starts the throw.
  if ((s.k === 'discard' || s.k === 'sync') && session) shownDiscard = [...session.view.discard];
  if (s.k === 'sever' || s.k === 'remove' || s.k === 'megaBomb') {
    // Futa04: cut-off tiles leave no scar / remnant art — board shows live tiles only.
    if (!IS_FUTA04) {
      const former = removedTiles.get(s);
      const keys = s.k === 'megaBomb' ? s.destroyed : s.keys;
      for (const key of keys) {
        const tile = former?.get(key);
        if (!tile && s.k !== 'sever') continue;
        scars = scars.filter(x => x.key !== key);
        scars.push({ key, owner: tile?.owner ?? (s.k === 'remove' ? HUMAN : s.player), age: 0, ...(tile ? { tile } : {}) });
      }
    } else {
      scars = [];
    }
    removedTiles.delete(s);
  }
  if (s.k === 'turn' && !IS_FUTA04) scars = scars.map((x) => ({ ...x, age: x.age + 1 })).filter((x) => x.age <= 1);
  if (s.k === 'sync') {
    if (animated) countScores(s.scores);
    else shownScores = [s.scores[HUMAN], s.scores[BOT]];
    smartCockpit?.score(s.scores[HUMAN],s.scores[BOT]);
  }
  if (!animated && s.k === 'sever') caption(captionFor(s, HUMAN)!, s.origin, s.player === HUMAN ? 'bad' : 'good');
}

/** The Grow step that auto-skip already skipped once (after an Undo it asks instead). */
let skippedFrom: State | null = null;
/**
 * Step 2: nothing can grow this turn. With "Auto-skip when nothing to play" on, skip the Grow
 * step and go straight to throwing (an empty turn is two taps: draw, throw). Off, the moves row
 * shows why and a Continue button (renderControls).
 */
function autoAdvance() {
  // The tutorial's free turn plays like a real game: once only "end" is left it goes on to Throw.
  if (!session || (coach.tutorial && !tutorialFreePlayActive()) || !myTurn() || busy() || session.view.phase !== 'ACT') return;
  if (session.state === skippedFrom) return;
  // Levels 1-10: an explanation on screen is read first; dismissing it redraws and comes back here.
  if (lessonActive() && lessonBeatNow?.explain) return;
  if (skipPlan(session.legal, session.view.hand.length, settings.autoSkip).kind !== 'auto') return;
  const end = session.legal.find((a) => a.t === 'EndAct');
  if (!end) return;
  skippedFrom = session.state;
  // v0.8: after a sprout or a Fruit card the turn was not empty: go on to the throw quietly
  if (!grewThisTurn()) {
    note({ t: 'empty', at: Date.now() });
    caption(NOTHING_TO_PLAY, null, 'info');
  }
  // `auto`: like the board tap that skips an optional Bloom, this EndAct is the APP's own move to
  // Throw, not one the player made. Without the flag it became its own undo stop, so the first
  // Undo after a Grow returned to the position AFTER that Grow (and the `skippedFrom` guard then
  // stopped the auto-skip re-firing), which is exactly the owner's "Undo did nothing" report —
  // still present on any turn where nothing but EndAct is left.
  humanPlay(end, { auto: true });
}

// ---------- the juice budget ----------

type Moment = { tier: Tier; budget: Budget; banner: string | null; chain: number; first: boolean };
const moments = new WeakMap<Step, Moment>();

/** Tags one action's steps with how big the moment is, and which effect in a chain each is. */
function markMoment(steps: readonly Step[], before: State) {
  const tier = moveTier(steps, (k) => before.terrain[k] === 'rich');
  const budget = effectBudget(tier, settings.effects, settings.reduceMotion);
  // Part 2: a cut has its own banner in its payoff (logic/cut.ts), so the move's banner stays quiet
  // (a Fruit card shows its own "Fruited!" in its burst, mine only: the opponent's is calmer)
  const banner = budget.banner && !steps.some((s) => s.k === 'sever' || s.k === 'fruit' || s.k === 'megaBomb') ? tierBanner(steps) : null;
  let chain = 0;
  let first = true;
  for (const st of steps) {
    if (st.k !== 'grow' && st.k !== 'sever' && st.k !== 'strangle' && st.k !== 'fruit' && st.k !== 'megaBomb' && st.k !== 'strengthen') continue;
    moments.set(st, { tier, budget, banner, chain, first });
    chain++;
    first = false;
  }
}
const momentOf = (st: Step): Moment => moments.get(st) ?? { tier: 'none', budget: effectBudget('none', 'normal', false), banner: null, chain: 0, first: false };

/** The big-moment build-up: a short beat (the board draws in), then the impact. */
async function anticipate(m: Moment, f: number, my: number) {
  if (m.budget.anticipationMs <= 0 || !m.first) return;
  anim($('board-wrap'), [{ transform: 'scale(1)' }, { transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { duration: (m.budget.anticipationMs + 120) * f, easing: 'ease-in-out' });
  await wait(m.budget.anticipationMs * f, my);
}

/** The impact of a big moment: shake, thud, banner, vibration, then a brief freeze (hit-stop). */
async function impact(m: Moment, f: number, my: number) {
  const b = m.budget;
  if (b.shake > 0 && !IS_FUTA04) anim($('board-wrap'), shakeFrames(b.shake * motion()), { duration: 320 * Math.max(f, 0.5) });
  if (b.thud) sound.thud(m.tier === 'severe' ? 0.72 : 1);
  if (b.vibrate) vibrate(settings.vibration, b.vibrate);
  if (m.banner && m.first) banner(m.banner, 'big');
  if (b.hitStopMs > 0) await wait(b.hitStopMs * Math.max(f, 0.5), my);
}

/**
 * Part 4: Smoother mode. While moves animate, frame times are watched; under 50 fps for 3
 * seconds in a row, effects drop to Low (once per device) and a one-time note offers to undo it.
 */
let perf = perfStart();
let perfUnsub: (() => void) | null = null;
function watchFrames() {
  if (IS_FUTA04) return; // no automatic effect downgrade or interruption in Futasaku 0.4
  if (perfUnsub || perf.done || settings.effects === 'low' || store.get(SMOOTH_KEY)) return;
  let last = performance.now();
  perfUnsub = scheduler.subscribe(({ now }) => {
    const r = perfStep(perf, now - last);
    perf = r.state;
    last = now;
    if (r.drop || !busy()) {
      perfUnsub?.();
      perfUnsub = null;
      if (r.drop) smootherMode();
    }
  });
}
function smootherMode() {
  const before = settings.effects;
  settings = { ...settings, effects: 'low' };
  sound.setEffects('low');
  saveSettings();
  store.set(SMOOTH_KEY, '1');
  const note = $('smoother');
  note.hidden = false;
  $('smoother-undo').onclick = () => {
    settings = { ...settings, effects: before };
    sound.setEffects(before);
    saveSettings();
    note.hidden = true;
    render();
  };
  $('smoother-keep').onclick = () => (note.hidden = true);
}

/**
 * The animation pump.
 *
 * The guard below is a WAKE-UP, never a drop. A `pump()` call that arrives while a pump is running
 * sets `pumpWanted`, so the owner loops once more instead of returning: a step pushed during the
 * pump's tail (or its minimum-hold) can never be left in the queue with nobody to play it. That
 * lost wake-up was the source of a gate that "could not progress".
 *
 * Ownership is a token (`pumpRun`), not a bare boolean. Every exit path — a normal drain, a Skip,
 * a `timeScale()===0` fast-forward, an epoch change from a new game, or any future early return —
 * runs the `finally`, so `pumping` can never be left `true`. A stale pump whose epoch moved on
 * (and whose successor has already started) must not clear the successor's state, which the token
 * guards against.
 *
 * `finally` is also the ONLY place a live reveal ends: whatever ended the pump, the gate is lifted
 * and the HUD is repainted from the real session state, so the turn word can never be left saying
 * "Opponent's turn" while the player is free to act.
 */
let pumpRun = 0;
let pumpWanted = false;
/**
 * The step the pump is playing right now (null between steps). The result gate needs it because a
 * step can take its queue slot before its animation ends (a single-tile grow applies its slot at
 * the START of the 336 ms pop), so an empty queue does not mean the board has settled.
 */
let currentStep: Step | null = null;
/** True while the in-game replay holds the display sign (released on the same drain). */
let replaySignHeld = false;
/** Steps that are an enemy ACTION: the in-game replay separates these with a quiet beat. */
const replayActionStep = (s: Step): boolean =>
  s.k === 'grow' || s.k === 'sever' || s.k === 'remove' || s.k === 'strengthen'
  || s.k === 'fruit' || s.k === 'megaBomb' || s.k === 'discard' || s.k === 'draw';
async function pump() {
  if (pumping) {
    pumpWanted = true;
    animLog('pump:wake', { pending: queue.pending, epoch });
    return;
  }
  pumping = true;
  const run = ++pumpRun;
  const my = epoch;
  /** Actions already played in THIS pump: the first needs no leading beat. */
  let actionsPlayed = 0;
  animLog('pump:enter', { pending: queue.pending, epoch: my });
  watchFrames();
  try {
    for (;;) {
      pumpWanted = false;
      while (queue.pending > 0) {
        if (my !== epoch) return;
        await whilePaused();
        if (my !== epoch) return;
        if (timeScale() === 0) {
          animLog('pump:fast-forward', { epoch: my });
          fastForward();
          return;
        }
        const step = queue.peek()!;
        // A readable beat BETWEEN the enemy's actions (in-game replay only): a Bloom or a Blast
        // is one thing, then the next. Reduce motion and Speed off add nothing (motionOn()).
        if (replayBeats && !liveReveal && actionsPlayed > 0 && motionOn() && replayActionStep(step)) {
          await wait(REPLAY_BEAT_MS * Math.max(speedFactor(settings.speed), 0.35), my);
          if (my !== epoch) return;
        }
        const stepStarted = performance.now();
        // Published to the result gate: the board is still changing until this returns.
        currentStep = step;
        try {
          await playStep(step, my);
        } finally {
          currentStep = null;
        }
        if (replayActionStep(step)) actionsPlayed += 1;
        // Read-only timing for the motion audit (web/e2e/motion-audit.ts): what played, for how long.
        animLog('step', { k: step.k, ms: Math.round(performance.now() - stepStarted), n: step.k === 'grow' ? step.tiles.length : step.k === 'sever' || step.k === 'remove' ? step.keys.length : step.k === 'megaBomb' ? step.destroyed.length : 0, who: 'player' in step ? step.player : -1 });
      }
      if (my !== epoch) return;
      // A live enemy turn must be READABLE: even a turn that grew nothing (a hidden draw plus a
      // discard) holds the gate for a beat, so the board never swaps in a single frame.
      if (liveReveal && getOnlineSession()) {
        const left = MIN_LIVE_REVEAL_MS - (performance.now() - revealStartedAt);
        if (left > 0) {
          await wait(left, my);
          if (my !== epoch) return;
        }
      }
      // A push that landed while we were finishing (during the hold, or between the loop and here)
      // must still play. Without this the queue could hold steps and no pump would pick them up.
      if (!pumpWanted && queue.pending === 0) break;
    }
  } catch (error) {
    // A step failed mid-animation. Never leave the board half-applied and the gate shut: settle
    // whatever is left to the TRUE final board, and make the failure loud so it is diagnosable.
    animLog('pump:error', { message: String(error).slice(0, 300), pending: queue.pending, epoch: my });
    console.error('[FUTASAKU] the animation pump threw; settling to the final board', error);
    fastForward();
  } finally {
    if (pumpRun === run) {
      pumping = false;
      currentStep = null;
      liveReveal = false;
      replaying = false;
      replayBeats = false;
      if (replaySignHeld) {
        replaySignHeld = false;
        smartCockpit?.led(null);
      }
      board.focus(null);
      animLog('pump:leave', {
        epoch: my,
        now: epoch,
        pending: queue.pending,
        revealing: !!getOnlineSession()?.isRevealing,
      });
      // The opponent's turn has fully played out (or was skipped): the player may act now.
      markTiming('replay:end', { queued: queue.pending });
      // The "not yours" dim belongs to the REPLAY, whichever mode started it (online reveal or the
      // in-game Replay of the bot's turn). `clear()` is idempotent, so an offline pump that never
      // dimmed costs nothing — and a begun dim can never outlive its replay.
      theirsDim.clear();
      if (getOnlineSession()) {
        getOnlineSession()!.endReveal();
        markTiming('input:open', { revealing: false });
        paintOnlineHudFromSession();
      }
      if (reopenGameOver) {
        reopenGameOver = false;
        gameOverDismissed = false;
      }
      disarmRevealWatchdog();
      render();
      flushIdle();
    } else {
      animLog('pump:stale-return', { epoch: my, now: epoch, run, current: pumpRun });
    }
  }
}

// ---------- the reveal safety net ----------

/**
 * The reveal watchdog: a LAST RESORT, not a timer that opens the gate early.
 *
 * The owner's rule stands — input stays closed until the enemy's finished turn has fully animated.
 * A normal turn progresses continuously (one step lands, then the next), so a watchdog that only
 * fires after a period with NO progress can never cut a legitimate animation short, however long
 * the turn or however slow the phone: a big Bloom, Reduce motion, the Slow speed setting, or a long
 * away catch-up all keep landing steps, each of which resets the clock. It is parked while the game
 * is paused or the tab is hidden, where "no progress" is expected rather than a fault.
 *
 * Two independent guards, because either alone can be defeated:
 *  1. NO-PROGRESS (6s): catches a step that never settles (a thrown animation, a missing target).
 *  2. ABSOLUTE BUDGET (the replay's own length + 3s): catches a replay that keeps PROGRESSING but
 *     never ENDS — the class of bug the two-phone playtest hit (a queue that keeps refilling, so
 *     every step resets the no-progress clock and the gate never opens). The budget is measured
 *     from the moment the gate closed, so it cannot be reset by progress.
 *
 * When either fires, the queue is flushed to the TRUE final board (`fastForward`), the gate is
 * lifted, the HUD is repainted from the real session state, and it is said loudly.
 */
let revealWatchdog = 0;
let revealWatchSeen = -1;
let revealWatchSince = 0;
let revealDeadline = 0;
/** When the watchdog was parked because the game is paused or the tab is hidden (0 = not parked). */
let revealPausedAt = 0;
const REVEAL_STALL_MS = 6_000;
/** The absolute budget beyond the replay's own designed length (owner's rule). */
const REVEAL_BUDGET_GRACE_MS = 3_000;
/**
 * A generous per-UNIT ceiling for the budget, above the Slow speed. A unit is one step, or one
 * TILE of a multi-tile grow (the slowest single thing the replay does). Measuring a big Slow Bloom
 * in tiles is what lets the budget be long enough that it can never cut a legitimate animation
 * short, while still being far shorter than a real stall.
 */
const REVEAL_MAX_UNIT_MS = 1_000;

/** The replay's own designed length (ms) from its work units, used for the absolute budget. */
export const estimateReplayMs = (units: number): number =>
  Math.max(1_500, Math.max(1, units) * REVEAL_MAX_UNIT_MS);

/** One unit per step, but a multi-tile grow is one unit PER TILE: it is the slow sequential path. */
const replayUnits = (steps: readonly Step[]): number =>
  steps.reduce((n, s) => n + (s.k === 'grow' ? Math.max(1, s.tiles.length) : 1), 0);

function armRevealWatchdog(steps: readonly Step[] = []): void {
  disarmRevealWatchdog();
  const now = performance.now();
  const units = replayUnits(steps);
  revealWatchSeen = revealProgress;
  revealWatchSince = now;
  revealDeadline = now + estimateReplayMs(units) + REVEAL_BUDGET_GRACE_MS;
  revealWatchdog = window.setInterval(checkRevealStall, 1000);
  animLog('watch:arm', { progress: revealProgress, steps: steps.length, units, budget: Math.round(revealDeadline - now) });
  markTiming('gate:arm', { steps: steps.length, units, budget: Math.round(revealDeadline - now) });
}
function disarmRevealWatchdog(): void {
  revealDeadline = 0;
  revealPausedAt = 0;
  if (!revealWatchdog) return;
  clearInterval(revealWatchdog);
  revealWatchdog = 0;
}

/** Flush to the true final board, lift the gate, repaint. Shared by both guards. */
function releaseGate(reason: string, detail: Record<string, unknown>): void {
  animLog('watch:release', { reason, ...detail });
  markTiming('gate:safety', { reason, ...detail });
  disarmRevealWatchdog();
  // A pump that never settles (or a queue that keeps refilling) must not be left owning the gate:
  // abandon it so a later reveal can pump at all, then flush the queue to the true board.
  pumpRun++;
  pumping = false;
  pumpWanted = false;
  fastForward();
  // A stuck dim would be worse than none: releaseGate can bypass fastForward's own clear, so the
  // safety release lifts it unconditionally here too (idempotent — a no-op when already lifted).
  theirsDim.clear();
  const os = getOnlineSession();
  if (os?.isRevealing) {
    os.endReveal();
    paintOnlineHudFromSession();
    render();
  }
  animLog('watch:recovered', { queued: queue.pending, revealing: !!os?.isRevealing });
  markTiming('input:open', { reason, recovering: true });
}

function checkRevealStall(): void {
  const os = getOnlineSession();
  if (!os || !os.isRevealing) {
    disarmRevealWatchdog();
    return;
  }
  // Paused or hidden: the replay is deliberately not advancing. Park the clocks (not a fault). The
  // paused time is ADDED BACK to the budget on resume, so a long pause cannot eat the real budget.
  if (paused || document.hidden) {
    const now = performance.now();
    if (!revealPausedAt) revealPausedAt = now;
    revealWatchSince = now;
    return;
  }
  if (revealPausedAt) {
    revealDeadline += performance.now() - revealPausedAt;
    revealPausedAt = 0;
    revealWatchSince = performance.now();
  }
  if (revealProgress !== revealWatchSeen) {
    revealWatchSeen = revealProgress;
    revealWatchSince = performance.now();
  }
  const stalledFor = Math.round(performance.now() - revealWatchSince);
  if (stalledFor >= REVEAL_STALL_MS) {
    const detail = { stalledFor, queued: queue.pending, pumping, epoch, progress: revealProgress };
    console.warn('[FUTASAKU] enemy-turn replay stalled; settling to the true final board', detail);
    releaseGate('no-progress', detail);
    return;
  }
  // The absolute budget: progress is happening, but the replay has run past its own length + 3s.
  const overrun = Math.round(performance.now() - revealDeadline);
  if (revealDeadline > 0 && overrun >= 0) {
    const detail = { overrun, queued: queue.pending, pumping, epoch, progress: revealProgress };
    console.warn('[FUTASAKU] enemy-turn replay overran its budget; settling to the true final board', detail);
    releaseGate('budget', detail);
    return;
  }
}

/**
 * TEST-ONLY injection: make the NEXT pump wait on a promise that only `releaseStall()` resolves.
 * It exists to prove the gate can never stay shut forever (the absolute budget releases it) and
 * that the board ends on the TRUE final state — with a deliberately hung step, not a guess.
 */
let stallInject: Promise<void> | null = null;
let stallRelease: (() => void) | null = null;
function injectStall(): void {
  stallInject = new Promise<void>((resolve) => {
    stallRelease = resolve;
  });
  animLog('test:stall-injected');
}

/**
 * My turn starts: a soft light passes over my hand. Each card carries its own ready-made glow
 * (#hand .card::before) and only its OPACITY animates, which the phone composites on the GPU. The
 * old version animated a drop-shadow filter on the whole hand, repainting every card every frame
 * for 0.9s, right at the turn hand-over (motion pass, owner 2026-10-15).
 */
let handGlowTimer: ReturnType<typeof setTimeout> | undefined;
function glowHand(ms: number): void {
  const hand = $('hand');
  clearTimeout(handGlowTimer);
  hand.classList.remove('turn-glow');
  hand.style.setProperty('--turn-glow-ms', `${Math.round(ms)}ms`);
  requestAnimationFrame(() => {
    hand.classList.add('turn-glow');
    handGlowTimer = setTimeout(() => hand.classList.remove('turn-glow'), ms + 50);
  });
}

async function playStep(step: Step, my: number) {
  if (stallInject) {
    const pending = stallInject;
    stallInject = null;
    await pending;
    if (my !== epoch) return;
  }
  const f = timeScale();
  const m = motion();
  // Overhaul item 19: the opponent's actions: the rest of the board dims a little, and the
  // view leans 1.5% toward the action (none with Reduce motion)
  const actor = actorOf(step);
  const involved = involvedKeys(step);
  if (actor === BOT && involved.length) {
    board.focus(involved);
    if (m > 0) {
      const n = nudgeToward(involved, 200, 170);
      const w = $('board-wrap').getBoundingClientRect();
      anim($('board-wrap'), [{ translate: '0 0' }, { translate: `${(n.x * w.width).toFixed(1)}px ${(n.y * w.height).toFixed(1)}px`, offset: 0.4 }, { translate: '0 0' }], { duration: 900 * f, easing: 'ease-in-out' });
    }
  } else if (actor !== null) board.focus(null);
  const show = () => {
    if (my !== epoch) return false;
    queue.next();
    settleStep(step, true);
    render();
    return true;
  };
  switch (step.k) {
    case 'draw': {
      if (!show()) return;
      if (step.player === HUMAN && step.card) {
        const hp = hapticFor('draw', settings);
        if (hp) vibrate(true, hp as number | number[]);
        const to = document.querySelector<HTMLElement>(`#hand [data-card="${step.card.id}"]`);
        const from = ((step.from === 'deck' ? $('deck') : $('discard')).querySelector<HTMLElement>('.pile-card') ?? (step.from === 'deck' ? $('deck') : $('discard'))).getBoundingClientRect();
        if (to) {
          const r = to.getBoundingClientRect();
          const dx = from.left + from.width / 2 - r.left - r.width / 2;
          const dy = from.top + from.height / 2 - r.top - r.height / 2;
          // Draw: out of the pile and into the hand with a 4% scale overshoot, then rest.
          const frames = IS_FUTA04
            ? m === 0 ? [{ opacity: 0 }, { opacity: 1 }]
              : [{ translate: `${dx}px ${dy}px`, scale: `${(from.height / Math.max(r.height, 1)).toFixed(2)}`, opacity: 1 },
                 { translate: `${(dx * .42).toFixed(1)}px ${(dy * .42 - 14).toFixed(1)}px`, scale: '.96', opacity: 1, offset:.5 },
                 { translate: '0 0', scale: '1.04', opacity: 1, offset:.8 },
                 { translate: '0 0', scale: '1', opacity: 1 }]
            : m === 0 ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: `${from.left - r.left}px ${from.top - r.top}px`, scale: '0.7', rotate: '-8deg', opacity: 0.3 }, { translate: `${(from.left - r.left) * 0.45}px ${(from.top - r.top) * 0.45 - 46 * m}px`, scale: '0.95', rotate: '4deg', opacity: 1, offset: 0.55 }, { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 }];
          anim(to, frames, { duration: (IS_FUTA04 ? PINNED.humanDraw : 420) * f, fill:'backwards', easing: IS_FUTA04 ? EASE.spring : 'cubic-bezier(.3,.7,.3,1)' });
        }
        sound.draw();
        await wait((IS_FUTA04 ? PINNED.humanDraw : 240) * f, my);
      } else {
        // The opponent's draw: a card back leaves the Draw pile and settles on their seat. The
        // card stays face down; the seat is an anchor placed on layout, so nothing is measured
        // inside a frame. Keep the old deck-to-score cue as a fallback for a page without the
        // flight layer (the material lab).
        const seat = oppSeat();
        const source = $('deck').querySelector<HTMLElement>('.pile-card') ?? $('deck');
        const ms = seat ? oppDraw(source, seat, f, !!quickShow) : 0;
        if (seat) {
          if (settings.sound) sound.rustle();
          await wait(ms, my);
        } else {
          flyBack($('deck'), document.querySelector<HTMLElement>('.score.bot')!, f);
          // A live reveal gives it a beat of its own instead of a blink.
          await wait(liveReveal ? 260 * f : quickShow ? quickShow.show.draw : OPP_DRAW_MS * f, my);
        }
      }
      return;
    }
    case 'grow': {
      const by = step.player;
      const mo = momentOf(step);
      const b = mo.budget;
      await anticipate(mo, f, my);
      const bloom = step.style === 'bloom';
      const pop = mo.tier === 'big' ? 1.6 : mo.tier === 'medium' ? 1.25 : 1;
      // Futa04: reveal multi-tile grows one hex at a time so opponent blooms (and cuts after)
      // stay readable — graceful, not hypnotic-fast.
      const sequential = IS_FUTA04 && step.tiles.length > 1 && m > 0 && !b.fadeOnly;
      if (sequential) {
        if (my !== epoch) return;
        queue.take();
        settleStep(step, true);
        let anchor: string | null = null;
        let anchorDist = Infinity;
        const home = parseKey(board.rootKey(by));
        for (let i = 0; i < step.tiles.length; i++) {
          if (my !== epoch) return;
          const t = step.tiles[i]!;
          queue.placeGrowTile(by, t);
          revealProgress++; // a tile really landed: the reveal watchdog must not treat this as a stall
          renderRevealTile();
          if (bloom) sound.bloomTile(i);
          const d = hexDistance(home, parseKey(t.key));
          if (d < anchorDist) { anchorDist = d; anchor = t.key; }
          const tileEl = board.tile(t.key);
          const st = settleFor(t.strength ?? 1, session?.state.config.maxRank ?? 9);
          const frames: Keyframe[] = [
            { transform: 'scale(0.86)', opacity: 0 },
            { transform: 'scale(1.02)', opacity: 1, offset: 0.72 },
            { transform: 'translateY(1px) scale(1)', offset: 0.9 },
            { transform: 'translateY(0) scale(1)' },
          ];
          anim(tileEl, frames, { duration: MOTION.move * f, easing: EASE.spring, transformOrigin: 'center' } as KeyframeAnimationOptions);
          if (tileEl) {
            tileEl.classList.add('spring');
            setTimeout(() => tileEl.classList.remove('spring'), 900 * f);
          }
          if (t.replaced && m > 0) {
            sparks(t.key, by === HUMAN ? 'bot' : 'you', 0, f, Math.max(4, Math.round(b.particles / Math.max(step.tiles.length, 1))));
            sound.sparks();
          } else if (m > 0 && !b.fadeOnly) {
            ring(t.key, f, st.heavy);
          }
          const str = t.strength ?? 1;
          const maxRank = session?.state.config.maxRank ?? 9;
          if (st.heavy) sound.placeTop(str, maxRank, 0);
          else sound.place(str, maxRank, 0);
          if (session?.state.terrain[t.key] === 'rich') sound.chime(0.08);
          const hp = hapticFor(st.heavy ? 'placeTop' : 'place', settings);
          if (hp && by === HUMAN) vibrate(true, hp as number | number[]);
          // Motion pass (2026-10-15): the next tile starts while this one is ~60% landed, so a
          // Bloom reads as one wave of distinct pops instead of a slow count (3 tiles: 1.27s → ~0.9s).
          await wait(i + 1 < step.tiles.length ? GROW_OVERLAP * MOTION.move * f : MOTION.move * f, my);
        }
        if (bloom && anchor && m > 0 && !b.fadeOnly) flash(anchor, f, false);
        if (b.float && by === HUMAN) floatText(`+${step.tiles.length}`, step.tiles[Math.floor(step.tiles.length / 2)]!.key, 'good', f);
        const cap = captionFor(step, HUMAN);
        if (cap && !(mo.banner && mo.first)) caption(cap, step.tiles[Math.floor(step.tiles.length / 2)]!.key, by === HUMAN ? 'good' : 'info');
        if (mo.tier === 'big') await impact(mo, f, my);
        await wait(GROW_HOLD_MS * f, my);
        return;
      }
      if (!show()) return;
      // Legacy / single-tile path: stagger wave for non-Futa04 blooms.
      const home = parseKey(board.rootKey(by));
      const firstDistance = Math.min(...step.tiles.map(tile => hexDistance(home,parseKey(tile.key))));
      const stagger = bloom ? BLOOM_STAGGER_MS * f : 0;
      const staggerCap = (MOTION.moment - MOTION.move) * f;
      let last = 0;
      let anchor: string | null = null;
      let anchorDist = Infinity;
      step.tiles.forEach((t, i) => {
        const tileEl = board.tile(t.key);
        const d = hexDistance(home,parseKey(t.key));
        if (d < anchorDist) { anchorDist = d; anchor = t.key; }
        const delay = bloom ? Math.min((d - firstDistance) * stagger, staggerCap) : 0;
        last = Math.max(last, delay);
        const st = settleFor(t.strength ?? 1, session?.state.config.maxRank ?? 9);
        const frames: Keyframe[] =
          m === 0 || b.fadeOnly
            ? [{ opacity: 0 }, { opacity: 1 }]
            : IS_FUTA04
              ? [{ transform: 'scale(0.86)', opacity: 0 }, { transform: 'scale(1.02)', opacity: 1, offset: 0.72 }, { transform: 'translateY(1px) scale(1)', offset: 0.9 }, { transform: 'translateY(0) scale(1)' }]
              : step.style === 'sprout'
                ? [{ transform: 'scale(0)' }, { transform: `scale(${1 + 0.32 * m}, ${1 + 0.18 * m})`, offset: 0.55 }, { transform: `scale(${1 - 0.06 * m}, ${1 + 0.04 * m})`, offset: 0.8 }, { transform: 'scale(1)' }]
                : [{ transform: `translateY(${-st.drop * m}px) scale(0.15)`, opacity: 0 }, { transform: `translateY(0) scale(${1 + (0.05 + st.squash) * m * pop}, ${1 - st.squash * 0.5 * m})`, opacity: 1, offset: 0.62 }, { transform: `scale(${1 - 0.04 * m}, ${1 + 0.03 * m})`, offset: 0.84 }, { transform: 'scale(1)' }];
        anim(tileEl, frames, { duration: IS_FUTA04 ? MOTION.move * f : (step.style === 'sprout' ? 460 : st.ms) * f, delay, easing: IS_FUTA04 ? EASE.spring : 'cubic-bezier(.2,.8,.3,1.1)', transformOrigin: 'center' } as KeyframeAnimationOptions);
        if (m > 0 && !b.fadeOnly) {
          tileEl?.classList.add('spring');
          setTimeout(() => tileEl?.classList.remove('spring'), delay + 900 * f);
          if (!IS_FUTA04 && b.particles > 0 && by === HUMAN && !t.replaced) drift(t.key, delay + st.ms * 0.55 * f, f, st.heavy ? 3 : 1);
        }
        const hp = hapticFor(st.heavy ? 'placeTop' : 'place', settings);
        if (hp && by === HUMAN && (st.heavy || i === 0)) setTimeout(() => vibrate(true, hp as number | number[]), delay + st.ms * 0.6 * f);
        if (t.replaced) {
          if (m > 0) {
            sparks(t.key, by === HUMAN ? 'bot' : 'you', delay, f, Math.max(4, Math.round(b.particles / Math.max(step.tiles.length, 1))));
            setTimeout(() => sound.sparks(), delay);
          }
          if (m > 0 && !b.fadeOnly && !bloom) ring(t.key, f, st.heavy);
        } else if (IS_FUTA04 && !bloom) {
          if (m > 0 && !b.fadeOnly) ring(t.key, f, st.heavy);
        } else if (!IS_FUTA04 && mo.tier === 'big' && b.particles > 0) {
          sparks(t.key, by === HUMAN ? 'you' : 'bot', delay, f, Math.round(b.particles / step.tiles.length));
        }
        if (!bloom) {
          const str = t.strength ?? 1;
          const maxRank = session?.state.config.maxRank ?? 9;
          if (st.heavy) sound.placeTop(str, maxRank, delay / 1000);
          else sound.place(str, maxRank, delay / 1000);
        }
        if (session?.state.terrain[t.key] === 'rich') sound.chime(delay / 1000 + 0.08);
      });
      if (bloom && anchor && m > 0 && !b.fadeOnly) flash(anchor, f, false);
      if (bloom) sound.bloom();
      if (settings.eyeCandy && by === HUMAN && m > 0 && b.particles > 0) {
        const homeKeys = sporesHome(step.tiles.map((t) => t.key), board.rootKey(HUMAN));
        if (homeKeys.length) setTimeout(() => stream(homeKeys.map((s) => s.from), board.rootKey(HUMAN), f, Math.min(6, homeKeys.length + 2)), last + 380 * f);
      }
      if (b.float && by === HUMAN) floatText(`+${step.tiles.length}`, step.tiles[Math.floor(step.tiles.length / 2)]!.key, 'good', f);
      const cap = captionFor(step, HUMAN);
      if (cap && !(mo.banner && mo.first)) caption(cap, step.tiles[Math.floor(step.tiles.length / 2)]!.key, by === HUMAN ? 'good' : 'info');
      if (mo.tier === 'big') await impact(mo, f, my);
      // The tile has landed after MOTION.move; a short hold lets it register (was a 672ms wait).
      await wait(last + (IS_FUTA04 ? MOTION.move + GROW_HOLD_MS : 420) * f, my);
      return;
    }
    case 'sever': {
      // Part 2: the cinematic cut, played from the pure plan (logic/cut.ts)
      const mine = step.player === HUMAN;
      const mo = momentOf(step);
      const victim = Object.values(queue.board).filter((t) => t && t.owner === step.player && !t.root).length;
      // the caption comes first, so it is there however the cut ends (played, skipped, interrupted)
      caption(captionFor(step, HUMAN)!, step.origin, mine ? 'bad' : 'good');
      await playCut({ origin: step.origin, keys: step.keys, victimTiles: victim, mine }, mo.first || mo.chain === 0, mo.chain, f, my);
      if (my !== epoch) return;
      show();
      return;
    }
    case 'megaBomb': {
      // Mega Bomb is its own disappearance, not a cut: no cutPlan, no ripple, no banner.
      // A fast-forwarded or abandoned step must not dim the board (moment-quiet). This branch
      // animates the doomed tiles before show() moves the queue on, so unlike the branches that
      // render first it guards with the plain epoch check (the one the sever branch uses).
      if (my !== epoch) return;
      const center = parseKey(step.target);
      const mine = step.player === HUMAN;
      quietAmbient(true);
      // one dark pulse from the target, sized to the destroyed set (opacity ≤0.4, duration quick)
      let lastRing = 0;
      for (const key of step.destroyed) lastRing = Math.max(lastRing, hexDistance(parseKey(key), center));
      flash(step.target, f, false, { dark: true, ms: MOTION.quick * 1.25 * f, radius: Math.min(4.4, lastRing + 1.15) });
      if (settings.sound) sound.megaBomb();
      if (mine) vibrate(settings.vibration, 22);
      // Blast: lowkey but heavy — the board thuds like something solid landed.
      if (m > 0 && step.destroyed.length >= 1) {
        const amp = IS_FUTA04 ? Math.min(6.5, 3.5 + step.destroyed.length * 0.35) : 3;
        anim($('board-wrap'), IS_FUTA04 ? heavyShakeFrames(amp) : shakeFrames(3), {
          duration: (IS_FUTA04 ? MOTION.moment : MOTION.move) * Math.max(f, 0.5),
          easing: EASE.out,
        });
      }
      // destroyed tiles punch inward at their own centre, staggered by ring
      for (const key of step.destroyed) {
        const ringN = hexDistance(parseKey(key), center);
        const delay = Math.min(ringN * 36, 480) * f;
        anim(board.tile(key), [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(0.68)', opacity: 1, offset: 0.5 },
          { transform: 'scale(0)', opacity: 0.45 },
        ], { duration: MOTION.move * 1.1 * f, delay, easing: EASE.out, transformOrigin: 'center', fill: 'forwards' } as KeyframeAnimationOptions);
        drift(key, delay + MOTION.move * 0.4 * f, f, IS_FUTA04 ? 2 : 1);
      }
      // Blast is the heaviest move: it holds the screen long enough to register (at least 640ms)
      // even when it only clears one ring, which used to be gone in ~430ms.
      const hold = Math.max(BLAST_MIN_MS, Math.min(840, lastRing * 36 + MOTION.move * 1.15)) * f;
      // The PLANNED hold, published for the motion suite (a diagnostic, like every animLog mark).
      // Tests used to tax the wall clock to the end of the busy gate, which also counts this
      // runner's frame and pump-wake latency; the plan is what the product actually intends.
      animLog('megaBomb:hold', { ms: Math.round(hold), ring: lastRing });
      await wait(hold, my);
      quietAmbient(false);
      show();
      return;
    }
    case 'remove': {
      for (const k of step.keys) anim(board.tile(k), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 * f, fill: 'forwards' });
      await wait(320 * f, my);
      show();
      return;
    }
    case 'strengthen': {
      // Level up: a quick pulse, a thin ring expanding, the number ticks up, a small solid thud.
      const mo = momentOf(step);
      const top = step.to >= (session?.state.config.maxRank ?? 9);
      if (!show()) return;
      const tileEl = board.tile(step.key);
      const num = tileEl?.querySelector('.tile-num');
      const stone = IS_FUTA04 ? tileEl?.querySelector<SVGGElement>('.seed-stone') ?? null : null;
      // The number brightens and ticks from → to over one "quick" beat; no bounce.
      if (m > 0 && !mo.budget.fadeOnly) anim(stone ?? num ?? tileEl, [{ opacity: 0.5 }, { opacity: 1 }], { duration: MOTION.quick * f, easing: EASE.out, fill: 'both' });
      if (m > 0 && !mo.budget.fadeOnly) ring(step.key, f, top);
      if ((num || stone) && step.to > step.from) {
        const setShown = (value: number) => {
          if (stone) {
            setSeedStoneStrength(stone, value);
            if (value === step.to && m > 0) glintSeedStone(stone);
          } else if (num) num.textContent = String(value);
        };
        const n = step.to - step.from;
        for (let i = 1; i <= n; i++) setTimeout(() => setShown(step.from + i), (i * MOTION.quick * f) / n);
        setShown(step.from);
      }
      if (settings.sound) sound.strengthen();
      if (top && mo.budget.particles > 0) sparks(step.key, step.player === HUMAN ? 'you' : 'bot', 120 * f, f, Math.min(8, mo.budget.particles));
      vibrate(settings.vibration && settings.effects !== 'low', 12);
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, step.key, step.player === HUMAN ? 'good' : 'info');
      // the count-up takes MOTION.quick; then a short hold (was 560ms in all)
      await wait((MOTION.quick + 230) * f, my);
      return;
    }
    case 'fruit': {
      // v0.6 Fruit card: the card lifts and flies to the tile, the tile swells like a pod, then
      // bursts (a spore puff, a thud, "Fruited!"); the cut that follows is its own steps.
      // The opponent's version is calmer: no banner, a caption instead.
      const mo = momentOf(step);
      const b = mo.budget;
      const mine = step.player === HUMAN;
      const tileEl = board.tile(step.target);
      const to = tileEl?.getBoundingClientRect();
      // Mine flies from my hand. Theirs has the same body as their throw: the Bomb turns face up on
      // their seat, holds a beat and arcs down onto the tile at card-to-tile size. (It used to fly
      // from their score pill, which the product header hides: a 0x0 box blew the card up ~37x.)
      const seat = mine ? null : oppSeat();
      // land on the hex itself (the tile's group can include art spilling past it, which made the
      // card grow as it came down): the card settles INTO the hex, smaller than it was on the seat
      const hex = document.querySelector(`#board .hex-cell[data-key="${step.target}"] > path.hex`) ?? tileEl;
      if (seat && hex) {
        const ms = oppThrow(step.card, seat, hex, f, !!quickShow);
        await wait(ms, my);
      } else {
        const from = mine ? cardRects.get(step.card.id) : undefined;
        if (from && to && m > 0) {
          flyCard(step.card, from, to, f);
          await wait(380 * f, my);
        }
      }
      await anticipate(mo, f, my);
      // the pod swells (a plain fade with Reduce motion)
      anim(tileEl, m === 0 || b.fadeOnly ? [{ opacity: 1 }, { opacity: 0.85 }] : [{ transform: 'scale(1)' }, { transform: `scale(${1 + 0.14 * m})`, offset: 0.7 }, { transform: `scale(${1 + 0.1 * m})` }], { duration: 300 * f, fill: 'forwards', easing: 'ease-out', transformOrigin: 'center' } as KeyframeAnimationOptions);
      await wait(300 * f, my);
      // the burst: spores puff out, a soft thud
      if (b.particles > 0) sparks(step.target, mine ? 'you' : 'bot', 0, f, Math.max(6, Math.round(b.particles / (mine ? 2 : 3))));
      flash(step.target, f, false);
      if (settings.sound) sound.fruit();
      {
        const hp = hapticFor('throw', settings);
        if (hp && mine) vibrate(true, hp as number | number[]);
      }
      anim(tileEl, m === 0 || b.fadeOnly ? [{ opacity: 0.85 }, { opacity: 0 }] : [{ opacity: 1, transform: `scale(${1 + 0.1 * m})` }, { opacity: 0, transform: `scale(${1 + 0.35 * m})` }], { duration: 260 * f, fill: 'forwards', easing: 'ease-in', transformOrigin: 'center' } as KeyframeAnimationOptions);
      if (mine && b.banner) banner(FRUIT.banner, 'big');
      await impact(mo, f, my);
      const cap = captionFor(step, HUMAN);
      if (cap && !(mine && b.banner)) caption(cap, step.target, mine ? 'good' : 'bad');
      await wait(220 * f, my);
      show();
      return;
    }
    case 'discard': {
      // My card flies from my hand. The opponent's card has a body of its own: it turns face up
      // on their seat, holds for a beat and arcs into the Throw pile.
      //
      // THE PILE TOP CHANGES ON ARRIVAL (owner, 2026-10-20: "after throwing card ... it somewhat
      // flashes the previous card again even new card was just placed"). The flight ends with a
      // fade; if the pile only advanced after that fade, the fade uncovered the OLD top for a
      // moment between the card leaving and the pile repainting. So both flights hand the pile
      // over at their landing stop — before the fade — and the same card then fades over itself.
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, null, 'info');
      // Exactly once, and idempotent: show()/settleStep writes the same value at the step's end.
      const land = () => {
        if (my !== epoch || !session) return;
        shownDiscard = [...session.view.discard];
        paintDiscardTop();
      };
      if (step.player === HUMAN) {
        // EVERY human throw gets the boomerang (owner, 2026-10-25): the swipe up, the drop on the
        // pile and the tap on the pile. It replaced the old fly-to-pile for only the swipe, which
        // is why the owner never saw it — he throws with the pile.
        //
        // A committed drag continues from the released ghost's box, never snapping back to the
        // hand for one frame. A pile tap has no release box, so it takes off from the card's hand
        // box: same flourish, different start. The box is consumed with the step.
        let from = cardRects.get(step.card.id);
        if (dragThrowFrom) {
          from = dragThrowFrom;
          dragThrowFrom = null;
        }
        const flight = IS_FUTA04 ? throwFlight(motionOn()) : 'ordinary';
        if (from) {
          const to = ($('discard').querySelector<HTMLElement>('.pile-card') ?? $('discard')).getBoundingClientRect();
          const source = document.querySelector<HTMLElement>(`#hand [data-card="${step.card.id}"]`);
          if (source) source.style.visibility = 'hidden';
          if (flight === 'boomerang') {
            // Settle over my home: the card visits the board as if it were about to be placed.
            let point = board.screenPoint(board.rootKey(HUMAN));
            if (!point.x && !point.y) {
              const r = $('board-wrap').getBoundingClientRect();
              point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            // The flight is the card's own beat (`BOOMERANG.total` = PINNED.throwFlight); the STEP
            // keeps its published 396 ms wait. The boomerang used to total 624 ms at interface
            // speed and this await followed it, so every human throw held the step 634 ms instead
            // of ~406 ms (+228 ms). max() is a floor for the flight, never a reason to stretch the
            // beat: the unit test pins the flight inside the wait, and `futa04-motion` measures
            // the step itself.
            const flightMs = throwBoomerang(step.card, from, point, to, f, land);
            await wait(Math.max(PINNED.throw * f, flightMs), my);
          } else if (flight === 'ordinary') {
            flyCard(step.card, from, to, f, land);
            await wait(IS_FUTA04 ? PINNED.throw * f : 320 * f, my);
          } else {
            // Reduce motion / Speed off: no lift, no spin, no flyer — the card is simply on the pile.
            land();
            await wait(0, my);
          }
        } else {
          await wait(320 * f, my);
        }
        // The flight is home: let the target settle. The held swell was part of the rect the
        // boomerang just landed on, so releasing it here cannot pull the landing out from under
        // the card.
        releaseThrowSwell();
        const hp = hapticFor('throw', settings);
        if (hp) vibrate(true, hp as number | number[]);
      } else {
        const seat = oppSeat();
        if (seat) {
          if (settings.sound) sound.rustle();
          const ms = oppThrow(step.card, seat, $('discard').querySelector<HTMLElement>('.pile-card') ?? $('discard'), f, !!quickShow, land);
          await wait(ms, my);
          if (my !== epoch) return;
          if (settings.sound) sound.throw();
        } else {
          // No flight layer (the material lab): keep the old pile-only beat.
          await wait(quickShow ? quickShow.show.discard : 320 * f, my);
        }
      }
      show();
      return;
    }
    case 'strangle': {
      const root = board.rootKey(step.loser);
      // Step 4: the Strangle finish (never over 2.0s at Normal): the surrounding tiles pulse
      // inward, a slow beat, then the volcano is smothered by moss while my tree blooms, or my
      // tree withers while the volcano roars. Tap or Skip jumps to the end state.
      const loserEl = board.homeEls[step.loser];
      const winnerEl = board.homeEls[step.loser === HUMAN ? BOT : HUMAN];
      const beats = strangleFinish({ speed: f, reduceMotion: settings.reduceMotion }, step.loser === HUMAN ? 'tree' : 'volcano');
      const rc = centerOf(root);
      for (const b of beats) {
        if (b.k === 'pulse') {
          for (const k of board.boardKeys) {
            const tileEl = board.tile(k);
            const p = centerOf(k);
            if (!tileEl || k === root || Math.hypot(p.x - rc.x, p.y - rc.y) > S * 1.9) continue;
            anim(tileEl, [{ translate: '0 0' }, { translate: `${(rc.x - p.x) * 0.14 * Math.max(m, 0.3)}px ${(rc.y - p.y) * 0.14 * Math.max(m, 0.3)}px`, offset: 0.45 }, { translate: '0 0' }], { duration: b.ms });
          }
          sound.snap();
        } else if (b.k === 'smother' || b.k === 'wither') {
          loserEl?.classList.add('strangled');
          loserEl?.classList.remove('idle', 'danger', 'worried', 'show-ring', 'ring-soft', 'ring-strong');
          if (b.k === 'smother') sound.sigh();
          else sound.grind();
        } else if (b.k === 'bloom' || b.k === 'roar') {
          winnerEl?.classList.add('won');
          if (winnerEl) pulseLandmark(winnerEl, 'tapped');
        }
        await wait(b.ms, my);
      }
      if (!beats.length) loserEl?.classList.add('strangled');
      await impact(momentOf(step), f, my);
      caption(captionFor(step, HUMAN)!, root, step.loser === HUMAN ? 'bad' : 'good');
      await wait(400 * f, my);
      show();
      return;
    }
    case 'turn': {
      if (!show()) return;
      announceTurn(step.player, step.player === HUMAN && step.final ? 'Your last turn' : undefined);
      // Only the now-active home answers, with one existing heartbeat; the other stays still.
      beatHome(step.player, my);
      // My turn starts: a soft glow passes over my hand.
      if (step.player === HUMAN) glowHand(900 * Math.max(f, 0.5));
      // an empty opponent turn starts at once (its quick beats are in its plan)
      const oppQuick = step.player === BOT && session && botPlan?.beats.quick && botPlan.keys[0] === posKey(session.state);
      const quick = oppQuick ? 0 : quickShow && step.player === HUMAN ? quickShow.show.turn : null;
      if (step.player === HUMAN) quickShow = null;
      await wait(quick ?? TURN_HANDOVER_MS * f, my);
      return;
    }
    case 'end': {
      if (!show()) return;
      const won = step.result.winner === HUMAN;
      if (won) sound.win();
      else sound.lose();
      {
        const hp = hapticFor(won ? 'win' : 'lose', settings);
        if (hp) vibrate(true, hp as number | number[]);
      }
      if (won) {
        // A fuller flourish: soft flashes and a ring of sparks from my root (within the cap).
        // three soft rings, at most 3 a second (photosensitivity)
        for (let i = 0; i < 3; i++) setTimeout(() => flash(board.rootKey(HUMAN), f, false), i * 340 * Math.max(f, 1));
        const spend = effectBudget('big', settings.effects, settings.reduceMotion).particles;
        if (spend) sparks(board.rootKey(HUMAN), 'you', 300 * f, f * 1.4, spend);
      }
      await wait(800 * f, my);
      return;
    }
    case 'sync':
      show();
      return;
  }
}

/** Overhaul item 14: the tug-of-war bar follows the shown scores (so it moves with the count-up). */
function setRace(s: readonly [number, number]) {
  const race = $('race');
  const share = raceShare(s[0], s[1]).toFixed(3);
  if (race.style.getPropertyValue('--share') !== share) race.style.setProperty('--share', share);
  race.setAttribute('aria-label', raceWords(s[0], s[1], OPP.Label));
}

/** Overhaul item 14: tap a score to see what it is made of (tap again or anywhere to close). */
function showBreakdown(p: Player) {
  const pop = $('score-pop');
  if (!session || (!pop.hidden && pop.dataset.p === String(p))) {
    pop.hidden = true;
    return;
  }
  const b = breakdownOf(session.state, p);
  pop.dataset.p = String(p);
  pop.className = `score-pop ${p === HUMAN ? 'you' : 'bot'}`;
  pop.replaceChildren(
    Object.assign(document.createElement('b'), { textContent: p === HUMAN ? 'Your score' : `${OPP.Label} score` }),
    ...b.lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })),
  );
  pop.hidden = false;
}

let lastAmbBoard: State['board'] | null = null;
let lastAmbKey = '';

/**
 * Part 2: plays one cut from its plan (logic/cut.ts): anticipation, hit-stop with a small local
 * flash and a micro zoom, the vein pulse, the snap and shake, the ripple of dying tiles (moss
 * withers, lava cools and crumbles), the scar, and the payoff. `quiet`: no payoff (Fruit).
 */
async function playCut(c: CutInput, first: boolean, _chain: number, f: number, my: number, quiet = false) {
  const plan = cutPlan(c, { speed: f, reduceMotion: settings.reduceMotion || motion() === 0, effects: settings.effects }, first);
  document.documentElement.dataset.cutTier = plan.tier; // (read by the filmstrip tool: where the cut starts)
  const at = (ms: number, fn: () => void) => setTimeout(() => my === epoch && fn(), ms);
  const wrap = $('board-wrap');
  const P = board.screenPoint(c.origin);
  const W = wrap.getBoundingClientRect();
  const origin = `${(P.x - W.left).toFixed(0)}px ${(P.y - W.top).toFixed(0)}px`;
  const keys = new Set(c.keys);
  // the veins' blur glow draws a black box in Chrome while tiles animate under it; it is also the
  // costliest thing on the board, so it rests during the cut (the next redraw brings it back)
  document.querySelectorAll('svg.board .veins[filter]').forEach((g) => g.removeAttribute('filter'));
  // dim the ambient skin loops for the moment, so the cut reads
  quietAmbient(true);
  if (!quiet) sound.duck(plan.duckMs);
  for (const s of plan.stages) {
    switch (s.name) {
      case 'anticipation': {
        // Only Big and Huge lean the camera into the beat; Severe keeps its weight for the impact.
        if (plan.tier === 'big' || plan.tier === 'huge') anim(wrap, [{ scale: '1' }, { scale: '0.99' }, { scale: '1' }], { duration: s.dur + 80 * f, easing: 'ease-in-out', transformOrigin: origin } as KeyframeAnimationOptions);
        // the doomed links brighten and shorten a little toward the cut origin
        const doomed = board.veinsTouching(keys);
        for (const v of doomed) {
          v.classList.add('straining');
          anim(v, [{ opacity: 1, strokeDashoffset: '0' }, { opacity: 1, strokeDashoffset: '0.06' }], { duration: s.dur, easing: EASE.out, fill: 'forwards' });
        }
        if (doomed.length) setTimeout(() => doomed.forEach((v) => v.classList.remove('straining')), s.dur + 60);
        break;
      }
      case 'flash': {
        // the torn edge: the links that snapped. A Severe cut flashes the whole seam, so its
        // weight reads along the cut and not just at one hex.
        const seam = c.keys.filter((key) => hexDistance(parseKey(key), parseKey(c.origin)) === 1);
        const edge = plan.tier === 'severe' ? seam : seam.slice(0, 1);
        at(s.at, () => cutFlash(c.origin, plan.flash.ms, plan.flash.alpha, plan.flash.radius, edge));
        break;
      }
      case 'zoom':
        at(s.at, () => anim(wrap, [{ scale: '1' }, { scale: String(plan.zoom), offset: 0.35 }, { scale: '1' }], { duration: s.dur * 2, easing: EASE.out, transformOrigin: origin } as KeyframeAnimationOptions));
        break;
      case 'pulse':
        at(s.at, () => {
          for (const v of board.veinsTouching(keys)) {
            v.classList.add('snapping');
            anim(v, [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0.15, offset: 0.7 }, { opacity: 0 }], { duration: s.dur + 200 * f, fill: 'forwards' });
          }
        });
        break;
      case 'snap':
        at(s.at, () => {
          // one cut family, recognisable at every size; losing tiles uses the duller, lower cutMe
          const cue: 'cutSmall' | 'cutMedium' | 'cutBig' | 'cutHuge' | 'cutMe' = c.mine ? 'cutMe'
            : plan.tier === 'huge' ? 'cutHuge' : plan.tier === 'big' ? 'cutBig' : plan.tier === 'severe' ? 'cutMedium' : 'cutSmall';
          sound[cue]();
          if (plan.shakePx > 0) anim(wrap, shakeFrames(plan.shakePx), { duration: MOTION.move * Math.max(f, 0.5), easing: EASE.out });
          // Severe: the tiles that survive beside the tear flinch toward it and dim a touch.
          if (plan.tier === 'severe' && plan.shakePx > 0) {
            const cutKeys = new Set(c.keys);
            const neighbours = new Set<string>();
            for (const key of c.keys) {
              for (const nb of allNeighbors(parseKey(key))) {
                const k = coordKey(nb);
                const tile = queue.board[k];
                if (tile && !tile.root && !cutKeys.has(k)) neighbours.add(k);
              }
            }
            for (const k of neighbours) flinch(k, c.origin, s.dur);
          }
          const hp = plan.haptic && hapticFor(plan.haptic, settings);
          if (hp && !quiet) vibrate(true, hp as number | number[]);
        });
        break;
      case 'crumble':
        at(s.at, () => {
          if (!quiet) sound.sad();
        });
        break;
      case 'payoff':
        if (!quiet)
          at(s.at, () => {
            // one floating −N for the whole cut, never a number per tile (never with Reduce motion)
            if (plan.stages[0]?.name !== 'fade') floatText(plan.float, c.origin, c.mine ? 'bad' : 'good', f, true);
            if (plan.banner) banner(plan.banner, c.mine ? 'calm' : 'big');
          });
        break;
      default:
        break;
    }
  }
  // the ripple: each tile darkens, flattens to 0.9 on Y, then drops away from the surviving
  // network (a fold along the link for small cuts). Not a random fade, not confetti.
  const fading = plan.stages[0]?.name === 'fade';
  const originPt = centerOf(c.origin);
  for (const t of plan.tiles) {
    const tileEl = board.tile(t.key);
    const lava = queue.board[t.key]?.owner === BOT;
    if (!tileEl) continue;
    const p = centerOf(t.key);
    const len = Math.hypot(p.x - originPt.x, p.y - originPt.y) || 1;
    const ax = ((p.x - originPt.x) / len) * 5;
    const ay = ((p.y - originPt.y) / len) * 5;
    const frames: Keyframe[] =
      fading
        ? [{ opacity: 1 }, { opacity: 0 }]
        : plan.tier === 'small'
          ? [{ opacity: 1, transform: 'scale(1, 1)' }, { opacity: 0.85, transform: 'scaleX(1.06) scaleY(0.5)', offset: 0.55 }, { opacity: 0, transform: 'scaleX(1.1) scaleY(0.12)' }]
          : [{ opacity: 1, transform: 'scale(1, 1)' }, { opacity: lava ? 0.85 : 0.8, transform: 'scale(1, 0.9)', offset: 0.4 }, { opacity: 0, transform: `scale(${lava ? 0.85 : 0.86}, 0.64) translate(${ax}px, ${ay + 3}px)` }];
    at(t.at, () => tileEl.classList.add('withering'));
    anim(tileEl, frames, { duration: t.dur, delay: t.at, fill: 'forwards', easing: EASE.out, transformOrigin: 'center' } as KeyframeAnimationOptions);
    if (plan.motes) drift(t.key, t.at + t.dur * 0.5, f, plan.motes);
  }
  // the chain reaction: as each ring of their tiles starts to fall, one pop a step higher (and a
  // light tick once the cut's own buzz is over); logic/cut.ts decides when, and when not
  if (!quiet) for (const pop of plan.pops) at(pop.at, () => {
    animLog('cascade', { step: pop.step, buzz: pop.buzz });
    sound.cascadePop(pop.step);
    const hp = pop.buzz && hapticFor('cascade', settings);
    if (hp) vibrate(true, hp as number);
  });
  // after the wave: a faint scar on the cut edge for ~400ms (not on Futa04 — no leftovers)
  if (plan.scar && !IS_FUTA04) at(Math.max(0, ...plan.tiles.map((t) => t.at + t.dur)), () => scar(c.keys, f));
  await wait(plan.total, my);
  quietAmbient(false);
}

/** the result screen's count-up plays once per game */
let goCounted = false;
/** the Seeds award's one moment plays once per game (a later re-render repaints it still) */
let goSeedSettled = false;
/** A proof is being settled for THIS card: hold the award's slot so the number lands without a jump. */
let goSeedSlot = false;
/** the reward message the card's seed line is currently showing (null until this game paints it) */
let goSeedShown: string | null = null;
/**
 * Which settle the card is waiting on. A new game (or a newer settle) bumps it, so an answer that
 * arrives late can never paint itself onto a card that is no longer about that game.
 */
let goSeedsSettleRun = 0;

/** the final-turns banner shows once per game */
let finalShown = false;
/** the final-turns cue plays once, when the endgame shade comes on */
let finalSoundOn = false;

let scoreUnsub: (() => void) | null = null;
function countScores(to: [number, number]) {
  const target: [number, number] = [to[HUMAN], to[BOT]];
  const start: [number, number] = [...shownScores];
  if (start[0] === target[0] && start[1] === target[1]) return;
  const t0 = performance.now();
  const dur = 600 * Math.max(timeScale(), 0.3);
  scoreUnsub?.();
  scoreUnsub = scheduler.subscribe(({ now }) => {
    const k = Math.min(1, (now - t0) / dur);
    shownScores = [Math.round(start[0] + (target[0] - start[0]) * k), Math.round(start[1] + (target[1] - start[1]) * k)];
    $('score-you').textContent = String(shownScores[0]);
    $('score-bot').textContent = String(shownScores[1]);
    setRace(shownScores);
    if (k >= 1) {
      scoreUnsub?.();
      scoreUnsub = null;
    }
  });
  // A fast tick, then a tiny bounce on the final number.
  const bounce: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.45 }, { transform: 'scale(0.96)', offset: 0.75 }, { transform: 'scale(1)' }];
  if (target[0] !== start[0]) anim($('score-you'), bounce, { duration: 360, delay: dur });
  if (target[1] !== start[1]) anim($('score-bot'), bounce, { duration: 360, delay: dur });
}

// ---------- rendering ----------

const busy = () => queue.pending > 0 || pumping;
const myTurn = () => {
  if (pregameHold || isStarterRitualPlaying()) return false;
  if (isOnlineDuel()) return !!getOnlineSession()?.myTurn && !getOnlineSession()?.finished;
  return !!session && session.state.actor === HUMAN && session.state.phase !== 'GAME_OVER';
};

/** The step a position is in: a new turn, phase or acting player means the step changed. */
const stepKeyOf = (state: State | null | undefined): string =>
  state ? `${state.turnNumber}|${state.phase}|${state.actor}|${state.turnPlayer}` : '';

/**
 * Keep the shared Session board in sync with the online display state (Me = moss).
 *
 * A poll or a ping re-sync must NOT throw away the taps the player has made: exactly like the
 * offline game, the transient selection survives a re-render and is cleared only by a committed
 * move or a step change. Pass `resetSelection` true after a move actually lands (or is taken back).
 */
const syncSessionFromOnline = (resetSelection = false) => {
  const os = getOnlineSession();
  if (!os) return;
  const prev = session;
  const keepSelection = !resetSelection && !!prev && stepKeyOf(prev.state) === stepKeyOf(os.state);
  const keptSel = keepSelection ? { ...prev!.sel } : null;
  const keptPreset = keepSelection ? prev!.presetMove : null;
  session = new Session(os.state, HUMAN, [...os.log], os.base);
  if (keptSel) session.sel = keptSel;
  if (keptPreset) session.preset(keptPreset);
  // A catch-up that is about to replay (its steps are still pending) owns the Throw pile: keep
  // the shown one until its discard step lands. An ordinary sync can catch the pile up now.
  const replayQueued = (os.driver.pendingEvents?.().length ?? 0) > 0;
  if (!os.isRevealing && !replayQueued) shownDiscard = [...session.view.discard];
  // Every local mirror of the online state is rebuilt here (after a snapshot, a move, or a
  // take-back), which is exactly when the Replay question may have a new answer. One cached read.
  refreshOnlineTurnReplay();
};

/** Futa04's idle prompt yields for every active move, including Bloom painting without a card. */
function updateFuta04MoveActive() {
  if (!IS_FUTA04) return;
  const active = !!session && !$('game').hidden && (busy() || session.sel.card !== null || session.sel.hex !== null || session.sel.kind !== null || !!session.pending || !!draw.shape.length || draw.desk.phase === 'live' || !!draw.ptr);
  document.documentElement.classList.toggle('futa04-move-active', active);
  // Free-play bulb nudge stops the moment a real move starts.
  if (active) clearFreePlayBulbNudge();
  document.documentElement.dataset.futa04Bloom = String(!!session?.sel.kind?.startsWith('bloom-'));
  const grew = !!session && myTurn() && !!grewThisTurn();
  const bloomReady = !!session && myTurn() && session.view.phase === 'ACT'
    && session.legal.some(a => a.t === 'Bloom' || a.t === 'MegaBomb');
  document.documentElement.dataset.futa04Grew = String(grew);
  document.documentElement.dataset.futa04BloomReady = String(bloomReady);
  document.documentElement.dataset.futa04Waiting = String(myTurn() && !busy() && !watching);
  document.documentElement.dataset.futa04Turn = String(session?.state.turnNumber ?? '');
}

// ---------- idle hint ----------
// After about 8 seconds without a tap on my turn, the next control pulses very gently.
// One quiet pulse, no sound, no nagging; any tap or change clears it.
let idleTimer: ReturnType<typeof setTimeout> | undefined;
function armIdle() {
  clearTimeout(idleTimer);
  document.querySelectorAll('.idle-hint').forEach((e) => e.classList.remove('idle-hint'));
  if (!session || busy()) return;
  const t = idleTarget(session.view.phase, myTurn(), !!session.pending);
  if (!t) return;
  idleTimer = setTimeout(() => {
    const el = t === 'deck' ? $('deck') : t === 'confirm' ? $('confirm-play') : $('hand');
    el.classList.add('idle-hint');
  }, 8000);
}

/** Polish pass 3: hands the top-rank glow its settings when they change. */
let glowKey = '';
function syncGlow() {
  const o = { setting: settings.topGlow, effects: settings.effects, reduceMotion: settings.reduceMotion };
  const k = JSON.stringify(o);
  if (k === glowKey) return;
  glowKey = k;
  board.setGlow(o);
}

/**
 * The cost of the two redraw paths, for the smoothness evidence only (never drives anything).
 * `full` = a whole-page `render()`, `tile` = `renderRevealTile()`. Read with `__severgrow.renderCosts()`.
 */
const renderCosts: { kind: 'full' | 'tile'; ms: number }[] = [];
const noteRenderCost = (kind: 'full' | 'tile', ms: number): void => {
  renderCosts.push({ kind, ms: Math.round(ms * 100) / 100 });
  if (renderCosts.length > 600) renderCosts.splice(0, renderCosts.length - 600);
};

/**
 * The per-tile redraw for a SEQUENTIAL (multi-tile) grow. Between two tiles of the same step only
 * the board changes — the turn word, hand, piles, controls and camera do not — so a full-page
 * `render()` per tile is wasted work that reads as a dropped frame on a phone. `show()` still runs
 * the full `render()` at every step boundary, and the pump's end does one more.
 */
function renderRevealTile(): void {
  if (!session || $('game').hidden) return;
  const t0 = performance.now();
  syncGlow();
  renderBoard(session.view, null);
  noteRenderCost('tile', performance.now() - t0);
}

/**
 * Turn hand-off (owner, 2026-10-24): the moment the turn comes back to me, a soft light runs round
 * the board's edge and the display says YOUR TURN. Not in lessons or the tutorial (they say it in
 * words); with reduced motion the display word alone carries it.
 */
let turnWasMine: boolean | null = null;
function cueTurnHandOff(v: View): void {
  if (busy()) return; // the opponent's turn is still being shown
  const was = turnWasMine;
  turnWasMine = v.turnPlayer === HUMAN && !v.result;
  if (was !== false || !turnWasMine || !IS_FUTA04 || lessonActive() || coach.tutorial) return;
  smartCockpit?.event({ message: 'YOUR TURN', priority: 20, duration: 1300, mode: 'green' });
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cue = document.getElementById('turn-cue');
  if (!cue) {
    cue = document.createElement('div');
    cue.id = 'turn-cue';
    cue.setAttribute('aria-hidden', 'true');
    $('game').append(cue);
  }
  cue.classList.remove('on');
  void cue.offsetWidth; // restart the sweep
  cue.classList.add('on');
}

/** A Bloom's cards all lift as one: the height of a middle card. */
const BLOOM_LIFT_WEIGHT = 0.5;

// The Replay control's own words (offline, unchanged): same sentences the product has always used.
const REPLAY_TIP = `Replay ${OPP.theirs} last turn`;
const REPLAY_NONE = `Nothing to replay yet: ${OPP.the} hasn't moved`;

/**
 * Is there an opponent turn the Replay control may offer?
 *
 * Offline the session simply kept the bot's turns. Online there is no such record, so the
 * `OnlineSession` answers from a reconstruction of the last turn that was PROVED against the live
 * board (`prepareOpponentTurnReplay`, called where a snapshot lands — never from here, so a render
 * can never become a fetch). It also stays quiet while a catch-up is still showing, because the
 * board on screen is not yet the live one.
 */
const canReplayLastTurn = (): boolean =>
  isOnlineDuel() ? getOnlineSession()?.canReplayOpponentTurn === true : session?.canReplayOpponent === true;

/**
 * Why the slot cannot offer Replay: the one honest distinction the online path needs. Offline
 * keeps exactly the words it always had.
 */
const noReplayTip = (): string =>
  isOnlineDuel() && getOnlineSession()?.turnReplayReason === 'unverified' ? TURN_REPLAY.unverified : REPLAY_NONE;

/**
 * Ask the online session to answer "is their last turn replayable?" for the state that just
 * landed, and repaint when the answer arrives. The session caches the answer per match + revision +
 * board, so this is one read per snapshot — never a read per render.
 */
function refreshOnlineTurnReplay(): void {
  const os = getOnlineSession();
  if (!os) return;
  void os.prepareOpponentTurnReplay().then(
    () => {
      if (getOnlineSession() !== os) return; // the match was torn down meanwhile
      render();
    },
    () => undefined,
  );
}

function render() {
  const t0 = performance.now();
  applyLayout();
  // A new layout (or a game screen not drawn yet): place the cockpit once it can be measured.
  if (sideDockStale && IS_FUTA04) requestAnimationFrame(() => sideDockStale && centreSideDock());
  syncGlow();
  updateFuta04MoveActive();
  if (!session || $('game').hidden) return;
  armIdle();
  const v = session.view;
  const advice = myTurn() && !busy() ? currentAdvice() : null;
  document.documentElement.style.setProperty('--anim', String(timeScale()));
  renderHud();
  const combo = drawCombo();
  if (!combo && (draw.shape.length || draw.desk.phase === 'live' || draw.msg)) draw = { ...DRAW0 };
  // Classic only: a unique placement is shown ready with Confirm. Futa04 always paints —
  // never pre-plant / pre-fill the bloom when the recipe is entered.
  if (!IS_FUTA04 && combo && !session.pending && !draw.shape.length && draw.desk.phase === 'idle' && !draw.redraw) {
    const only = onlyPlacement(combo);
    if (only) session.preset(only);
  }
  board.setDrawing(!!combo, drawHandlers);
  renderBoard(v, advice);
  if (combo) paintDraw();
  else $('draw-info').hidden = true;
  renderControls(v, advice);
  $('dock').classList.toggle('confirming', !$('confirm').hidden);
  renderHand(v, advice);
  renderPiles(v, advice);
  if (IS_FUTA04) requestAnimationFrame(alignDrawPiles);
  if (FEATURES.smartCamera && camera) {
    // what I am working on: the map (a card picked, painting, the opponent's turn) or the cards
    const mapFocus = !myTurn() || busy() || draw.shape.length > 0 || !!draw.ptr || session.sel.card !== null || session.sel.hex !== null;
    document.documentElement.dataset.focus = mapFocus ? 'map' : 'cards';
    feedCamera(v);
  }
  if (FEATURES.phoneLayout && thumbLayout) checkOverlap(v);
  // the test copy: the step's tip, faintly over the board after a few idle seconds (my turn, no
  // animation, no Bloom being painted)
  if (FEATURES.guidance && guideMod) {
    // the step, from the game's own state: whose turn it is and the phase
    const st = session.state;
    const over = st.phase === 'GAME_OVER';
    const step = over || watching ? null : st.actor !== HUMAN ? 'opp' : st.phase === 'DRAW' ? 'draw' : st.phase === 'DISCARD' ? 'throw' : 'grow';
    guideMod.update({ step, turn: st.turnNumber, picked: session.sel.card !== null });
  }
  renderCoach(advice);
  renderOnboardingGuide(v);
  renderGameOver();
  renderGuide(advice);
  renderFirstTip(v);
  updateFuta04Help();
  smartCockpit?.sync();
  syncTutorialChrome();
  renderTutorial();
  syncFreePlayBulbNudge();
  cueTurnHandOff(v);
  if (glassSurface?.isOpen()) {
    if (tutorialFreePlayActive() && glassSurface.mode?.() === 'guidance') {
      glassSurface.guidance(freePlayGuidanceLine());
    } else if (intelState !== session.state && glassSurface.mode?.() === 'intel') {
      intelState = session.state;
      const model = intelModel()!;
      glassSurface.intel(model.data, { guide: model.guide });
    }
  }
  if (!IS_FUTA04 && placeTeachingPanel && thumbLayout) {
    const keys = targetHexes(v, session.legal, session.sel);
    requestAnimationFrame(() => {
      placeTeachingPanel?.($('first-tip'), keys);
      placeTeachingPanel?.($('coach'), keys);
    });
  }
  if (myTurn() && !busy() && v.phase === 'ACT' && !autoQueued) {
    autoQueued = true;
    setTimeout(() => {
      autoQueued = false;
      autoAdvance();
    }, 250);
  }
  noteRenderCost('full', performance.now() - t0);
}
let autoQueued = false;
/** Optional teaching yields to the player's move and to other sheets. */
function tutorialFreePlayActive(): boolean {
  const progress = coach.tutorial;
  if (!progress) return false;
  return tutorialLesson(progress.chapter, progress.step)?.action === 'FreeTurn';
}

/** The free turn's step and its one line (logic/tutorial-script.ts freeTurnGuide). */
function freeTurnGuideNow(): { title: string; line: string } {
  if (!session) return { title: 'YOUR TURN', line: '' };
  const st = session.state;
  return freeTurnGuide({
    phase: st.phase,
    mine: st.actor === HUMAN,
    picked: session.sel.card !== null || session.sel.kind !== null,
    grew: st.sproutsThisTurn > 0,
    bloomReady: document.documentElement.dataset.futa04BloomReady === 'true',
  });
}

function freePlayGuidanceLine(): string {
  return freeTurnGuideNow().line;
}

/** The player can turn step guidance off (Settings → Step guidance). Respect it here too. */
function guidanceOff(): boolean {
  try {
    return localStorage.getItem('severgrow-guide') === 'off';
  } catch {
    return false;
  }
}

/**
 * Campaign levels 1-10 ARE the game's tutorial, so they borrow the tutorial's own top window and
 * its board band — never a second overlay system. The window only appears while the level is
 * guided, and it is the SAME panel the Tutorial uses, so a player who has seen one recognises the
 * other. Guidance is derived from the live position (logic/onboarding.ts), never scripted.
 */
function onboardingActive(): boolean {
  // AN ONLINE DUEL IS NEVER A LESSON (owner, 2026-10-21). The two gates differ in where they read
  // their state: `lessonActive` matches `campaignLevel` against the level whose script is loaded,
  // but this one only asks "campaign level <= 10", and `campaignLevel` is NOT cleared when an
  // online match starts. So a player who had reached, say, level 5 and then opened an online duel
  // still looked like a beginner here: onboarding came back on, which adds the `futa04-tutorial`
  // class (the padded "tutorial window" that shrinks the map) and explains Bloom again mid-duel.
  // Guard on the mode itself, exactly as `lessonActive` does, so no stale campaign state can leak.
  if (isOnlineDuel()) return false;
  if (lessonActive()) return false;
  return FEATURES.guidance && !guidanceOff() && !coach.tutorial && !!campaignLevel
    && campaignLevel.number <= ONBOARDING_LEVELS && !!session && !watching;
}

/** Hides our own window only: Match Intel and the real Tutorial are not ours to close. */
function hideOnboardingWindow() {
  if (glassSurface?.mode?.() === 'tutorial' && !coach.tutorial) glassSurface.hide();
}

/**
 * How close the WIN is. Rather than re-state the strangle rule, this asks the ENGINE: it plays each
 * candidate move on a copy of the state and checks `isStrangled`. That matters because a move does
 * not simply "fill" sides — a Bloom overgrows, severs, and can leave a hex EMPTY — and only the
 * engine knows the result. The guide must never promise a win it cannot see.
 *
 * `theirOpen` is only a count for the words: the sides of their home that are still not mine.
 */
function theirHomeState(v: View, legal: readonly Action[]): { theirOpen: number; canWinNow: boolean } {
  if (!session) return { theirOpen: 6, canWinNow: false };
  const home = homeCoord(BOT, v.config);
  const around = new Set(allNeighbors(home).map(coordKey));
  const theirOpen = [...around]
    .filter((k) => k in v.board && v.terrain[k] !== 'rock' && v.board[k]?.owner !== HUMAN).length;
  // Only a PLACEMENT that touches their home can strangle it, so the simulation stays cheap and the
  // promise stays exact: the line says "surround their home", so the engine must say strangled.
  const candidates = legal.filter((a) => placedHexKeys(a).some((k) => around.has(k)));
  const canWinNow = candidates.some((a) => isStrangled(apply(session!.state, a), BOT));
  return { theirOpen, canWinNow };
}

// ---------- levels 1-10: the lessons ----------
// Levels 1-10 ARE the tutorial (owner, FUTASAKU /3). Each opens from an authored position
// (lessons/authored.ts), plays a gentle scripted opponent (lessons/opponent.ts) and is guided by
// beats read from the live game (lessons/lessons.ts). Words go only in the glass window or the
// LED; the map itself only ever gets a small ring where a tap landed.

/** The lesson of the match on screen, or null (any other level, mode, the Tutorial, online). */
function lessonActive(): Lesson | null {
  if (!lessonNow || !session || !campaignLevel || campaignLevel.number !== lessonNow.level) return null;
  if (coach.tutorial || isOnlineDuel() || watching) return null;
  return lessonNow;
}

/** Levels 1-4 never show a Bloom in any form: no button, no glow, no bracket, no gold pile. */
function bloomsShown(): boolean {
  const l = lessonActive();
  return !l || lessonOffersBloom(l);
}

function saveLessonMeta() {
  if (!lessonNow) return;
  // A tutorial replay never writes the campaign lesson notes: which explanations the player has
  // already read belongs to the level they are actually working on (owner, 2026-10-24).
  if (tutorialReplay) return;
  store.set(LESSON_META_KEY, encodeLessonMeta({ level: lessonNow.level, version: lessonNow.version, seen: [...lessonSeen] }));
}

function saveLessonMastery() {
  // ...and neither does it touch the mastery record the campaign lessons read for their pace.
  if (tutorialReplay) return;
  store.set(LESSON_MASTERY_KEY, encodeMastery(lessonMastery));
  lessonPowerSeen = new Set(lessonMastery.hellos);
}

/** A new level starts with its own runtime state; the learned counts persist across levels. */
function resetLessonRuntime() {
  lessonIdle = false;
  lessonIdleStage = 0;
  lessonIdleWatch.stop();
  lessonWrongInStep = 0;
  lessonEscalated = false;
  lessonTierShown = 'silent';
  lessonTierKind = null;
  lessonShownBeatId = '';
  lessonHelloNow = null;
  clearTimeout(lessonHelloTimer);
  lessonHelloTimer = 0;
  lessonStageUntil = 0;
  clearTimeout(lessonStageTimer);
  lessonStageTimer = 0;
}

/** ~1.2 s: the level number and name, skippable by a tap; the board is not live yet. */
function startLessonStage() {
  if (!lessonNow || !campaignLevel) return;
  lessonStageUntil = performance.now() + 1200;
  lessonShownKey = '';
  clearTimeout(lessonStageTimer);
  lessonStageTimer = window.setTimeout(() => {
    lessonStageUntil = 0;
    lessonStageTimer = 0;
    lessonShownKey = '';
    render();
    // The safety net starts when the board becomes live, not during the intro.
    lessonArmIdle();
  }, 1200);
  render();
}

function lessonStageActive(): boolean {
  return !!lessonNow && performance.now() < lessonStageUntil;
}

function skipLessonStage(): boolean {
  if (!lessonStageActive()) return false;
  lessonStageUntil = 0;
  clearTimeout(lessonStageTimer);
  lessonStageTimer = 0;
  lessonShownKey = '';
  render();
  lessonArmIdle();
  return true;
}

/** A Bloom or a Blast is being placed: its tiles are the next touch. */
function lessonPlacing(): 'bloom' | 'blast' | null {
  if (!session) return null;
  const kind = session.sel.kind ?? '';
  if (kind.startsWith('bloom-mega')) return 'blast';
  if (kind.startsWith('bloom-') || draw.shape.length) return 'bloom';
  return null;
}

function lessonCtx() {
  const pending = session?.pending;
  // Keep the hello currently on screen visible until the next action, even though it is already
  // remembered; every other render is silent about it.
  const powerSeen = new Set(lessonPowerSeen);
  if (lessonHelloNow) powerSeen.delete(lessonHelloNow);
  return {
    card: session?.sel.card ?? null,
    placing: lessonPlacing(),
    throwPending: pending?.t === 'Discard' ? pending.card : null,
    seen: lessonSeen as ReadonlySet<string>,
    powerSeen: powerSeen as ReadonlySet<PowerKind>,
  };
}

/** An explanation was read: it never shows again in this level (kept across a refresh). */
function lessonMarkSeen(id: string) {
  if (lessonSeen.has(id)) return;
  lessonSeen.add(id);
  saveLessonMeta();
  lessonShownKey = '';
  render();
}

/**
 * The same, for the tap that is ALSO the move. The seen set is updated at once (so the game's own
 * render already drops the sentence), but the repaint waits until the gesture has been delivered:
 * a render inside pointerdown would replace the tapped card or pile before the game reads it, and
 * the move would be lost. So: flush on the click that ends this gesture, never before.
 */
let lessonSeenFlush = 0;
function lessonMarkSeenAfterTap(id: string) {
  if (!lessonSeen.has(id)) {
    lessonSeen.add(id);
    saveLessonMeta();
  }
  lessonShownKey = '';
  if (lessonSeenFlush) return;
  const flush = () => {
    if (!lessonSeenFlush) return;
    window.clearTimeout(lessonSeenFlush);
    lessonSeenFlush = 0;
    document.removeEventListener('pointerup', after, true);
    document.removeEventListener('pointercancel', after, true);
    document.removeEventListener('click', after, true);
    render();
  };
  const after = () => {
    if (!lessonSeenFlush) return;
    // Next task, so the game's own click handler has already run on the node we must not replace.
    window.setTimeout(flush, 0);
  };
  document.addEventListener('pointerup', after, true);
  document.addEventListener('pointercancel', after, true);
  document.addEventListener('click', after, true);
  // A gesture that never ends (a cancelled pointer, a keyboard activation) still closes the box.
  lessonSeenFlush = window.setTimeout(flush, 600);
}

/**
 * The safety net: 6 s WHISPER, 12 s GUIDE, 20 s the light guide. Any input resets all three. The
 * watch reports the stage; render turns it into at least that tier for the current move.
 */
function lessonArmIdle() {
  if (lessonIdle) {
    lessonIdle = false;
    lessonIdleStage = 0;
    lessonShownKey = '';
  }
  if (!lessonActive()) { lessonIdleWatch.stop(); return; }
  lessonIdleWatch.reset();
}

/** A second wrong tap on this step raises the tier until the step changes or a move is made. */
function lessonWrongTap() {
  lessonWrongInStep++;
  if (lessonWrongInStep < 2 || lessonEscalated) return;
  lessonEscalated = true;
  lessonShownKey = '';
  render();
}

/** One short answer to a tap: on the display (never in the info box), a ring at the spot. */
function lessonSay(text: string, x: number | null, y: number | null) {
  lessonAnswerSeq++;
  if (x !== null && y !== null && !settings.reduceMotion) {
    const ring = document.createElement('div');
    ring.className = 'lesson-tap-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.append(ring);
    window.setTimeout(() => ring.remove(), 650);
  }
  lessonAnswerText = text;
  lessonShownKey = '';
  clearTimeout(lessonAnswerTimer);
  lessonAnswerTimer = window.setTimeout(() => {
    lessonAnswerText = '';
    lessonShownKey = '';
    render();
  }, 2200);
  // Priority 40 clears the lesson's quiet mode, so an answer is always read.
  smartCockpit?.event({ message: text.toUpperCase(), priority: 40, duration: 1800 });
  render();
}

/**
 * Every tap during a lesson is read once, before the game sees it. An explanation moves on with a
 * tap anywhere — and a tap ON the lit thing both reads the sentence and performs the move on the
 * same gesture (owner, 2026-10-20: "the first tap with this window open - if tapped on the
 * highlighted item works first time - no double taps needed"). A tap that cannot do anything gets
 * its answer. In levels 1-3 (locked) a tap that is not the lit one does not reach the game at all;
 * from level 4 on the game takes every legal tap (a different legal move is the player's choice)
 * and only the answer is added.
 */
let lessonVeto = false;

/**
 * A tap on an explanation's lit thing that would really do something: the lit target itself or one
 * of its quiet alternatives, and the same answer the game gives on the next tap (no refusal).
 * A home, a rock or the display that is only being explained is not a move: that tap dismisses.
 */
function lessonTapMoves(beat: Beat, target: Element, e: Event, locked: boolean): boolean {
  if (!session) return false;
  const selectors = litTargetAndQuiet(beat.lit, SMALL_HOMES).selectors;
  if (!selectors.length || !target.closest(selectors.join(', '))) return false;
  const pe = e as PointerEvent;
  const keyAt = () => (Number.isFinite(pe.clientX) ? board.keyAtClient(pe.clientX, pe.clientY) : null);
  const tap = tapOf(target as never, keyAt);
  if (tap.t === 'other') return false;
  return tapAnswer(session.state, session.sel.card, tap, beat.lit, locked, !!lessonPlacing()) === null;
}

function lessonDecide(e: Event): boolean {
  const lesson = lessonActive();
  if (!lesson || !session || openSheet || session.state.phase === 'GAME_OVER') return false;
  const target = e.target as Element | null;
  if (!target?.closest?.('#game')) return false;
  // The caption is pointer-events:none, so a tap over it arrives at the board beneath: nothing
  // in the lesson's info box can swallow a tap (there are no buttons in it).
  if (target.closest('#hud, #hud-menu, #futasaku-glass, #gameover, .sheet, #scrim')) return false;
  const guided = !guidanceOff();
  const beat = lessonBeatNow;
  const lockedNow = lessonLocked(lesson, session.state) && guided;
  if (guided && beat?.explain) {
    // The lit thing is the move: one tap reads the sentence AND plays it. Never the dwell guard
    // here — that guard exists for a tap meant for the move that just happened, and this tap is
    // aimed at the thing the lesson is pointing at now.
    if (lessonTapMoves(beat, target, e, lockedNow)) {
      lessonMarkSeenAfterTap(beat.id);
      return false;
    }
    // THE READING FLOOR (owner, 2026-10-21): the explanation is up for at least 3 s before a
    // DISMISSING tap can take it away. Taps that are not a move are swallowed inside that floor, so
    // a sentence cannot be lost to a stray finger. Deliberately scoped to DISMISSAL only — the lit
    // target above still plays the move on one tap, because the owner also requires that (making
    // the lit thing wait would recreate the "my first tap did nothing" bug). The old floor was
    // 650 ms, which only stopped a tap aimed at the move that had just happened.
    if (performance.now() - lessonExplainAt < LESSON_READ_MS) {
      // A refused dismissal must still be ACKNOWLEDGED. A swallowed tap with no feedback is the
      // "my first tap did nothing" smell the owner reported in the same breath, and the random-tap
      // robustness check caught it: the tap changed nothing and said nothing. A single quiet pulse
      // of the caption says "I felt that, the sentence stays a moment" without adding words.
      lessonAckFloor();
      return true;
    }
    lessonMarkSeen(beat.id);
    return true;
  }
  const pe = e as PointerEvent;
  const keyAt = () => (Number.isFinite(pe.clientX) ? board.keyAtClient(pe.clientX, pe.clientY) : null);
  const tap = tapOf(target as never, keyAt);
  const x = Number.isFinite(pe.clientX) && pe.clientX ? pe.clientX : null;
  const y = Number.isFinite(pe.clientY) && pe.clientY ? pe.clientY : null;
  // My own move still settling: the game fast-forwards on a tap, as everywhere. Nothing to answer.
  if (busy() && session.state.actor === HUMAN) return false;
  if (!myTurn()) {
    if (tap.t === 'other') return false;
    lessonSay(LESSON.theirTurnNow, x, y);
    return lessonLocked(lesson, session.state);
  }
  const locked = lockedNow;
  if (tap.t === 'other') {
    // A control that is not the lit one (Undo, sort, Bloom) does not react in the locked levels.
    if (locked && target.closest('button') && !(beat?.lit.t === 'bloom' && target.closest('#smart-bloom'))) {
      lessonSay(LESSON.tapLit, x, y);
      return true;
    }
    return false;
  }
  const answer = tapAnswer(session.state, session.sel.card, tap, guided ? beat?.lit ?? null : null, locked, !!lessonPlacing());
  if (!answer) return false;
  lessonSay(answer, x, y);
  lessonWrongTap();
  return locked;
}
function lessonCapture(e: Event) {
  if (!lessonActive()) return;
  if (lessonStageActive()) {
    // A tap skips the intro. The pause menu is the one control that must ALSO act on that tap:
    // the tutorial gate keeps it reachable for exactly this reason (leaving a level), and eating
    // the press made it cost two taps. The stage still skips, then the button's own click runs.
    if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('#hud-menu')) {
      skipLessonStage();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'pointerdown') {
      lessonVeto = true;
      skipLessonStage();
    } else if (e.type === 'click') {
      lessonVeto = false;
    }
    return;
  }
  lessonArmIdle();
  const stop = () => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  if (e.type === 'pointerdown') {
    lessonVeto = lessonDecide(e);
    if (lessonVeto) stop();
    return;
  }
  // A keyboard click has no pointer before it: it is decided on its own.
  if (e.type === 'click' && (e as MouseEvent).detail === 0) {
    if (lessonDecide(e)) stop();
    return;
  }
  if (lessonVeto) stop();
  if (e.type === 'click') lessonVeto = false;
}
for (const name of ['pointerdown', 'pointerup', 'click', 'touchend'] as const) {
  document.addEventListener(name, lessonCapture, { capture: true, passive: false });
}

/** The Draw pile's count glows as the lesson's clock runs out. */
function syncLessonPile(st: State | null) {
  const low = !!st && !!lessonActive() && st.deck.length > 0 && st.deck.length <= 3 && st.phase !== 'GAME_OVER';
  $('deck').classList.toggle('lesson-pile-low', low);
}

let lessonPlateTimer = 0;

/**
 * ONE info box for lessons: a caption floating over the felt. It holds an explanation sentence
 * only — no title, no mission, no buttons. `pointer-events:none` (CSS) lets every tap through.
 */
function lessonPlate(): HTMLElement {
  let plate = document.getElementById('lesson-plate');
  if (plate) return plate;
  plate = document.createElement('div');
  plate.id = 'lesson-plate';
  plate.hidden = true;
  plate.setAttribute('role', 'status');
  // One box: the sentence, then (on the Bloom lesson only) a small static example inside it.
  plate.innerHTML = '<p class="lesson-copy"></p><div class="lesson-example" hidden aria-hidden="true"></div>';
  document.body.append(plate);
  window.addEventListener('resize', () => placeLessonPlate(), { passive: true });
  return plate;
}

/** The owner-approved Bloom example: a set (same number, three suits) and a run (three in order). */
const BLOOM_EXAMPLE_SET: readonly Card[] = Object.freeze([
  { id: -501, suit: 0, rank: 3 }, { id: -502, suit: 1, rank: 3 }, { id: -503, suit: 2, rank: 3 },
]);
const BLOOM_EXAMPLE_RUN: readonly Card[] = Object.freeze([
  { id: -511, suit: 0, rank: 3 }, { id: -512, suit: 0, rank: 4 }, { id: -513, suit: 0, rank: 5 },
]);
/** The same face the hand draws with, only smaller. No new art. */
const lessonExampleFace = (c: Card) =>
  `<span class="card lesson-example-card ${suitClass(c)}" aria-hidden="true">${cardFace(c)}</span>`;
const lessonExampleRow = (cards: readonly Card[], cls: string) =>
  `<span class="lesson-example-row ${cls}">${cards.map(lessonExampleFace).join('')}</span>`;

/**
 * Put the static example under the sentence — never a second overlay, never an animation. The run
 * row is dropped when the box would grow past a third of the screen, so the map keeps its room.
 */
function setLessonExample(kind: 'bloom' | null) {
  const plate = lessonPlate();
  const box = plate.querySelector<HTMLElement>('.lesson-example');
  if (!box) return;
  const on = kind === 'bloom';
  box.hidden = !on;
  if (!on) {
    box.replaceChildren();
    delete box.dataset.kind;
    plate.classList.remove('example-tight');
    return;
  }
  if (box.dataset.kind !== 'bloom') {
    box.innerHTML = lessonExampleRow(BLOOM_EXAMPLE_SET, 'lesson-example-set')
      + lessonExampleRow(BLOOM_EXAMPLE_RUN, 'lesson-example-run');
    box.dataset.kind = 'bloom';
  }
  const run = box.querySelector<HTMLElement>('.lesson-example-run');
  if (run) run.hidden = false;
  // Fit decides again on every new beat: placeLessonPlate() calls fitLessonExample().
  plate.classList.remove('example-tight');
  const budget = Math.min(220, Math.round(innerHeight * 0.34));
  if (plate.offsetHeight > budget && run) {
    run.hidden = true; // one compact row still shows the set
    plate.classList.add('example-tight');
  }
}

type PlateEl = HTMLElement & {
  _avoid?: readonly string[];
  _lessonBox?: { left: number; right: number; top: number; bottom: number; width: number; height: number };
};
type Spot = { l: number; t: number; r: number; b: number };

/** The plate may use this much room at the viewport's side, and this gap from the header. */
const PLATE_MARGIN = 8;
const PLATE_GAP = 6;
const PLATE_MAX_WIDTH = 420;
/** Controls the caption must never sit on, whatever the light is doing. */
const PLATE_KEEP_CLEAR = ['#hud', '#hud-menu', '#deck', '#discard', '#hand', '#smart-led', '#smart-bloom-button', '#moves', '#smart-context', '#dock'] as const;

function hideLessonPlate() {
  const plate = document.getElementById('lesson-plate') as PlateEl | null;
  if (plate) {
    plate.hidden = true;
    delete plate._lessonBox;
    const example = plate.querySelector<HTMLElement>('.lesson-example');
    if (example) { example.hidden = true; example.replaceChildren(); delete example.dataset.kind; }
    plate.classList.remove('example-tight');
    setLessonRestart(plate, false);
  }
  unwatchPlateSettle();
}

/**
 * The camera eases after a beat, so a plate placed on the geometry of that instant can be left
 * beside where the lit thing finally lands. The board's own viewBox is the camera: one observer,
 * debounced, re-places the plate once the camera stops. It never measures per frame (only after a
 * quiet spell), leaves nothing behind when the plate hides, and is the event-driven form of the
 * "correct once the camera has settled" call that has always followed a new sentence.
 */
let plateWatch: MutationObserver | null = null;
let plateSettle = 0;
function watchPlateSettle() {
  const svg = document.getElementById('board');
  if (!svg || plateWatch) return;
  plateWatch = new MutationObserver(() => {
    if (plateSettle) clearTimeout(plateSettle);
    plateSettle = window.setTimeout(() => {
      plateSettle = 0;
      const plate = document.getElementById('lesson-plate');
      if (plate && !(plate as HTMLElement).hidden) placeLessonPlate();
    }, 120);
  });
  plateWatch.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
}
function unwatchPlateSettle() {
  if (plateSettle) clearTimeout(plateSettle);
  plateSettle = 0;
  plateWatch?.disconnect();
  plateWatch = null;
}

/** A box for an element that is actually on screen, or null. */
const plateBox = (el: Element | null): Spot | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
};
const boxesOverlap = (a: Spot, b: Spot) =>
  a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Put the wide caption in an empty gap: under the header, clear of the hexes and of every cockpit
 * control, and never on the lit thing. Where the map leaves no gap at all (a short phone), take the
 * gap with the fewest hexes under it — still never on the light, a control, or the header.
 *
 * This runs when the words change, on resize and once after the camera settles, never per frame.
 */
function placeLessonPlate() {
  const plate = document.getElementById('lesson-plate') as PlateEl | null;
  if (!plate || plate.hidden) return;
  const hud = document.querySelector('#game > .hud');
  if (!hud) return;
  const vw = innerWidth;
  const vh = innerHeight;
  const sideLayout = document.documentElement.dataset.layout === 'side';
  const width = Math.round(Math.max(0, Math.min(PLATE_MAX_WIDTH, vw - 2 * PLATE_MARGIN)));
  plate.style.width = `${width}px`;
  const h = Math.ceil(plate.offsetHeight);

  const hexes: Spot[] = [];
  for (const el of document.querySelectorAll('#board .hex-cell')) {
    const spot = plateBox(el);
    if (spot) hexes.push(spot);
  }
  const lit: Spot[] = [];
  for (const sel of plate._avoid ?? []) {
    const spot = plateBox(document.querySelector(sel));
    if (spot) lit.push(spot);
  }
  const controls: Spot[] = [];
  for (const sel of PLATE_KEEP_CLEAR) {
    const spot = plateBox(document.querySelector(sel));
    if (spot) controls.push(spot);
  }
  const dock = plateBox(document.getElementById('dock'));
  const topMin = Math.max(PLATE_MARGIN, Math.round(hud.getBoundingClientRect().bottom + PLATE_GAP));
  const topMax = Math.max(topMin, Math.min(vh - h - PLATE_MARGIN, (dock ? dock.t - PLATE_GAP : vh) - h));
  const xMax = Math.max(PLATE_MARGIN, vw - width - PLATE_MARGIN);
  const centre = Math.round((vw - width) / 2);
  const xs = [...new Set([clamp(centre, PLATE_MARGIN, xMax), PLATE_MARGIN, xMax])];
  // The edges of every box define the only vertical intervals worth testing: the plate either sits
  // above a box or below it, so the candidate tops are exactly those edges (plus the two extremes).
  const ys = new Set<number>([topMin, topMax]);
  for (const spot of [...hexes, ...lit, ...controls]) {
    ys.add(clamp(Math.round(spot.t - h - 2), topMin, topMax));
    ys.add(clamp(Math.round(spot.b + 2), topMin, topMax));
  }
  // Follow the action: a spot's distance from the plate's centre to the nearest lit centre is the
  // preference, with fewer covered hexes and then centred x breaking a near-tie. Hard rules are
  // unchanged (the light and every cockpit control are rejected before this). The side layout
  // (desktop) and a beat with no light keep the old "fewest hexes, then highest" order.
  const followLit = !sideLayout && lit.length > 0;
  const distToLit = (x: number, y: number) => {
    const cx = x + width / 2;
    const cy = y + h / 2;
    let d = Infinity;
    for (const s of lit) d = Math.min(d, Math.hypot(cx - (s.l + s.r) / 2, cy - (s.t + s.b) / 2));
    return d;
  };
  let best: { x: number; y: number; hexes: number; dist: number } | null = null;
  for (const y of ys) {
    for (const x of xs) {
      const r = { l: x, t: y, r: x + width, b: y + h };
      if (lit.some((s) => boxesOverlap(r, s))) continue;
      if (controls.some((s) => boxesOverlap(r, s))) continue;
      const covered = hexes.reduce((n, s) => n + (boxesOverlap(r, s) ? 1 : 0), 0);
      const dx = Math.abs(x + width / 2 - vw / 2);
      const dist = followLit ? distToLit(x, y) : 0;
      if (!best) {
        best = { x, y, hexes: covered, dist };
        continue;
      }
      const better = followLit
        ? dist < best.dist - 0.5
          || (Math.abs(dist - best.dist) <= 0.5
            && (covered < best.hexes || (covered === best.hexes && dx < Math.abs(best.x + width / 2 - vw / 2))))
        : covered < best.hexes
          || (covered === best.hexes && (y < best.y || (y === best.y && dx < Math.abs(best.x + width / 2 - vw / 2))));
      if (better) best = { x, y, hexes: covered, dist };
    }
  }
  // No free gap at all: never cover the lit target, even if that means sitting over a control or
  // a few unlit hexes. Above the light first, then below it.
  const fallbackY = (() => {
    if (!lit.length) return topMin;
    const above = Math.min(...lit.map((s) => s.t)) - h - 2;
    const below = Math.max(...lit.map((s) => s.b)) + 2;
    if (above >= topMin && above <= topMax) return above;
    if (below >= topMin && below <= topMax) return below;
    return clamp(above, topMin, topMax);
  })();
  const x = best?.x ?? clamp(centre, PLATE_MARGIN, xMax);
  const y = best?.y ?? fallbackY;
  plate.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  plate._lessonBox = { left: Math.round(x), top: Math.round(y), right: Math.round(x) + width, bottom: Math.round(y) + h, width, height: h };
  fitLessonExample();
}

/**
 * On a tall phone the caption lives in the free gap, never over a hex. The Bloom example is the
 * only thing that can make it too tall, so it gives way: the run row goes first ("if it fits"),
 * then the whole example, and the sentence always stays. Never runs per frame — only when the
 * words change, on resize and once after the camera settles.
 */
let fittingExample = false;
function fitLessonExample() {
  if (fittingExample) return;
  const plate = document.getElementById('lesson-plate') as PlateEl | null;
  if (!plate || plate.hidden || !plate._lessonBox || innerHeight < 800) return;
  const example = plate.querySelector<HTMLElement>('.lesson-example');
  if (!example || example.hidden) return;
  const covers = () => {
    const box = plate._lessonBox!;
    const spot: Spot = { l: box.left, t: box.top, r: box.right, b: box.bottom };
    for (const el of document.querySelectorAll('#board .hex-cell')) {
      const hex = plateBox(el);
      if (hex && boxesOverlap(spot, hex)) return true;
    }
    return false;
  };
  if (!covers()) return;
  fittingExample = true;
  try {
    const run = example.querySelector<HTMLElement>('.lesson-example-run');
    if (run && !run.hidden) run.hidden = true;
    placeLessonPlate();
    if (covers()) {
      // No room even for the set: keep the sentence, drop the example's markup entirely, so the
      // box is exactly what it was before this lesson had an example.
      example.hidden = true;
      example.replaceChildren();
      delete example.dataset.kind;
      plate.classList.add('example-tight');
      placeLessonPlate();
    }
  } finally {
    fittingExample = false;
  }
}

/**
 * START AGAIN: the one button the box ever holds, and only while the lesson cannot finish (owner,
 * 2026-10-22). It exists in the DOM only then, so the box is otherwise information only.
 */
function setLessonRestart(plate: HTMLElement, on: boolean) {
  let btn = plate.querySelector<HTMLButtonElement>('.lesson-restart');
  if (!on) { btn?.remove(); return; }
  if (btn) return;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary lesson-restart';
  btn.textContent = LESSON.startAgain;
  btn.addEventListener('click', restartStuckLesson);
  plate.append(btn);
}

/** The same level from its opening, in place: no menu, no start sheet. */
function restartStuckLesson() {
  if (!lessonActive() || !campaignLevel) return;
  hideLessonPlate();
  startCampaignLevel(campaignLevel);
}

/** Put the explanation in the box. `lift` is what the box must never cover (the lit target). */
function showLessonPlate(text: string, lift: readonly string[], example: 'bloom' | null = null, restart = false) {
  const plate = lessonPlate();
  plate.hidden = false;
  const copy = plate.querySelector<HTMLElement>('.lesson-copy');
  if (copy && copy.textContent !== text) copy.textContent = text;
  setLessonExample(example);
  setLessonRestart(plate, restart);
  (plate as PlateEl)._avoid = lift;
  placeLessonPlate();
  watchPlateSettle();
  // The camera eases for a moment after a beat. Correct once when it has settled.
  clearTimeout(lessonPlateTimer);
  lessonPlateTimer = window.setTimeout(placeLessonPlate, 400);
}

function renderLessonGuide(): void {
  const lesson = lessonActive()!;
  const st = session!.state;
  const level = lesson.level;
  document.documentElement.dataset.onboard = String(revealTierFor(level));
  document.documentElement.dataset.lesson = String(level);
  const bulb = document.getElementById('futa04-help-button');
  if (bulb) {
    if (revealTierFor(level) === 1) bulb.style.setProperty('filter', 'brightness(0.45) saturate(0.6)', 'important');
    else bulb.style.removeProperty('filter');
  }
  syncLessonPile(st);
  if (!glassSurface) return;
  // The header stays the menu and the logo; the words are chosen below.
  // `pregameHold`: the Who-starts ceremony owns the screen. A lesson (level 10 onwards, the only
  // levels that have both) must not paint its window or its light over the cards — the send-off
  // comes after the ceremony, when the hold is released and this function is repainted.
  if (pregameHold || guidanceOff() || openSheet || st.phase === 'GAME_OVER') {
    lessonBeatNow = null;
    lessonBreath?.clear();
    hideLessonPlate();
    smartCockpit?.quiet?.(false);
    if (!lessonHoldingScore) smartCockpit?.led?.(null);
    if (lessonShownKey) {
      lessonShownKey = '';
      glassSurface.hide();
    }
    return;
  }
  // The stage intro is a short, quiet beat (~1.2 s, a tap skips it): the board is not live yet and
  // there is no label — the first explanation takes the box.
  if (lessonStageActive()) {
    const stageKey = `stage:${level}`;
    lessonBeatNow = null;
    lessonBreath?.clear();
    if (lessonShownKey !== stageKey) {
      lessonShownKey = stageKey;
      glassSurface.hide();
      hideLessonPlate();
      smartCockpit?.quiet?.(true);
      if (!lessonHoldingScore) smartCockpit?.led?.(openingDisplay(lesson, st, lessonSeen));
    }
    return;
  }
  // The first light waits for the opening hand to stop moving — never a fixed delay.
  if (!handSettled) {
    lessonBeatNow = null;
    lessonBreath?.clear();
    hideLessonPlate();
    if (lessonShownKey) {
      lessonShownKey = '';
      glassSurface.hide();
    }
    // Level 1 welcomes from the first frame, while the opening hand is still being dealt.
    const opening = openingDisplay(lesson, st, lessonSeen);
    if (opening) { smartCockpit?.quiet?.(true); smartCockpit?.led?.(opening); }
    return;
  }
  const mine = st.actor === HUMAN && !busy();
  const stuck = mine && !goalReachable(lesson, st);
  let beat: Beat | null = stuck
    ? { id: 'restart', line: LESSON.restartLine, lit: { t: 'none' } }
    : lessonBeat(lesson, st, lessonCtx());
  // Every new step of mine starts its own quiet count: idle time spent watching their turn (or
  // reading the last step) never makes a waiting hint appear at once (owner, 2026-10-24).
  const stepKey = mine ? `${st.history?.length ?? 0}|${st.phase}` : '';
  if (stepKey && stepKey !== lessonIdleStep) { lessonIdleStep = stepKey; lessonArmIdle(); }
  if (!mine) lessonIdleStep = '';
  // A hint that is not the lesson's own step (and every hint on level 10) waits for a quiet moment.
  if (beat?.idleOnly && !lessonIdle) beat = null;
  // Nothing is left to do but end the Grow: the game goes on to the Throw by itself (autoAdvance),
  // so » is never lit for the moment before it does (owner, 2026-10-20).
  if (beat?.id === 'end' && lessonEndsByItself()) beat = null;
  if ((beat?.id ?? '') !== lessonShownBeatId) {
    // A new step: the two-wrong-tap escalation belonged to the old one.
    lessonWrongInStep = 0;
    lessonEscalated = false;
    if (lessonHelloNow && beat?.hello !== lessonHelloNow) lessonHelloNow = null;
    lessonShownBeatId = beat?.id ?? '';
  }
  // A power's hello is a once-ever moment: remember it now, keep it on screen until the move.
  if (beat?.hello && !helloSeen(lessonMastery, beat.hello)) {
    lessonHelloNow = beat.hello;
    lessonMastery = recordHello(lessonMastery, beat.hello);
    saveLessonMastery();
    // One short hello, not a second guide: it fades on its own, and is never shown again.
    clearTimeout(lessonHelloTimer);
    lessonHelloTimer = window.setTimeout(() => {
      lessonHelloNow = null;
      lessonHelloTimer = 0;
      lessonShownKey = '';
      render();
    }, 2600);
  }
  const kind = beat?.kind ?? null;
  const tier: LessonTier = stuck ? 'spotlight'
    : beat?.explain ? 'spotlight'
    : beat?.status ? 'guide'
    : beat?.hello ? 'whisper'
    : kind ? displayTier({
      mastery: lessonMastery, kind, level: lesson.level, newActions: lesson.newActions,
      safety: lessonIdleStage, escalation: lessonEscalated,
    })
    : 'silent';
  const shown = presentedLessonBeat(beat, tier);
  lessonBeatNow = shown;
  lessonTierShown = tier;
  lessonTierKind = kind;
  if (beat?.explain && beat.id !== lessonExplainId) { lessonExplainId = beat.id; lessonExplainAt = performance.now(); }
  // The box explains; the display says what to do. They never carry the same words, and the box
  // never holds a title, a mission or a button.
  const voice = lessonVoiceFor({
    beat: shown, answer: lessonAnswerText || null, stuck, restartLine: LESSON.restartLine,
  });
  // The one moment that teaches the score: the sign shows the score itself — but only when this
  // beat has no action line. In lessons 1-10 the ACTION always wins the display (owner,
  // 2026-10-20); the score is what is left when there is nothing to do.
  const holdScore = shown?.lit.t === 'score' && !voice.display;
  if (holdScore !== lessonHoldingScore) { lessonHoldingScore = holdScore; smartCockpit?.holdScore?.(holdScore); }
  const lit = shown && mine ? litTarget(shown.lit, SMALL_HOMES) : { selectors: [] as string[], shape: 'none' as const };
  // The lit thing keeps breathing for as long as the beat is live: a card, a pile, a key. A hex
  // already breathes on the board and the display is its own light, so neither is doubled.
  lessonBreath?.sync(lit.selectors, lit.shape, !!shown && mine && motionOn() && !settings.reduceMotion);
  const key = JSON.stringify([
    level, shown?.id, voice.box, voice.display, shown?.lit, lessonAnswerText, lessonIdle, tier,
    lessonHelloNow, holdScore, mine, settings.reduceMotion, handSettled,
  ]);
  if (key === lessonShownKey) return;
  lessonShownKey = key;
  // A lesson never lets the cockpit's own one-word step cues (DRAW!/GROW!/THROW!) speak: the
  // display is driven only by the lesson's action lines.
  smartCockpit?.quiet?.(true);
  if (!holdScore && !lessonAnswerText) smartCockpit?.led?.(voice.display);
  if (!shown && !voice.box) {
    lessonBeatNow = null;
    lessonBreath?.clear();
    hideLessonPlate();
    glassSurface.hide();
    return;
  }
  if (voice.box) showLessonPlate(voice.box, holdScore ? ['#smart-led', ...lit.selectors] : lit.selectors,
    level === 5 && shown?.id === '5:intro:bloom-cards' ? 'bloom' : null, voice.restart);
  else hideLessonPlate();
  // An explanation with no lit move (the way out of a stuck lesson): the box speaks, the map is
  // not dimmed and there is nothing to point at.
  if (!shown) {
    lessonBreath?.clear();
    glassSurface.hide();
    return;
  }
  glassSurface.tutorial(voice.display ?? '', 0, lit.selectors, {
    shape: lit.shape,
    lesson: true,
    inCockpit: true,
    tier,
    noLight: lit.selectors.length === 0,
    stepKey: `lesson:${level}:${shown.id}`,
    reduceMotion: settings.reduceMotion,
    idleHard: lessonIdle,
    arrow: lit.selectors.length > 0,
  });
}

let onboardKey = '';
function renderOnboardingGuide(v: View) {
  if (lessonActive()) return renderLessonGuide();
  // Every other screen keeps its own chrome: the plate never shows outside a lesson.
  hideLessonPlate();
  lessonBreath?.clear();
  smartCockpit?.quiet?.(false);
  delete document.documentElement.dataset.lesson;
  syncLessonPile(null);
  if (!glassSurface) return;
  if (!onboardingActive()) {
    if (onboardKey) {
      onboardKey = '';
      delete document.documentElement.dataset.onboard;
      hideOnboardingWindow();
    }
    return;
  }
  const level = campaignLevel!.number;
  // The interface reveals itself by level; CSS keys off this one attribute.
  document.documentElement.dataset.onboard = String(revealTierFor(level));
  // The old help bulb (Match Intel) is an advanced tool: on the first levels it steps back rather
  // than competing with the lesson. Opacity is animated by the cockpit's own transition, so the
  // quieting is done with a filter — it applies at once and cannot fight that transition.
  const bulb = $('futa04-help-button');
  if (revealTierFor(level) === 1) bulb.style.setProperty('filter', 'brightness(0.45) saturate(0.6)', 'important');
  else bulb.style.removeProperty('filter');

  const st = session!.state;
  const picked = session!.sel.card !== null || session!.sel.kind !== null;
  const guide = openSheet || st.phase === 'GAME_OVER' ? null : onboardGuide({
    level,
    turn: st.turnNumber,
    mine: st.actor === HUMAN,
    phase: st.phase,
    picked,
    targetCount: picked ? targetHexes(v, session!.legal, session!.sel).size : 0,
    availableCount: session!.legal.filter((a) => a.t === 'Sprout').length,
    fruitReady: session!.legal.some((a) => a.t === 'PlayFruit'),
    bloomReady: document.documentElement.dataset.futa04BloomReady === 'true',
    grew: (st.sproutsThisTurn ?? 0) > 0,
    throwPending: session!.pending?.t === 'Discard',
    ...theirHomeState(v, session!.legal),
  });
  const key = guideKey(level, st.turnNumber, picked, guide);
  if (key === onboardKey) return;
  onboardKey = key;
  if (!guide) {
    hideOnboardingWindow();
    return;
  }
  const selector = guide.focus === 'deck' ? ['#deck']
    : guide.focus === 'discard' ? ['#discard']
    : guide.focus === 'hand' ? ['#hand']
    : guide.focus === 'their-home' ? ['.lm-volcano']
    : guide.focus === 'end' ? ['#smart-context[data-action="skip"]']
    : [];
  glassSurface.tutorial(guide.title, 0, selector, {
    shape: selector.length ? 'pill' : 'none',
    stepKey: key,
    why: guide.line,
    // Where this is in the journey, quietly: "LEVEL 1" above the instruction.
    kicker: CAMPAIGN.levelLabel(level),
    reduceMotion: settings.reduceMotion,
    buttons: { previous: false, next: false },
  });
}

function updateFuta04Help() {
  const free = tutorialFreePlayActive();
  const unavailable=!session || (!!coach.tutorial && !free) || !!openSheet || session.state.phase==='GAME_OVER';
  futa04Help?.update({ blocked: IS_FUTA04 ? unavailable : unavailable || busy() || !!session?.pending || !!draw.shape.length || cardPinned });
}

function toggleMatchIntel() {
  if (!glassSurface || !session) return;
  if (coach.tutorial && !tutorialFreePlayActive()) return;
  if (tutorialFreePlayActive()) {
    // the free turn's line is always up: the bulb just draws the eye to it
    noteFreePlayBulbInteraction();
    glassSurface.nudge();
    return;
  }
  if (glassSurface.isOpen()) {
    glassSurface.close();
    intelState=null;
    noteFreePlayBulbInteraction();
    return;
  }
  openIntel(lastIntelTab());
}

/** Match Intel tab labels, kept in src/strings.ts for a one-line rename. */
const INTEL_TABS = Object.freeze({ now: HELP.nowTab, tips: HELP.tipsTab, rules: HELP.rulesTab });
/** Match Intel opens on the tab the player used last (owner, 2026-10-24). */
const INTEL_TAB_KEY = 'severgrow.intel.tab.v1';
const lastIntelTab = (): IntelTabId => {
  const saved = store.get(INTEL_TAB_KEY);
  return saved === 'tips' || saved === 'rules' ? saved : 'now';
};

/** Match Intel's content: the public match record, plus this match's tips and the rule cards. */
function intelModel(): { data: ReturnType<typeof matchIntel>; guide: IntelGuide } | null {
  if (!session) return null;
  const v = session.view;
  const tips = intelTips(v);
  return {
    data: matchIntel(v, session.state.history ?? [], openingPublicDiscard(session.state, session.base)),
    guide: { tips, rules: ruleCards(session.state.config), rule: nearestRule(tips) },
  };
}

/** Open the Match Intel glass: Now (the match), Tips (this moment), Rules (the lessons, the full rules). */
function openIntel(tab: IntelTabId, fullRules = false): void {
  if (!glassSurface || !session) return;
  const model = intelModel()!;
  glassSurface.intel(model.data, { tab, labels: INTEL_TABS, howToHtml: howToReferenceHtml(session.state.config), guide: model.guide, fullRules,
    onTab: (next) => store.set(INTEL_TAB_KEY, next) });
  intelState=session.state;
  $('futa04-help-button').setAttribute('aria-expanded','true');
  document.querySelector<HTMLElement>('#futasaku-glass .intel-close')?.focus();
}

/** The pause menu's "How to play" opens the same moves reference: Match Intel's Rules tab, full rules unfolded,
 *  where the glass exists, the legacy sheet during a guided tutorial step (the glass is the
 *  tutorial window then) and on channels without the glass. */
function openHowToReference(): void {
  if (coach.tutorial && !tutorialFreePlayActive()) { sheet('sheet-howto'); return; }
  if (!session || !glassSurface) { sheet('sheet-howto'); return; }
  sheet(null);
  openIntel('rules', true);
}

/** The coach's arrow: points at the one thing to tap next for the suggested move. */
function renderGuide(advice: Advice | null) {
  const arrow = $('guide-arrow');
  arrow.hidden = true;
  if (!session || !guideGoal || !advice || !myTurn() || busy() || openSheet) return;
  if (JSON.stringify(advice.action) !== JSON.stringify(guideGoal)) {
    guideGoal = null;
    return;
  }
  let t = guideTarget(session.view, session.legal, session.sel, guideGoal, session.pending);
  if (t?.kind === 'preset') {
    // A line or clump: the coach shows its placement on the board, ready to confirm.
    if (IS_FUTA04) draw = { ...DRAW0 };
    session.preset(guideGoal);
    render();
    return;
  }
  if (IS_FUTA04 && t?.kind === 'confirm' && session.pending?.t === 'Bloom') {
    // Only an explicit demonstrated placement is ready; a bare inspected hex still needs
    // the player to choose the Bloom group before drawing its shape.
    t = session.presetMove?.t === 'Bloom'
      ? { kind: 'hex', key: coordKey(session.presetMove.hexes[0]!) }
      : { kind: 'kind', move: kindOf(session.pending)! };
  } else if (FEATURES.tapAgain && t?.kind === 'confirm' && session.pending) {
    const card = moveCards(session.pending)[0];
    if (card !== undefined) t = { kind: 'card', id: card };
  }
  if (!t) {
    guideGoal = null;
    return;
  }
  let rect: { x: number; y: number } | null = null;
  const above = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 4 };
  };
  switch (t.kind) {
    case 'card':
      rect = above(document.querySelector(`#hand [data-card="${t.id}"]`));
      break;
    case 'hex':
      rect = board.screenPoint(t.key);
      rect = { x: rect.x, y: rect.y - 6 };
      break;
    case 'confirm':
      rect = above($('confirm-play'));
      break;
    case 'cancel':
      rect = above(document.querySelector('#confirm-cancel:not([hidden]), #moves .cancel') ?? $('confirm-cancel'));
      break;
    case 'deck':
      rect = above($('deck'));
      break;
    case 'discard':
      rect = above($('discard'));
      break;
    case 'end':
      rect = above(document.querySelector('#moves .end'));
      break;
    case 'button':
      rect = above(document.querySelector('#moves .btn.primary'));
      break;
    case 'kind': {
      const el = document.querySelector<HTMLElement>(`#moves [data-kind="${t.move}"]`);
      rect = above(el && el.offsetParent ? el : document.querySelector('#moves .bloom-toggle'));
      break;
    }
  }
  if (!rect) return;
  arrow.hidden = false;
  arrow.dataset.target = t.kind === 'card' ? `card:${t.id}` : t.kind === 'hex' ? `hex:${t.key}` : t.kind === 'kind' ? `kind:${t.move}` : t.kind;
  arrow.style.left = `${rect.x}px`;
  arrow.style.top = `${rect.y}px`;
}

/** The hidden ?debug=1 corner: the only place the game's random number shows. */
const DEBUG = isDebug(location.search);
// Step 10: local playtest notes (?debug=1 only; kept in this browser, never sent anywhere)
let notes: Notes = DEBUG ? ((): Notes => {
  try {
    const n = JSON.parse(store.get(NOTES_KEY) ?? '') as Notes;
    return Array.isArray(n?.events) ? n : emptyNotes();
  } catch {
    return emptyNotes();
  }
})() : emptyNotes();
let notedPlayer: Player | null = null;
function note(e: NoteEvent) {
  if (!DEBUG) return;
  notes = noteEvent(notes, e);
  store.set(NOTES_KEY, JSON.stringify(notes));
}
if (DEBUG) {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as Element | null;
      const where = t?.closest('#hand') ? 'hand' : t?.closest('#board-wrap') ? 'board' : t?.closest('.piles') ? 'piles' : t?.closest('#moves') ? 'moves' : t?.closest('.dock') ? 'dock' : 'other';
      if (session && myTurn()) note({ t: 'input', at: Date.now(), where });
    },
    true,
  );
  const exp = document.createElement('button');
  exp.type = 'button';
  exp.className = 'btn small ghost debug-export';
  exp.textContent = 'Export as JSON';
  exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ summary: notesSummary(notes), events: notes.events }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playtest-notes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.body.append(exp);
}
function renderDebug(st: State) {
  if (!DEBUG) return;
  // my turns start and end (for the notes)
  if (st.turnPlayer !== notedPlayer) {
    if (notedPlayer === HUMAN) note({ t: 'turnEnd', at: Date.now() });
    if (st.turnPlayer === HUMAN && st.phase !== 'GAME_OVER') note({ t: 'turnStart', at: Date.now() });
    notedPlayer = st.turnPlayer;
  }
  const el = $('debug-corner');
  el.hidden = false;
  const sm = notesSummary(notes);
  el.textContent = [
    ...debugLines({ seed: st.seed, turnNumber: st.turnNumber, level: gameLevel }),
    `my turns ${sm.turns} · ${(sm.avgTurnMs / 1000).toFixed(1)} s each`,
    `undo ${sm.undos} · empty turns ${sm.emptyTurns}`,
    sm.longestPause ? `longest pause ${(sm.longestPause.ms / 1000).toFixed(1)} s (then: ${sm.longestPause.before})` : 'longest pause -',
  ].join('\n');
}

function renderHud() {
  if (!session) return;
  const st = session.state;
  renderDebug(st);
  if (!busy()) shownScores = [session.view.score, session.view.opponentScore];
  if (!busy()) smartCockpit?.score(session.view.score,session.view.opponentScore);
  $('score-you').textContent = String(shownScores[0]);
  $('score-bot').textContent = String(shownScores[1]);
  const scoreKey = `${shownScores[0]}:${shownScores[1]}:${document.documentElement.className}`;
  if (scoreKey !== lastScoreFit) {
    lastScoreFit = scoreKey;
    fitHudNames();
  }
  setRace(shownScores);
  const over = st.phase === 'GAME_OVER' && !busy();
  // Overhaul item 15: the final turns: a calm vignette and a softer ambient sound; one short banner
  const ft = finalTurns(session.view);
  const finalOn = ft.final && st.phase !== 'GAME_OVER';
  document.documentElement.classList.toggle('final-turns', finalOn);
  sound.setCalm(finalOn);
  if (finalOn && !finalSoundOn && settings.sound) sound.finalTurns();
  finalSoundOn = finalOn;
  if (finalOn && !st.deckFinal && !finalShown && !busy() && st.actor === HUMAN && ft.banner && ft.reason === 'deck') {
    finalShown = true;
    banner(ft.banner, 'calm');
  }
  const turn = $('turn');
  turn.className = `turn ${over ? 'over' : st.turnPlayer === HUMAN ? 'you' : 'bot'}${thinking ? ' thinking' : ''}`;
  const turnKey = over ? 'over' : `${st.turnPlayer}`;
  if (turnKey !== lastTurnKey && lastTurnKey !== '' && !settings.reduceMotion && settings.speed !== 'skip') anim(turn, [{ opacity: 0.25 }, { opacity: 1 }], { duration: 280 * Math.max(timeScale(), 0.35), easing: 'ease-out' });
  lastTurnKey = turnKey;
  // Online the duel strip (directly above) already owns the turn word, and there is no bot level:
  // the pill carries the turn clock only — never a "Level N" that does not exist online.
  // Owner's cleanup (2026-10-14): no "N turns left" / "Last turn" words anywhere the player reads
  // (the turn pill here, and the pause sheet that copies this markup). Online the duel lane owns
  // the turn word; offline the pill says whose turn it is, and nothing else. The count was a
  // misleading upper bound (a match can end earlier by KO, an empty deck or a timeout).
  turn.innerHTML = over
    ? '<b>Game over</b>'
    : isOnlineDuel()
      ? ''
      : `<b>${st.turnPlayer === HUMAN ? (watching ? `Green turn (Level ${watching.level})` : 'Your turn') : thinking ? `${OPP.Label} turn<span class="dots"><i></i><i></i><i></i></span>` : `${OPP.Label} turn`}</b><small>${currentMatchLabel()}</small>`;
  // The dock's hint line: always there (one fixed row), saying what to do next.
  const hint = dockHint(session.view);
  const hintEl = $('hint');
  if (hintEl.dataset.text !== hint.text || hintEl.dataset.arrow !== String(hint.arrow)) {
    hintEl.dataset.text = hint.text;
    hintEl.dataset.arrow = String(hint.arrow);
    // Step 3 item 11: one calm line, no floating triangle
    hintEl.innerHTML = '<span class="hint-text"></span>';
    hintEl.querySelector('.hint-text')!.textContent = hint.text;
  }
  updateHintWeight();
}

/**
 * Positioning pass: the hint is at full weight for my first 3 turns, then quieter; it comes back
 * at full weight when it says something unusual, or when I've tapped nothing for about 6 s on
 * my turn (I may be stuck).
 */
let lastInputAt = Date.now();
let stuckTimer = 0;
document.addEventListener('pointerdown', () => {
  lastInputAt = Date.now();
  updateHintWeight();
}, { capture: true, passive: true });
function updateHintWeight() {
  if (!session) return;
  const el = $('hint');
  const text = el.dataset.text ?? '';
  const mine = session.state.actor === HUMAN && session.state.phase !== 'GAME_OVER';
  const idle = mine ? Date.now() - lastInputAt : 0;
  const w = hintWeight({ myTurns: Math.ceil(session.state.turnNumber / 2), idleMs: idle, routine: isRoutineHint(text) });
  el.classList.toggle('quiet', w === 'quiet');
  clearTimeout(stuckTimer);
  if (w === 'quiet' && mine) stuckTimer = window.setTimeout(updateHintWeight, Math.max(50, STUCK_MS - idle + 20));
}

/** In the default game (Rot and Knock off) throwing a card ends the turn. */
const discardEndsTurn = (v: View) => !v.config.rotEnabled && !v.config.knockEnabled && !v.finalTurn;

/** The dock's one-line hint (overhaul item 13 shortens and sharpens it). */
function dockHint(v: View): Hint {
  if (!session) return { text: '', arrow: null };
  const h = hintFor(hintCtx(v));
  if (IS_FUTA04 && session.presetMove?.t === 'Bloom') return { text: 'Tap a glowing hex to bloom', arrow: 'up' };
  if (IS_FUTA04 && session.sel.card === null && session.sel.kind === null && (session.pending?.t === 'Bloom' || session.pending?.t === 'Sprout')) return { text: 'Pick a card or Bloom', arrow: 'down' };
  // the test copy: no Confirm box; a second tap on the card or the hex places the move
  if (FEATURES.tapAgain && session.pending && h.text.startsWith('Confirm,')) return { ...h, text: 'Tap again to place it' };
  return h;
}

// ---------- the layout (overhaul items 1-2): fixed dock, board fits the rest ----------

/** The safe-area insets (notch, home bar), read from CSS env() through a probe element. */
function safeArea() {
  const probe = document.getElementById('safe-probe') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'safe-probe' }));
  const cs = getComputedStyle(probe);
  const px = (s: string) => parseFloat(s) || 0;
  return { safeTop: px(cs.paddingTop), safeBottom: px(cs.paddingBottom), safeLeft: px(cs.paddingLeft), safeRight: px(cs.paddingRight) };
}

/** The iPhone Home Screen web view can report a content viewport ending above
 * the physical screen. `screen.height` supplies the missing bottom strip when
 * its width matches this full-screen portrait app. Safari tabs keep their
 * visual viewport, including the browser's own bars. */
function gameViewport() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const homeScreen = document.documentElement.classList.contains('home-screen-app');
  const screenFits = homeScreen && w <= 600 && window.innerHeight > w &&
    Math.abs(window.screen.width - w) <= 2 &&
    window.screen.height >= window.innerHeight &&
    window.screen.height - window.innerHeight < window.innerHeight * .16;
  const h = Math.round(homeScreen
    ? Math.max(window.innerHeight, screenFits ? window.screen.height : 0)
    : (vv?.height ?? window.innerHeight));
  return { w, h };
}

let firstToolTips: () => void = () => {};
let layoutKey = '';
let drawPileAnchorKey = '';
/** Draw brings the two pile instruments toward the first hand card, without moving
 * their counters separately or letting them cover the cockpit's action buttons. */
function alignDrawPiles() {
  const box = document.getElementById('futa04-box');
  const piles = box?.querySelector<HTMLElement>(':scope > .piles');
  if (!box || !piles) return;
  if (document.documentElement.dataset.step !== 'draw' || document.documentElement.dataset.thumb === 'left') {
    drawPileAnchorKey = '';
    piles.style.setProperty('--futa04-draw-shift', '0px');
    return;
  }
  const anchorKey = `${layoutKey}|${session?.state.turnNumber ?? 0}`;
  if (drawPileAnchorKey === anchorKey) return;
  const handCard = document.querySelector<HTMLElement>('#hand .card');
  const actions = document.getElementById('smart-panel') ?? document.getElementById('futa04-actions');
  if (!handCard) return;
  // offsetLeft is layout geometry, so the calculation stays steady while the group animates.
  const baseLeft = box.getBoundingClientRect().left + piles.offsetLeft;
  // Hand sorting uses a FLIP animation on the individual card's `translate`.
  // Its screen rect includes that temporary travel, while the piles must align
  // with the card's resting slot throughout the sort.
  const travelX = parseFloat(getComputedStyle(handCard).translate);
  const restingLeft = handCard.getBoundingClientRect().left - (Number.isFinite(travelX) ? travelX : 0);
  const desired = restingLeft - baseLeft;
  const rightLimit = Math.min(window.innerWidth - 8, (actions?.getBoundingClientRect().left ?? window.innerWidth) - 8);
  const room = Math.max(0, rightLimit - baseLeft - piles.offsetWidth);
  piles.style.setProperty('--futa04-draw-shift', `${Math.round(Math.max(0, Math.min(desired, room)))}px`);
  drawPileAnchorKey = anchorKey;
}
/**
 * Wide screens: centre the cockpit in the empty space to the right of the board (owner,
 * 2026-10-15), instead of pushed against the screen edge. Measured once per layout (never per
 * move), anchored on the cockpit — not the hand — so the dock never jumps as the hand changes
 * size. It only ever moves left, and always keeps clear of the board.
 */
let sideDockStale = true;
function centreSideDock(): void {
  const root = document.documentElement;
  if (root.dataset.layout !== 'side') {
    root.style.removeProperty('--side-dock-shift');
    sideDockStale = false;
    return;
  }
  const tiles = document.querySelector('#board-wrap .l-base')?.getBoundingClientRect();
  const box = document.getElementById('futa04-box')?.getBoundingClientRect();
  if (!tiles || !box || tiles.width === 0 || box.width === 0) return; // not drawn yet: the next render retries
  sideDockStale = false;
  const current = parseFloat(root.style.getPropertyValue('--side-dock-shift')) || 0;
  const left = box.left - current; // where the cockpit sits with no shift
  const room = innerWidth - tiles.right;
  const want = tiles.right + room / 2 - box.width / 2; // its left edge, centred in the room
  const shift = Math.min(0, Math.max(want, tiles.right + 24) - left);
  root.style.setProperty('--side-dock-shift', `${Math.round(shift)}px`);
}
/**
 * The opponent's seat: a real, invisible anchor at the top-right of the map band (their side of
 * the board on both the portrait and the wide layout). It is measured only from layout — the
 * cached key makes repeated calls from a layout pass free, and no animation frame measures it.
 */
let oppSeatCache = '';
function placeOppSeat(): void {
  if (!IS_FUTA04) return;
  const seat = document.getElementById('opp-seat');
  const wrapEl = document.getElementById('board-wrap');
  const game = document.getElementById('game');
  if (!seat || !wrapEl || !game) return;
  const wrap = wrapEl.getBoundingClientRect();
  if (wrap.width < 80 || wrap.height < 80) return;
  const card = document.querySelector<HTMLElement>('#deck .pile-card')?.getBoundingClientRect();
  const cw = card && card.width > 0 ? card.width : 44;
  const ch = card && card.height > 0 ? card.height : Math.round(cw * 1.42);
  const side = document.documentElement.dataset.layout === 'side';
  // Clear of the header, the map's right edge and (on a wide screen) the cockpit beside it.
  const left = Math.max(wrap.left + 4, wrap.right - cw - (side ? 18 : 10));
  const top = Math.max(wrap.top + 6, wrap.top + (side ? 18 : 8));
  const g = game.getBoundingClientRect();
  const key = `${g.left},${g.top},${left.toFixed(1)},${top.toFixed(1)},${cw.toFixed(1)},${ch.toFixed(1)}`;
  if (key === oppSeatCache) return;
  oppSeatCache = key;
  Object.assign(seat.style, {
    left: `${(left - g.left).toFixed(1)}px`,
    top: `${(top - g.top).toFixed(1)}px`,
    width: `${cw}px`,
    height: `${ch}px`,
  });
}
/** The seat, if it has a settled rect. A page that has not laid out yet gets one more try. */
function oppSeat(): HTMLElement | null {
  const seat = document.getElementById('opp-seat');
  if (!seat) return null;
  if (seat.getBoundingClientRect().width > 1) return seat;
  placeOppSeat();
  return seat.getBoundingClientRect().width > 1 ? seat : null;
}
/** Sets the layout's sizes as CSS variables; only when the viewport (or board size) changes. */
function applyLayout() {
  const { w, h } = gameViewport();
  if (document.documentElement.classList.contains('home-screen-app'))
    document.documentElement.style.setProperty('--futasaku-app-height', `${h}px`);
  const radius = session?.state.config.boardRadius ?? 3;
  // the Lab (test copy): a board of any shape fits by the box around its tiles
  const shapeCfg = session?.state.config;
  setBoardShape(shapeCfg?.board ? { cells: shapeCfg.board.cells, rot: (o) => homeRotation(o, shapeCfg, HUMAN) } : null);
  // the test copy's thumb layout (phones in portrait, the setting on): sized for the game's hand
  const thumbSide = FEATURES.phoneLayout && thumbMod ? thumbMod.side(w, h) : null;
  const maxHand = (shapeCfg?.handSize ?? 7) + 1;
  const key = `${w}x${h}r${radius}d${window.devicePixelRatio || 1}b${shapeCfg?.board ? shapeCfg.board.cells.length + shapeCfg.board.homes.join() : ''}t${thumbSide ?? ''}${thumbSide ? `${maxHand}o${thumbOverlap}` : ''}`;
  // phones: the board sits just above the dock (board.setup resets this, so set it every time);
  // the thumb layout puts it at the bottom of its zone (at most 24pt above the cards).
  // Tutorial keeps mid alignment so glass↔map and map↔hand gaps stay equal.
  const tutorialOnEarly = document.documentElement.classList.contains('futa04-tutorial');
  const par = FEATURES.phoneLayout && thumbMod?.side(w, h) && !tutorialOnEarly ? 'xMidYMax meet' : 'xMidYMid meet';
  if (board.svg.getAttribute('preserveAspectRatio') !== par) board.svg.setAttribute('preserveAspectRatio', par);
  if (key === layoutKey) return;
  layoutKey = key;
  const l = thumbSide ? computeLayout({ w, h, ...safeArea() }, radius, maxHand, thumbSide, thumbOverlap) : computeLayout({ w, h, ...safeArea() }, radius);
  if (branding) Object.assign(l, branding.polishLayout(l, { w, h, ...safeArea() }, radius));
  const thumbWas = thumbLayout;
  thumbLayout = l.thumb ?? null;
  if (thumbLayout) {
    document.documentElement.dataset.thumb = thumbLayout.side;
    const r = document.documentElement.style;
    const t = thumbLayout;
    for (const [name, b] of [['deck', t.deck], ['discard', t.discard], ['moves', t.moves], ['undo', t.undo], ['sort', t.sort], ['tips', t.tips]] as const) {
      r.setProperty(`--t-${name}-x`, `${b.x.toFixed(1)}px`);
      r.setProperty(`--t-${name}-y`, `${b.y.toFixed(1)}px`);
      r.setProperty(`--t-${name}-w`, `${b.w.toFixed(1)}px`);
      r.setProperty(`--t-${name}-h`, `${b.h.toFixed(1)}px`);
    }
    r.setProperty('--t-pile-w', `${t.pileCard.w}px`);
    r.setProperty('--t-overlap', `${Math.max(0, l.zone.y + l.zone.h - l.dock.y).toFixed(1)}px`);
    r.setProperty('--t-gap', `${Math.max(0, l.zone.y + l.zone.h - (l.board.y + l.board.h)).toFixed(1)}px`);
    r.setProperty('--t-pile-h', `${t.pileCard.h}px`);
    if (thumbOverlap > 0) document.documentElement.dataset.fanOver = '1';
    else delete document.documentElement.dataset.fanOver;
  } else {
    delete document.documentElement.dataset.thumb;
    delete document.documentElement.dataset.fanOver;
  }
  if (thumbWas !== thumbLayout && session) queueMicrotask(() => render());
  // Step 3: the board's orientation (points left-right or up-down), whichever gives bigger
  // tiles; a turn of the board is a full redraw (rendering only: the game state never changes)
  document.documentElement.dataset.orient = l.orient;
  // Positioning pass: the board also turns (steps of 60 degrees) so the homes sit on the centre
  // line, and the tile centres snap to device pixels (every gap the same); display only
  const cfg = session?.state.config ?? newGame(1).config;
  const rot = homeRotation(l.orient, cfg, HUMAN);
  const grid = 1 / (l.scale * (window.devicePixelRatio || 1));
  const familyChanged = l.orient !== getOrient();
  if (familyChanged || rot !== getRotation() || Math.abs(grid - getPixelGrid()) > 1e-9) {
    setOrient(l.orient);
    setRotation(rot);
    setPixelGrid(grid);
    if (familyChanged && !IS_FUTA04) photosForOrientation();
    if (session) {
      board.setup(session.state.config, session.state.terrain, theme().style, look(), theme().id);
      lastAmbBoard = null;
      lastBoard = null;
      layoutKey = key;
      render();
    }
  }
  const root = document.documentElement.style;
  const px = (n: number) => `${Math.round(n)}px`;
  root.setProperty('--hud-h', px(FEATURES.slimHeader ? SLIM_HUD : HEIGHTS.hud));
  root.setProperty('--race-h', px(FEATURES.slimHeader ? 0 : HEIGHTS.race));
  root.setProperty('--dock-h', px(l.dock.h));
  root.setProperty('--dock-w', px(l.dock.w));
  root.setProperty('--board-margin', `${BOARD_MARGIN}px`);
  for (const [k, v] of Object.entries(l.rows)) root.setProperty(`--row-${k}`, px(v));
  root.setProperty('--pile-card-h', `${l.parts.pileCard.h.toFixed(1)}px`);
  root.setProperty('--centre-w', `${l.parts.hint.w.toFixed(1)}px`);
  root.setProperty('--pile-col', `${l.parts.deck.w.toFixed(1)}px`);
  root.setProperty('--cw', px(l.card.w));
  root.setProperty('--slice', px(l.card.slice));
  document.documentElement.dataset.layout = l.mode;
  board.svg.setAttribute('preserveAspectRatio', (l.thumb && !tutorialOnEarly) ? 'xMidYMax meet' : 'xMidYMid meet');
  fitHudNames();
  if (IS_FUTA04) requestAnimationFrame(alignDrawPiles);
  if (IS_FUTA04) requestAnimationFrame(placeOppSeat);
  if (IS_FUTA04) sideDockStale = true;

}
/**
 * iPhone Safari fires resize before it reports the new size when the phone turns (and often no
 * second event once the size settles), so a layout taken on the event alone could keep the other
 * orientation's numbers: back in portrait the board stayed squeezed at the bottom (owner report,
 * 2026-10-24). After any resize the real size is read again a few times while it settles, and
 * the layout follows whenever it moved. applyLayout is cheap when nothing changed (its key).
 */
let settleTimers: number[] = [];
function layoutSoon() {
  applyLayout();
  for (const t of settleTimers) clearTimeout(t);
  settleTimers = [80, 250, 600, 1200].map((ms) => window.setTimeout(() => {
    const before = layoutKey;
    applyLayout();
    if (layoutKey !== before && session) render();
  }, ms));
}
window.addEventListener('resize', layoutSoon);
window.addEventListener('orientationchange', layoutSoon);
window.visualViewport?.addEventListener('resize', layoutSoon);
screen.orientation?.addEventListener?.('change', layoutSoon);

/**
 * Positioning pass: the score bar keeps "You" and "Opponent" only while both fit their (equal)
 * columns; otherwise both words go together (the marks, colours, aria-labels and the tooltip
 * still say whose score it is). Never a cut-off word.
 */
let lastScoreFit = '';
function fitHudNames() {
  const hud = document.querySelector<HTMLElement>('.hud');
  if (!hud) return;
  hud.classList.remove('names-off', 'tight');
  const over = () => [...hud.querySelectorAll<HTMLElement>('.score')].some((e) => e.scrollWidth > e.clientWidth + 1); // 1px: rounding of a fractional column
  if (!over()) return;
  hud.classList.add('names-off');
  // still too wide (Large text, three-digit scores on a 360px phone): smaller numbers and a
  // narrower pill, both sides alike
  if (over()) hud.classList.add('tight');
}

/** The moment, summarised for the hint line (overhaul item 13; the wording lives in logic/hint.ts). */
function hintCtx(v: View): HintCtx {
  const sel = session!.sel;
  const pending = session!.pending;
  const dc = drawCombo();
  const kinds = sel.card !== null ? new Set(targetKinds(v, session!.legal, sel).values()) : null;
  return {
    phase: v.phase,
    myTurn: v.actor === HUMAN,
    busy: busy(),
    words: SPROUT,
    deckCount: v.deckCount,
    canTakeThrow: session!.legal.some((a) => a.t === 'Draw' && a.from === 'discard'),
    // a picked Fruit card: the "any strength" note, or why it has nothing to do (never "grow")
    fruit: kinds?.has('fruit')
      ? { firstTime: anyNoteCard === sel.card }
      : v.hand.find((c) => c.id === sel.card)?.suit === null
        ? { firstTime: false, reason: fruitCardState(v, session!.legal, sel.card!).reason }
        : null,
    pending: !pending ? null : sproutKind(v, pending) === 'strengthen' ? 'strengthen' : dc ? 'drawn' : 'board',
    drawing: dc ? { n: dc.n, fine: finePointer() } : null,
    card: kinds ? { single: sel.kind === 'sprout', grow: kinds.has('grow'), replace: kinds.has('replace'), strengthen: kinds.has('strengthen') } : null,
    kindPicked: sel.kind !== null,
    hexWithNoMove: sel.hex !== null,
    handEmpty: v.hand.length === 0,
    canSprout: session!.legal.some((a) => a.t === 'Sprout'),
    canCombo: session!.legal.some((a) => a.t === 'Bloom'),
    bloomBlocked: (() => {
      const groups = bloomsShown() ? bloomGroups(v.hand) : [];
      return groups.length ? Math.min(...groups.map((g) => g.cards.length)) : null;
    })(),
    throwEndsTurn: v.phase === 'DISCARD' && discardEndsTurn(v),
    throwPicked: pending?.t === 'Discard',
    fruitReady: session!.legal.some((a) => a.t === 'PlayFruit'),
    grew: grewThisTurn(),
  };
}

/** v0.8: what used my sprout this turn (a Fruit card uses it too): the last such move since my draw. */
function grewThisTurn(): null | 'sprout' | 'fruit' {
  const log = session!.log;
  for (let i = log.length - 1; i >= 0; i--) {
    const a = log[i]!;
    if (a.t === 'Draw' || a.t === 'EndAct' || a.t === 'Discard') return null;
    if (a.t === 'PlayFruit') return 'fruit';
    if (a.t === 'Sprout') return 'sprout';
  }
  return null;
}

/**
 * UX pass: the hexes the opponent grew on or strengthened on its last turn, shown at the start
 * of my turn until I change the board (an undo back to that board shows them again).
 */
let freshTurn = -1;
let freshBoard: State['board'] | null = null;
function freshKeys(): string[] {
  if (!session || busy()) return [];
  // Online the offline "grew last turn" highlight has no source: the duel keeps only this seat's
  // own actions, not a replayable turn history. Reading it used to throw from a render path.
  if (isOnlineDuel()) return [];
  const st = session.state;
  if (st.turnPlayer !== HUMAN || st.phase === 'GAME_OVER') return [];
  if (st.turnNumber !== freshTurn) {
    freshTurn = st.turnNumber;
    freshBoard = st.board;
  }
  if (st.board !== freshBoard) return [];
  const keys = new Set<string>();
  for (const p of session.lastTurnOf(BOT))
    for (const s of p.steps) {
      if (s.k === 'grow') for (const t of s.tiles) keys.add(t.key);
      if (s.k === 'strengthen') keys.add(s.key);
    }
  return [...keys].filter((k) => st.board[k]?.owner === BOT).sort();
}

/** Overhaul item 10: a preview's veins and its at-risk "−N" (only when the move makes it worse). */
function ghostExtras(v: View, pending: Action | null, ghosts: { key: string }[]): Pick<Overlay, 'ghostLinks' | 'atRisk'> {
  if (!pending || ghosts.length === 0) return {};
  const f = forecastMove(v, pending);
  const worse = f?.atRisk && f.atRisk.loss >= 2 && f.atRisk.loss > f.atRiskBefore ? f.atRisk : null;
  return { ghostLinks: ghostLinks(v.board, v.player, ghosts.map((g) => g.key)), atRisk: worse };
}

let blastHoverKey: string | null = null;
/** While a hand card is dragged, the board shows its legal hexes without changing the tap selection. */
let dragSel: Sel | null = null;
/** The legal hex a drag is over (the board's own cue), and the drag's cached screen-to-board matrix. */
let dragHoverKey: string | null = null;
let dragInv: DOMMatrix | null = null;
/** A board-only repaint while a drag is active: no hand re-render, so the dimmed source stays put. */
function refreshBoardDrag() {
  if (!session) return;
  renderBoard(session.view, currentAdvice());
}
function renderBoard(v: View, advice: Advice | null) {
  if (!session) return;
  let o: Overlay = { ...NO_OVERLAY, scars: scars.map(({ key, owner, age, tile }) => ({ key, owner, age, tile })), focusKey, fresh: freshKeys() };
  if (myTurn() && !busy()) {
    const sel = dragSel ?? session.sel;
    const pending = dragSel ? null : session.pending;
    const pv = pending ? previewMove(v, pending) : null;
    const anySel = sel.card !== null || sel.kind !== null || sel.hex !== null;
    const kinds = !pending && (sel.card !== null || sel.kind !== null) && !drawCombo() ? targetKinds(v, session.legal, sel) : null;
    const targets = !pending && (sel.card !== null || sel.kind !== null) ? targetHexes(v, session.legal, sel) : null;
    const bloomTint = sel.kind?.startsWith('bloom-') ? (sel.kind.startsWith('bloom-mega-') ? 'replace' : 'bloom') : null;
    o = {
      ...o,
      targets,
      ...(kinds || bloomTint && targets ? { targetKinds: Object.fromEntries(
        [...targets ?? []].map(key => [key, bloomTint ?? kinds?.get(key) ?? 'grow'])) } : {}),
      selectedHex: dragHoverKey ?? (sel.hex ?? (pending?.t === 'RotPick' ? coordKey(pending.coord) : null)),
      selectedKind: pending?.t === 'Bloom' ? 'bloom' : pending?.t === 'Sprout' ? sproutKind(v, pending) : pending?.t === 'MegaBomb' ? 'replace' : sel.kind?.startsWith('bloom-') ? 'bloom' : undefined,
      ghosts: pv?.ghosts ?? [],
      cutKeys: pv?.cutKeys ?? [],
      ...ghostExtras(v, pending, pv?.ghosts ?? []),
      // A guided level offers the coach's own pick as a stronger ring — but only where the picked
      // card can actually go. Pointing at a hex the current card cannot use would be a lie, and
      // three equally-lit rings make a beginner choose blind.
      coachHexes: advice
        ? (onboardingActive()
          ? advice.hexes.map(coordKey).filter((k) => targets?.has(k))
          : (!anySel && !IS_FUTA04 ? advice.hexes.map(coordKey) : []))
        : [],
      // Before a card is picked, the guided levels show every hex that card could use: the game
      // offering the moves, so a beginner never has to guess a tap and wait for a rejection.
      available: !pending && !anySel && onboardingActive()
        ? new Set(session.legal.filter((a) => a.t === 'Sprout').map((a) => coordKey((a as Extract<Action, { t: 'Sprout' }>).coord)))
        : null,
      usable: true,
    };
    if (sel.kind?.startsWith('bloom-mega-')) {
      const target = pending?.t === 'MegaBomb' ? coordKey(pending.target) : blastHoverKey;
      const action = target ? session.legal.find(a=>a.t==='MegaBomb' && coordKey(a.target)===target) : undefined;
      if (action?.t === 'MegaBomb') {
        const blast = planMegaBomb(session.state,HUMAN,v.hand,action.cards,action.target);
        o = { ...o, blastKeys:blast.destroyed.map(coordKey).filter(key=>key!==target),blastTarget:target };
      }
    }
    const dc = drawCombo();
    // overhaul item 7: before drawing only the starts; while drawing only what can come next
    const drawn = draw.shape.length ? draw.shape : draw.desk.phase === 'live' ? [draw.desk.start] : [];
    if (dc && !pending) {
      const targets = drawNext(dc, drawn, draw.reverse);
      if (IS_FUTA04 && drawn.length === 1) for (const key of bloomEndpoints(dc, drawn[0]!, draw.reverse)) targets.add(key);
      o = { ...o, targets, selectedHex: null, coachHexes: [] };
    }
  }
  if (!busy() && !FEATURES.weakTools) {
    // the test copy: no weak-spot toggles; my most dangerous weak link always pulses gently
    // with its "-N" (the opponent's weak links are on their tile card, when tapped)
    if (v.phase !== 'GAME_OVER') o.pulse = weakSpots(v)[0] ?? null;
  } else if (!busy()) {
    if (settings.weakSpots) o.weak = weakSpots(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
    if (showOpps) o.opps = opportunities(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
    // My most dangerous weak link (one the bot could cut next turn) pulses gently.
    if (settings.weakPulse && !settings.weakSpots && v.phase !== 'GAME_OVER') o.pulse = weakSpots(v)[0] ?? null;
    o.botFragile = showOpps;
  }
  // Redraw the board only when something on it changed (cheaper on older phones).
  const key = JSON.stringify({ ...o, targets: o.targets ? [...o.targets] : null });
  if (queue.board !== lastBoard || key !== lastOverlay) {
    board.render(queue.board, o);
    lastBoard = queue.board;
    lastOverlay = key;
  }
  // Overhaul item 16: ambient life, quiet while moves animate (so cuts read clearly)
  const ambKey = busy() ? 'busy' : `${settings.effects}|${settings.reduceMotion}`;
  if (queue.board !== lastAmbBoard || ambKey !== lastAmbKey) {
    lastAmbBoard = queue.board;
    lastAmbKey = ambKey;
    board.ambient(busy() ? null : ambientPlan({ board: queue.board, terrain: v.terrain, config: v.config, me: HUMAN, effects: settings.effects, reduceMotion: settings.reduceMotion }));
  }
  document.getElementById('tool-weak')?.setAttribute('aria-pressed', String(settings.weakSpots));
  document.getElementById('tool-targets')?.setAttribute('aria-pressed', String(showOpps));
  $('tool-skip').hidden = !busy();
  // Positioning pass: the bottom-left slot always holds a tool (Skip while something animates,
  // otherwise Replay, dimmed until there is a turn to replay), so the "?" opposite is never alone
  const canReplay = canReplayLastTurn();
  const noReplay = !canReplay;
  $('tool-replay').hidden = busy() || !REPLAY_BUTTON;
  $('tool-replay').classList.toggle('off', noReplay);
  $('tool-replay').setAttribute('aria-disabled', String(noReplay));
  $('tool-replay').dataset.tip = noReplay ? noReplayTip() : REPLAY_TIP;
  // Undo (overhaul item 9): always in the same place; lit with a dot while a move can be taken back
  const undoOk = (isOnlineDuel() ? !!getOnlineSession()?.canUndo : session.canUndo) && !busy();
  const replayOk = !undoOk && !busy() && canReplay;
  // Positioning pass: Undo always holds its slot (opposite Sort), dimmed and disabled until a move
  // can be taken back, so it appearing never moves anything and Sort is never alone
  $('tool-undo').hidden = false;
  const undoSlot = $('tool-undo') as HTMLButtonElement;
  undoSlot.disabled = !undoOk && !replayOk;
  const slotMode = replayOk ? 'replay' : 'undo';
  if (undoSlot.dataset.mode !== slotMode) {
    undoSlot.dataset.mode = slotMode;
    const icon = undoSlot.querySelector<HTMLElement>('.i');
    if (icon) { icon.dataset.icon = slotMode; icon.innerHTML = ICONS[slotMode]!; }
  }
  undoSlot.setAttribute('aria-label', replayOk ? `Replay ${OPP.theirs} last turn` : 'Undo: take back your last move');
  undoSlot.title = replayOk ? `Replay ${OPP.theirs} last turn` : 'Take back your last move (you can until you throw)';
  // The same slot holds Replay when nothing can be undone: ONLINE its disabled tooltip must say why
  // (the offline words stay exactly as they were).
  if (!replayOk && noReplay && !undoOk && isOnlineDuel()) undoSlot.title = noReplayTip();
  // Step 4: the homes (tree, volcano): idle life, a calm worried state and the "sides blocked"
  // ring in danger (or when tapped), smothered or withered after a Strangle. Public information.
  {
    const res = session.state.result;
    const states = ([0, 1] as const).map((p) => {
      const sides = homeSides(v, p);
      const m = landmarkMotion({ reduceMotion: settings.reduceMotion, effects: settings.effects }, sides.danger);
      const strangled = !busy() && res?.reason === 'strangle' && res.winner !== p;
      return { ...sides, ...m, tapped: cardPinned && inspectKey === sides.key, strangled, won: !busy() && res?.reason === 'strangle' && res.winner === p };
    });
    board.setHomes(states);
    // Only the player's home breathes, and only while it feeds a joined tile.
    const homeKey = board.rootKey(HUMAN);
    const joinedHome = Object.entries(queue.board).some(([key,tile]) => tile?.owner === HUMAN && !tile.root && hexDistance(parseKey(key),parseKey(homeKey)) === 1);
    board.homeEls[HUMAN]?.classList.toggle('joined-pulse',joinedHome && !settings.reduceMotion);
    board.homeEls[BOT]?.classList.remove('joined-pulse');
    const warn = $('root-warn');
    warn.hidden = !(states[HUMAN]!.danger && v.phase !== 'GAME_OVER');
  }
  placeCorners();
  renderTooltip(v);
}

/**
 * Pins the four corner buttons (weak spots, bot's weak links, replay, skip) to the corners
 * of the board as it is actually drawn (the board is centred inside a taller area).
 */
function placeCorners() {
  const wrap = $('board-wrap');
  const svg = board.svg;
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width) return;
  const w = wrap.getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / vb.width, r.height / vb.height);
  const dw = vb.width * scale;
  const dh = vb.height * scale;
  const left = r.left - w.left + (r.width - dw) / 2;
  const top = r.top - w.top + (r.height - dh) / 2;
  wrap.style.setProperty('--b-left', `${Math.max(0, left).toFixed(0)}px`);
  wrap.style.setProperty('--b-top', `${Math.max(0, top).toFixed(0)}px`);
  wrap.style.setProperty('--b-right', `${Math.max(0, w.width - left - dw).toFixed(0)}px`);
  wrap.style.setProperty('--b-bottom', `${Math.max(0, w.height - top - dh).toFixed(0)}px`);
}

function renderTooltip(v: View) {
  const tip = $('tooltip');
  if (IS_FUTA04 || !inspectKey || busy() || !session) {
    tip.hidden = true;
    return;
  }
  const key = inspectKey;
  const t = v.board[key];
  const terrain = v.terrain[key];
  const name = hexName(parseKey(key), v.config.boardRadius);
  const gold = terrain === 'rich';
  let html: string;
  if (terrain === 'rock') html = `<b>${name} · Rock</b><span>Nothing can grow here.</span>`;
  else if (!t) {
    const scar = IS_FUTA04 ? undefined : scars.find((s) => s.key === key);
    const cut = scar ? `<span class="muted">${scar.owner === HUMAN ? 'Your' : OPP.Label} tile here was cut off ${scar.age === 0 ? 'this turn' : scar.age === 1 ? 'a turn ago' : 'two turns ago'}.</span>` : '';
    html = `<b>${name} · Empty${gold ? ' gold hex' : ''}</b><span>A tile here scores ${gold ? 2 : 1}.</span>${cut}`;
  }
  else {
    const mine = t.owner === HUMAN;
    const who = mine ? 'Your' : OPP.Label;
    if (t.root) {
      const sides = homeSides(v, t.owner);
      html = mine ? `<b>${HOME.mine}</b><span>${HOME.tapMine(sides.taken, sides.openSides)}</span>` : `<b>${HOME.theirs}</b><span>${HOME.tapTheirs(sides.taken, sides.openSides)}</span>`;
    }
    else {
      const loss = cutLoss(v, key).length;
      const top = t.strength >= v.config.maxRank ? ' · top strength, can’t be overgrown' : '';
      const lose = loss > 1 ? `If lost, ${mine ? 'you lose' : `${OPP.the} loses`} ${loss} tiles.` : 'Losing it cuts nothing else.';
      html = `<b>${name} · ${who} tile</b><span>Strength ${t.strength}${top}${gold ? ' · gold: scores 2' : ''}</span><span>Joined to ${mine ? 'your' : 'their'} home. ${lose}</span>`;
      // the test copy: the opponent's weak link (was the "their weak links" toggle), on their card only
      if (!FEATURES.weakTools && !mine && opportunities(v, { anyReach: true, minLoss: 2 }).some((o) => o.key === key)) html += `<span class="tc-note">${OPP.Label} weak link: you can reach it now.</span>`;
    }
  }
  // v0.6: in my Grow step, an opponent tile a Fruit card can remove offers "Use Fruit card"
  const offer = cardPinned && myTurn() ? fruitOffer(v, session.legal, key) : null;
  if (offer) html += `${offer.note ? `<span class="tc-note">${offer.note}</span>` : ''}<button type="button" class="btn primary small tc-fruit" data-fruit="${key}">${offer.label}</button>`;
  tip.innerHTML = html;
  tip.hidden = false;
  tip.classList.toggle('pinned', cardPinned);
  const p = boardWrapPoint(key);
  const wrap = $('board-wrap').getBoundingClientRect();
  tip.setAttribute('role', cardPinned ? 'dialog' : 'tooltip');
  tip.setAttribute('aria-label', `Tile card: ${name}`);
  const w = Math.min(250, wrap.width - 16);
  tip.style.width = `${w}px`;
  tip.style.left = `${Math.min(Math.max(p.x - w / 2, 8), wrap.width - w - 8)}px`;
  const above = p.y > wrap.height * 0.45;
  tip.style.top = above ? '' : `${p.y + S}px`;
  tip.style.bottom = above ? `${wrap.height - p.y + S}px` : '';
}

const button = (text: string, cls: string, onClick: () => void, label?: string) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${cls}`;
  b.textContent = text;
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', () => {
    sound.unlock();
    onClick();
  });
  return b;
};

/** Futa04 cockpit art. The accessible name remains the action, not the drawing. */
const controlIcon = (control: HTMLButtonElement, name: 'skip' | 'cancel' | 'clear' | 'reverse' | 'previous' | 'next') => {
  if (!IS_FUTA04) return;
  const label = control.getAttribute('aria-label') || control.textContent?.trim() || name;
  control.setAttribute('aria-label', label);
  control.title = label;
  control.classList.add('futa04-hardware-control', `futa04-control-${name}`);
  const paths: Record<typeof name, string> = {
    skip: '<path d="m5 5 7 7-7 7V5Zm8 0 7 7-7 7V5Z" fill="currentColor" stroke="none"/>',
    cancel: '<path d="M6 6 18 18M18 6 6 18"/>',
    clear: '<path d="M5 7h14M9 7V5h6v2m2 0-.7 12H7.7L7 7m3 4v5m4-5v5"/>',
    reverse: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
    previous: '<path d="m14.5 5-7 7 7 7"/>',
    next: '<path d="m9.5 5 7 7-7 7"/>',
  };
  control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

function renderControls(v: View, advice: Advice | null) {
  if (!session) return;
  const moves = $('moves');
  moves.replaceChildren();
  $('confirm').hidden = true;
  if (!myTurn() || busy()) {
    if (session.state.phase === 'GAME_OVER' && !busy() && gameOverDismissed) {
      moves.append(
        button('Results', 'ghost', () => {
          gameOverDismissed = false;
          render();
        }),
        button('Rematch', 'primary', () => startGame(randomSeed())),
      );
    }
    return;
  }
  const legal = session.legal;
  const sel = session.sel;
  const pending = session.pending;
  const anySel = sel.card !== null || sel.kind !== null || sel.hex !== null;
  const coachKind = advice && advice.action.t === 'Bloom' ? kindOf(advice.action) : null;

  if (v.phase === 'DRAW') {
    // Nothing here: the two piles glow and say "Tap to draw" / "Tap to take".
  } else if (v.phase === 'ACT' && !grewThisTurn() && skipPlan(legal, v.hand.length, settings.autoSkip && session.state !== skippedFrom).kind === 'ask') {
    // Step 2, auto-skip off (or after an Undo of a skip): why nothing can be played, and Continue
    // (v0.8: only for a truly empty Grow step; after a sprout or a Fruit card it is "Throw a card")
    const end = legal.find((a) => a.t === 'EndAct')!;
    const note = document.createElement('span');
    note.className = 'note empty-reason';
    // positioning pass: one short line in the centre column; the full reason on hover and for
    // screen readers
    note.textContent = NOTHING_TO_PLAY;
    note.title = `${NOTHING_TO_PLAY}. ${emptyReason(v.hand)}`;
    note.setAttribute('aria-label', note.title);
    moves.append(note, button('Continue', 'primary empty-continue', () => humanPlay(end), 'Continue to the Throw step'));
  } else if (v.phase === 'ACT') {
    // Sprout first: tapping a card picks it. Say so while nothing is picked.
    const grow = growControls(legal);
    const kindButtons = moveButtons(v, legal, sel, IS_FUTA04);
    // two or more ways to bloom: one "Bloom" button opens the list of choices (they never
    // crowd the row or run off the screen); a single way gets its own button
    const many = kindButtons.length > 1;
    let host: HTMLElement = moves;
    if (!many && (!IS_FUTA04 || !sel.kind?.startsWith('bloom-'))) bloomMenu = false;
    if (many) {
      const chosen = kindButtons.find((k) => sel.kind === k.kind);
      const toggle = button(chosen ? shortKindLabel(chosen.kind) : BLOOM.Name, `kind bloom-toggle${chosen || bloomMenu ? ' on' : ''}`, () => {
        bloomMenu = !bloomMenu;
        render();
      });
      const sub = document.createElement('small');
      sub.className = 'kind-keep';
      sub.textContent = BLOOM.choices(kindButtons.length);
      toggle.append(sub);
      if (IS_FUTA04) renderBloomIcons(toggle, chosen?.kind ?? kindButtons[0]!.kind, v, true);
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', String(bloomMenu));
      moves.append(toggle);
      const panel = document.createElement('div');
      panel.className = 'bloom-options';
      panel.setAttribute('role', 'menu');
      panel.hidden = !bloomMenu;
      moves.append(panel);
      host = panel;
    }
    for (const k of kindButtons) {
      const on = sel.kind === k.kind;
      // two or more share the row: short words, so they fit beside the piles on a phone
      const b = button(k.label, `kind${on ? ' on' : ''}${coachKind === k.kind && !anySel ? ' coach-glow' : ''}`, () => {
        if (IS_FUTA04 && k.kind.startsWith('bloom-') && !k.kind.startsWith('bloom-mega-')) {
          // Menu / smart-bloom pick: enter the recipe; optional mini-card pick is first tile.
          const picked = Number(b.dataset.bloomCard);
          const cardId = Number.isFinite(picked) ? picked : session!.sel.card;
          delete b.dataset.bloomCard;
          beginBloomKind(k.kind, cardId);
          smartCockpit?.hint('BLOOM');
          render();
          return;
        }
        bloomMenu = false;
        session!.tapKind(k.kind);
        render();
      });
      b.dataset.kind = k.kind;
      b.dataset.kinds = k.kinds.join(' ');
      if (many) {
        b.setAttribute('role', 'menuitemradio');
        // the cards it uses, so two "Bloom 4 tiles" are told apart (numbers in their suit colours)
        const cards = kindCards(k.kind)
          .map((id) => v.hand.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .sort((x, y) => x.rank - y.rank || (x.suit ?? 0) - (y.suit ?? 0));
        const nums = document.createElement('span');
        nums.className = 'kind-cards';
        nums.innerHTML = cards.map((c) => `<b class="${suitClass(c)}">${c.rank}</b>`).join('');
        b.prepend(nums);
        b.setAttribute('aria-label', `${k.label}: ${cards.map((c) => c.rank).join(', ')}`);
      }
      b.setAttribute('aria-pressed', String(on));
      if (IS_FUTA04) renderBloomIcons(b, k.kind, v, !many && (on || kindCards(k.kind).length > 4));
      host.append(b);
    }
    if (IS_FUTA04 && !many && sel.kind?.startsWith('bloom-') && kindButtons.length) {
      const chosenButton = moves.querySelector<HTMLButtonElement>('[data-kind]')!;
      const toggle = button('', 'kind bloom-toggle on', () => { bloomMenu = !bloomMenu; render(); });
      renderBloomIcons(toggle, sel.kind, v, true);
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', String(bloomMenu));
      const panel = document.createElement('div'); panel.className = 'bloom-options';
      panel.setAttribute('role', 'menu'); panel.hidden = !bloomMenu;
      moves.replaceChild(toggle, chosenButton); panel.append(chosenButton); moves.append(panel);
    }
    // Done growing: the next step is throwing a card (or, with an empty hand, the turn just ends).
    const end = legal.find((a) => a.t === 'EndAct');
    const bloomStill = IS_FUTA04 && legal.some(a => a.t === 'Bloom' || a.t === 'MegaBomb');
    const skipLabel = v.hand.length > 0
      ? IS_FUTA04 && grow.throwButton && bloomStill ? 'skip?' : IS_FUTA04 ? 'Skip' : 'Throw a card'
      : 'End turn';
    // Tutorial: hide Skip during Grow teaching — show it again on EndAct steps (STAY JOINED, etc.).
    const tutLesson = coach.tutorial ? tutorialLesson(coach.tutorial.chapter, coach.tutorial.step) : null;
    const hideTutSkip = !!tutLesson && tutLesson.action !== 'EndAct' && tutLesson.action !== 'FreeTurn';
    if (end && !pending && grow.throwButton && !hideTutSkip) moves.append(button(skipLabel, `end ${anySel ? 'ghost' : 'primary'}${IS_FUTA04 && v.hand.length > 0 ? ' futa04-skip' : ''}${advice?.action.t === 'EndAct' || tutLesson?.action === 'EndAct' ? ' coach-glow' : ''}`, () => humanPlay(end), `${skipLabel}: skip bloom and throw a card`));
    // Sprouting stays optional in the rules: a small link skips it and goes on to Throw.
    if (end && !pending && grow.skipLink && !anySel && !hideTutSkip) moves.append(button(IS_FUTA04 ? 'Skip' : SPROUT.skip, `link end skip${IS_FUTA04 ? ' futa04-skip' : ''}${advice?.action.t === 'EndAct' || tutLesson?.action === 'EndAct' ? ' coach-glow' : ''}`, () => humanPlay(end), SPROUT.skipTitle));
  } else if (v.phase === 'DISCARD') {
    // (the hint line says "Tap a card to throw it")
  } else {
    for (const a of legal) {
      if (isBoardAction(a) || a.t === 'Discard') continue;
      moves.append(button(a.t === 'Continue' ? 'End turn' : a.t === 'Knock' ? 'Knock' : a.t, 'primary', () => humanPlay(a)));
    }
  }
  if (IS_FUTA04 && sel.kind?.startsWith('bloom-') && !coach.tutorial) {
    const end = legal.find(a => a.t === 'EndAct');
    if (end && !moves.querySelector('.end')) moves.append(button(grewThisTurn() ? 'skip?' : 'Skip', 'end futa04-skip', () => humanPlay(end), 'Skip bloom and throw a card'));
  }
  // Tutorial explanation steps: the cockpit's » doubles as Next (the cockpit mirrors #moves)
  const nextLesson = coach.tutorial ? tutorialLesson(coach.tutorial.chapter, coach.tutorial.step) : null;
  if (nextLesson?.action === 'Next') moves.append(button('Next', 'end futa04-skip tutorial-next', () => tutorialNext(), 'Next'));
  const dc = drawCombo();
  if (dc && !pending) {
    if (draw.shape.length > 0 || draw.suggested) moves.append(button('Clear', 'ghost draw-clear', () => cancelDraw(), 'Clear the shape'));
    // a run: which end gets the lowest number (a set has one number: no toggle)
    if (dc.run) {
      const b = button('Reverse', `ghost draw-reverse${draw.reverse ? ' on' : ''}`, () => toggleReverse(), 'Reverse the numbers: highest on the first hex');
      b.setAttribute('aria-pressed', String(draw.reverse));
      moves.append(b);
    }
  }
  if (dc && settings.placementList) {
    // an opt-in accessibility list: step through every legal placement of this combo
    const all = dc.actions;
    const i = Math.max(0, all.findIndex((a) => JSON.stringify(a) === JSON.stringify(pending)));
    const step = (d: number) => {
      const k = pending ? (i + d + all.length) % all.length : d > 0 ? 0 : all.length - 1;
      if (IS_FUTA04) {
        draw = { ...DRAW0 };
        board.ghost(null);
      }
      session!.preset(all[k]!);
      render();
    };
    moves.append(button('◀', 'ghost list-prev', () => step(-1), 'Previous placement'));
    const lab = document.createElement('span');
    lab.className = 'list-pos';
    lab.textContent = pending ? `Placement ${i + 1} of ${all.length}` : `${all.length} placements`;
    moves.append(lab);
    moves.append(button('▶', 'ghost list-next', () => step(1), 'Next placement'));
  }
  if (anySel && (!pending || IS_FUTA04)) moves.append(button('Cancel', 'ghost cancel', () => cancelSel()));

  if (IS_FUTA04 && dc) {
    const panel = moves.querySelector<HTMLElement>('.bloom-options');
    if (panel) for (const control of [...moves.children]) {
      if (control.matches('.draw-clear, .draw-reverse, .list-prev, .list-pos, .list-next, .cancel')) panel.append(control);
    }
  }
  if (IS_FUTA04) {
    for (const [selector, name] of [
      ['.futa04-skip', 'skip'], ['.cancel', 'cancel'], ['.draw-clear', 'clear'],
      ['.draw-reverse', 'reverse'], ['.list-prev', 'previous'], ['.list-next', 'next'],
    ] as const) {
      for (const control of moves.querySelectorAll<HTMLButtonElement>(selector)) controlIcon(control, name);
    }
  }
  if (pending) {
    const pv = previewMove(v, pending);
    $('confirm-chip').textContent = pv ? pv.chip : pending.t === 'Discard' ? `Discard ${cardName(v.hand.find((c) => c.id === pending.card)!)}` : '';
    $('confirm-play').textContent = pending.t === 'Discard' && discardEndsTurn(v) ? 'Discard & end turn' : pending.t === 'Discard' ? 'Discard' : 'Confirm';
    // Overhaul item 8: the risks that made this move ask (icons + short lines); else the old note
    const risks = (() => {
      const f = forecastMove(v, pending);
      return f ? riskLines(f) : [];
    })();
    renderRisks(risks);
    const warn = $('confirm-warn');
    const quiet = risks.length > 0 || (!pv?.warning && !pv?.note);
    warn.hidden = quiet;
    warn.textContent = quiet ? '' : (pv?.warning ?? pv?.note ?? '');
    warn.classList.toggle('note', !pv?.warning && !!pv?.note);
    // Polish pass 3: previewing a Sprout onto an opponent tile? A small "i" opens its tile card,
    // so Fruit stays reachable while a card is picked.
    const info = $('confirm-info');
    const onOpp = pending.t === 'Sprout' && v.board[coordKey(pending.coord)]?.owner === BOT;
    info.hidden = !onOpp || fruitOffer(v, legal, coordKey((pending as Extract<Action, { t: 'Sprout' }>).coord)) === null;
    if (!info.hidden) info.dataset.key = coordKey((pending as Extract<Action, { t: 'Sprout' }>).coord);
    // the test copy: no Confirm box (a second tap on the card or the hex places the move)
    $('confirm').hidden = FEATURES.tapAgain;
  }
}

/** Futa04 keeps the actual rank/suit combinations and accessible names, without instruction prose. */
function renderBloomIcons(button: HTMLButtonElement, kind: string, v: View, compact = false) {
  const cards = kindCards(kind).map(id => v.hand.find(c => c.id === id)).filter(c => !!c);
  const icons = document.createElement('span');
  icons.className = 'futa04-combination';
  icons.setAttribute('aria-hidden', 'true');
  icons.innerHTML = cards.map(c => `<span class="futa04-mini-card ${suitClass(c!)}" data-card="${c!.id}">${cardFace(c!)}</span>`).join('');
  button.replaceChildren(icons);
  // Show the actual combination in the cockpit, including the selected Bloom.
  if (compact) button.classList.add('futa04-compact-control');
  button.setAttribute('aria-label', `${shortKindLabel(kind)}: ${cards.map(c => cardName(c!)).join(', ')}`);
}

/** The forecast bar's risk lines (overhaul item 8): one icon and short line each. */
function renderRisks(risks: ReturnType<typeof riskLines>) {
  const box = $('confirm-risks');
  box.replaceChildren(
    ...risks.map((r) => {
      const li = document.createElement('li');
      li.className = `risk risk-${r.reason}`;
      const i = document.createElement('span');
      i.className = 'risk-icon';
      i.setAttribute('aria-hidden', 'true');
      i.textContent = r.icon;
      li.append(i, document.createTextNode(r.text));
      return li;
    }),
  );
  box.hidden = risks.length === 0;
}


/** First-time tips for Fruit and Strengthen: shown once, until dismissed (re-open from How to play). */
function renderFirstTip(v: View) {
  const card = $('first-tip');
  if (!session || coach.tutorial || (openSheet && (!IS_FUTA04 || openSheet.id !== 'sheet-futa04-help'))) {
    card.hidden = true;
    return;
  }
  if (!tipOpen && myTurn() && !busy() && v.phase === 'ACT') {
    if (!tipsSeen.draw && drawCombo()) tipOpen = 'draw';
    else if (!tipsSeen.fruit && v.hand.some((c) => c.suit === null)) tipOpen = 'fruit';
    else if (!tipsSeen.strengthen && session.sel.card !== null && [...targetKinds(v, session.legal, session.sel).values()].includes('strengthen')) tipOpen = 'strengthen';
  }
  // An explicitly opened lesson (the How to sheet) belongs to the player, not to the moment: a
  // background render must never close it just because it is not their ACT turn right now.
  const openedByPlayer = IS_FUTA04 && openSheet?.id === 'sheet-futa04-help' && !!tipOpen;
  card.hidden = !tipOpen || (!openedByPlayer && IS_FUTA04 && (!myTurn() || busy() || v.phase !== 'ACT'));
  if (!tipOpen) return;
  $('first-tip-title').textContent = TIPS[tipOpen].title;
  $('first-tip-text').textContent = TIPS[tipOpen].text;
  $('first-tip-demo').hidden = tipOpen !== 'draw';
}

/** Let the familiar Throw motion finish a scripted turn without another lesson. */
function scheduleTutorialRoutineThrow(stepKey: string) {
  if (tutorialRoutineThrowKey === stepKey) return;
  tutorialRoutineThrowKey = stepKey;
  const currentEpoch = epoch;
  void idle().then(async () => {
    if (currentEpoch !== epoch || !coach.tutorial ||
      `${coach.tutorial.chapter}:${coach.tutorial.step}` !== stepKey) return;
    if (openSheet) { tutorialRoutineThrowKey = ''; return; }
    if (session?.state.phase === 'ACT') {
      const end = session.legal.find(action => action.t === 'EndAct');
      if (end) {
        // Scripted tutorial beat: the APP throws, so it is not a stop the player can "take back".
        const played = session.play(end, HUMAN, { auto: true });
        if (played) afterPlay(played, HUMAN, null);
      }
      await idle();
    }
    if (currentEpoch !== epoch || !coach.tutorial ||
      `${coach.tutorial.chapter}:${coach.tutorial.step}` !== stepKey) return;
    if (openSheet) { tutorialRoutineThrowKey = ''; return; }
    const discard = session?.legal.find(action => action.t === 'Discard');
    if (discard) humanPlay(discard);
  });
}

/** The single hand card the current tutorial step asks for (before it is picked), or null. */
/**
 * Levels 1-10: the one card the light points at, so it is lifted out of the fan and alone in the
 * glow. It is read from the live beat (this runs before the lesson render), and it is never lifted
 * at the SILENT tier — the light is off, so the card rests with the fan.
 */
function lessonSingleCardId(): number | null {
  const lesson = lessonActive();
  if (!lesson || !session || guidanceOff() || !myTurn() || busy()) return null;
  if (!goalReachable(lesson, session.state)) return null;
  const beat = lessonBeat(lesson, session.state, lessonCtx());
  if (beat?.lit.t !== 'card') return null;
  if (!beat.explain && !beat.hello && !beat.status && beat.kind) {
    const tier = displayTier({
      mastery: lessonMastery, kind: beat.kind, level: lesson.level, newActions: lesson.newActions,
      safety: lessonIdleStage, escalation: lessonEscalated,
    });
    if (tier === 'silent') return null;
  }
  return beat.lit.id;
}

function tutorialSingleCardId(): number | null {
  const progress = coach.tutorial;
  if (!progress || !session || session.sel.card !== null) return null;
  const lesson = tutorialLesson(progress.chapter, progress.step);
  if (!lesson || (lesson.focus !== 'card' && lesson.focus !== 'tile')) return null;
  if (lesson.focus === 'tile' && !lesson.tile) return null;
  const hand = session.view.hand;
  const card = lesson.cardId != null
    ? hand.find(c => c.id === lesson.cardId)
    : lesson.card
      ? hand.find(c => c.suit === lesson.card![0] && c.rank === lesson.card![1])
      : lesson.focus === 'card' ? hand[0] : hand.find(c => c.suit === null);
  return card?.id ?? null;
}

function renderTutorial() {
  const progress=coach.tutorial;
  if (!progress || !session || !glassSurface) {
    tutorialGate?.clear();
    return;
  }
  const lesson=tutorialLesson(progress.chapter,progress.step);
  if (!lesson) return;
  const stepKey = `${progress.chapter}:${progress.step}`;
  if (lesson.autoDiscard) {
    glassSurface.hide();
    tutorialGate?.set(allowedSelectorsForLesson(null, '', 'busy'), 'busy');
    scheduleTutorialRoutineThrow(stepKey);
    return;
  }
  const selected=session.sel.card;
  const selectingBloom=!!session.sel.kind?.startsWith('bloom-');
  const title = lesson.instruction;
  const body = lesson.why;
  // Rounded-rect highlight targets. Card→tile lessons: whole hand first, then the tile.
  let selector='';
  if (lesson.focus==='explainer') {
    selector = '#futasaku-glass [data-tut="next"]';
  } else if (lesson.focus==='hand' || lesson.action === 'Discard') {
    // Throw: union hand + discard pile. Grow-from-hand: hand first, then the tile.
    if (lesson.action === 'Discard') selector = '#hand .card, #discard';
    else if (selected!==null && lesson.tile) {
      selector=`#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`;
    } else selector='#hand .card';
  } else if (lesson.focus==='deck') { selector='#deck'; }
  else if (lesson.focus==='discard') { selector='#discard'; }
  else if (lesson.focus==='context') { selector='#smart-context'; }
  else if (lesson.focus==='card') {
    const card = lesson.cardId != null
      ? session.view.hand.find(c=>c.id===lesson.cardId)
      : lesson.card
        ? session.view.hand.find(c=>c.suit===lesson.card![0]&&c.rank===lesson.card![1])
        : session.view.hand[0];
    if (card) selector=`#hand .card[data-card="${card.id}"]`;
  } else if (lesson.focus==='bloom') {
    if (selectingBloom) {
      // Union planted bloom hexes + next legal tip/endpoint hexes so the glow
      // never “loses” the tile the player already painted.
      const planted = draw.shape.length
        ? [...draw.shape]
        : draw.desk.phase === 'live' && draw.desk.start
          ? [draw.desk.start]
          : [];
      const tipKeys = [...document.querySelectorAll<SVGElement>('#board .target[data-key]')]
        .map(el => el.getAttribute('data-key'))
        .filter((k): k is string => !!k);
      const keys = [...new Set([
        ...planted,
        ...tipKeys,
        ...(lesson.tile ? [coordKey(lesson.tile)] : []),
      ])];
      selector = keys.length
        ? keys.map(k => `#board .hex-cell[data-key="${k}"]`).join(', ')
        : '#board .target, #board .ghost.draw-ghost';
    } else { selector='#smart-bloom-button'; }
  } else if (lesson.focus==='home' && lesson.tile) {
    selector=`#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`;
  } else if (lesson.focus==='button') {
    const map: Record<string,string> = {
      deck:'#deck', discard:'#discard', sort:'#hand-sort', undo:'#tool-undo',
      score:'#race', intel:'#futa04-help-button', display:'#smart-led',
    };
    const id = lesson.button ?? lesson.id;
    selector = map[id] ?? `[data-tutorial-btn="${id}"]`;
  } else if (lesson.focus==='tile' && lesson.tile) {
    const wanted=lesson.cardId != null
      ? session.view.hand.find(c=>c.id===lesson.cardId)
      : lesson.card
        ? session.view.hand.find(c=>c.suit===lesson.card![0]&&c.rank===lesson.card![1])
        : session.view.hand.find(c=>c.suit===null);
    if (selected!==wanted?.id && wanted) selector=`#hand .card[data-card="${wanted.id}"]`;
    else selector=`#board .hex-cell[data-key="${coordKey(lesson.tile)}"]`;
  }
  tutorialTargetSelector = selector;
  const lockedBusy = busy() || tutorialTransitionPending
    || lesson.action === 'Opponent'
    || (lesson.action !== 'FreeTurn' && !myTurn());
  let cta = lesson.cta ?? (lesson.action === 'Next' ? 'NEXT' : undefined);
  if (lesson.action === 'Discard' && session.pending?.t === 'Discard') {
    cta = 'TAP IT AGAIN';
  } else if (lesson.action === 'MegaBomb' && (selectingBloom || selected !== null)) {
    // The Blast plays on this one tap (like Grow/Bloom), so there is no "TAP AGAIN": after the tap
    // the step advances. A second tap is never asked for.
    cta = 'TAP TILE';
  } else if ((lesson.focus === 'hand' || lesson.focus === 'tile') && selected !== null && lesson.tile) {
    cta = 'TAP TILE';
  } else if (lesson.focus === 'hand' && selected === null && lesson.action !== 'EndAct') {
    cta = lesson.cta || 'TAP A CARD';
  } else if (lesson.focus === 'bloom' && selectingBloom && lesson.action !== 'MegaBomb') {
    cta = 'TAP TILE';
  } else if (lesson.action === 'PlayFruit' && selected !== null) {
    cta = 'TAP TILE';
  }
  // Free play: the glass keeps one line for the current step (Draw → Grow → Throw).
  if (lesson.action === 'FreeTurn') {
    syncTutorialGate();
    const guide = freeTurnGuideNow();
    const freeKey = `free:${guide.title}:${guide.line}`;
    if (tutorialDisplayKey !== freeKey || glassSurface.mode?.() !== 'tutorial') {
      tutorialDisplayKey = freeKey;
      glassSurface.tutorial(guide.title, progress.chapter, [], {
        shape: 'none',
        stepKey: freeKey,
        why: guide.line,
        chapterCount: TUTORIAL_CHAPTER_COUNT,
        reduceMotion: settings.reduceMotion,
        buttons: {
          previous: progress.step > 0 || previousTutorialChapter(progress.chapter, progress.track) !== null,
          next: false,
          playReal: false,
        },
        handlers: {
          onPrevious: tutorialPrevious,
        },
      });
    }
    glassSurface.hideFocus?.();
    return;
  }
  const key=`${stepKey}:${selected}:${session.sel.kind}:${session.pending?.t ?? ''}:${selector}:${lockedBusy?'1':'0'}:${tutorialStatus ?? ''}:${cta ?? ''}`;
  if (tutorialDisplayKey!==key) {
    tutorialDisplayKey=key;
    const showIdle = document.getElementById('tutorial-focus')?.dataset.bob === 'hard';
    const showNext = lesson.action === 'Next' || !!cta;
    const nextLabel = lesson.action === 'Next' || lesson.action === 'EndAct'
      ? (lesson.cta || 'NEXT')
      : (cta || 'NEXT');
    const nextBlink = lesson.action === 'Next';
    const bloomDemo = !!lesson.bloomDemo;
    if (lockedBusy) {
      glassSurface.tutorial(tutorialStatus ?? title, progress.chapter, [], {
        shape: 'none',
        stepKey,
        chapterCount: TUTORIAL_CHAPTER_COUNT,
        reduceMotion: settings.reduceMotion,
        bloomDemo,
        ...(tutorialStatus ? { status: tutorialStatus } : {}),
        // their turn keeps its title and one line under it
        ...(lesson.action === 'Opponent' && body && !tutorialStatus ? { why: body } : {}),
        buttons: {
          previous: progress.step > 0 || previousTutorialChapter(progress.chapter, progress.track) !== null,
          next: false,
        },
        handlers: {
          onPrevious: tutorialPrevious,
        },
      });
      glassSurface.hideFocus?.();
      tutorialLookTapCleanup?.();
      tutorialLookTapCleanup = null;
    } else {
      glassSurface.tutorial(tutorialStatus ?? title, progress.chapter, selector ? [selector] : [], {
        shape: 'pill',
        stepKey,
        ...(body != null && !tutorialStatus ? { why: body } : {}),
        chapterCount: TUTORIAL_CHAPTER_COUNT,
        reduceMotion: settings.reduceMotion,
        bloomDemo,
        arrow: true,
        ...(tutorialStatus && /Clean|Nice|There it is|Easy/.test(tutorialStatus) ? { praise: tutorialStatus } : {}),
        ...(tutorialStatus && !/Clean|Nice|There it is|Easy/.test(tutorialStatus) ? { status: tutorialStatus } : {}),
        idleHard: showIdle,
        buttons: {
          previous: progress.step > 0 || previousTutorialChapter(progress.chapter, progress.track) !== null,
          next: showNext,
          nextLabel,
          nextBlink,
          playReal: false,
        },
        handlers: {
          onPrevious: tutorialPrevious,
          onNext: () => {
            if (lesson.action === 'Next') tutorialNext();
            else if (lesson.action === 'EndAct') {
              const endBtn = document.querySelector<HTMLButtonElement>('#moves .end, #moves .futa04-skip, #smart-context:not(:disabled)');
              if (endBtn && !endBtn.disabled) endBtn.click();
              else glassSurface?.nudge();
            } else if (lesson.action === 'Bloom' || lesson.action === 'MegaBomb') {
              if (!tutorialAssistBloom(lesson.action)) glassSurface?.nudge();
            } else glassSurface?.nudge();
          },
          onPlayReal: () => { releaseTutorialLock(); store.remove(SAVE_KEY); coach = freshCoach(); showScreen('menu'); },
        },
      });
      armTutorialIdle();
      armTutorialLookTap(lesson, selector);
    }
  } else glassSurface.refresh();
  syncTutorialGate();
}

function showTip(id: FirstTip) {
  tipOpen = id;
  sheet(null);
  render();
  if (IS_FUTA04 && futa04Help) {
    // How to play can open before a game exists; fill this explicit lesson directly.
    $('first-tip-title').textContent = TIPS[id].title;
    $('first-tip-text').textContent = TIPS[id].text;
    $('first-tip-demo').hidden = id !== 'draw';
    $('first-tip').hidden = false;
    futa04Help.open('tip');
  }
}

/**
 * Phase 4: the idle breath is CSS-only, but it must not move under a finger. A pointer pressed on
 * the hand (or a tab that went away, a sheet, a pause) holds it; releasing resumes the same phase.
 * The lesson's lit breath follows the very same hold, so a hidden tab or a pause freezes it too.
 */
let breathPointers = 0;
function syncBreathHold() {
  const hold = breathPointers > 0 || document.hidden || paused || !!openSheet || !!$('game').hidden;
  document.getElementById('hand')?.classList.toggle('breath-hold', hold);
  lessonBreath?.hold(hold);
}
function installHandBreath(hand: HTMLElement) {
  hand.addEventListener('pointerdown', () => {
    breathPointers++;
    syncBreathHold();
  }, { capture: true, passive: true });
  const release = () => {
    if (!breathPointers) return;
    breathPointers = Math.max(0, breathPointers - 1);
    syncBreathHold();
  };
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', () => {
    breathPointers = 0;
    syncBreathHold();
  });
  document.addEventListener('visibilitychange', syncBreathHold);
}

function renderHand(v: View, advice: Advice | null) {
  if (!session) return;
  // A pick toward a Bloom only lives in my own Grow step, and only while it can still bloom.
  if (bloomPick.length && !(IS_FUTA04 && myTurn() && !busy() && v.phase === 'ACT' && bloomKindsWith(bloomPick).length)) bloomPick = [];
  const hand = $('hand');
  const sel = session.sel;
  const legal = myTurn() && !busy() ? session.legal : [];
  const usable = legal.length ? usableCards(v, legal, { ...sel, card: null }) : new Set<number>();
  const picked = new Set(session.pending ? moveCards(session.pending) : []);
  const coachCards = advice && sel.card === null && !session.pending ? new Set(advice.cards) : new Set<number>();
  const cards = handOrder(v.hand, settings.handSort);
  const bloomCards = IS_FUTA04 && myTurn() && !busy() ? new Set(sel.kind?.startsWith('bloom-')
    ? kindCards(sel.kind) : sel.card === null && sel.kind === null
      ? legal.flatMap(a => a.t === 'Bloom' || a.t === 'MegaBomb' ? a.cards : []) : []) : new Set<number>();
  // overhaul item 3: cards of the same combo share a small bracket under them
  const combos = bloomsShown() ? comboGroups(v.hand) : new Map<number, number>();
  const showBloomHints = (settings.bloomHints || !!coach.tutorial || IS_TEST) && myTurn() && !busy() && bloomsShown();
  const bloomHintIds = showBloomHints
    ? new Set(bloomHintGroups(v, legal).flat())
    : new Set<number>();
  // FLIP needs layout reads only when card membership or order changes. Selection,
  // phase updates and bot moves otherwise forced two full hand measurements.
  const flip = !settings.reduceMotion && settings.speed !== 'skip' &&
    (hand.children.length !== cards.length || cards.some((card, index) =>
      (hand.children[index] as HTMLElement | undefined)?.dataset.card !== String(card.id)));
  const before = new Map<number, DOMRect>();
  if (flip) for (const b of hand.querySelectorAll<HTMLElement>('[data-card]'))
    before.set(Number(b.dataset.card), b.getBoundingClientRect());
  const n = cards.length;
  const spread = Math.min(3.5, 22 / Math.max(n, 1));
  // Phase 4: the hand only breathes when it is the player's to touch.
  const breathing = IS_FUTA04 && motionOn() && myTurn() && !busy();
  hand.classList.toggle('breathing', breathing);
  syncBreathHold();
  // Tutorial: the one card a step asks for sits above the fan, so only it shows in the glow.
  const tutorialCard = tutorialSingleCardId() ?? lessonSingleCardId();
  const existing = new Map([...hand.querySelectorAll<HTMLButtonElement>('[data-card]')].map((b) => [Number(b.dataset.card), b]));
  cards.forEach((c, i) => {
    let b = existing.get(c.id);
    existing.delete(c.id);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.dataset.card = String(c.id);
      b.innerHTML = cardFace(c);
      b.addEventListener('click', () => onCardTap(c.id));
    }
    // Phase 1: the card's weight (0 light .. 1 heavy). Drives the press, the lift, the settle,
    // the sway and the shadow. It never changes the card's box or any action's duration.
    const weight = weightOf(c.rank);
    // Picked toward a Bloom, or in the Bloom being painted: every one of its cards is lifted, and
    // by the same height whatever its number (owner, 2026-10-24: "all of them should be equally
    // lifted") — a group reads as one choice, not as one card and three stragglers.
    const inBloom = IS_FUTA04 && (bloomPick.includes(c.id) || (!!sel.kind?.startsWith('bloom-') && !sel.kind.startsWith('bloom-mega-') && kindCards(sel.kind).includes(c.id)));
    const liftWeight = inBloom ? BLOOM_LIFT_WEIGHT : weight;
    b.style.setProperty('--weight', weight.toFixed(3));
    b.style.setProperty('--lift', `${liftOf(liftWeight).toFixed(1)}px`);
    const shadow = shadowOf(weight);
    b.style.setProperty('--shadow-y', `${shadow.y.toFixed(1)}px`);
    b.style.setProperty('--shadow-blur', `${shadow.blur.toFixed(1)}px`);
    b.style.setProperty('--shadow-alpha', shadow.alpha.toFixed(3));
    if (i < BREATH.maxCards) {
      b.style.setProperty('--breath-period', `${breathPeriodOf(c.id)}ms`);
      b.style.setProperty('--breath-phase', `${breathPhaseOf(c.id)}ms`);
    }
    const off = i - (n - 1) / 2;
    const lifted = sel.card === c.id || picked.has(c.id) || bloomPick.includes(c.id) || inBloom;
    const playable = legal.length > 0 && usable.has(c.id);
    // v0.6: a Fruit card glows softly when it has a target now; dimmed, it says why (one line)
    const fs = c.suit === null ? fruitCardState(v, legal, c.id) : null;
    const firstFruit = c.suit === null && cards[i - 1]?.suit !== null && i > 0;
    b.className = `card ${suitClass(c)}${lifted ? ' lifted' : ''}${playable ? ' playable' : ''}${legal.length > 0 && !playable ? ' dim' : ''}${fs?.ready && myTurn() ? ' fruit-ready' : ''}${firstFruit ? ' fruit-gap' : ''}${coachCards.has(c.id) ? ' coach-glow' : ''}`;
    if (i >= BREATH.maxCards) b.classList.add('breath-off');
    // One of five baked amplitudes (never a custom property: see hand-breath-a* in style.css).
    else b.classList.add(`breath-a${breathAmpStep(weight)}`);
    if (IS_FUTA04) {
      // Picked toward a Bloom, or in the Bloom being painted: the Bloom's own aqua, as on the board.
      b.classList.toggle('futa04-bloom-pick', IS_FUTA04 && inBloom);
      b.classList.toggle('futa04-bloom-card', bloomCards.has(c.id) && !inBloom);
      b.classList.toggle('futa04-throw-picked', session!.pending?.t === 'Discard' && session!.pending.card === c.id);
    }
    if (fs?.reason && myTurn()) b.title = fs.reason;
    else b.removeAttribute('title');
    if (thumbLayout) {
      // the test copy's thumb layout: each card on the arc, turned with it; picked: lifted outward.
      // A heavier card comes out a little less (the 22 px sheet lift scaled to the fan's 10 px).
      const p = fanSlots(thumbLayout, n)[i]!;
      const lift = THUMB.lift * (liftOf(liftWeight) / 22);
      b.style.setProperty('--fx', `${p.x.toFixed(1)}px`);
      b.style.setProperty('--fy', `${p.y.toFixed(1)}px`);
      b.style.setProperty('--rot', `${p.rot.toFixed(2)}deg`);
      b.style.setProperty('--lx', `${(p.nx * lift).toFixed(1)}px`);
      b.style.setProperty('--ly', `${(p.ny * lift).toFixed(1)}px`);
      // each card's number corner stays visible: right hand, later cards on top; left, earlier
      b.style.zIndex = String(thumbLayout.side === 'left' ? n - i : i + 1);
    } else {
      b.style.zIndex = '';
      b.style.setProperty('--rot', `${(off * spread).toFixed(2)}deg`);
      b.style.setProperty('--dy', `${(off * off * 0.7).toFixed(1)}px`);
    }
    if (IS_FUTA04 && b.classList.contains('futa04-throw-picked')) b.style.zIndex = '100';
    b.classList.toggle('tutorial-target-card', tutorialCard === c.id);
    if (tutorialCard === c.id) b.style.zIndex = '100';
    b.style.visibility = hiddenCards.has(c.id) ? 'hidden' : '';
    b.setAttribute('aria-label', `${cardName(c)}${playable ? ', can be played' : ''}${fs?.reason && myTurn() ? `, ${fs.reason}` : ''}${lifted ? ', picked' : ''}${IS_FUTA04 && session!.pending?.t === 'Discard' && session!.pending.card === c.id ? ', swipe up or tap the Throw pile to throw it; tap it again to put it down' : ''}`);
    b.setAttribute('aria-pressed', String(lifted));
    const g = combos.get(c.id);
    if (g === undefined) delete b.dataset.combo;
    else b.dataset.combo = String(g % 3);
    b.classList.toggle('bloom-hint', bloomHintIds.has(c.id));
    if (hand.children[i] !== b) hand.insertBefore(b, hand.children[i] ?? null);
  });
  for (const b of existing.values()) b.remove();
  if (flip) {
    // Phase 4: a change in membership or order settles card by card, outward from the middle,
    // with a small weight-scaled overshoot. This is the existing FLIP condition, never a
    // re-render for selection or a phase tick.
    const settleMs = MOTION.consequence * timeScale();
    const stagger = (MOTION.ack / 2) * timeScale();
    const centre = (n - 1) / 2;
    [...hand.querySelectorAll<HTMLElement>('[data-card]')].forEach((b, i) => {
      const was = before.get(Number(b.dataset.card));
      const now = b.getBoundingClientRect();
      const dx = was === undefined ? 0 : was.left - now.left;
      const dy = was === undefined ? 0 : was.top - now.top;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        if (IS_FUTA04) {
          const weight = Number(b.style.getPropertyValue('--weight')) || 0;
          const over = settleOvershootOf(weight);
          const len = Math.hypot(dx, dy) || 1;
          // Continue a touch past the landing spot, then settle back into the fan.
          const ox = (-dx / len) * over;
          const oy = (-dy / len) * over;
          anim(b, [
            { translate: `${dx}px ${dy}px` },
            { translate: `${ox.toFixed(2)}px ${oy.toFixed(2)}px`, offset: 0.74 },
            { translate: '0 0' },
          ], {
            duration: settleMs,
            delay: Math.min(Math.abs(i - centre), 3) * stagger,
            easing: EASE.settle,
          });
        } else {
          anim(b, [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], {
            duration: 280 * timeScale(),
            easing: 'cubic-bezier(.2,.9,.3,1.25)',
          });
        }
      }
    });
  }
  const sortBtn = $('hand-sort');
  sortBtn.hidden = false;
  (sortBtn as HTMLButtonElement).disabled = n < 2;
  const sortWords = `Sorted ${settings.handSort === 'suit' ? 'by suit' : 'by number'}. Tap to sort ${settings.handSort === 'suit' ? 'by number' : 'by suit'}.`;
  sortBtn.setAttribute('aria-label', sortWords);
  sortBtn.title = sortWords;
  hand.style.setProperty('--n', String(n));
  hand.classList.toggle('waiting', !myTurn());
  // The first layout pass can run before the hand has cards. Establish the
  // Draw pile anchor as soon as its resting hand geometry exists; sorting only
  // reorders those cards and must never establish the anchor for the first time.
  if (IS_FUTA04 && v.phase === 'DRAW' && !drawPileAnchorKey) requestAnimationFrame(alignDrawPiles);
}

const rememberCardRects = () => {
  cardRects = new Map([...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((b) => [Number(b.dataset.card), b.getBoundingClientRect()]));
};

/** Part 3 C: the deck count last drawn (-1 before a game is shown) */
let lastDeckSeen = -1;
/** the biggest the piles have been this game (for the stack thickness) */
let deckFull = 1;

/**
 * The Throw pile's physical top card and its count — the only two things that change when a
 * thrown card ARRIVES. Split out so a landing flight can hand them over at the landing stop,
 * without a whole-page render mid-step (see the discard step).
 */
function paintDiscardTop() {
  const top = shownDiscard.at(-1);
  const t = $('discard-top');
  t.className = `pile-top${top ? ` card ${suitClass(top)}` : ' empty'}`;
  // Keep the physical top card mounted while its identity is unchanged.
  // Replacing it on every unrelated render restarted styling and DOM observers.
  const faceKey = top ? `${top.id}:${top.suit}:${top.rank}` : '';
  if (t.dataset.faceKey !== faceKey) {
    t.innerHTML = top ? cardFace(top) : '';
    t.dataset.faceKey = faceKey;
  }
  if (IS_FUTA04) renderPileMeter($('discard-count'), shownDiscard.length);
  else $('discard-count').textContent = String(shownDiscard.length);
}

function renderPiles(v: View, advice: Advice | null) {
  // The product keeps its Throw pile lit in the Throw step (owner, 2026-10-25). Classic copies
  // pass nothing and keep the old both-piles-dimmed look.
  const looks = pileStates(v.phase, myTurn(), busy(), session!.legal, IS_FUTA04);
  const top = shownDiscard.at(-1);
  paintDiscardTop();
  if (IS_FUTA04) renderPileMeter($('deck-count'), v.deckCount);
  else $('deck-count').textContent = String(v.deckCount);
  // UX pass: the last few cards: the count turns amber (the game ends when the deck runs out)
  const low = v.deckCount > 0 && v.deckCount <= 5 && v.phase !== 'GAME_OVER';
  $('deck').classList.toggle('low', low);
  // Part 3 C: the last card, and the deck running out, each get a small moment (Eye candy)
  const dm = deckMoment(lastDeckSeen, v.deckCount);
  if (lastDeckSeen >= 0 && dm && settings.eyeCandy && motion() > 0) {
    const df = Math.max(timeScale(), 0.35);
    if (dm === 'last') {
      anim($('deck'), [{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-3deg)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 600 * df, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      if (settings.sound) sound.chime();
    } else anim($('deck'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(0.9) translateY(4px)' }], { duration: 700 * df, easing: 'ease-out' });
  }
  lastDeckSeen = v.deckCount;
  // overhaul item 6: the stacks are as thick as the piles are big; the last card stands alone
  deckFull = Math.max(deckFull, v.deckCount + shownDiscard.length);
  $('deck').dataset.layers = String(stackLayers(v.deckCount, deckFull));
  $('discard').dataset.layers = String(stackLayers(shownDiscard.length, deckFull));
  $('deck').dataset.count = pileCountState(v.deckCount);
  $('deck').querySelector('.pile-label')!.textContent = v.deckCount === 1 && v.phase !== 'GAME_OVER' ? PILES.lastCard : PILES.draw;
  // Tap-to-throw: with a throw waiting, the Throw pile takes it (it stays tappable for that alone).
  const tossReady = !!session && myTurn() && !!throwPileAction(v.phase, session.pending, session.legal);
  for (const [id, look] of [['deck', looks.deck], ['discard', looks.discard]] as const) {
    const b = $(id) as HTMLButtonElement;
    b.disabled = !look.enabled && !(id === 'discard' && tossReady);
    b.classList.toggle('ready', look.glow);
    b.classList.toggle('dim', look.dim);
    // The swell lives on the selection seam (a picked Throw card) and on the flight that follows
    // it, so a pile never stays swollen after the throw.
    b.classList.toggle('futa04-throw-target', IS_FUTA04 && id === 'discard' && (tossReady || throwSwellHeld));
    const coachOn = !!advice && advice.action.t === 'Draw' && advice.action.from === id && look.enabled;
    b.classList.toggle('coach-glow', IS_FUTA04 ? false : coachOn);
    $(`${id}-hint`).textContent = look.hint ?? '';
  }
  if (IS_FUTA04) {
    // A new card combination, regardless of board space. Duplicate faces don't create one.
    const key = (cards: readonly Card[]) => cards.map(c => `${c.suit}:${c.rank}`).sort().join('|');
    const before = looks.discard.enabled && top ? new Set(bloomGroups(v.hand).map(g => key(g.cards))) : null;
    const createsBloom = !!before && !!top && bloomGroups([...v.hand, top]).some(g => !before.has(key(g.cards)));
    $('discard').classList.toggle('futa04-bloom-draw', looks.discard.enabled && createsBloom && bloomsShown());
  }
  $('deck').setAttribute('aria-label', `${PILES.draw}: ${plural(v.deckCount, 'card')}.${looks.deck.enabled ? ' Tap to draw.' : ''}`);
  $('discard').setAttribute('aria-label', top ? `${PILES.discard}: ${plural(v.discard.length, 'card')}, ${cardName(top)} on top.${looks.discard.enabled ? ' Tap to take it.' : tossReady ? ' Tap to throw your card.' : ''}` : `${PILES.discard}: empty${tossReady ? '. Tap to throw your card.' : ''}`);
}

function renderCoach(advice: Advice | null) {
  const box = $('coach');
  const showSummary = coach.step >= COACH_STEPS && !coach.summaryDone && session?.state.phase !== 'GAME_OVER';
  box.hidden = !(advice || showSummary) || busy() || (IS_FUTA04 && !myTurn());
  $('coach-advice').hidden = !advice;
  $('coach-summary').hidden = !showSummary || !!advice;
  if (advice) {
    $('coach-step').textContent = `${coach.step + 1} of ${COACH_STEPS}`;
    $('coach-suggested').textContent = advice.suggested;
    $('coach-why').textContent = advice.why.join(' ');
    const tip = $('coach-tip');
    tip.hidden = !advice.tip;
    tip.textContent = advice.tip ? advice.tip.text : '';
    $('coach-why').hidden = !coachWhyOpen;
    $('coach-why-btn').setAttribute('aria-expanded', String(coachWhyOpen));
    $('coach-why-btn').textContent = coachWhyOpen ? 'Less' : 'Why?';
    $('coach-show').textContent = guideGoal ? 'Hide arrow' : 'Show me where';
    $('coach-show').setAttribute('aria-pressed', String(!!guideGoal));
  } else if (showSummary && session) {
    $('coach-step').textContent = '';
    const sum = coachSummary(coach.taught, session.state.config);
    $('coach-summary-title').textContent = sum.title;
    $('coach-summary-list').replaceChildren(
      ...sum.bullets.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
  }
}

/**
 * The finish card's ONE disclosure (owner direction, 2026-10-16: "way shorter… no scrolling"). The
 * outcome, the final score, the ONE reason and a way forward are always on the card; every detail
 * line and every extra action carries `data-go-extra` and lives behind this. A mode marks an extra
 * as unavailable with `data-go-available="0"` (no big cut to replay, no one-card-move line), and the
 * disclosure hides itself when nothing is behind it. Shared by all three modes, so they cannot drift.
 */
let goExtrasOpen = false;
function syncGoExtras() {
  const extras = [...document.querySelectorAll<HTMLElement>('#gameover [data-go-extra]')];
  const available = extras.filter((el) => el.dataset.goAvailable !== '0');
  for (const el of extras) el.hidden = !(goExtrasOpen && el.dataset.goAvailable !== '0');
  const more = $('go-more');
  more.hidden = available.length === 0;
  more.textContent = goExtrasOpen ? RESULT.less : RESULT.more;
  more.setAttribute('aria-expanded', String(goExtrasOpen));
}
/** Marks one disclosure member as available this time (default: available). */
function setGoExtra(id: string, available: boolean) {
  const el = document.getElementById(id);
  if (el) el.dataset.goAvailable = available ? '1' : '0';
}
function setGoExtrasOpen(open: boolean) {
  goExtrasOpen = open;
  syncGoExtras();
}

/**
 * The finish card's one way to Territory (owner, 2026-10-30), with the payout. The rule is pure
 * (`territoryLinkVisible`); this owns the DOM's own evidence for it: the Seeds line is the payout,
 * and `goTerritoryIntro` marks the level-10 card that already carries its own "Open Territory" key.
 */
let goTerritoryIntro = false;
function syncTerritoryGrow(): void {
  const btn = document.getElementById('go-territory-grow');
  if (!btn) return;
  if (btn.textContent !== RESULT.growTiles) btn.textContent = RESULT.growTiles;
  const seeds = document.getElementById('go-seeds');
  const payout = !!seeds && !seeds.hidden && (seeds.textContent ?? '').trim() !== '';
  const reachable = FEATURES.campaign && onlineBuildEnabled() && !!onlineLobbyCtl && !goTerritoryIntro;
  btn.hidden = !territoryLinkVisible({ payout, reachable });
}

/** Paints the shared Seeds line empty: a mode that pays no Seeds (a duel) shows no line at all. */
function clearGoSeeds(): void {
  goSeedShown = null;
  paintSeedReward($('go-seeds'), { kind: 'none' }, { animate: false });
  syncTerritoryGrow();
}

/**
 * The finish card's Seeds line — the ONE place it is painted, for every mode and every path
 * (the first render, and the reward that arrives later from the server). The reward is not always
 * earned (a resignation or a timeout pays nothing, a win can be capped) and the number is verified
 * AFTER the card is on screen, so `paintSeedReward` owns all three states; here we only decide
 * whether its one moment may play, and it plays at most once per game (a re-render repaints still).
 */
function paintGoSeeds(): void {
  // The card re-renders (a resize, a late history fetch, the board toggle). Repainting the same
  // line would rebuild the row and snap a running count to its end, so the message is the guard:
  // unchanged means "already on the card", and only a real change paints again. The Territory key
  // is still synced on that path: its visibility depends on the line being there at all.
  if (goSeedShown === seedRewardMessage) {
    syncTerritoryGrow();
    return;
  }
  goSeedShown = seedRewardMessage;
  const view = seedReward(seedRewardMessage);
  const fresh = view.kind === 'award' && !goSeedSettled;
  if (view.kind === 'award') goSeedSettled = true;
  paintSeedReward($('go-seeds'), view, {
    animate: fresh && timeScale() > 0 && !settings.reduceMotion,
    scale: Math.max(timeScale(), 0.35),
    tick: (step, last) => { if (settings.sound) sound.seedTick(step, last); },
  });
  syncTerritoryGrow();
}

/**
 * The finish card's Seeds, settled for real (owner report, 2026-10-25).
 *
 * The card used to be handed a "pending" line before any receipt existed, from an optional-chained
 * call into the online lobby. Every failure mode of that shape ended the same way — a claim with no
 * receipt behind it, left on screen for the whole session:
 *
 *   * a fetch that never settles (a backgrounded mobile tab, a captured connection) wedged the
 *     single-flight entry, so no later proof was ever settled;
 *   * the lobby module not being mounted yet made the optional chain do nothing at all;
 *   * a proof refused with HTTP 400 was removed from the queue and then reported as "nothing
 *     happened", so the Seeds were lost with no word;
 *   * a pass that had already drained did not cover a proof queued after it started.
 *
 * `settleSeedProof` (online/seed-settle.ts) owns those: a bounded deadline, a small retry, and a
 * fresh pass for anything the previous one could not see. What this function owns is the TRUTH on
 * the card: an award with its one moment, the calm limit line, an honest refusal, or NOTHING while
 * it is still unknown. It never writes "pending", and it never guesses a number.
 */
function settleSeedsForCard(key: string): void {
  const run = ++goSeedsSettleRun;
  // The award's line gets its SLOT now, while the result is still animating in, so the number can
  // land without pushing the score and the keys down (the jump the owner saw). The slot is empty
  // until a receipt exists — it never says "pending".
  goSeedSlot = true;
  void settleSeedProof(key).then((report) => {
    // A newer game has started: its card is not this one's to paint.
    if (run !== goSeedsSettleRun) return;
    if (report.kind === 'settled') {
      // `replayed` means this receipt existed already: the line stays empty rather than counting a
      // second "+N" the wallet never received.
      seedRewardMessage = settledSeedsMessage(report.reward);
    } else if (report.kind === 'refused') {
      // The server will never accept this replay, so those Seeds are gone. Say so, and log why.
      console.warn('[FUTASAKU] Seeds refused for this game:', key, report.message);
      seedRewardMessage = SEEDS_NOT_VERIFIED;
    } else if (report.kind === 'unverified') {
      // There is no usable identity on this device. The proof is STILL QUEUED (the next pass — a
      // sign-in, a reload, a recovered guest — pays it), but the card says so instead of staying
      // silent, which was the old silent deferral loop (owner report, 2026-10-25).
      console.warn('[FUTASAKU] Seeds could not be settled: no usable identity:', report.message);
      seedRewardMessage = SEEDS_IDENTITY_UNVERIFIED;
    } else {
      // Still unconfirmed and still queued. The card shows NOTHING: the next menu visit (or the
      // next time this device is online) settles it, and the wallet is the one place it is claimed.
      seedRewardMessage = '';
    }
    // The reward can land while the finish card is already up: the SAME line repaints in place (no
    // reflow), and the award gets its one moment here rather than a silent swap.
    if (!$('gameover').hidden) paintGoSeeds();
  });
}

/**
 * The finish plate's arrival (owner brief, 2026-10-22): the board settles and goes quiet, then the
 * plate becomes present. `wasHidden` is the state transition (not a timer): a re-render of a card
 * already on screen must not replay the entrance, while a genuinely new result always does.
 */
/**
 * The result owns the screen. A duel can decide itself while a menu is open — the match clock keeps
 * running, and an opponent may resign or run out of time, so the finish lands on the next render —
 * and a match can end on the frame a plate is leaving. Either way the plate underneath showed its
 * header and its Settings key above the result card (owner's 2026-10-23 audit: "PAUSED" and
 * "Settings" floating over the loss plate at desktop size). So any open sheet is put away FIRST,
 * at once, and without handing the keyboard to a control the card now covers: the card is the only
 * surface left. The game is also un-paused, because a finished match is not a paused one.
 */
function putAwaySheetsForResult(): void {
  if (!openSheet && !closingSheet) return;
  sheetExit++; // any pending close is now stale
  sheetReturns.length = 0;
  sheetOpener = null;
  for (const el of [closingSheet, openSheet]) {
    if (!el) continue;
    resetSurface(el);
    el.hidden = true;
  }
  closingSheet = null;
  openSheet = null;
  $('scrim').hidden = true;
  setPaused(false);
  if (IS_FUTA04) {
    document.documentElement.classList.remove('futa04-information-blocked');
    updateFuta04Help();
  }
}

function presentResult(go: HTMLElement, wasHidden: boolean): void {
  putAwaySheetsForResult();
  // The result covers the board: a finger that was on it is released, as when a sheet opens.
  camera?.release();
  board.releasePress();
  document.body.classList.add('result');
  syncVeil();
  if (!wasHidden) return;
  go.dataset.fresh = '1';
  enterSurface(go, { travel: 0, scale: 1, duration: 150 });
  const card = go.querySelector<HTMLElement>('.go-card');
  if (card) enterSurface(card);
}
/** One exit for every path that puts the result away, so the board always comes back to life. */
function hideGameOver(): void {
  const go = $('gameover');
  if (!go.hidden) {
    go.hidden = true;
    resetSurface(go);
    const card = go.querySelector<HTMLElement>('.go-card');
    if (card) {
      resetSurface(card);
      card.classList.remove('seed-slot');
    }
    goSeedSlot = false;
  }
  document.body.classList.remove('result');
  syncVeil();
}

/**
 * The replay of the whole match (owner brief, 2026-10-25): one tap on the finish card, every mode.
 *
 * The player itself is mounted once, on the first use, so the finish card's cost is one lazily-built
 * overlay rather than a second board renderer in the boot path. Its motion gate is the game's own
 * (`motionOn`): Reduce motion, or Speed Off, means no crossfade and no settle — the board simply is
 * the next position, and the pacing is unchanged.
 */
let replayPlayer: ReplayHandle | null = null;

/** The model for the match just played offline (campaign, tutorial or practice), or null. */
function offlineReplayModel(): ReplayModel | null {
  const st = session;
  if (!st || !st.log.length) return null;
  // `session.start` is the exact opening this match was dealt (a lesson's authored position
  // included), so the replay begins on the board the player actually saw.
  const opening = st.start;
  const input: ReplayInput = {
    seed: opening.seed,
    config: opening.config,
    startingPlayer: opening.startingPlayer ?? opening.turnPlayer,
    base: opening,
    actions: [...st.log],
    // The player's own nickname when signed in (an online duel already names both players this way);
    // a guest stays "You".
    names: [signedInNickname() ?? REPLAY.you, OPP.label],
    me: 0,
  };
  return buildReplay(input);
}

/** The model for a finished ONLINE duel, from the server's replay payload. */
function replayModelFromPayload(payload: ReplayPayload): ReplayModel | null {
  if (!payload.actions.length) return null;
  const nameOf = (seat: Player): string =>
    payload.seats.find((s) => s.seat === seat)?.displayName ?? `Seat ${seat + 1}`;
  return buildReplay({
    seed: payload.seed,
    rulesVersion: payload.rulesVersion,
    config: payload.config,
    startingPlayer: payload.startingPlayer,
    actions: payload.actions,
    names: [nameOf(0), nameOf(1)],
    me: payload.seat,
    result: payload.result
      ? { winner: payload.result.winner, scores: payload.result.scores, reason: payload.result.reason }
      : null,
  });
}

/** The finish card's replay control is shown only when there is something to watch. */
function setReplayAvailable(available: boolean): void {
  const btn = document.getElementById('go-replay');
  if (!btn) return;
  btn.hidden = !available;
  const label = document.getElementById('go-replay-label');
  if (label) label.textContent = REPLAY.watch;
  btn.setAttribute('aria-label', REPLAY.watch);
}

function showReplay(model: ReplayModel): void {
  if (!replayPlayer) {
    replayPlayer = mountReplay({
      theme,
      look,
      reduceMotion: () => !motionOn(),
      onExit: () => {
        // The finish card was never touched: it is exactly where the player left it.
        const anchor = document.getElementById('go-replay');
        if (anchor && !$('gameover').hidden) anchor.focus({ preventScroll: true });
      },
    });
  }
  replayPlayer.open(model);
}

/** Open the replay for THIS finish card, in whichever mode the match was played. */
async function openReplayForFinish(): Promise<void> {
  const go = $('go-replay');
  go.setAttribute('aria-busy', 'true');
  try {
    const os = isOnlineDuel() ? getOnlineSession() : null;
    const model = os ? replayModelFromPayload(await os.driver.replay()) : offlineReplayModel();
    if (model) showReplay(model);
    else caption(REPLAY.unavailable, null, 'info');
  } catch {
    caption(REPLAY.unavailable, null, 'info');
  } finally {
    go.removeAttribute('aria-busy');
  }
}

/**
 * Open a PAST duel's replay from the online match list. The lobby owns the identity and the token,
 * so IT makes the authorised read (`GET /v1/matches/:id/replay`) and hands the payload here.
 */
function openPastReplay(payload: ReplayPayload): void {
  const model = replayModelFromPayload(payload);
  if (model) showReplay(model);
  else caption(REPLAY.unavailable, null, 'info');
}

/**
 * Paint the outcome without changing its words. A campaign win reads `Level 12 complete` exactly
 * as before (finish-fit and the screen reader see the same sentence); the two halves are only
 * wrapped so the eye sees LEVEL 12 over COMPLETE. The space between them is a real text node.
 */
function paintGoTitle(text: string, split: boolean): void {
  const el = $('go-title');
  const at = split ? text.lastIndexOf(' ') : -1;
  if (at <= 0) {
    el.textContent = text;
    return;
  }
  const kicker = document.createElement('span');
  kicker.className = 'go-kicker';
  kicker.textContent = text.slice(0, at);
  const outcome = document.createElement('span');
  outcome.className = 'go-outcome';
  outcome.textContent = text.slice(at + 1);
  el.replaceChildren(kicker, document.createTextNode(' '), outcome);
}

// ---------- the final move's own gate ----------

/**
 * THE RESULT WAITS FOR THE MOVE, NOT FOR A CLOCK (owner, 2026-10-25: the losing seat was getting
 * "you lost" before the winning move landed). The decision itself is pure and unit-tested
 * (`logic/result-hold.ts`); this is only the safety net around it.
 *
 * The net is a STALL timer, never a fixed delay: it measures how long the held board has been
 * completely still (no step landed, no tile revealed, the queue unchanged). A real finish keeps
 * landing beats, so it can never be cut short; a lost step — the one case where the plate would
 * otherwise never arrive — is released after `RESULT_HOLD_STALL_MS`, flushing the board to its true
 * final position first.
 */
let resultHoldWatch = 0;
let resultHoldSeen = '';
let resultHoldSince = 0;

const resultHoldSignature = (): string => `${revealProgress}|${queue.pending}|${currentStep?.k ?? '-'}`;

function armResultHold(): void {
  if (resultHoldWatch) return;
  resultHoldSeen = resultHoldSignature();
  resultHoldSince = performance.now();
  resultHoldWatch = window.setInterval(checkResultHold, 250);
  animLog('result:hold', { queued: queue.pending, playing: currentStep?.k ?? '-' });
}

function disarmResultHold(): void {
  if (!resultHoldWatch) return;
  clearInterval(resultHoldWatch);
  resultHoldWatch = 0;
  resultHoldSeen = '';
  resultHoldSince = 0;
}

function checkResultHold(): void {
  const os = getOnlineSession();
  if (!os?.finished || !$('gameover').hidden) {
    disarmResultHold();
    return;
  }
  // PAUSED: the player deliberately stopped the board, so silence is not a stall and cutting the
  // finish short would be wrong — park the clock exactly as the reveal watchdog does.
  //
  // `document.hidden` is deliberately NOT parked. A backgrounded tab cannot let the player watch
  // anything anyway, and parking on it made the hold wait forever for a tab nobody was looking at
  // (which is what a second tab in a two-seat test always is). The stall window still keeps the
  // ordinary guarantee: a lost step releases the plate, it is just measured while hidden too.
  if (paused) {
    resultHoldSince = performance.now();
    resultHoldSeen = resultHoldSignature();
    return;
  }
  const seen = resultHoldSignature();
  if (seen !== resultHoldSeen) {
    resultHoldSeen = seen;
    resultHoldSince = performance.now();
    return;
  }
  const quiet = performance.now() - resultHoldSince;
  if (!resultHoldStalled(quiet)) return;
  // A held board that has been silent for the whole window cannot settle on its own. Show the
  // truth (every waiting step applied) and the card, instead of hanging on a lost step.
  animLog('result:hold-release', { quiet: Math.round(quiet), queued: queue.pending, playing: currentStep?.k ?? '-' });
  markTiming('result:safety', { quiet: Math.round(quiet) });
  fastForward();
  disarmResultHold();
}

/**
 * THE FINISH CARD'S STAMP (surprise, 2026-10-29): one small figure of the final position, painted
 * into the card that already exists — no panel, tab, badge or ornament, nothing behind "More". It is
 * static: the SVG is one string, and the only motion is the card's own entering fade (the
 * `.go-verdict` rule in style.css). The one-line summary beside it was removed (owner, 2026-10-30).
 */
function paintVerdict(figure: HarvestFigure | null): void {
  const box = document.getElementById('go-verdict');
  const fig = document.getElementById('go-harvest');
  if (!box || !fig) return;
  if (figure) {
    fig.innerHTML = harvestSvg(figure);
    fig.hidden = false;
  } else {
    fig.replaceChildren();
    fig.hidden = true;
  }
  box.hidden = !figure;
}

/** The stamp for a FINISHED offline match: its final board (known even when the event record is not). */
function offlineVerdict(st: State): HarvestFigure | null {
  return st.result ? harvestFigure(st.board, st.config, HUMAN, st.terrain) : null;
}

function renderGameOver() {
  const go = $('gameover');
  if (isOnlineDuel()) {
    const os = getOnlineSession();
    const info = os?.finishInfo() ?? null;
    // THE FINAL MOVE IS SEEN FIRST (owner, 2026-10-25). A decided match still does not go back to
    // waiting on the clock: this waits on the BOARD, and only while a move is actually changing it.
    // A timeout or a resignation carries no move at all, so its queue is empty and the card arrives
    // at once; a reconnecting client that opens an already-finished match has nothing queued either.
    const wasHidden = !!go.hidden;
    const wanted = !!info && !gameOverDismissed && !$('game').hidden;
    // `isPreparingCatchUp` covers the one render that runs INSIDE `consumeCatchUp` (its own
    // `skipCatchUp()` emit) before the deciding move's steps reach the queue — see duel-session.ts.
    const settled = wanted && !os?.isPreparingCatchUp && boardHasSettled({
      waiting: queue.kinds(),
      playing: currentStep?.k ?? null,
      reducedMotion: settings.reduceMotion,
    });
    // Once the plate is up, a later render of the same match never takes it down (only `wanted`
    // can: leaving, or the player dismissing it).
    const show = wanted && (!wasHidden || settled);
    if (!show) {
      go.hidden = true;
      document.body.classList.remove('result');
      syncVeil();
      if (wanted) armResultHold();
      else disarmResultHold();
      return;
    }
    disarmResultHold();
    if (!info || !os) return;
    go.hidden = false;
    if (wasHidden) animLog('result:show', { queued: queue.pending, playing: currentStep?.k ?? '-', revision: os.driver.snapshot().revision });
    presentResult(go, wasHidden);
    // A duel settles its own wallet server-side, and this paragraph is SHARED by every mode — so it
    // is reset first, or the previous offline game's "+15 Seeds" would appear on a duel's card.
    // Then the one honest line: what the server reported this seat was paid (owner, 2026-10-24:
    // "seeds pending or shit like that"). No payload carries that award yet, so this is silence in
    // practice — and it must be, because a daily cap pays 0 and a resignation pays nothing, so any
    // number the client worked out for itself would be a guess. See `duelSeedsMessage`.
    goTerritoryIntro = false;
    $('go-territory').hidden = true;
    clearGoSeeds();
    const snapshot = os.driver.snapshot();
    seedRewardMessage = duelSeedsMessage(snapshot.seeds ?? null);
    paintGoSeeds();
    // The match's whole public history is one fetch; when it lands, re-render so the highlights are
    // the real ones (offline's are computed from the same event list). Fetched at most once.
    if (!os.historyLoaded && !os.historyLoading) {
      os.historyLoading = true;
      void os.loadHistory().then(() => {
        os.historyLoading = false;
        if (isOnlineDuel()) render();
      });
    }
    const won = info.title === RESULT.won;
    const draw = info.title === RESULT.draw;
    // Count this ONLINE finish for the install invitation too — an online-only player must reach
    // the trigger. Once per match: the finish screen re-renders, so the match id is the guard.
    const matchId = snapshot.matchId;
    if (onlineResultNoted !== matchId) {
      onlineResultNoted = matchId;
      installPrompt.noteFinished(won ? 'won' : draw ? 'draw' : 'lost');
    }
    $('go-title').textContent = info.title;
    // A duel has no campaign level: its context is the opponent line in #go-sub, never a kicker.
    $('go-context').textContent = '';
    $('go-context').hidden = true;
    // Context only — never a repeat of the reason (offline shows the level line here).
    $('go-sub').textContent = info.sub;
    $('go-reason').textContent = info.reason;
    $('go-score').innerHTML = `<span class="you">${info.scores[0]}</span><span class="dash">–</span><span class="bot">${info.scores[1]}</span>`;
    // THE DOUBLE HARVEST: the duel's final board. A pruned or refused history never withholds it
    // (owner, 2026-10-30): the position on screen is the match's own final board.
    const harvest = info.harvest ?? harvestFigure(os.state.board, os.state.config, HUMAN, os.state.terrain);
    paintVerdict(harvest);
    $('go-break').textContent = info.breakdown;
    $('go-moves').textContent = info.moves ?? '';
    setGoExtra('go-moves', !!info.moves);
    $('go-highlights').replaceChildren(
      ...info.highlights.map((h) => {
        const li = document.createElement('li');
        li.className = h.by === HUMAN ? 'you' : h.by === BOT ? 'bot' : '';
        li.innerHTML = `<span class="h-value num">${h.value}</span><span class="h-title">${h.title}</span><span class="h-text">${h.text}</span>`;
        return li;
      }),
    );
    // The record line counts offline games only — never leak it onto a server match.
    $('go-stats').textContent = '';
    setGoExtra('go-stats', false);
    // A duel has no offline cut replay to offer, and no replayable log to review.
    setGoExtra('go-cut', false);
    // It DOES have a replay of the whole match (owner brief, 2026-10-25), whenever at least one
    // move was committed — so the one entry sits on the card beside the ways forward.
    setReplayAvailable(snapshot.revision > 0);
    // The owner's ask: a REAL rematch leads the finish screen, ahead of the old "back out" that
    // used to sit in this slot. Back to matches and Menu stay, as secondary ways out
    // (`bind('go-rematch')` starts the rematch; `bind('go-other')` is Back to matches).
    $('go-rematch').textContent = ONLINE.rematch;
    $('go-rematch').setAttribute('aria-label', ONLINE.rematch);
    const other = $('go-other');
    other.hidden = false;
    other.textContent = ONLINE.backToMatches;
    other.setAttribute('aria-label', ONLINE.backToMatches);
    $('go-menu').textContent = ONLINE.menuButton;
    $('go-menu').setAttribute('aria-label', ONLINE.menuButton);
    $('go-share').textContent = RESULT.share;
    go.className = `gameover ${won ? 'won' : draw ? 'draw' : 'lost'}`;
    // A fresh finish starts folded: the card shows the result and the ways forward, nothing else.
    if (wasHidden) setGoExtrasOpen(false);
    else syncGoExtras();
    // The primary action takes focus the moment the screen appears, exactly as offline does.
    if (wasHidden) $('go-rematch').focus();
    return;
  }
  const st = session?.state;
  const wasHidden = !!go.hidden;
  const show = !!st && st.phase === 'GAME_OVER' && !!st.result && !busy() && !gameOverDismissed && !$('game').hidden;
  if (go.hidden === !show) {
    if (!show) document.body.classList.remove('result');
    return;
  }
  go.hidden = !show;
  if (!show || !st?.result) {
    document.body.classList.remove('result');
    syncVeil();
    return;
  }
  presentResult(go, wasHidden);
  // Hold the Seeds line's slot from the card's first frame while a proof settles (see
  // `settleSeedsForCard`): the award lands IN PLACE instead of pushing the card's content down.
  go.querySelector<HTMLElement>('.go-card')?.classList.toggle('seed-slot', goSeedSlot);
  const r = st.result;
  const won = r.winner === HUMAN;
  const campaign = campaignLevel;
  // Which kind of campaign match this was (owner, 2026-10-24): a TUTORIAL replay returns to the
  // Tutorial it came from; a REPLAY of a level behind the place has no next level to lead to.
  const tutorial = !!campaign && tutorialReplay;
  const replay = !!campaign && !tutorial && campaignReplay;
  // The next level the win unlocked (null on a loss, on a replay, in a tutorial, and past the last
  // built level — read from the level data, never a hardcoded count, so a worker adding levels
  // needs no change here).
  const next = campaign && won && !tutorial && !replay ? nextCampaignLevel(campaign.number) : null;
  $('go-title').textContent = won
    ? campaign ? CAMPAIGN.levelWon(campaign.number) : RESULT.won
    : resultTitle(r, HUMAN);
  // The campaign's own lockup: LEVEL 12 over COMPLETE (same sentence, different shape).
  if (campaign && won && $('go-title').textContent === CAMPAIGN.levelWon(campaign.number)) {
    paintGoTitle(CAMPAIGN.levelWon(campaign.number), true);
  }
  // A loss keeps the honest outcome words; the level rides above them as context, never as a
  // second title. A win already names the level, so the context line stays away — except in the
  // Tutorial, where the win's title is the lesson's own and the line says where the card returns to.
  const context = document.getElementById('go-context');
  if (context) {
    const label = tutorial
      ? `${TUTORIAL_REPLAY.title} · ${CAMPAIGN.levelLabel(campaign.number)}`
      : campaign && !won ? CAMPAIGN.levelLabel(campaign.number) : '';
    context.textContent = label;
    context.hidden = label === '';
  }
  // The subtitle used to name the level ("Level 6 · Branching Out"). The owner removed level and
  // chapter NAMES everywhere (2026-10-16): the title already says which level it was, so naming it
  // again below was repetition, and "Branching Out" tells a player nothing they can use. What is
  // left is the one genuinely useful note — what the win unlocked.
  if (campaign) {
    const note = tutorial || replay
      ? ''
      : next
        ? CAMPAIGN.unlockedNext()
        : won && !next ? CAMPAIGN.chapterDone : '';
    $('go-sub').textContent = note;
    $('go-sub').hidden = note === '';
  } else {
    // A practice match: which difficulty it was — never the internal opponent level (owner).
    $('go-sub').textContent = RESULT.practice(currentMatchLabel());
    $('go-sub').hidden = false;
  }
  // What this level was teaching, said back to the player once they have won it: the "you did it,
  // and here is what you just learned" beat. Only on a guided level, only on a win. Guarded by id:
  // a stale cached shell without the line must not break the finish card.
  // A lesson's finish card says how it was won, in one line (and its title is the lesson's own).
  const taught = lessonActive();
  if (taught && won) paintGoTitle(taught.finish.title, false);
  const learned = taught
    ? (won ? `${LESSON.learned}: ${taught.finish.learned}` : '')
    : campaign && won ? ONBOARD.recap(campaign.number) : '';
  const learnedEl = document.getElementById('go-learned');
  if (learnedEl) {
    learnedEl.textContent = learned;
    learnedEl.dataset.icon = taught?.finish.icon ?? '';
    learnedEl.hidden = learned === '';
  }
  // The owner's rule (2026-10-16): after a WON campaign level the first button is "Next level" — the
  // next level starts straight away, with no walk back to the list to pick it. The last built level
  // has no next, so that same button becomes the honest way out (the level list) rather than a dead
  // one. A loss and a plain offline game keep the retry/again words they always had. Which one leads
  // is decided in one pure place (`finishLead`), and the next level is read from the level DATA.
  const lead = finishLead({ online: false, campaign: !!campaign, won, hasNext: !!next, tutorial, replay });
  const leadWord = lead === 'next-level' ? CAMPAIGN.nextLevel
    : lead === 'back-to-campaign' ? CAMPAIGN.back
    : lead === 'back-to-tutorial' ? TUTORIAL_REPLAY.back
    : won ? 'Play again' : 'Try again';
  $('go-rematch').textContent = leadWord;
  $('go-rematch').setAttribute('aria-label', leadWord);
  // Lessons 1-9 pay no Seeds: no Seeds line at all on their finish card. Level 10 pays 100 once, and
  // its won card says what Seeds and Territory are, with the way there (owner, 2026-10-24).
  if (taught && taught.level !== FINAL_LESSON.level) seedRewardMessage = '';
  const territoryIntro = !!taught && taught.level === FINAL_LESSON.level && won && onlineBuildEnabled() && !!onlineLobbyCtl;
  // The intro card already carries its own "Open Territory" key, so the payout's own key steps
  // aside there instead of offering the same destination twice (owner, 2026-10-30).
  goTerritoryIntro = territoryIntro;
  paintGoSeeds();
  $('go-territory-earned').textContent = SEEDS_INTRO.earned;
  $('go-territory-spend').textContent = SEEDS_INTRO.spend;
  $('go-territory').hidden = !territoryIntro;
  $('go-territory-open').textContent = SEEDS_INTRO.open;
  $('go-territory-open').hidden = !territoryIntro;
  syncTerritoryGrow();
  const other = $('go-other');
  // On the last level, on a replay and in the Tutorial the primary already IS the way back to the
  // list/Tutorial: one action, not two that do the same thing (the online rematch keeps its own
  // secondary, untouched). On the tutorial's last card, Open Territory takes the second place
  // (the card never grows a row).
  other.hidden = lead === 'back-to-campaign' || lead === 'back-to-tutorial' || territoryIntro;
  const otherWord = campaign ? CAMPAIGN.back : 'Change difficulty';
  other.textContent = otherWord;
  other.setAttribute('aria-label', otherWord);
  $('go-menu').textContent = RESULT.backToMenu;
  $('go-menu').setAttribute('aria-label', RESULT.backToMenu);
  go.className = `gameover ${r.winner === HUMAN ? 'won' : r.winner === null ? 'draw' : 'lost'}`;
  $('go-score').innerHTML = `<span class="you">${r.scores[HUMAN]}</span><span class="dash">–</span><span class="bot">${r.scores[BOT]}</span>`;
  // overhaul item 20: the final score counts up once, calmly (not with Reduce motion or Speed Off)
  if (timeScale() > 0 && !settings.reduceMotion && !goCounted) {
    goCounted = true;
    const els = [$('go-score').querySelector('.you')!, $('go-score').querySelector('.bot')!];
    const to = [r.scores[HUMAN], r.scores[BOT]];
    const t0 = performance.now();
    const tick = ({ now }: { now: number }) => {
      const k = Math.min(1, (now - t0) / 900);
      const e = 1 - (1 - k) ** 3;
      els.forEach((el, i) => (el.textContent = String(Math.round(to[i]! * e))));
      if (k < 1) scheduler.request('result-score', tick);
    };
    scheduler.request('result-score', tick);
  }
  setGoExtra('go-cut', !!session?.biggestCut);
  // Every offline match — practice, campaign and a tutorial replay — can be watched back from its
  // own log in memory. There is no stored list offline (owner's decision, 2026-10-25).
  setReplayAvailable(!!session && session.log.length > 0);
  $('go-share').textContent = RESULT.share;
  $('go-reason').textContent = taught ? '' : resultReason(r, HUMAN);
  if (taught) $('go-sub').hidden = true;
  // THE DOUBLE HARVEST (surprise, 2026-10-29): this match's final position, stamped as one small
  // figure. (The one-line summary that sat beside it was removed, owner 2026-10-30.)
  paintVerdict(offlineVerdict(st));
  // UX pass: what I did with the one-card move
  const moves = moveSummary(st.history ?? [], HUMAN);
  $('go-moves').textContent = moves ?? '';
  setGoExtra('go-moves', !!moves);
  $('go-break').textContent = RESULT.breakdown(breakdownPart(st, HUMAN), breakdownPart(st, BOT));
  $('go-stats').textContent = statsLine(stats);
  setGoExtra('go-stats', true);
  $('go-highlights').replaceChildren(
    ...gameHighlights(st.history ?? [], HUMAN).map((h) => {
      const li = document.createElement('li');
      li.className = h.by === HUMAN ? 'you' : h.by === BOT ? 'bot' : '';
      li.innerHTML = `<span class="h-value num">${h.value}</span><span class="h-title">${h.title}</span><span class="h-text">${h.text}</span>`;
      return li;
    }),
  );
  // A fresh finish starts folded (see the online branch): the card shows the result and the ways
  // forward, and the details wait behind "More" — that is what keeps it on one phone screen.
  if (wasHidden) setGoExtrasOpen(false);
  else syncGoExtras();
  $('go-rematch').focus();
}

// ---------- history ----------

function renderHistory() {
  $('history').replaceChildren(
    ...log.map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
}

// ---------- input ----------

/** Drop bloom paint / menu chrome without touching session selection or undo history. */
function clearBloomPaintUi() {
  bloomMenu = false;
  draw = { ...DRAW0 };
  board.ghost(null);
}

/**
 * UNDO BRINGS THE LAST EXPLANATION BACK (owner, 2026-10-21: "after closing, clicking undo shows it
 * again" — and explicitly even if it had already been read). Taking a move back means the player is
 * about to redo it, so the sentence that taught it is worth re-reading; it is the same beat, so the
 * words are unchanged.
 *
 * Implemented by forgetting that this beat was read: `lessonSeen` is what suppresses it, so removing
 * the id re-opens the box on the next render. The read clock is reset too, so the fresh showing gets
 * its own full 3 s floor rather than inheriting an already-expired one.
 *
 * Levels 1-3 never reach here: there every non-lit control is refused, so Undo does not undo.
 */
function lessonReopenExplanation() {
  if (!lessonActive() || !lessonExplainId) return;
  const opened = lessonSeen.delete(lessonExplainId);
  if (!opened) return;
  saveLessonMeta();
  lessonShownKey = '';
  lessonExplainId = '';
  lessonExplainAt = 0;
  render();
}

/** Takes back the player's last move of this turn (nothing hidden was revealed by it). */
function undoMove() {
  if (!session) return;
  note({ t: 'undo', at: Date.now() });
  fastForward();
  const before = session.state.board;
  if (isOnlineDuel()) {
    const os = getOnlineSession();
    if (!os || !os.undo()) return;
    syncSessionFromOnline(true);
    paintOnlineHudFromSession();
  } else if (!session.undo()) return;
  // An undo inside a lesson re-opens the sentence that taught the move being taken back.
  lessonReopenExplanation();
  // Overhaul item 9: the move runs backwards (its tiles sink away, cut tiles come back),
  // with a falling sound and a light double tap. The state itself is restored exactly.
  const after = session.state.board;
  const gone = Object.keys(before).filter((k) => before[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const back = Object.keys(after).filter((k) => after[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (settings.sound) sound.undo(undoPitches(gone.length));
  const hp = hapticFor('undo', settings);
  if (hp) vibrate(true, hp as number | number[]);
  const f = timeScale();
  if (f > 0 && !settings.reduceMotion) {
    for (const k of gone) {
      const el = board.tile(k);
      if (!el) continue;
      const ghost = el.cloneNode(true) as SVGGElement;
      ghost.classList.add('undo-ghost');
      el.parentNode?.appendChild(ghost);
      removeAfter(anim(ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55) translateY(4px)' }], { duration: 260 * f, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }), ghost, 320 * f);
    }
    requestAnimationFrame(() => {
      for (const k of back) anim(board.tile(k), [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 240 * f, delay: 120 * f, easing: 'ease-out', fill: 'backwards' });
    });
  }
  queue.reset(session.state.board);
  const v = session.view;
  shownScores = [v.score, v.opponentScore];
  scars = [];
  // Same paint/menu chrome cancelSel clears — render's !many path alone leaves bloomMenu open.
  clearBloomPaintUi();
  inspectKey = null;
  guideGoal = null;
  log.unshift('You took back a move.');
  save();
  render();
  smartCockpit?.hint('UNDONE');
}

/** Cards picked toward a Bloom by hand (BLOOM BY HAND in onCardTap); empty when nothing is held. */
let bloomPick: number[] = [];

function cancelSel() {
  bloomPick = [];
  clearBloomPaintUi();
  session?.cancel();
  inspectKey = null;
  cardPinned = false;
  render();
}

/** A clear choice (one move on the picked spot) plays at once: no Confirm, Undo can take it back. */
function maybeAutoPlay() {
  if (!session || !myTurn() || busy()) return;
  // Futa04 commits a complete card-and-target Sprout, including Strengthen. Blooms finish
  // through the drawing path (a painted shape of any size), so an inferred placement never spends
  // a partly chosen group. A Blast is a whole move at a target like a Sprout: it plays on the tap.
  const sprout = IS_FUTA04 && (session.sel.kind === null || session.sel.kind === 'sprout') ? onlyChoice(session.view, session.legal, { ...session.sel, kind: 'sprout' }) : null;
  // A Blast has no single card (it is a recipe), so it needs its own one-tap path: the tap on a
  // legal target is the whole move, exactly like Grow. Without this the recipe fell through to
  // the old "tap the tile again" confirmation (f24fdc8's intent, which never reached the board).
  const blast = IS_FUTA04 ? playNowBlast(session.view, session.legal, session.sel) : null;
  const a = blast ?? sprout ?? playNow(session.view, session.legal, session.sel) ?? (settings.confirmPolicy === 'never' ? onlyChoice(session.view, session.legal, session.sel) : null);
  if (a && (!IS_FUTA04 || a.t !== 'Bloom') && !asksConfirm(a)) humanPlay(a);
}

/** Overhaul item 8: does this move wait for Confirm? (the "Confirm moves" setting and the forecast) */
function asksConfirm(a: Action): boolean {
  if (IS_FUTA04 && a.t === 'Discard') return true;
  // Futa04's board moves are all one tap: Grow, Bloom, a Fruit card and now Blast place at once,
  // and Undo is the safety net (owner's rule, 2026-10-14: Blast no longer asks for a second tap).
  if (IS_FUTA04 && futa04OneTap(a)) return false;
  return !!session && needsConfirm(settings.confirmPolicy, forecastMove(session.view, a));
}

function onCardTap(id: number) {
  sound.unlock();
  if (!session) return;
  // Mid-reveal a tap must not skip the enemy's turn (and must not start mine early).
  if (onlineGateShut()) return revealWaitNotice();
  if (busy()) fastForward();
  if (!myTurn()) return;
  // Before the draw a card cannot be used yet. It used to be selected silently, so the tap looked
  // broken; now it says why, at the card.
  if (IS_FUTA04 && !coach.tutorial && session.view.phase === 'DRAW') {
    const card = document.querySelector<HTMLElement>(`.hand .card[data-card="${id}"]`);
    const r = card?.getBoundingClientRect();
    if (r) sayWhyAtPoint(r.left + r.width / 2, r.top + r.height / 2, TAP_WHY.draw, document.body);
    return;
  }
  if (IS_FUTA04 && session.view.phase === 'ACT') {
    const hasCombo = session.legal.some(a => a.t === 'Bloom' || a.t === 'MegaBomb');
    const matchingBlooms = bloomKindsForCard(id);
    const inBloomCard = matchingBlooms.length > 0;
    const sameAgain = session.sel.card === id || (bloomPick.length === 1 && bloomPick[0] === id);
    // NO ROOM (tester report, 2026-10-27): the card is part of a set or run in the hand, but the
    // board has no room to grow it, so no Bloom is legal and the tap is an ordinary card pick. Say
    // why on the display instead of leaving the player to read the silence as a bug. Words only:
    // the tap itself does exactly what it did before.
    if (!inBloomCard && bloomNoRoom(session.view, session.legal, id) !== null) smartCockpit?.hint('NO ROOM');
    if (grewThisTurn() && hasCombo) {
      // Bloom-related card: first tap stays on Bloom; tapping the same card again
      // (or any non-Bloom card) moves to Throw select → next tap confirms.
      if (!inBloomCard || sameAgain) {
        const end = session.legal.find(a => a.t === 'EndAct');
        if (end) {
          humanPlay(end);
          session.tapCard(id);
          render();
          return;
        }
      }
    }
    // BLOOM BY HAND (owner, 2026-10-23). A card that can bloom is first only PICKED (lifted, aqua):
    //   - the same card again: it is played as a plain one-tile Grow;
    //   - another card that blooms with it: both are held, and the player picks the rest from the
    //     hand; the moment the picked cards ARE a Bloom, it is time to paint it on the board;
    //   - while a Bloom is being painted, a card that makes it one longer extends it, a card of
    //     the Bloom puts it down, and any other card is chosen as usual.
    const painting = !!session.sel.kind?.startsWith('bloom-') && !session.sel.kind.startsWith('bloom-mega-');
    const clearPaint = () => { session!.cancel(); draw = { ...DRAW0 }; board.ghost(null); bloomMenu = false; };
    if (painting) {
      const group = kindCards(session.sel.kind!);
      if (group.includes(id)) {
        clearPaint();
        bloomPick = [];
        render();
        return;
      }
      const longer = bloomKindsWith([...group, id]).find((k) => kindCards(k.kind).length === group.length + 1);
      if (longer) {
        sound.click();
        beginBloomKind(longer.kind, group[0] ?? id);
        smartCockpit?.hint('BLOOM');
        render();
        return;
      }
      if (inBloomCard) {
        clearPaint();
        bloomPick = [id];
        sound.click();
        hintBloomPick();
        render();
        return;
      }
    }
    if (bloomPick.length === 1 && bloomPick[0] === id) {
      // The second tap on the same card: a plain one-tile Grow (chosen below, as any card is).
      bloomPick = [];
    } else if (bloomPick.includes(id)) {
      bloomPick = bloomPick.filter((x) => x !== id);
      hintBloomPick();
      render();
      return;
    } else if (inBloomCard) {
      const next = [...bloomPick, id];
      const fits = bloomKindsWith(next);
      // A card that does not bloom with the ones held starts a fresh pick of its own.
      bloomPick = fits.length ? next : [id];
      const exact = fits.length && next.length >= 3 ? fits.find((k) => kindCards(k.kind).length === next.length) : undefined;
      sound.click();
      clearPaint();
      inspectKey = null;
      if (exact) {
        beginBloomKind(exact.kind, sameFaceIn(exact.kind, next[0]!));
        bloomPick = [];
        smartCockpit?.hint('BLOOM');
      } else hintBloomPick();
      render();
      return;
    } else if (bloomPick.length) {
      // a card that cannot bloom ends the pick and is chosen as usual
      bloomPick = [];
    }
    // The double-Bomb recipe is entered only through its cockpit control.
    // Picking a Bomb from the hand remains the existing single-card action.
    if (session.sel.kind?.startsWith('bloom-mega-') && session.view.hand.some(c=>c.id===id && c.suit===null)) session.cancel();
  }
  // The classic / test copies: no Confirm box, tapping a card of the waiting move again places it.
  // The product Throw step is NOT in this path: a second tap on the picked card deselects, and a
  // card tap never throws (owner, 2026-10-25). Throws are the swipe, the pile drop, or a pile tap.
  if (FEATURES.tapAgain && session.pending && tapAgainPlays(session.pending, id, IS_FUTA04)) return humanPlay(session.pending);
  sound.click();
  pickFruit(id);
  inspectKey = null;
  // a Fruit card with nothing to do says why, in one line
  if (session.view.hand.find((c) => c.id === id)?.suit === null) {
    const why = fruitCardState(session.view, session.legal, id).reason;
    if (why) caption(why, null, 'info');
  }
  // Classic only: tapping a card throws it directly (only the last card asks first, per "Confirm
  // moves"). The product always selects first and throws by gesture, never by card tap.
  if (!IS_FUTA04 && session.view.phase === 'DISCARD' && session.pending?.t === 'Discard' && !asksConfirm(session.pending)) return humanPlay(session.pending);
  // A card with just one place to grow picks it at once: one tap plays it (Undo takes it back).
  if (session.sel.card !== null && session.sel.hex === null && (!IS_FUTA04 || session.view.hand.find(c => c.id === session!.sel.card)?.suit !== null)) {
    const only = [...targetHexes(session.view, session.legal, session.sel)];
    if (only.length === 1) session.tapHex(only[0]!);
  }
  render();
  maybeAutoPlay();
}

// ---------- painting a Bloom (v0.7) ----------

type Ptr = { id: number; last: Pt; start: Pt; moved: boolean; downKey: string | null; type: string; cur: string | null; viewport: string };
type DrawUi = {
  shape: string[]; reverse: boolean; desk: Desk; ptr: Ptr | null; msg: string | null;
  mouseLast?: Pt | null; redraw?: boolean; suggested?: boolean;
  /** Natural first tile from beginBloomKind — first tap must not undo it. */
  autoStart?: boolean;
};
const DRAW0: DrawUi = { shape: [], reverse: false, desk: DESK_IDLE, ptr: null, msg: null };
let draw: DrawUi = { ...DRAW0 };
let drawFrame = 0;
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** The picked Bloom while painting is possible (my Grow step, a Bloom picked), else null. */
let comboMemo: { state: unknown; sel: unknown; combo: Combo | null } | null = null;
function drawCombo(): Combo | null {
  if (!session || !myTurn() || busy() || session.view.phase !== 'ACT') return null;
  // worked out once per position and selection, not on every pointer move
  if (comboMemo?.state !== session.state || comboMemo.sel !== session.sel) comboMemo = { state: session.state, sel: session.sel, combo: comboFor(session.view, session.legal, session.sel) };
  return comboMemo.combo;
}

/** Reverse so a tapped high-end card becomes the first painted bloom tile. */
function bloomReverseForCard(combo: Combo, cardId: number | null): boolean {
  if (!combo.run || cardId == null || !session) return false;
  const card = session.view.hand.find((c) => c.id === cardId);
  if (!card) return false;
  const low = combo.ranks[0]!;
  const high = combo.ranks[combo.n - 1]!;
  return card.rank === high && card.rank !== low;
}

/**
 * Enter a Bloom recipe. Futa04 never pre-plants: empty shape + lit legal starts; the player
 * places the first tile (then draw / endpoint / 1-by-1). Classic still plants the natural
 * first hex. When `cardId` is the high end of a run, paint highest-first so that card is tile one.
 */
function beginBloomKind(kind: string, cardId: number | null = null): boolean {
  if (!session || !kind.startsWith('bloom-') || kind.startsWith('bloom-mega-')) return false;
  bloomMenu = false;
  bloomPick = [];
  session.preset(null);
  const card = cardId ?? kindCards(kind)[0] ?? null;
  session.sel = { card, hex: null, kind, option: 0 };
  comboMemo = null;
  const combo = comboFor(session.view, session.legal, session.sel);
  const reverse = combo ? bloomReverseForCard(combo, card) : false;
  draw = { ...DRAW0, reverse };
  board.ghost(null);
  if (!combo) return true;
  // Futa04: recipe entry leaves an empty shape; starts light via drawNext([], …).
  if (IS_FUTA04) return true;
  const start = naturalBloomStart(combo, board.rootKey(HUMAN), reverse);
  if (start) {
    const planted = paintEnter(combo, [], start, reverse);
    draw = { ...DRAW0, reverse, shape: planted, autoStart: planted.length === 1 };
  }
  return true;
}

/** Bloom recipes in the hand that use this card (by suit/rank copy). */
function bloomKindsForCard(id: number) {
  if (!session) return [];
  const card = session.view.hand.find((c) => c.id === id);
  if (!card || card.suit === null) return [];
  return moveButtons(session.view, session.legal, EMPTY_SEL, true).filter(
    (k) =>
      k.kind.startsWith('bloom-') &&
      !k.kind.startsWith('bloom-mega-') &&
      kindCards(k.kind).some((cid) => {
        const other = session!.view.hand.find((c) => c.id === cid);
        return !!other && other.suit === card.suit && other.rank === card.rank;
      }),
  );
}

/** A card's face (suit and number): copies of the same face are interchangeable in a Bloom. */
const faceOf = (id: number): string => {
  const c = session?.view.hand.find((x) => x.id === id);
  return c ? `${c.suit}:${c.rank}` : '';
};

/** The Bloom recipes that hold every one of these cards (by face, so copies are interchangeable). */
function bloomKindsWith(ids: readonly number[]) {
  if (!session) return [];
  const want = ids.map(faceOf);
  return moveButtons(session.view, session.legal, EMPTY_SEL, true).filter((k) => {
    if (!k.kind.startsWith('bloom-') || k.kind.startsWith('bloom-mega-')) return false;
    const have = kindCards(k.kind).map(faceOf);
    for (const w of want) {
      const at = have.indexOf(w);
      if (at < 0) return false;
      have.splice(at, 1);
    }
    return true;
  });
}

/** The card of `kind` with the same face as `id` (the recipe may name another copy of it). */
function sameFaceIn(kind: string, id: number): number {
  const cards = kindCards(kind);
  return cards.includes(id) ? id : cards.find((c) => faceOf(c) === faceOf(id)) ?? cards[0] ?? id;
}

/** The display counts what is left to pick: "PICK 2 MORE", "PICK 1 MORE" (the shortest Bloom). */
function hintBloomPick() {
  if (!bloomPick.length) return;
  const fits = bloomKindsWith(bloomPick);
  const shortest = fits.reduce((n, k) => Math.min(n, kindCards(k.kind).length), Infinity);
  const left = Number.isFinite(shortest) ? shortest - bloomPick.length : 0;
  if (left > 0) smartCockpit?.hint(`PICK ${left} MORE`);
}

/** The ghost of the shape being painted right now (null when nothing is painted). */
function drawGhostNow(c: Combo): DrawGhost | null {
  const v = session!.view;
  if (draw.desk.phase === 'live') return deskShape(v, c, draw.desk, draw.reverse);
  return draw.shape.length ? paintGhost(v, c, draw.shape, draw.reverse) : null;
}

/** Repaints only the ghost layer and the info card (no full board redraw), once per frame. */
function paintDraw() {
  updateFuta04MoveActive();
  cancelAnimationFrame(drawFrame);
  drawFrame = requestAnimationFrame(() => {
    try {
      const c = drawCombo();
      if (!c || !session) return;
      const g = session.presetMove ? null : drawGhostNow(c);
      const shape = draw.desk.phase === 'live' ? g?.tiles.map(tile=>tile.key) ?? [] : draw.shape;
      const blocked = session.presetMove ? [] : [...unavailable(session.view, c, shape, draw.reverse).keys()];
      board.ghost(g || blocked.length ? {
        tiles: g?.tiles ?? [],
        blocked: !!g && !g.action && g.tiles.length === c.n,
        unavailable: blocked,
        cursor: focusKey && document.activeElement === $('board') ? focusKey : null,
      } : null);
      renderDrawInfo(c, g);
      // Keep next-hex wells in sync with the painted path (ghost layer alone used to lag).
      refreshBoardDrag();
    } catch (error) {
      // A preview must never take the page down. Drop the ghost and leave the paint state for the
      // next frame; the commit path has its own calm refusal (see `humanPlay`).
      console.error('paint preview failed', error);
      board.ghost(null);
    }
  });
}

/** The info card above the board: the counter, the result chip or why not, in plain words (also read out). */
function renderDrawInfo(c: Combo, g: DrawGhost | null) {
  const box = $('draw-info');
  const v = session!.view;
  let text = '';
  if (session!.presetMove) text = '';
  else if (g?.action) {
    const pv = previewMove(v, g.action);
    text = IS_FUTA04
      ? `${c.n}/${c.n}${pv?.warning ? ` · ${pv.warning}` : ''}${draw.msg ? ` · ${draw.msg}` : ''}`
      : `${c.n}/${c.n} · ${pv?.chip ?? ''}${pv?.warning ? ` · ${pv.warning}` : ''}`;
  } else if (g?.reason) text = draw.msg ? `${g.reason} · ${draw.msg}` : g.reason;
  else if (draw.msg) text = draw.msg;
  box.textContent = text;
  box.hidden = !text;
  const n = g?.tiles.length ?? 0;
  $('draw-live').textContent = g?.action ? `${n} of ${c.n} hexes chosen. ${previewMove(v, g.action)?.chip ?? ''}` : n ? `${n} of ${c.n} hexes chosen` : '';
}

/** A soft rising tick and a light haptic for each hex added (Sound and Vibration toggles). */
function drawTick(i: number) {
  if (settings.sound) sound.grow([pitchLadder(i + 1, 0)[i]!], 0);
  vibrate(settings.vibration, 6);
}

function cancelDraw(msg: string | null = null) {
  if (draw.suggested) session?.preset(null);
  draw = { ...DRAW0, reverse: draw.reverse, msg };
  board.ghost(null);
  render();
}

/** Flips which end of a run gets the lowest number (only shown for runs). */
function toggleReverse() {
  const c = drawCombo();
  if (!c) return;
  if (draw.suggested) session!.preset(null);
  draw = { ...draw, reverse: !draw.reverse, suggested: false };
  // keep only the part of the shape that still fits the flipped numbers
  const kept: string[] = [];
  for (const k of draw.shape) {
    const next = paintEnter(c, kept, k, draw.reverse);
    if (next.length === kept.length) break;
    kept.push(k);
  }
  draw = { ...draw, shape: kept };
  render();
}

/** A finished shape: placed at once, or shown with Confirm (the "Confirm moves" setting). */
function finishDraw(a: Meld) {
  draw = { ...DRAW0, reverse: draw.reverse };
  board.ghost(null);
  if (asksConfirm(a)) {
    session!.preset(a);
    render();
  } else humanPlay(a);
}

/**
 * A tap on a hex while painting (no drag). The first tap on an empty shape also shows the
 * suggested Bloom through that hex (with its result chip and Confirm); tapping on adds hexes
 * one by one (every Bloom can be made by taps alone); a mouse uses the two-click machine.
 */
function drawTap(c: Combo, key: string, type: string) {
  const v = session!.view;
  if (draw.desk.phase === 'live' && draw.desk.trail?.at(-1) === key) {
    const traced = paintMatch(c,draw.desk.trail,draw.reverse);
    if (traced) return finishDraw(traced);
  }
  if (IS_FUTA04 && (draw.shape.length === 1 || draw.desk.phase === 'live')) {
    const start = draw.desk.phase === 'live' ? draw.desk.start : draw.shape[0]!;
    const shortcut = endpointBloom(c, start, key, draw.reverse, v);
    if (shortcut) return finishDraw(shortcut);
  }
  if (((type === 'mouse' || type === 'keyboard') && draw.shape.length === 0) || draw.desk.phase === 'live') {
    const r = deskClick(draw.desk, key, v, c, draw.reverse);
    if (r.finish) {
      // The desktop shape grows toward the pointer, so hovering rock can still suggest a
      // legal nearby clump. Futa04 finishes only when the chosen hex belongs to that clump.
      if (IS_FUTA04 && !r.finish.hexes.some((h) => coordKey(h) === key)) {
        draw = { ...draw, desk: deskHover(draw.desk, key), msg: 'Choose a glowing hex' };
        board.shake(settings.reduceMotion);
        paintDraw();
        return;
      }
      return finishDraw(r.finish);
    }
    // a click on another legal start begins again from there
    if (draw.desk.phase === 'live' && r.desk.phase === 'live' && key !== draw.desk.start && drawStarts(c, draw.reverse).has(key) && !deskShape(v, c, r.desk, draw.reverse).action) {
      draw = { ...draw, desk: { phase: 'live', start: key, hover: key }, shape: [] };
    } else draw = { ...draw, desk: r.desk, shape: [] };
    if (r.desk.phase === 'live' && draw.desk.phase === 'live') { draw.mouseLast = draw.ptr?.start ?? null; drawTick(0); }
    paintDraw();
    return;
  }
  if (draw.suggested) session!.preset(null);
  // Auto-planted natural start: tapping that sole hex must place/continue, not undo.
  if (draw.autoStart && draw.shape.length === 1 && key === draw.shape[0]) {
    paintDraw();
    return;
  }
  const next = paintTap(c, draw.shape, key, draw.reverse);
  if (next.length > draw.shape.length) drawTick(next.length - 1);
  else if (next.length === draw.shape.length && !draw.shape.includes(key)) {
    // The shape did not change. Say why (or at least that this hex cannot come next) — a finger
    // that gets no answer reads as "painting is broken", which is exactly what the two-phone
    // playtest reported. Never leave it silent.
    draw = { ...draw, msg: unavailable(v, c, draw.shape, draw.reverse).get(key) ?? BLOOM.nextHint };
    board.shake(settings.reduceMotion);
  }
  draw = {
    ...draw,
    shape: next,
    suggested: false,
    autoStart: next.length > 1 ? false : !!draw.autoStart,
    msg: next.length !== draw.shape.length ? null : draw.msg,
  };
  const m = paintMatch(c, next, draw.reverse);
  if (m) return finishDraw(m);
  // the one-tap suggestion: a first tap shows the best Bloom through this hex, ready to confirm
  if (!IS_FUTA04 && next.length === 1 && draw.shape.length === 1) {
    const s = suggestBloom(v, c.actions, key);
    if (s) {
      session!.preset(s);
      draw = { ...draw, suggested: true };
      render();
      return;
    }
  }
  render();
}

/**
 * The hex a FINGER is actually over, read from what is drawn (the cell under the touch), rather
 * than re-derived from the lattice maths. A finger lands on a hex — never in a gap — and on a
 * rotated (seat 1) board the maths can round an edge tap to the neighbour, which silently painted
 * the wrong tile (the dead end the two-phone playtest hit). A mouse keeps the maths, so the
 * desktop paint machine (and its gap tolerance) is untouched.
 */
const hexUnderFinger = (e: PointerEvent): string | null => {
  if (e.pointerType === 'mouse') return null;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el?.closest?.('.hex-cell');
  const key = cell instanceof HTMLElement ? cell.dataset.key : undefined;
  return key && board.boardKeys.includes(key) ? key : null;
};

const drawHandlers = {  down(p: Pt, e: PointerEvent) {
    const c = drawCombo();
    if (!c || !session) return;
    if (e.button === 2) return cancelDraw();
    // a second finger (a pinch, a scroll) cancels the painting
    if (draw.ptr && draw.ptr.id !== e.pointerId) return cancelDraw();
    const keys = new Set(board.boardKeys);
    const key = hexUnderFinger(e) ?? hexAtPoint(p.x, p.y, keys);
    if (!IS_FUTA04 && session.presetMove && !draw.suggested) {
      // painting again over a waiting preview: the preview goes (and the one-placement shortcut
      // does not bring it straight back while this painting is on)
      session.preset(null);
      draw = { ...draw, redraw: true };
      render();
    }
    draw.ptr = { id: e.pointerId, last: p, start: p, moved: false, downKey: key, type: e.pointerType, cur: key, viewport: `${innerWidth}:${innerHeight}` };
    // a hex is added when the finger lifts (a tap) or starts to move (a drag), not on touch
    paintDraw();
  },
  move(p: Pt, e: PointerEvent) {
    const c = drawCombo();
    if (!c) return;
    const keys = new Set(board.boardKeys);
    // after a first click the live shape follows the pointer, button held or not
    if (draw.desk.phase === 'live') {
      const crossed = hexesAlong(draw.mouseLast ?? p,p,keys);
      draw.mouseLast = p;
      const k = crossed.at(-1) ?? hexAtPoint(p.x,p.y,keys);
      if (k && (k !== draw.desk.hover || crossed.length > 1)) {
        let desk: Desk = draw.desk;
        for (const entered of crossed) desk = deskTrace(c,desk,entered,draw.reverse);
        draw = { ...draw, desk:deskHover(desk,k), msg: IS_FUTA04 ? null : draw.msg };
        paintDraw();
      }
      if (draw.ptr && Math.hypot(p.x - draw.ptr.start.x, p.y - draw.ptr.start.y) > S * 0.25) draw.ptr.moved = true;
      return;
    }
    if (!draw.ptr || e.pointerId !== draw.ptr.id) return;
    const ptr = draw.ptr;
    // Chromium can synthesize a move in the newly rotated coordinate system
    // before dispatching resize. It must not count as painting backwards.
    if (ptr.viewport !== `${innerWidth}:${innerHeight}`) { draw.ptr = null; return; }
    if (!ptr.moved && Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y) > S * 0.25) {
      ptr.moved = true;
      if (IS_FUTA04 && session!.presetMove) {
        session!.preset(null);
        draw = { ...draw, redraw: true };
      }
      // a drag begins with the hex it started on (a drag from a suggestion reshapes it)
      if (draw.suggested) {
        session!.preset(null);
        draw = { ...draw, suggested: false, shape: ptr.downKey && draw.shape[0] === ptr.downKey ? [ptr.downKey] : [] };
      }
      // Legal start under the finger replaces any auto-planted natural start so the drag path
      // is not backtracked when it crosses that planted hex (board touch-drag Bloom commit).
      const next = paintDragBegin(c, draw.shape, ptr.downKey, draw.reverse);
      if (next.length && next.join('|') !== draw.shape.join('|')) drawTick(next.length - 1);
      draw = { ...draw, shape: next, msg: null };
    }
    // only hexes the finger moves INTO count (fast swipes are sampled so none is skipped)
    const entered: string[] = [];
    for (const k of hexesAlong(ptr.last, p, keys)) {
      if (k === ptr.cur) continue;
      entered.push(k);
      ptr.cur = k;
    }
    ptr.last = p;
    if (!ptr.moved) return;
    let shape = draw.shape;
    let msg = draw.msg;
    for (const k of entered) {
      const next = paintEnter(c, shape, k, draw.reverse);
      if (next.length > shape.length) {
        drawTick(next.length - 1);
        msg = null;
        shape = next;
        continue;
      }
      // Moving onto a hex the path cannot simply extend: if it can legally BE the last tile, the
      // tentative end follows the finger instead of needing a drag back first (owner, 2026-10-25).
      // A refused retarget changes nothing, so the shape can never pick up a gap or an illegal end.
      const retargeted = next.length === shape.length && !shape.includes(k) ? paintRetarget(c, shape, k, draw.reverse) : null;
      if (retargeted) {
        shape = retargeted;
        msg = null;
        continue;
      }
      if (next.length === shape.length && !shape.includes(k)) msg = unavailable(session!.view, c, shape, draw.reverse).get(k) ?? msg;
      shape = next;
    }
    draw = { ...draw, shape, msg };
    paintDraw();
  },
  up(p: Pt, e: PointerEvent, inside: boolean) {
    const c = drawCombo();
    const ptr = draw.ptr;
    if (!c || !ptr || ptr.id !== e.pointerId) return;
    draw.ptr = null;
    if (ptr.type === 'mouse' && draw.desk.phase === 'idle') draw.mouseLast = ptr.start;
    if (IS_FUTA04 && !inside) return cancelDraw('Painting cancelled');
    if (!ptr.moved) {
      // A coach/list/sole-placement preview is a complete choice. Selecting one of its
      // ghost hexes places it, while an ordinary first touch keeps choosing the shape.
      const preset = session!.presetMove;
      if (IS_FUTA04 && preset?.t === 'Bloom') {
        if (ptr.downKey && preset.hexes.some((h) => coordKey(h) === ptr.downKey)) return finishDraw(preset);
        session!.preset(null);
        draw = { ...draw, redraw: true };
      }
      if (ptr.downKey) drawTap(c, ptr.downKey, ptr.type);
      return;
    }
    // lifting the finger outside the board: nothing is placed
    if (!inside) return cancelDraw('Painting cancelled');
    // a live two-click shape dragged and released: it finishes where it was released
    if (draw.desk.phase === 'live') {
      const at = hexAtPoint(p.x, p.y, new Set(board.boardKeys));
      // A release in a gap must not substitute the last legal hovered destination.
      if (IS_FUTA04 && !at) return cancelDraw('Painting cancelled');
      const k = at ?? draw.desk.hover;
      return drawTap(c, k, ptr.type);
    }
    const g = drawGhostNow(c);
    if (g?.action) return finishDraw(g.action);
    // released early: the partial shape stays (with Clear); a full shape that can't go shakes
    if (draw.shape.length === c.n) {
      board.shake(settings.reduceMotion);
      if (settings.sound) sound.illegal();
      draw = { ...draw, msg: paintProblem(session!.view, c, draw.shape, draw.reverse) };
    }
    render();
  },
  cancel() {
    if (draw.ptr || draw.shape.length || draw.desk.phase === 'live') cancelDraw();
  },
};

/** After the one Grow, a tap above the cockpit (board) skips optional Bloom → Throw. */
function trySkipBloomToThrow(): boolean {
  if (!IS_FUTA04 || !session || !myTurn() || busy()) return false;
  if (session.view.phase !== 'ACT' || !grewThisTurn()) return false;
  if (draw.shape.length || draw.ptr || session.sel.kind?.startsWith('bloom-')) return false;
  if (!session.legal.some(a => a.t === 'Bloom' || a.t === 'MegaBomb')) return false;
  const end = session.legal.find(a => a.t === 'EndAct');
  if (!end) return false;
  // `auto`: this EndAct is the app's own jump to Throw, not a move the player made, so it must not
  // become an undo stop of its own (see Session.play).
  humanPlay(end, { auto: true });
  return true;
}

/** Bloom paint: empty / off-shape tap steps back one hex; past the first fully unpicks. */
function bloomStepBack(): boolean {
  if (!IS_FUTA04 || !session || !drawCombo()) return false;
  if (draw.shape.length > 0) {
    const next = draw.shape.slice(0, -1);
    if (!next.length) {
      cancelDraw();
      session.cancel();
      render();
      return true;
    }
    draw = { ...draw, shape: next, msg: null };
    paintDraw();
    render();
    return true;
  }
  if (session.sel.card !== null || session.sel.kind !== null) {
    session.cancel();
    render();
    return true;
  }
  return false;
}

/** How long the same reason stays quiet, so hammering a stone never turns into a chant. */
const WHY_QUIET_MS = 4500;
let whyEl: HTMLElement | null = null;
let whyReason = '';
let whyAt = 0;
let whyTimer = 0;

/**
 * Says, at the tapped hex and for a moment, why nothing happened. One line at a time, never over the
 * hand or the cockpit, never blocking the next tap, and a plain fade with Reduce motion.
 */
function sayWhy(key: string, reason: string) {
  if (!IS_FUTA04 || document.hidden || !session) return;
  const p = boardWrapPoint(key);
  sayWhyAtPoint(p.x, p.y, reason, $('board-wrap'));
}

/**
 * The same answer, placed anywhere (a card in the hand sits outside the board's box, so its plate is
 * fixed to the viewport). Shared by the hex and the card paths so the wording and the quiet period
 * are one rule.
 */
function sayWhyAtPoint(x: number, y: number, reason: string, host: HTMLElement | null) {
  if (!IS_FUTA04 || document.hidden || !session) return;
  // A lesson answers its own taps (glass or LED).
  if (lessonActive()) return;
  // No text on the map: the answer goes to the LED, the spot gets only a small ring.
  if (smartCockpit) {
    const now = performance.now();
    if (whyReason === reason && now - whyAt < WHY_QUIET_MS) return;
    whyAt = now;
    whyReason = reason;
    const r = (host ?? $('board-wrap')).getBoundingClientRect();
    const px = host && host.id !== 'board-wrap' ? x : r.left + x;
    const py = host && host.id !== 'board-wrap' ? y : r.top + y;
    if (!settings.reduceMotion) {
      const ring = document.createElement('div');
      ring.className = 'lesson-tap-ring';
      ring.setAttribute('aria-hidden', 'true');
      ring.style.left = `${px}px`;
      ring.style.top = `${py}px`;
      document.body.append(ring);
      window.setTimeout(() => ring.remove(), 650);
    }
    smartCockpit.event({ message: reason.toUpperCase(), priority: 40, duration: 1700 });
    return;
  }
  const now = performance.now();
  if (whyReason === reason && now - whyAt < WHY_QUIET_MS) return;
  whyAt = now;
  whyReason = reason;
  whyEl?.remove();
  const el = document.createElement('div');
  el.className = host && host.id !== 'board-wrap' ? 'tap-why fixed' : 'tap-why';
  el.dataset.reason = reason;
  // A spoken status, not decoration: a player using a screen reader gets the same answer.
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = reason;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (!(settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches)) el.classList.add('rise');
  // NOT #captions: the product cockpit hides the board's caption layer by design, so the answer
  // lives on the board itself, where the finger landed.
  (host ?? $('board-wrap')).append(el);
  // Never off the edge or under the header: the plate is centred, then pulled in.
  const half = el.offsetWidth / 2;
  const lift = el.offsetHeight * 1.4;
  const box = (host ?? $('board-wrap')).getBoundingClientRect();
  const minX = (host?.id === 'board-wrap' ? 0 : box.left) + half + 6;
  const maxX = (host?.id === 'board-wrap' ? box.width : box.right) - half - 6;
  el.style.left = `${Math.min(Math.max(x, minX), maxX)}px`;
  el.style.top = `${Math.max(y, lift + 8)}px`;
  whyEl = el;
  clearTimeout(whyTimer);
  whyTimer = window.setTimeout(() => {
    el.remove();
    if (whyEl === el) whyEl = null;
  }, 1700);
}

function onHexTap(key: string) {
  sound.unlock();
  if (!session) return;
  // Mid-reveal a tap must not skip the enemy's turn: the board is still changing under it.
  if (onlineGateShut()) return revealWaitNotice();
  if (busy()) fastForward();
  // Bloom undo / unpick on a hex that is not continuing the paint (still allow the
  // first→last endpoint shortcut used by Futa04 Bloom).
  if (IS_FUTA04 && myTurn() && session.view.phase === 'ACT' && (session.sel.kind?.startsWith('bloom-') || draw.shape.length)) {
    const combo = drawCombo();
    const onShape = draw.shape.includes(key);
    const nextOk = combo ? drawNext(combo, draw.shape, draw.reverse).has(key) : false;
    const startOk = combo && !draw.shape.length ? drawStarts(combo, draw.reverse).has(key) : false;
    const endOk = combo && draw.shape.length === 1
      ? bloomEndpoints(combo, draw.shape[0]!, draw.reverse).has(key)
      : false;
    if (!onShape && !nextOk && !startOk && !endOk) {
      if (bloomStepBack()) return;
    }
  }
  // A tap that can do nothing says why, at the hex. It never blocks the tap: the same tap still
  // unpicks, inspects or boinks exactly as before.
  const why = session ? whyNotTap(session.view, session.legal, session.sel, key) : null;
  if (why) sayWhy(key, why);
  const idleGrowSpot = IS_FUTA04 && myTurn() && session.view.phase === 'ACT' &&
    session.sel.card === null && session.sel.kind === null && !session.view.board[key] &&
    session.legal.some(a => a.t === 'Sprout' && coordKey(a.coord) === key);
  if (IS_FUTA04 && (!myTurn() ||
      (session.view.phase !== 'ACT' && session.view.phase !== 'ROT_PICK') ||
      (session.view.phase === 'ACT' && ((!idleGrowSpot && session.sel.card === null && session.sel.kind === null) ||
        hexTapIntent(session.view, session.legal, session.sel, key) === 'tilecard')))) {
    if (trySkipBloomToThrow()) return;
    boinkTile(key);
    return;
  }
  reactHome(key);
  if (!myTurn() || (session.view.phase !== 'ACT' && session.view.phase !== 'ROT_PICK')) {
    pinCard(inspectKey === key && cardPinned ? null : key);
    return;
  }
  sound.click();
  // An opponent tile the picked card cannot take (or any opponent tile with nothing picked)
  // opens its tile card, which offers "Use Fruit card". The picked card stays picked.
  if (session.view.phase === 'ACT' && hexTapIntent(session.view, session.legal, session.sel, key) === 'tilecard') {
    pinCard(inspectKey === key && cardPinned ? null : key);
    return;
  }
  cardPinned = false;
  // Tapping the previewed hex again plays the move (same as Confirm).
  if (session.sel.hex === key && session.pending && (!IS_FUTA04 || (session.pending.t !== 'Bloom' && session.pending.t !== 'Sprout'))) return humanPlay(session.pending);
  session.tapHex(key);
  inspectKey = session.pending ? null : key;
  render();
  maybeAutoPlay();
}

function onInspect(key: string | null) {
  if (IS_FUTA04) {
    if (!session?.sel.kind?.startsWith('bloom-mega-') || busy()) return;
    if (blastHoverKey !== key) { blastHoverKey = key; renderBoard(session.view,null); }
    return;
  }
  // hovering never moves a pinned tile card
  if (cardPinned) return;
  inspectKey = key;
  if (session) renderTooltip(session.view);
}

/** Futa04 idle touch response. Never select a tile or change the session. */
function boinkTile(key: string) {
  if (!session?.view.board[key]) return;
  sound.click();
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tile = session.view.board[key]?.root
    ? board.homeEls.find(home=>home.dataset.key === key) : board.tile(key);
  if (!tile) return;
  for (const animation of tile.getAnimations()) if (animation.id === 'futa04-boink') animation.cancel();
  tile.classList.add('futa04-boink');
  const animation = anim(tile, [
    { scale:'1', rotate:'0deg' },
    { scale:'.97', rotate:'-1.2deg', offset:.25 },
    { scale:'1.025', rotate:'.8deg', offset:.6 },
    { scale:'1', rotate:'0deg' },
  ], { duration:240, easing:'ease-out', fill:'none' });
  if (!animation) { tile.classList.remove('futa04-boink'); return; }
  animation.id = 'futa04-boink';
  const clear = () => { if (!tile.getAnimations().some(a=>a.id === 'futa04-boink' && a.playState !== 'finished' && a.playState !== 'idle')) tile.classList.remove('futa04-boink'); };
  void animation.finished.then(clear,clear);
}

/** Step 4: tapping a home: the tree's heartbeat and rustle, or the volcano's thump and rumble. */
function reactHome(key: string) {
  const p = board.homeEls.findIndex((g) => g.dataset.key === key);
  if (p < 0 || board.homeEls[p]!.classList.contains('strangled')) return;
  if (!settings.reduceMotion) pulseLandmark(board.homeEls[p]!, 'tapped');
  if (p === HUMAN) sound.rustle();
  else sound.rumble();
}

/** Opens (and keeps open) the tile card for `key`, or closes it (null). Long-press does the same. */
function pinCard(key: string | null) {
  if (IS_FUTA04) { if (key) boinkTile(key); return; }
  inspectKey = key;
  cardPinned = key !== null;
  render();
}

/** "Use Fruit card" in the tile card: the Fruit card and this target are picked (Confirm per "Confirm moves"). */
function useFruitOn(key: string) {
  if (!session) return;
  const offer = fruitOffer(session.view, session.legal, key);
  if (!offer) return;
  sound.click();
  session.cancel();
  pickFruit(offer.action.card);
  session.tapHex(key);
  inspectKey = null;
  cardPinned = false;
  render();
  maybeAutoPlay();
}

/** Picks a card in the hand; a Fruit card's first pick shows the "any strength" note once. */
function pickFruit(id: number) {
  if (!session) return;
  session.tapCard(id);
  if (session.sel.card === id && session.view.hand.find((c) => c.id === id)?.suit === null && !tipsSeen.fruitAny) {
    anyNoteCard = id;
    tipsSeen = markTip(tipsSeen, 'fruitAny');
    store.set(TIPS_KEY, JSON.stringify(tipsSeen));
  }
}
/** The Fruit card the "any strength" note is shown for (the first one picked). */
let anyNoteCard: number | null = null;

function replayBotTurn() {
  if (!session || busy()) return;
  const turn = session.lastTurnOf(BOT);
  if (!turn.length) return;
  session.cancel();
  replaying = true;
  replaySpeed = REPLAY_SPEED;
  // In-game replay: a readable beat between the enemy's actions.
  replayBeats = true;
  sound.reset(); // the same steps pick the same variations as the first time
  queue.reset(turn[0]!.before.board);
  const v0 = viewFor(turn[0]!.before, HUMAN);
  shownScores = [v0.score, v0.opponentScore];
  for (const p of turn) {
    rememberRemoved(p.steps, p.before);
    queue.push(p.steps.filter((s) => s.k !== 'end' && s.k !== 'turn' && !(s.k === 'draw' && s.player === HUMAN)));
  }
  const v = session.view;
  queue.push([{ k: 'sync', board: session.state.board, scores: [v.score, v.opponentScore] }]);
  // It is a REPLAY, and it is the OPPONENT'S: the product's own display (the LED sign) says so
  // for the whole turn and its glass dims, the same way an online reveal marks "not ours".
  // `banner()` is deliberately a no-op on the product channels, so relying on it alone left this
  // replay with no on-screen label at all. Legacy channels keep the banner they always had.
  if (IS_FUTA04) {
    theirsDim.begin();
    if (smartCockpit) {
      // `immediate`: the board starts moving on this frame, so the sign must not wait out the
      // display's dwell behind the step cue already on the glass. MEASURED by removing this flag:
      // the word then appeared 856 ms into the replay (moving) / 806 ms (Reduce motion), during
      // which the sign still read "0:1" while the board was already moving. With it: 15 ms / 14 ms.
      smartCockpit.led('REPLAY', { immediate: true });
      replaySignHeld = true;
    }
  } else {
    banner(`Replay: ${OPP.Label} turn`, 'bot');
  }
  render();
  void pump();
}

/**
 * The same replay, ONLINE: the opponent's last turn rebuilt from the match's public history.
 *
 * It goes through the SAME machinery as offline (`queue.reset(startBoard)` → its steps → a closing
 * sync onto the live board), so the pace, the beats, Reduce motion / Speed off, Skip and the
 * product's own REPLAY sign all behave identically. The steps are only ever produced by
 * `OnlineSession.opponentTurnReplay`, which refuses unless the reconstruction was proved against
 * the live board — so a wrong position can never be shown and the board always ends where the duel
 * really is. Nothing here touches the clock, the server, the catch-up gates or the action log.
 */
function replayOnlineOpponentTurn() {
  if (!session || busy()) return;
  const os = getOnlineSession();
  const turn = os?.opponentTurnReplay;
  if (!turn) return;
  // The live position, read BEFORE anything is queued: this is where the replay must end.
  const liveBoard = session.state.board;
  const v = session.view;
  const liveScores: [number, number] = [v.score, v.opponentScore];
  session.cancel();
  replaying = true;
  replaySpeed = REPLAY_SPEED;
  replayBeats = true;
  sound.reset(); // the same steps pick the same variations as the first time
  queue.reset(turn.startBoard);
  shownScores = [turn.scores[0], turn.scores[1]];
  queue.push(turn.steps.filter((s) => s.k !== 'end' && s.k !== 'turn'));
  // The closing sync: whatever the steps did, the board lands on the TRUE current position.
  queue.push([{ k: 'sync', board: liveBoard, scores: liveScores }]);
  if (IS_FUTA04) {
    theirsDim.begin();
    if (smartCockpit) {
      smartCockpit.led('REPLAY', { immediate: true });
      replaySignHeld = true;
    }
  } else {
    banner(`Replay: ${OPP.Label} turn`, 'bot');
  }
  render();
  void pump();
}

/** One entry point for the one control: online it is a rebuild, offline it is the kept turns. */
function replayLastTurn() {
  if (isOnlineDuel()) replayOnlineOpponentTurn();
  else replayBotTurn();
}

const bind = (id: string, fn: () => void) =>
  $(id).addEventListener('click', () => {
    sound.unlock();
    fn();
  });

// ---------- the product menu: LOG IN + PLAY, and the PLAY submenu ----------

/**
 * The product menu (owner direction, 2026-10-15) puts the offline modes and the duel lobby behind
 * ONE doorway, PLAY. The three entries are MOVED into the submenu's column rather than duplicated,
 * so each keeps its id, its existing handler and its words: the online hub's own click binding, the
 * campaign screen binding, and the training picker below. The legacy channels never see the submenu
 * and keep the flat menu they are used to, so their own tests are untouched.
 *
 * The ARRAY IS THE VISUAL ORDER (`append` one by one, in order), so it is also the tab order and the
 * screen reader's order. Owner decision (2026-10-20): LEVEL is the FIRST entry, above Play online -
 * the offline campaign is the thing a player opens most, and it leads the column. Since 2026-10-22 it
 * also carries the cream fill (the one leader inside PLAY); Play online is a quiet ghost key.
 */
const PLAY_MENU_ENTRIES = ['menu-campaign', 'menu-online', 'menu-new'] as const;
if (FEATURES.campaign) {
  const actions = document.getElementById('play-actions');
  if (actions) for (const id of PLAY_MENU_ENTRIES) actions.append($(id));
  // The chapter caption is a DETAIL of the LEVEL entry, so it is placed directly under it in the
  // column (moved, not copied). It has no id of its own in the entry list and no handler: it can
  // never become a fourth destination or enter the tab order.
  $('menu-campaign').after($('play-readout'));
}

bind('menu-play', openPlayMenu);
bind('play-back', () => {
  closePlayMenu();
  // The submenu keeps the menu underneath (see openPlayMenu), so returning repaints its own state
  // explicitly rather than relying on showScreen's "the screen changed" branch.
  layoutMenu(syncMenuResume());
  showScreen('menu');
});
// The hub takes over the whole screen; the submenu must not stay behind it.
$('menu-online').addEventListener('click', closePlayMenu);

bind('menu-new', () => {
  if (!$('menu-continue').hidden && !window.confirm('Start a new game? The saved game will be lost.')) return;
  showScreen('levels');
});
for (const [sel, p] of [['.hud .score.you', HUMAN], ['.hud .score.bot', BOT]] as const) {
  const el = document.querySelector<HTMLElement>(sel)!;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', () => showBreakdown(p));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') showBreakdown(p);
  });
}
document.addEventListener('pointerdown', (e) => {
  if (!(e.target as Element | null)?.closest?.('.hud .score, #score-pop')) $('score-pop').hidden = true;
});
bind('levels-back', () => showScreen('menu'));
// LEVEL <n> in the PLAY submenu goes STRAIGHT into the game (owner, 2026-10-16: "it should take you
// straight to the game - dont show the whole levels and chapters"). It is the same entry the
// tutorial hands off to and the campaign screen's own leading button uses: resume an unfinished
// campaign match, otherwise open the player's current level. The owner then removed the "Levels"
// entry (2026-10-16), so this is now the ONLY way to start a level and the list is reached only from
// the finish card once the campaign runs out of next levels.
bind('menu-campaign', () => enterCampaign());
bind('campaign-back', () => showScreen('menu'));
bind('campaign-continue', () => enterCampaign());
// The ask sheet. Since the entry anchors on the PLACE (owner, 2026-10-24), `campaignEntry` only
// raises it when the saved match IS the place (`next.id === saved.id`); the different-level wording
// below is kept for a direct caller, not reachable through the entry any more.
bind('csa-resume', () => {
  campaignAsk = null;
  sheet(null);
  const resume = campaignResume();
  if (resume) continueCampaignMatch(resume);
});
bind('csa-start', () => {
  const ask = campaignAsk;
  campaignAsk = null;
  sheet(null);
  if (ask) startCampaignLevel(ask.next);
});
// Overhaul item 11: every button answers a press the same way: a 0.97 press (CSS), a soft
// tick (Sound) and, with Effects High, a tiny tap (Vibration). Nothing plays before a tap.
// Sound is a CONSUMER of the phase 0 press seam, never a second primitive: the same pointerdown
// gets a quiet tick, the lift gets the click, and a drag (a paint, not a tap) gets neither.
const BUTTON_SELECTOR = '.btn, .ctool, .undo-chip, .seg-btn, .chip, .icon-only, .hand-sort, .level-tile, .world-challenge-chip, .world-challenge-primary, .world-challenge-secondary, .world-claim-button';
let soundPress: { el: Element; x: number; y: number; id: number; cancelled: boolean } | null = null;
const pressableAt = (target: EventTarget | null): Element | null => {
  const el = target instanceof Element ? target.closest(PRESS_SELECTOR) : null;
  return el && !shouldSkipPress(el as unknown as Parameters<typeof shouldSkipPress>[0]) ? el : null;
};
document.addEventListener(
  'pointerdown',
  (e) => {
    const el = pressableAt(e.target);
    if (!el) return;
    sound.unlock();
    if (settings.sound) sound.tick();
    soundPress = { el, x: e.clientX, y: e.clientY, id: e.pointerId, cancelled: false };
    const b = el.closest(BUTTON_SELECTOR);
    if (!b || (b as HTMLButtonElement).disabled) return;
    const hp = hapticFor('press', settings);
    if (hp) vibrate(true, hp as number | number[]);
  },
  { capture: true, passive: true },
);
document.addEventListener(
  'pointermove',
  (e) => {
    if (!soundPress || soundPress.id !== e.pointerId || soundPress.cancelled) return;
    if (dragExceeded(soundPress.x, soundPress.y, e.clientX, e.clientY)) soundPress.cancelled = true;
  },
  { capture: true, passive: true },
);
document.addEventListener(
  'pointerup',
  (e) => {
    const p = soundPress;
    soundPress = null;
    if (!p || p.cancelled || p.id !== e.pointerId) return;
    // Lift is the click layer; only button-like surfaces get it. Cards and hexes already click
    // with their action, so they are not clicked twice.
    if (!p.el.closest(BUTTON_SELECTOR)) return;
    if (settings.sound) sound.click();
  },
  { capture: true, passive: true },
);
document.addEventListener('pointercancel', () => (soundPress = null), { capture: true, passive: true });
bind('hand-sort', () => {
  settings = { ...settings, handSort: nextSort(settings.handSort) };
  saveSettings();
  render();
});
// overhaul item 7: legal hexes brighten softly as the finger or mouse comes near
{
  let last: { x: number; y: number } | null = null;
  const glowNear = () => {
    const targets = board.svg.querySelectorAll<SVGPathElement>('.l-over .target');
    if (!targets.length) return;
    const m = board.svg.getScreenCTM();
    const p = last && m ? new DOMPoint(last.x, last.y).matrixTransform(m.inverse()) : null;
    for (const t of targets) {
      const key = t.dataset.key ?? t.getAttribute('data-key');
      const c = key ? centerOf(key) : null;
      const near = p && c ? proximity(Math.hypot(p.x - c.x, p.y - c.y)) : 0;
      t.style.setProperty('--near', near.toFixed(2));
    }
  };
  const track = (e: PointerEvent) => {
    last = { x: e.clientX, y: e.clientY };
    // Several pointer moves in one frame collapse into one job (coalesced, non-urgent).
    scheduler.request('board-near', glowNear);
  };
  board.svg.addEventListener('pointermove', track);
  board.svg.addEventListener('pointerdown', track);
  board.svg.addEventListener('pointerleave', () => {
    last = null;
    scheduler.request('board-near', glowNear);
  });
}
// desktop: a card tilts a few degrees toward the pointer
// the test copy: a fan lying over the map is see-through until I touch it
let fanSleep = 0;
$('dock').addEventListener(
  'pointerdown',
  () => {
    if (!FEATURES.mapBehindCards) return;
    document.documentElement.classList.add('fan-awake');
    clearTimeout(fanSleep);
    fanSleep = window.setTimeout(() => document.documentElement.classList.remove('fan-awake'), 3000);
  },
  { capture: true, passive: true },
);
$('hand').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || settings.reduceMotion) return;
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--tilt-x', `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1)}deg`);
  card.style.setProperty('--tilt-y', `${(((e.clientY - r.top) / r.height - 0.5) * -6).toFixed(1)}deg`);
});
$('hand').addEventListener('pointerout', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  card?.style.removeProperty('--tilt-x');
  card?.style.removeProperty('--tilt-y');
});
/**
 * The ONE way out of an online duel. Every exit route — the pause menu's Main menu and New game,
 * the finish screen's Back to menu, Back to matches and Change difficulty, and the lobby's Back —
 * stops the session through here, so no route can leave the client believing a duel is still open.
 * The match itself stays on the server: leaving and returning is a resume, never a cancel.
 */
let activeMatchChat: ReturnType<typeof mountMatchChat> | null = null;

function tearDownOnlineDuel(): void {
  activeMatchChat?.stop();
  activeMatchChat = null;
  cancelStarterRitual();
  getOnlineSession()?.driver.stop();
  setOnlineSession(null);
  onlineResign = null;
  syncResignMenu();
  // The only exit from a duel: a dim left on while a replay was in flight must never survive it.
  theirsDim.clear();
  const hud = document.getElementById('duel-hud');
  if (hud) hud.hidden = true;
}

bind('go-other', () => {
  flushInstallInvite();
  hideGameOver();
  if (isOnlineDuel()) {
    // "Back to matches": the same one teardown, then the hub. Hiding #game is the same guard the
    // rematch uses — a stray resize render must never paint the finished board's overlay here.
    tearDownOnlineDuel();
    $('game').hidden = true;
    void onlineLobbyCtl?.openHub();
    return;
  }
  // A tutorial replay never enters campaign progression; its card's own way out is the Tutorial.
  if (tutorialReplay) return showScreen('menu');
  showScreen(campaignLevel ? 'campaign' : 'levels');
});
bind('menu-continue', () => continueGame());
bind('menu-tutorial', () => {
  if (!IS_FUTA04) {
    startGame(TUTORIAL_SEED,7);
    return;
  }
  // One entry: start the guided run from its top.
  startTutorialFromMenu();
});
bind('menu-settings', () => sheet('sheet-settings'));
bind('settings-tutorial', () => {
  renderTutorialSheet();
  sheet('sheet-tutorial');
});
($('settings-lab') as HTMLDetailsElement).addEventListener('toggle', () => {
  renderSettingsLab();
  const section = $('settings-lab') as HTMLDetailsElement;
  if (section.open) requestAnimationFrame(() => section.scrollIntoView({ block: 'start', behavior: settings.reduceMotion ? 'instant' : 'smooth' }));
});
bind('lab-restore', restoreLab);
bind('lab-surprise', () => {
  const choices = LAB_PRESETS.filter((preset) => preset.id !== labActiveId);
  const preset = choices[crypto.getRandomValues(new Uint32Array(1))[0]! % choices.length]!;
  labCategory = preset.category;
  applyLab(preset);
});
/**
 * A finished match has no menu to open. The result card is the screen then, and the HUD keys stay
 * in the DOM (the top bar is not covered by the card), so a tap used to open "Paused" over the
 * result — the plate's own header and Settings key painted above the outcome (owner's 2026-10-23
 * audit). The guard is the finished state itself, so it holds whether the match ended a moment ago
 * or the player is reading the card a minute later.
 */
const matchIsFinished = (): boolean => !$('gameover').hidden;
bind('hud-menu', () => { if (!matchIsFinished()) sheet('sheet-menu'); });
bind('hud-history', () => { if (!matchIsFinished()) sheet('sheet-history'); });
bind('gm-exit-tutorial', () => {
  sheet(null);
  exitTutorial();
});
bind('gm-resume', () => sheet(null));
/**
 * Restart (owner brief, 2026-10-22). It resets the match the player is IN, instead of walking them
 * out to a level list:
 *   - a campaign level reopens from its own deterministic seed (the authored opening is identical);
 *   - a practice match restarts its same tier with a fresh deal;
 *   - a finished match is not pausable, so this only ever runs while a match is in progress.
 * A confirmation appears only when there is real progress to lose; a fresh turn restarts at once.
 * The restarting flag is released by `startGame` itself, so two quick taps cannot start two games.
 */
function restartHasConsequence(): boolean {
  if (!session) return false;
  const st = session.state;
  return st.turnNumber > 1 || (st.history?.length ?? 0) > 0;
}

function requestRestart(): void {
  if (!session || restarting || isOnlineDuel() || $('game').hidden) return;
  if (!restartHasConsequence()) {
    void restartCurrentMatch();
    return;
  }
  const campaign = !!campaignLevel;
  $('restart-title').textContent = campaign ? PAUSE.restartLevelTitle : PAUSE.restartMatchTitle;
  $('restart-body').textContent = campaign ? PAUSE.restartLevelBody : PAUSE.restartMatchBody;
  $('restart-confirm').textContent = campaign ? PAUSE.restartLevel : PAUSE.restartMatch;
  $('restart-cancel').textContent = PAUSE.keepPlaying;
  sheet('sheet-restart');
}

async function restartCurrentMatch(): Promise<void> {
  if (!session || restarting || isOnlineDuel()) return;
  restarting = true;
  // Close the plate first (the pause state is released), then take the board back to its opening.
  closeAllSheets();
  fastForward();
  const campaign = campaignLevel;
  const level = gameLevel;
  const difficulty = gameDifficulty;
  if (campaign) {
    // The same order rule as the campaign's one entry point: a stale/edited save cannot skip ahead.
    if (!isUnlocked(campaignProgress, campaign)) {
      restarting = false;
      showScreen('campaign');
      return;
    }
    gameOverDismissed = true;
    await startGame(campaign.seed, campaign.botLevel, null, campaign, null, tutorialReplay);
    return;
  }
  await startGame(randomSeed(), level, null, null, difficulty);
}
bind('gm-new', () => requestRestart());
bind('restart-confirm', () => void restartCurrentMatch());
bind('restart-cancel', () => sheet(null));
bind('gm-howto', () => openHowToReference());
bind('gm-settings', () => sheet('sheet-settings'));
bind('gm-resign', () => {
  const resign = onlineResign;
  if (!resign) return;
  if (!window.confirm(ONLINE.resignConfirm)) return;
  sheet(null);
  resign();
});
bind('gm-main', () => {
  sheet(null);
  fastForward();
  if (isOnlineDuel()) tearDownOnlineDuel();
  showScreen('menu');
});
bind('restart-tutorial', () => {
  if (!IS_FUTA04) {
    sheet(null);
    startGame(randomSeed());
    return;
  }
  sheet(null);
  startTutorial();
});
bind('scrim', () => sheet(null));
for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.addEventListener('click', () => sheet(null));

bind('confirm-play', () => {
  if (!session) return;
  const a = session.pending;
  if (a) humanPlay(a);
});
bind('confirm-cancel', () => cancelSel());
bind('confirm-info', () => {
  const k = $('confirm-info').dataset.key;
  if (k) pinCard(k);
});
$('tooltip').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fruit]');
  if (b) useFruitOn(b.dataset.fruit!);
});
bind('first-tip-ok', () => {
  if (tipOpen) {
    tipsSeen = markTip(tipsSeen, tipOpen);
    store.set(TIPS_KEY, JSON.stringify(tipsSeen));
  }
  tipOpen = null;
  render();
});
bind('deck', () => {
  // The gate first: a tap on the deck mid-reveal used to skip the replay AND commit a Draw.
  if (onlineGateShut()) return revealWaitNotice();
  if (busy()) fastForward();
  const a = myTurn() ? session!.legal.find((x) => x.t === 'Draw' && x.from === 'deck') : undefined;
  if (a) humanPlay(a);
});
bind('discard', () => {
  if (onlineGateShut()) return revealWaitNotice();
  if (busy()) fastForward();
  // The Throw step: the picked card goes onto the pile. This is the third throw gesture (tap the
  // pile while a card is picked); a tap on the card itself only selects/deselects. Nothing picked,
  // nothing thrown. Every mode, online too (humanPlay routes it).
  const toss = myTurn() && session ? throwPileAction(session.view.phase, session.pending, session.legal) : null;
  if (toss) return humanPlay(toss);
  const a = myTurn() ? session!.legal.find((x) => x.t === 'Draw' && x.from === 'discard') : undefined;
  if (a) humanPlay(a);
});

// ---------- drag layer (an extra path on top of the taps) ----------
// A drag only ever plays an action the engine already lists as legal, so it can never fire
// something a tap could not in the same state. A move under 10px stays a tap: this layer
// only steps in past the threshold, and it suppresses the click that would otherwise
// double-fire a committed drag. Taps, buttons, the Confirm setting and board painting are
// untouched.
const dragLayer = mountDragLayer({
  canDrag: () => !!session && myTurn() && !busy() && session.state.phase !== 'GAME_OVER',
  view: () => session?.view ?? null,
  legal: () => (session && myTurn() && !busy() ? session.legal : []),
  sel: () => session?.sel ?? EMPTY_SEL,
  keyAt: (x, y) => board.keyAtClient(x, y, dragInv),
  pointOf: (key) => {
    const p = board.screenPoint(key);
    return { x: p.x, y: p.y };
  },
  overDiscardPile: (x, y) => {
    // Throw drop: discard pile (+ grab radius / band above it) and cockpit chrome, but not
    // the action buttons / bloom menu / context controls, and not the hand.
    const discard = $('discard');
    const r = discard.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    if (Math.hypot(dx, dy) <= PILE_GRAB_PX) return true;
    // Common aim: drag up into the column above the pile.
    if (x >= r.left - PILE_GRAB_PX && x <= r.right + PILE_GRAB_PX && y < r.top && y >= r.top - 140) return true;
    if (!IS_FUTA04 || !session || session.view.phase !== 'DISCARD') return false;
    const box = document.getElementById('futa04-box');
    if (!box) return false;
    const br = box.getBoundingClientRect();
    if (x < br.left || x > br.right || y < br.top || y > br.bottom) return false;
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter((el): el is Element => !!el);
    for (const el of stack) {
      if (el.closest?.('.drag-ghost, #smart-led-window, #smart-led-bloom, #smart-spill')) continue;
      if (el.closest?.('#hand, #futa04-actions, #smart-context, #smart-bloom, #moves, button, .bloom-options, .bloom-toggle')) return false;
      if (el.closest?.('#discard, #futa04-box')) return true;
    }
    return false;
  },
  bloomReverse: () => draw.reverse,
  setThrowZone: (on) => {
    document.getElementById('futa04-box')?.classList.toggle('drag-throw-zone', on);
  },
  commit: (a, _mode, from) => {
    // A pile tap / drag draws at once. Drag/flick throw commits on release (the gesture is
    // the confirmation); card taps still select / deselect.
    if (a.t === 'Draw') {
      vibrate(settings.vibration, 12);
      return humanPlay(a);
    }
    if (IS_FUTA04 && a.t === 'Discard') {
      vibrate(settings.vibration, 12);
      // Every throw gesture gets the boomerang now (owner, 2026-10-25): the swipe, and the drop on
      // the pile. `from` is the released ghost's box, so the flight continues where the card was.
      return humanPlay(a, from ? { flightFrom: from } : {});
    }
    if (asksConfirm(a)) {
      session?.preset(a);
      render();
      return;
    }
    humanPlay(a);
  },
  // A started move shorter than SWIPE_TAP_PX is still a tap: it selects, or deselects the card
  // the player already picked (never throws — that is what confused testers).
  tap: (cardId) => onCardTap(cardId),
  openBloom: (cardId, key) => {
    if (!session) return;
    session.cancel();
    const groups = bloomKindsForCard(cardId);
    if (groups.length === 1) {
      beginBloomKind(groups[0]!.kind, cardId);
      // Drag-drop onto a legal start is the player's first tile (not an auto-plant).
      const combo = comboFor(session.view, session.legal, session.sel);
      const reverse = draw.reverse;
      if (combo && key && drawStarts(combo, reverse).has(key)) {
        draw = { ...DRAW0, reverse, shape: paintEnter(combo, [], key, reverse) };
      }
    } else {
      session.sel = { card: cardId, hex: null, kind: null, option: 0 };
      bloomMenu = groups.length > 1;
    }
    render();
    if (draw.shape.length) paintDraw();
  },
  led: (word) => smartCockpit?.led(word),
  onShape: (shape) => {
    // Mirror a Bloom drag into the board's existing paint ghost, only when the board is not
    // itself being painted (one gesture at a time). Empty clears it.
    if (!session || draw.ptr) return;
    if (!shape.length) {
      draw = { ...draw, shape: [] };
      board.ghost(null);
      return;
    }
    draw = { ...draw, shape: [...shape], msg: null };
    paintDraw();
  },
  onCardFocus: (cardId) => {
    if (!session) {
      dragSel = null;
      return;
    }
    if (cardId === null) {
      dragSel = null;
      refreshBoardDrag();
      return;
    }
    const card = session.view.hand.find((c) => c.id === cardId);
    const mega = card?.suit === null ? session.legal.find((a) => a.t === 'MegaBomb' && a.cards.includes(cardId)) : undefined;
    const kind = session.sel.kind?.startsWith('bloom-') ? session.sel.kind : mega ? kindOf(mega) : null;
    dragSel = { card: cardId, hex: null, kind, option: 0 };
    refreshBoardDrag();
  },
  onHoverKey: (key) => {
    if (dragHoverKey === key) return;
    dragHoverKey = key;
    refreshBoardDrag();
  },
  onDragBegin: () => {
    // Measure the screen-to-board matrix once per drag, not once per pointer move.
    dragInv = board.screenCTMInverse();
  },
  onDragEnd: () => {
    dragInv = null;
    dragHoverKey = null;
  },
  onEnterTarget: () => {
    const hp = hapticFor('press', settings);
    if (hp) vibrate(true, hp as number | number[]);
  },
  reducedMotion: () => settings.reduceMotion || motion() === 0,
  flyBack: (from, to) => flyBack(from, to, timeScale()),
});
dragLayer.attachHand($('hand'));
dragLayer.attachDeck($('deck'));
dragLayer.attachDiscard($('discard'));
// Tap empty board chrome (gaps — not hexes/targets/ghosts) after Grow → skip Bloom to Throw,
// or step back one Bloom paint hex. Capture is off so draw/paint handlers win on real hexes.
$('board-wrap').addEventListener('pointerup', (event) => {
  if (!IS_FUTA04 || event.button === 2) return;
  const t = event.target as Element | null;
  if (!t) return;
  if (t.closest('.hex-cell, .target, .ghost, .ghost-tile, .receptive-well, .selected, button, a, .card, #hand, #moves, #futa04-actions')) return;
  // A hit on the SVG grid that resolves to a hex is painting / placing — leave it alone.
  if (t.closest('#board') && board.keyAtClient(event.clientX, event.clientY)) return;
  if (trySkipBloomToThrow()) return;
  if (bloomStepBack()) return;
});
if (FEATURES.weakTools) bind('tool-weak', () => {
  settings = { ...settings, weakSpots: !settings.weakSpots };
  saveSettings();
  render();
});
if (FEATURES.weakTools) bind('tool-targets', () => {
  showOpps = !showOpps;
  render();
});
bind('tool-skip', () => {
  pill.skip();
  fastForward();
});
bind('tool-replay', () => replayLastTurn());
// Step 3 item 7: the corner tools' tooltips: hover (mouse), long-press (touch), and once
// automatically the first time they appear (one at a time, a few seconds each)
{
  const tip = $('ctool-tip');
  let timer = 0;
  const show = (b: HTMLElement, ms = 0) => {
    const wrap = $('board-wrap').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    tip.textContent = b.dataset.tip ?? '';
    tip.hidden = false;
    const right = r.left - wrap.left > wrap.width / 2;
    const below = r.top - wrap.top < wrap.height / 2;
    tip.style.left = right ? '' : `${r.left - wrap.left}px`;
    tip.style.right = right ? `${wrap.right - r.right}px` : '';
    tip.style.top = below ? `${r.bottom - wrap.top + 6}px` : '';
    tip.style.bottom = below ? '' : `${wrap.bottom - r.top + 6}px`;
    clearTimeout(timer);
    if (ms) timer = window.setTimeout(() => (tip.hidden = true), ms);
  };
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
  };
  for (const b of document.querySelectorAll<HTMLElement>('.ctool')) {
    b.title = '';
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show(b));
    b.addEventListener('pointerleave', hide);
    let press = 0;
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') press = window.setTimeout(() => show(b, 2200), 450);
    });
    for (const ev of ['pointerup', 'pointercancel'] as const) b.addEventListener(ev, () => clearTimeout(press));
  }
  const KEY = 'severgrow.ctools.seen';
  /** The first time the tools show in a game: name each once (shield, then target). */
  firstToolTips = () => {
    if (!FEATURES.weakTools || store.get(KEY)) return;
    store.set(KEY, '1');
    const tools = ['tool-weak', 'tool-targets'].map((id) => document.getElementById(id)).filter((b): b is HTMLElement => !!b && !b.hidden);
    tools.forEach((b, i) => window.setTimeout(() => show(b, 2400), 900 + i * 2700));
  };
}
bind('tool-undo', () => {
  if (!session) return;
  // ONE PRESS takes back the last move (owner, 2026-10-25: "undo shouldnt need 2 taps"). The
  // decision is one pure function (logic/undo) because `session.pending` is DERIVED from the pick:
  // asking it first spent the press clearing the pick, and only the second press reached undo().
  const online = isOnlineDuel();
  const intent = undoIntent({
    // The SAME question the enable line above asks. Online the offline `session` is rebuilt after
    // every move, so its undo stack is always empty: the draft that can be taken back lives on the
    // OnlineSession. Reading `session.canUndo` here lit the button but never reached `undoMove()`.
    canUndo: online ? !!getOnlineSession()?.canUndo : session.canUndo,
    // A drawn placement waiting for Confirm, or a Bloom being painted: drawn, never played.
    hasStagedPreview: !!session.presetMove || !!draw.shape.length || draw.desk.phase === 'live' || !!draw.ptr,
    hasSelection: session.sel.card !== null || session.sel.hex !== null || session.sel.kind !== null,
    online,
  });
  if (intent === 'undo') return undoMove();
  if (intent === 'cancel') {
    cancelSel();
    smartCockpit?.hint('UNDONE');
    return;
  }
  // `none`: nothing was moved and nothing is waiting. The same slot may be showing Replay — online
  // too, where the turn is rebuilt from the match's public history instead of the kept turns.
  if (canReplayLastTurn()) replayLastTurn();
});
bind('go-rematch', () => {
  // One advance per finish card (owner brief, 2026-10-22): the leading key is the largest target on
  // the screen and is tappable twice in a fast hand. `resultAdvance` is released by the new session
  // (startGame) or by the rematch promise, never by a guessed timer.
  if (resultAdvance) return;
  resultAdvance = true;
  flushInstallInvite();
  if (isOnlineDuel()) {
    // Rematch: the finished session is torn down FIRST (nothing leaks into the new match), then a
    // fresh match is created and the existing invite/share screen is shown. Hiding #game keeps a
    // stray resize render from painting the finished board's overlay over the opaque invite screen.
    hideGameOver();
    $('game').hidden = true;
    // The finished duel's id, read BEFORE the teardown clears the session: the server pairs both
    // players' presses on it (a mutual rematch, 2026-10-22).
    const finishedMatchId = getOnlineSession()?.driver.snapshot().matchId ?? null;
    void runRematch({
      tearDown: tearDownOnlineDuel,
      createMatch: () => onlineLobbyCtl?.rematch(finishedMatchId) ?? Promise.resolve(),
    }).finally(() => {
      resultAdvance = false;
    });
    return;
  }
  // A TUTORIAL replay returns to where it came from: Settings → Tutorial. It must never hand the
  // player to the campaign's next level (owner, 2026-10-24).
  if (tutorialReplay) {
    hideGameOver();
    resultAdvance = false;
    showScreen('menu');
    sheet('sheet-settings');
    sheet('sheet-tutorial');
    return;
  }
  // A WON campaign level leads with the next one (owner direction, 2026-10-16): the player never
  // walks back to the level list to pick it. The next level comes from the level DATA, so the last
  // built level honestly has none: that same button is then the way out, back to the level list. A
  // REPLAY of a level behind the place also has no NEXT to march through — the card's own
  // `finishLead` says the level list, so this press goes there. A loss, and a plain offline game,
  // restart what was just played — exactly as before.
  const wonNow = session?.state.phase === 'GAME_OVER' && session.state.result?.winner === HUMAN;
  if (campaignLevel && wonNow) {
    const next = campaignReplay ? null : nextCampaignLevel(campaignLevel.number);
    if (next) return startCampaignLevel(next);
    hideGameOver();
    resultAdvance = false;
    return showScreen('campaign');
  }
  // A campaign retry restarts the SAME level from its fixed seed (never a random one).
  if (campaignLevel) return startCampaignLevel(campaignLevel);
  startGame(randomSeed(), gameLevel);
});
// The finish card's ONE disclosure: every detail line and every extra action is behind it.
bind('go-more', () => setGoExtrasOpen(!goExtrasOpen));
bind('go-board', () => {
  gameOverDismissed = true;
  hideGameOver();
  render();
});
bind('go-menu', () => {
  hideGameOver();
  // Leaving a duel must tear the session down, exactly like Back to matches (the match stays
  // resumable on the server).
  if (isOnlineDuel()) tearDownOnlineDuel();
  showScreen('menu');
});
bind('go-territory-open', () => {
  hideGameOver();
  showScreen('menu');
  onlineLobbyCtl?.openWorld('menu');
});
// The replay of the whole match (owner brief, 2026-10-25): one tap on the finish card, any mode.
bind('go-replay', () => void openReplayForFinish());
bind('go-territory-grow', () => {
  hideGameOver();
  showScreen('menu');
  onlineLobbyCtl?.openWorld('menu');
});
// Overhaul item 20: replay the game's biggest cut (from the board just before it), then come back here
bind('go-cut', () => {
  const p = session?.biggestCut;
  if (!session || !p || busy()) return;
  gameOverDismissed = true;
  reopenGameOver = true;
  replaying = true;
  replaySpeed = CUT_REPLAY_SPEED;
  queue.reset(p.before.board);
  const v0 = viewFor(p.before, HUMAN);
  shownScores = [v0.score, v0.opponentScore];
  rememberRemoved(p.steps, p.before);
  queue.push(p.steps.filter((s) => s.k !== 'end' && s.k !== 'turn' && s.k !== 'draw'));
  const v = session.view;
  queue.push([{ k: 'sync', board: session.state.board, scores: [v.score, v.opponentScore] }]);
  render();
  void pump();
});
// Overhaul item 20: a picture of the result for the share sheet (or saved); nothing is uploaded.
// ONLINE builds the card from the online display state, so the button can never be a silent no-op.
bind('go-share', () => {
  const onSaved = (r: string) => {
    if (r === 'saved') $('go-share').textContent = ONLINE.shareSaved;
  };
  const os = isOnlineDuel() ? getOnlineSession() : null;
  if (os) {
    const info = os.finishInfo();
    if (!info) return;
    const hl = info.highlights.filter((h) => h.value > 0).map((h) => `${h.title}: ${h.text}`);
    void shareCard({
      game: GAME_TITLE,
      title: $('go-title').textContent ?? '',
      sub: $('go-sub').textContent ?? '',
      score: [info.scores[0], info.scores[1]],
      highlights: hl,
      board: os.state.board,
      radius: os.state.config.boardRadius,
      cells: os.state.config.board?.cells,
      me: HUMAN,
    }).then(onSaved);
    return;
  }
  const st = session?.state;
  if (!st?.result) return;
  const hl = gameHighlights(st.history ?? [], HUMAN).filter((h) => h.value > 0).map((h) => `${h.title}: ${h.text}`);
  void shareCard({
    game: GAME_TITLE,
    title: $('go-title').textContent ?? '',
    sub: $('go-sub').textContent ?? '',
    score: [st.result.scores[HUMAN], st.result.scores[BOT]],
    highlights: hl,
    board: st.board,
    radius: st.config.boardRadius,
    cells: st.config.board?.cells,
    me: HUMAN,
  }).then(onSaved);
});

bind('coach-show', () => {
  // "Show me where": an arrow points at each thing to tap, one step at a time.
  const advice = currentAdvice();
  if (!session || !advice) return;
  guideGoal = guideGoal ? null : advice.action;
  if (guideGoal) session.cancel();
  render();
});
bind('coach-why-btn', () => {
  coachWhyOpen = !coachWhyOpen;
  render();
});
// Sound and vibration can't be checked from a computer: let the player test them here.
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
bind('test-sound', () => {
  sound.unlock();
  const was = sound.enabled;
  sound.enabled = true;
  sound.click();
  sound.chime(0.15);
  setTimeout(() => sound.snap(), 600);
  setTimeout(() => sound.fanfare(true), 1300);
  setTimeout(() => (sound.enabled = was), 2400);
  $('test-note').textContent = "You should hear a click, a chime, a snap and a short tune. Nothing? Check your phone's silent switch and volume.";
});
bind('test-vibration', () => {
  vibrate(true, [60, 60, 120]);
  $('test-note').textContent = canVibrate ? 'Your phone should buzz three times.' : "This phone's browser doesn't let websites vibrate (iPhones never do).";
});
bind('coach-summary-ok', () => {
  coach.summaryDone = true;
  save();
  render();
});

for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
  input.addEventListener('change', () => {
    const k = input.dataset.setting as keyof Settings;
    settings = { ...settings, [k]: input.checked };
    saveSettings();
    if (k === 'sound') sound.enabled = settings.sound;
    if (k === 'music') {
      sound.unlock();
      sound.setMusic(settings.music);
    }
    if (k === 'reduceMotion' || k === 'largeText' || k === 'eyeCandy') applyTheme();
    else render();
  });
}

// Step 7: the effects and music volume sliders (each its own bus; the limiter is on the master)
for (const input of document.querySelectorAll<HTMLInputElement>('[data-volume]')) {
  input.addEventListener('input', () => {
    const k = input.dataset.volume as 'sfxVolume' | 'musicVolume';
    settings = { ...settings, [k]: Number(input.value) };
    sound.unlock();
    sound.setMix(settings);
  });
  input.addEventListener('change', () => {
    saveSettings();
    if (input.dataset.volume === 'sfxVolume' && settings.sound) sound.click();
  });
}

// Keyboard: arrows move over the board, Enter picks, Esc cancels or closes; 1-9 pick cards.
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openSheet) sheet(null);
    // Esc skips an animation, but never the enemy's turn: that is the Skip control's job alone.
    else if (onlineReveal()) revealWaitNotice();
    else if (busy()) fastForward();
    // Esc first stops the shape being painted; again, it cancels the bloom
    else if (drawCombo() && (draw.shape.length || draw.desk.phase === 'live' || draw.ptr)) cancelDraw();
    else cancelSel();
    return;
  }
  if (openSheet || !session || $('game').hidden) return;
  const target = e.target as HTMLElement;
  if (/^[1-9]$/.test(e.key) && target.tagName !== 'INPUT') {
    document.querySelectorAll<HTMLButtonElement>('#hand [data-card]')[Number(e.key) - 1]?.click();
    return;
  }
  // Step 7: whole turns from the keyboard: D draws from the deck, T takes the throw pile, U undoes
  if (target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'd') return void $('deck').click();
    if (k === 't') return void $('discard').click();
    if (k === 'u' && !($('tool-undo') as HTMLButtonElement).disabled) return void $('tool-undo').click();
  }
  if (target.id !== 'board') return;
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    const keys = board.boardKeys;
    focusKey = keyStep(focusKey ?? keys[Math.floor(keys.length / 2)]!, e.key, new Set(keys));
    const dc = drawCombo();
    if (dc && draw.desk.phase === 'live') {
      draw = { ...draw, desk: deskHover(draw.desk, focusKey) };
      paintDraw();
    }
    inspectKey = dc ? null : focusKey;
    render();
    $('board').setAttribute('aria-label', `Board: ${describeHex(focusKey)}`);
  } else if ((e.key === 'Enter' || e.key === ' ') && session.presetMove && drawCombo()) {
    e.preventDefault();
    humanPlay(session.presetMove);
  } else if ((e.key === 'Enter' || e.key === ' ') && focusKey) {
    e.preventDefault();
    const dc = drawCombo();
    if (dc) drawTap(dc, focusKey, 'keyboard');
    else onHexTap(focusKey);
  } else if (e.key === 'Backspace' && drawCombo()) {
    e.preventDefault();
    if (draw.desk.phase === 'live') draw = { ...draw, desk: DESK_IDLE };
    else draw = { ...draw, shape: draw.shape.slice(0, -1) };
    paintDraw();
  }
});

function describeHex(key: string) {
  const v = session!.view;
  const t = v.board[key];
  const name = hexName(parseKey(key), v.config.boardRadius);
  if (v.terrain[key] === 'rock') return `${name}, rock`;
  if (!t) return `${name}, empty${v.terrain[key] === 'rich' ? ' gold hex' : ''}`;
  return `${name}, ${t.owner === HUMAN ? 'your' : OPP.noun} ${t.root ? 'root' : `tile, strength ${t.strength}`}`;
}

// In the background, finish animations at once: on return the board is simply current. The
// enemy's turn is the exception — hiding the tab (a lock, a switch to the other phone) must not
// silently swap the board in, or the player never sees what happened; it resumes on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !onlineReveal()) fastForward();
});

// Online duels: a hidden or offline tab must not keep the 2s fast poll alive. Tell the sync engine
// so it drops to the slow hidden cadence, and force a refresh when the tab or network comes back.
document.addEventListener('visibilitychange', () => {
  getOnlineSession()?.driver.sync().setVisible(!document.hidden);
});
window.addEventListener('online', () => getOnlineSession()?.driver.sync().setOnline(true));
window.addEventListener('offline', () => getOnlineSession()?.driver.sync().setOnline(false));

// Install as an app and play offline (the service worker caches the page's own files).
// the test copy (/test/) works online only: no worker of its own (main's worker skips it too)
if (!IS_TEST && 'serviceWorker' in navigator && location.protocol === 'https:') {
  const registerOffline = () => {
    navigator.serviceWorker
      .register(typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'futa04' || __CHANNEL__ === 'futa05') ? './futa04-sw.js' : './sw.js')
      // ask for a newer worker on every launch (browsers may otherwise keep an old one for a day);
      // a moment after registering, when the browser is free to run the check
      .then((r) => setTimeout(() => void r.update().catch(() => undefined), 1500))
      .catch(() => {
        /* offline play is a bonus; the page works without it */
      });
  };
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline, { once: true });
}

// Rotation or resize: just redraw (the game itself is untouched).
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  // A held finger still has the old screen coordinates after rotation. Keep the
  // painted hexes, but stop this pointer before its release can retrace the shape.
  draw.ptr = null;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(), 80);
});
document.addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
    document.documentElement.classList.remove('kbd');
  },
  { capture: true },
);
// Phase 0: the one delegated press primitive and the one frame scheduler.
installPress();
// Phase 4: the hand's breath pauses under a finger and in a hidden tab.
installHandBreath($('hand'));
attachSchedulerPause($('game'), $('board-wrap'));
// A hidden tab has nobody looking at it: park every playing animation until it is back.
mountHiddenPause();
observeLongTasks();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow')) document.documentElement.classList.add('kbd');
});

// ---------- start ----------

/** Read-only hook for the automated browser test (nothing is sent anywhere). */
let appReady = false;
(window as unknown as Record<string, unknown>).__severgrow = {
  state: () => session?.state ?? null,
  pending: () => session?.pending ?? null,
  /** The live tap selection (the same object offline uses), for interaction tests. */
  sel: () => (session?.sel ? { ...session.sel } : null),
  /** The Bloom being painted right now (the tentative shape, the same one the ghost paints). */
  drawShape: () => ({ shape: [...draw.shape], reverse: draw.reverse, msg: draw.msg, desk: draw.desk.phase }),
  /** The legal moves the page is offering right now (display coords), for interaction tests. */
  legal: () => (session ? [...session.legal] : []),
  // Online the source of truth is the OnlineSession's draft, not the offline Session the page
  // rebuilds after every move (which never sees the online draft, so it always read false).
  canUndo: () => (isOnlineDuel() ? !!getOnlineSession()?.canUndo : !!session?.canUndo),
  /** tests only: pick this exact Bloom card group (the button picks its family's usual one) */
  pickKind: (kind: string) => {
    if (!session) return;
    if (IS_FUTA04 && kind.startsWith('bloom-') && !kind.startsWith('bloom-mega-')) {
      beginBloomKind(kind, session.sel.card);
      render();
      return;
    }
    session.sel = { ...session.sel, kind, ...(IS_FUTA04 ? { hex: null } : {}) };
    render();
  },
  /** tests only (filmstrip): play this action for this player, as if chosen */
  playFor: (a: Action, who: Player) => {
    const p = session?.play(a, who);
    if (p) afterPlay(p, who, null);
    return !!p;
  },
  settings: () => ({ ...settings }),
  /** The campaign place the page is on, as the menu's LEVEL <n> reads it (tests/screenshots). */
  campaignLevel: () => currentLevel(campaignProgress).number,
  busy: () => busy(),
  /** Read-only sound diagnostics: the pre-rendered bank's size and the last cues played. */
  soundBank: () => sound.bankStats(),
  soundLog: () => [...sound.log()],
  /** tests only: play a named cue through the real sound gate (never mutates the game) */
  soundCue: (name: string) => sound.cue(name),
  /** Test-only feel harness: press latency, frame gaps, long tasks, live animations, RAF jobs. */
  feel: () => feel(scheduler.subscriberCount()),
  particles: () => ({ alive: particles.alive, peak: particles.peak }),
  world: () => board.worldStats,
  /** Tests: the cold-first-visit art warm (null before the first lesson board has been asked for). */
  warm: () => (warmDiag ? { ...warmDiag } : null),
  /** tests: tutorial focus lock */
  tutorialGate: () => tutorialGate ? {
    active: tutorialGate.isActive(),
    mode: tutorialGate.mode(),
    allow: tutorialGate.allow(),
    wouldBlock: (target: EventTarget | null) => tutorialGate!.wouldBlock(target),
  } : null,
  tutorial: () => coach.tutorial ? { ...coach.tutorial } : null,
  /** tests: the lesson on screen (levels 1-10): its beat, what is lit, the answer showing */
  lesson: () => {
    const l = lessonActive();
    return l ? {
      level: l.level, beat: lessonBeatNow, answer: lessonAnswerText, answers: lessonAnswerSeq,
      idle: lessonIdle, idleStage: lessonIdleStage, tier: lessonTierShown,
      /** Tests: when this explanation first appeared — the start of its reading floor (LESSON_READ_MS). */
      explainAt: lessonExplainAt,
      /** Tests: taps the reading floor refused, each acknowledged on screen (lessonAckFloor). */
      floorAcks: lessonFloorAcks,
      stage: lessonStageActive(), stageLeft: Math.max(0, Math.round(lessonStageUntil - performance.now())),
      handSettled, shownKey: lessonShownKey, seen: [...lessonSeen], powerSeen: [...lessonPowerSeen],
    } : null;
  },
  /** tests: the lesson's own suggested move now (what the light would point at) */
  lessonMove: () => {
    const l = lessonActive();
    return l && session ? suggestMove(l, session.state) : null;
  },
  tutorialNext: () => tutorialNext(),
  exitTutorial: () => exitTutorial(),
  /**
   * ONLINE tests: the enemy-turn gate, read-only. `revealing` is true from the moment a completed
   * enemy turn is detected until its animation has drained; `queued` is how much is still to play.
   */
  online: () => {
    const os = getOnlineSession();
    if (!os) return null;
    const snap = os.driver.snapshot();
    return {
      matchId: snap.matchId,
      revealing: os.isRevealing,
      live: os.revealIsLive,
      myTurn: os.myTurn,
      /** The SERVER's actor/seat (never the gate): the test that both phones disagree. */
      serverActor: snap.view.actor,
      serverTurn: snap.status !== 'active' || snap.view.phase === 'GAME_OVER'
        ? 'closed'
        : snap.view.actor === snap.seat
          ? 'mine'
          : 'theirs',
      seat: os.seat,
      finished: os.finished,
      /** True when the local draft can be taken back (the source the Undo button's enable reads). */
      canUndo: os.canUndo,
      queued: queue.pending,
      /** Diagnostics: the revision the page has applied, and the sync engine's link state. */
      revision: snap.revision,
      /** Diagnostics: the sync engine's own revision (what its next `?since=` will be). */
      syncRevision: os.driver.sync().revision(),
      connection: snap.connection,
      /** Diagnostics: the pump's own state, so a test can prove nothing was left running. */
      pumping,
      watchdog: revealWatchdog !== 0,
      progress: revealProgress,
      /** The opponent's last completed turn, if a verified reconstruction of it is ready. */
      replayTurn: (() => {
        const t = os.opponentTurnReplay;
        return t ? { steps: t.steps.length, scores: [...t.scores] } : null;
      })(),
      /** Why the Replay slot is (not) offered: ok | no-turn | unverified | pending. */
      replayReason: os.turnReplayReason,
    };
  },
  /** Tests only: the board on the screen right now (the AnimQueue's own board, never the state). */
  shownBoard: () => queue.board,
  /** Tests/diagnostics: the animation pump's timeline (see `animLog`). Never drives the game. */
  animLog: () => animMarks.slice(),
  clearAnimLog: () => {
    animMarks.length = 0;
  },
  /** Diagnostics: how long each redraw path took (full page vs per-tile). */
  renderCosts: () => renderCosts.slice(),
  clearRenderCosts: () => {
    renderCosts.length = 0;
  },
  /** Diagnostics: the `?debug=timing` segment trace (across two pages via `wall`). */
  timing: () => timingLog(),
  clearTiming: () => clearTiming(),
  timingEnabled: () => timingEnabled(),
  /** Test-only: make the NEXT pump wait on a promise that only `releaseStall()` resolves. */
  injectStall: () => injectStall(),
  releaseStall: () => {
    const release = stallRelease;
    stallRelease = null;
    release?.();
  },
  /** Boot finished: every async UI mount is attached and the first screen is shown. */
  ready: () => appReady,
  /**
   * Tests only: the replay player's own clock and frame (never drives it). Null when the replay is
   * not mounted. `index` is the frame on screen, `total` the whole playback length in ms.
   */
  replay: () => replayPlayer?.now() ?? null,
  /** Tests only: the replay's whole frame plan (times, seats, each frame's board signature). */
  replayPlan: () => replayPlayer?.plan() ?? null,
  /**
   * Tests/screenshots only: one frame of the exported video (a step of its plan), painted by the
   * recorder's own painter as a PNG data URL. It never drives the replay or starts a recording.
   */
  replayVideoFrame: (step = -1) => replayPlayer?.videoFrame(step) ?? null,
  replayLastVideo: () => replayPlayer?.lastVideo() ?? null,
  /** Tests/screenshots: the install invitation's memory (games counted) and a way to show it. */
  install: () => installPrompt.memory(),
  showInstall: () => installPrompt.showNow(),
  /**
   * Tests/screenshots only: pay an award on the finish card's own Seeds line, through the very
   * paint path a win uses (so the suite measures what the player would get, not a copy of it).
   */
  seedReveal: (amount: number) => {
    seedRewardMessage = `+${Math.max(0, Math.floor(amount))} Seeds`;
    goSeedSettled = false;
    goSeedShown = null; // a test may ask for the same award twice; each ask is a fresh paint
    paintGoSeeds();
    return seedRewardMessage;
  },
};

// The product menu's own controls (PLAY, the world map, Tutorial, Settings and the saved-game
// Continue) depend only on compile-time channel flags, strings and storage — never the network. Lay
// them out here, in boot's SYNCHRONOUS prefix (the first `await` below is the boot's first yield),
// so a first-time tester sees a way to play WITH THE FIRST PAINT instead of after the async player
// mounts. LOG IN is deliberately not one of them: it waits for the Google probe and is revealed by
// the accounts module. Non-product channels keep their own flat menu (layoutMenu handles both).
applySettingsCopy(); // the Settings sheet's words (src/strings.ts SETTINGS), before the first await
layoutMenu(syncMenuResume());
await mountPlayerEnhancements();
fillIcons();
// The install invitation: a timed prompt after a played game (no menu button any more). The words
// live in src/strings.ts; the counting rule lives in logic/install-prompt.ts.
const installPrompt = mountInstallPrompt({ copy: INSTALL, storage: store });
mountAppWindowButton(INSTALL.desktop.windowButton); // computers: open in its own window / full screen
// once the photo-like grass and lava are painted (in the background), redraw the board with them
if (!IS_FUTA04) onPhotosReady(() => {
  lastBoard = null;
  if (!busy()) render();
});
sound.enabled = settings.sound;
sound.setEffects(settings.effects);
sound.setMix(settings);
sound.musicOn = settings.music;
applyTheme();
if (!IS_FUTA04) showSplash();
const params = BOOT_PARAMS;
// Positioning pass: the alignment overlay (the centre line and the 16pt margins), for checking
// the layout by eye: ?align=1 (or ?align=0 to turn it off), remembered; the lab has a switch too
{
  const KEY = 'severgrow.align';
  if (params.has('align')) store.set(KEY, params.get('align') === '1' ? '1' : '');
  document.documentElement.classList.toggle('align-overlay', store.get(KEY) === '1');
}
const urlSeed = Number(params.get('seed'));
if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test' && params.get('lab') === '1') {
  // the dev-only material lab: every material in every palette (?lab=1, add &detail=low for Low)
  for (const id of ['menu', 'levels', 'campaign', 'game']) $(id).hidden = true;
  void import('./lab.js').then((m) => m.showLab(params.get('detail') === 'low' ? 'low' : 'normal', settings.reduceMotion));
} else if (session) showScreen('game'); // an immediate menu tap may start play while optional UI mounts
else if (params.get('tutorial') === '1' || params.get('tutorial') === 'pro') {
  const chapterRaw = Number(params.get('chapter'));
  const chapter = Number.isInteger(chapterRaw) && chapterRaw >= 1 && chapterRaw <= TUTORIAL_CHAPTER_COUNT
    ? chapterRaw - 1
    : 0;
  startTutorial(chapter);
} else if (Number.isSafeInteger(urlSeed) && urlSeed > 0) startGame(urlSeed);
else showScreen('menu');
// One background read on boot: a signed-in account's place comes from the server (a guest never
// asks). It repaints the menu if it moves; the first paint is already usable without it.
void syncAccountLevel();

// The main-menu tagline ("GROW · CONNECT · CONQUER") is NOT on the menu — the owner had it removed
// on 2026-10-14 (it read as clutter under the wordmark). It is not in `web/index.html` at all, so
// there is no hidden placeholder and the menu column cannot gain an empty row. Restoring it is a
// ONE-LINE change: flip SHOW_MENU_TAGLINE to true in `src/strings.ts` and this rebuilds the element
// in its old slot (between the wordmark and the buttons) with the existing `.tagline` styling.
if (SHOW_MENU_TAGLINE) {
  const buttons = document.querySelector('#menu .menu-buttons');
  if (buttons) {
    const tagline = document.createElement('p');
    tagline.id = 'menu-tagline';
    tagline.className = 'tagline';
    tagline.textContent = ONLINE.tagline;
    buttons.before(tagline);
  }
}

// Phase 4–5: online lobby + duel on the shared board (Draw / draft / Throw / resign).
// Seeds are NOT here: settling a finished game's proof is `online/seed-settle.ts`, because it must
// work even when this module has not mounted (owner report, 2026-10-25 — see `settleSeedsForCard`).
type OnlineLobbyCtl = {
  openHub(): Promise<void>;
  rematch(finishedMatchId?: string | null): Promise<void>;
  /** The Territory map (the menu's own entry); the finish card of level 10 opens it too. */
  openWorld(from: 'hub' | 'menu'): void;
  /** Leave the lobby for a match: the one transition every entry point uses. */
  leaveForMatch(): void;
};
let onlineLobbyCtl: OnlineLobbyCtl | null = null;
/** Set while an online duel is open; the pause menu's Resign calls it (one confirm). */
let onlineResign: (() => void) | null = null;
void import('./online/lobby-ui.js').then(async (m) => {
  const {
    createOnlineDriver,
    OnlineSession,
    hasStarterRevealed,
    markStarterRevealed,
    shouldPlayStarterLottery,
    realtimeChannelFromEnv,
  } = await import('./online/index.js');
  const { DuelClient, browserStorage } = await import('../../server/src/client.js');
  const { duelApiUrl, duelRegion } = await import('./online/config.js');

  // The lobby's own exits use the same one teardown as every in-game exit route.
  const leaveOnline = () => tearDownOnlineDuel();

  const lobby = m.installOnlineLobby({
    // The Territory's own-tile level: the SAME number the PLAY entry opens, so the map and the menu
    // can never disagree about where the player is (owner report, 2026-10-24: "im at level 23 - but
    // on territory it says im level 11").
    campaignLevel: () => currentLevel(campaignProgress).number,
    // The Territory is part of the same instrument as the board, so its keys speak in the same
    // voice. It reuses the bank's existing cues; it never ships a second sound system.
    cue: (name: string) => sound.cue(name),
    showMenu: () => {
      leaveOnline();
      showScreen('menu');
    },
    // A finished duel's row opens its replay (owner brief, 2026-10-25): the lobby made the
    // authorised read; the page owns the player.
    openReplay: (payload) => openPastReplay(payload),
    // The honest computer fallback: a normal offline game (same engine, same save/Continue). The
    // parked online search keeps running in the lobby controller and surfaces an "Opponent found"
    // prompt if someone turns up. A local game is not a server match, so it never counts against
    // the 10-unfinished-games cap. An in-progress computer game is RESUMED, never overwritten, so
    // choosing this offer can never lose the player's local game.
    startComputerGame: () => {
      leaveOnline();
      const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
      if (saved && saved.state.phase !== 'GAME_OVER') continueGame();
      else void startGame(randomSeed(), settings.level);
    },
    openDuel: ({ matchId, token, view: player, liveJoin }) => {
      const api = duelApiUrl();
      if (!api) return;
      leaveOnline();
      // An online duel is never a training tier: its finish must not write a carry-over.
      gameDifficulty = null;
      const client = new DuelClient({
        baseUrl: api,
        storage: browserStorage(),
        ...(duelRegion() ? { region: duelRegion()! } : {}),
      });
      const matchChannel = realtimeChannelFromEnv();
      const driver = createOnlineDriver({
        client,
        token,
        matchId,
        initial: player,
        channel: matchChannel,
        onChange: () => {
          const os = getOnlineSession();
          if (!os) return;
          activeMatchChat?.update();
          // Both ends of the replay, read BEFORE the display state is rebuilt: the cockpit's
          // read-out for the enemy's turn needs them, exactly as the offline game does. `pending`
          // is captured here too, because `consumeCatchUp` clears the driver's buffer below.
          const beforeState = os.state;
          const pending = os.driver.pendingEvents();
          os.refresh();
          syncSessionFromOnline();
          let catchUp: Step[] = [];
          try {
            catchUp = os.consumeCatchUp();
          } catch (error) {
            // A replay that cannot be built must never leave the gate shut: the session has already
            // closed it. Open it and say what happened, instead of a silent "Opponent's turn".
            const stack = error instanceof Error ? String(error.stack ?? '') : '';
            animLog('onchange:catchup-error', { message: String(error).slice(0, 300), stack: stack.slice(0, 500) });
            console.error('[FUTASAKU] could not build the enemy-turn replay', error);
            os.endReveal();
          }
          if (catchUp.length) {
            // The enemy's finished turn gets the SAME cockpit personality the player's own moves
            // get — same DisplayEvent, same one mechanism offline uses: the event rides its anchor
            // step (the outcome cue, else the turn's closing sync) and fires exactly when that step
            // animates, via the single `displaySteps` consumer. Their play is never silent again.
            //
            // Scope is the OPPONENT's replay only. `theirs` is read from the events (right for a
            // live turn AND a catch-up after being away, and never true for the player's own
            // aftermath, which keeps its current, silent-online behaviour).
            if (IS_FUTA04 && replayedByOpponent(pending, os.seat)) {
              const displayEvent = displayEventForPlay(beforeState, os.state, catchUp, HUMAN);
              const cue = outcomeCue(catchUp, HUMAN);
              if (cue) outcomeSteps.set(cue.step, cue);
              if (displayEvent) {
                const anchor = cue?.step ?? catchUp.find((step) => step.k === 'sync');
                if (anchor) displaySteps.set(anchor, displayEvent);
              }
              // "Not ours": dim the glass while it plays. Lifted at every drain point below.
              theirsDim.begin();
            }
            // The enemy's finished turn is shown at the OFFLINE game's own pace (one tile at a
            // time, MOTION.move each) so the player can see what arrived. A catch-up after being
            // away keeps its 2x and its Skip.
            markTiming('gate:closed', { steps: catchUp.length });
            liveReveal = os.revealIsLive;
            revealStartedAt = performance.now();
            if (liveReveal) {
              replaying = false;
              replaySpeed = REPLAY_SPEED;
            } else {
              replaying = true;
              replaySpeed = 2;
            }
            queue.push(catchUp);
            markTiming('replay:start', { steps: catchUp.length, live: liveReveal, queued: queue.pending });
            armRevealWatchdog(catchUp);
            void pump().then(() => {
              if (!liveReveal) {
                replaying = false;
                replaySpeed = REPLAY_SPEED;
              }
            });
          }
          // Invariant: while the gate is shut, the watchdog is armed. A reveal whose arm was
          // missed (or that produced no steps to push) must never wedge the gate — that is how a
          // decided match could sit on the board with nothing left to animate.
          if (os.isRevealing && !revealWatchdog) armRevealWatchdog(catchUp);
          paintOnlineHudFromSession();
          if (os.finished) gameOverDismissed = false;
          // Remember how far this device has seen, so a later resume replays only the gap.
          const snap = os.driver.snapshot();
          client.saveSession({ token, matchId, seat: snap.seat, revision: snap.revision });
          render();
        },
      });
      const os = new OnlineSession(driver);
      setOnlineSession(os);
      activeMatchChat = mountMatchChat({ host: $('game'), header: $('game').querySelector<HTMLElement>('.hud')!, client, token, matchId, channel: matchChannel, snapshot: () => driver.snapshot() });
      // An online duel is not a campaign match: drop the campaign level so no campaign-only
      // surface (guidance, the tutorial window, lesson copy) can read a stale one. The save keeps
      // the campaign's own progress; this is only what THIS match is.
      campaignLevel = null;
      tutorialReplay = false;
      campaignReplay = false;
      syncSessionFromOnline(true);
      if (session) {
        board.setup(session.state.config, session.state.terrain, theme().style, look(), theme().id);
        queue = new AnimQueue(session.state.board);
        shownScores = [session.view.score, session.view.opponentScore];
      }
      void driver.start();
      client.saveSession({ token, matchId, seat: player.seat, revision: player.revision });
      // Resign lives in the in-game pause menu (one confirm, exactly as before).
      onlineResign = () => {
        void (async () => {
          const cur = getOnlineSession();
          if (!cur || cur.driver !== driver) return;
          const res = await cur.resign();
          if (!res.ok) {
            caption(res.message, null, 'info');
            return;
          }
          syncSessionFromOnline(true);
          // Resigning can carry aftermath steps (the opponent's cut, the end). Replay them
          // through the same queue, and make sure the gate is always lifted.
          if (res.catchUp.length) {
            queue.push(res.catchUp);
            armRevealWatchdog(res.catchUp);
            void pump();
          } else {
            cur.endReveal();
          }
          paintOnlineHudFromSession();
          gameOverDismissed = false;
          render();
        })();
      };
      // Resign now lives in the pause menu (the old top-row chip is gone); reveal it for the duel.
      syncResignMenu();
      // Board first: the duel board is already visible before the lottery. Who starts is said once
      // by that reveal — there is no permanent chip any more.
      //
      // ONE DELIBERATE MOMENT (owner, 2026-10-28: "opening a duel from territory is taking you to
      // that duel in a cool way, small animation or effect"). Every lobby entry point funnels
      // through here: a match row, a friend joining, a join code, a Territory challenge. The lobby
      // screen the player is on tears its view down and leaves on the interface's own 100 ms beat;
      // the board is never animated, it is revealed underneath. `showScreen` then hides every lobby
      // screen via the same shared list, so even a route that forgets this call cannot stack them.
      onlineLobbyCtl?.leaveForMatch();
      showScreen('game');
      // The lottery animation is a one-off courtesy. It plays exactly once per player per match,
      // and only at the live-join moment: the waiting creator when the friend joins, or the joiner
      // itself. The per-match marker means a refresh, a return later, an async catch-up, or a
      // later turn never replays it. The offline game is untouched (startGame still awaits it).
      const store = browserStorage();
      const revealed = hasStarterRevealed(store, matchId);
      if (shouldPlayStarterLottery({ status: player.status, liveJoin, alreadyRevealed: revealed })) {
        markStarterRevealed(store, matchId);
        // The server owns who starts. Both seats key the presentation by the same match id, so they
        // see the same two cards; each maps them to You / Opponent locally.
        const starterSeat = player.startingPlayer ?? player.view.turnPlayer;
        const meFirst = starterSeat === player.seat;
        const ritual = starterRitualView(onlineRitualKey(matchId), starterSeat, player.seat);
        announceTurn(meFirst ? HUMAN : BOT);
        const play = () => {
          const cur = getOnlineSession();
          if (!cur || cur.driver !== driver || $('game').hidden) return;
          void runStarterRitual(ritual)
            .then(() => {
              const still = getOnlineSession();
              if (!still || still.driver !== driver || $('game').hidden) return;
              // The match was prepared underneath; this is the one repaint that unlocks its input.
              render();
              paintOnlineHudFromSession();
            })
            .catch(() => undefined);
        };
        // "Actually on the screen": if this tab is hidden at the live-join moment, wait for it to
        // come back rather than animating off-screen (the marker is already written, so it plays
        // at most once either way).
        if (document.visibilityState === 'hidden') {
          const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            document.removeEventListener('visibilitychange', onVisible);
            play();
          };
          document.addEventListener('visibilitychange', onVisible);
        } else {
          play();
        }
      }
      paintOnlineHudFromSession();
      render();
    },
  });
  onlineLobbyCtl = lobby;
  void lobby.handleBootHash();
  // Live duels (test channel; docs/LIVE.md): its own module, mounted with three ways back.
  void import('./online/live/flag.js').then((f) => { if (f.liveDuelsEnabled()) void import('./online/live/mount.js').then((live) => live.mountLive({
    openMatch: (id) => lobby.openMatch?.(id),
    continueBotGame: () => { leaveOnline(); continueGame(); },
    showMenu: () => { leaveOnline(); showScreen('menu'); },
  })); });
});

window.addEventListener('popstate', () => {
  if (coach.tutorial) exitTutorial();
});
window.addEventListener('error', () => {
  if (coach.tutorial) tutorialGate?.clear();
});
window.addEventListener('pagehide', () => {
  tutorialGate?.clear();
});

// `?debug=timing`: a small on-screen readout of the same trace the harness reads from `window`.
// It is the only UI the trace has; it never touches the game and never renders without the flag.
if (timingEnabled()) {
  const box = document.createElement('pre');
  box.id = 'timing-readout';
  box.style.cssText = [
    'position:fixed', 'left:6px', 'bottom:6px', 'z-index:80', 'margin:0', 'padding:6px 8px',
    'max-width:min(94vw,560px)', 'max-height:38vh', 'overflow:hidden', 'pointer-events:none',
    'font:11px/1.35 ui-monospace,monospace', 'color:#d9f2c8', 'background:rgba(4,8,6,.82)',
    'border-radius:8px', 'white-space:pre-wrap',
  ].join(';');
  document.body.appendChild(box);
  const renderReadout = () => {
    const all = timingLog();
    const lines = all.slice(-16).map((m) => `${m.t.toFixed(0).padStart(7)}ms  ${m.ev}${m.d ? '  ' + JSON.stringify(m.d) : ''}`);
    box.textContent = `timing (${all.length} marks)\n${lines.join('\n')}`;
    window.setTimeout(renderReadout, 250);
  };
  renderReadout();
}

// Beta feedback (docs/BETA.md): Report a problem, crash reports, the #beta tester guide. Read-only.
void import('./feedback/mount.js').then((f) => f.mountFeedback()).catch(() => undefined);
// Accounts: "Continue with Google" (docs/ACCOUNTS.md); shows nothing until Google is on in Supabase.
void import('./accounts/mount.js').then((a) => a.mountAccounts()).catch(() => undefined);
// Seeds earned while the settle could not run are QUEUED on this device, not lost. Drain them as
// soon as the app is up (owner ask, 2026-10-25: "every level of campaign and any other game should
// pay out seeds immediately"): a player whose proofs were stranded by the old wedge sees the balance
// right on their next visit, without having to win another game first. Silent and fire-and-forget;
// a device with nothing queued makes no request at all.
void settleQueuedSeedsOnBoot();
appReady = true;
window.dispatchEvent(new Event('severor-ready'));
