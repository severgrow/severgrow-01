// The pre-game card ritual: arrival, cut and riffle, two dealt cards, simultaneous reveal, result,
// then every card is gathered into the real draw pile.
//
// This is presentation only. The winner is decided by the engine/server and handed in as
// `view.starter`; the two faces are chosen by `logic/starter-ritual.ts` from a public key, so the
// higher card always belongs to that same seat. Nothing here reads or writes game state.
//
// The two dealt cards are placed beside the players' OWN HOME TILES, measured from the rendered
// board at match start, so the composition always says "this is yours, that is theirs" without
// labels, on any viewport. The deck sits above the middle; the result appears in the gap between
// the deck and the two cards.
//
// Engineering rules this file keeps:
//   * one explicit phase at a time (`data-phase`), no chains of stray timeouts;
//   * WAAPI transform/opacity only — no layout animation, no backdrop-filter animation;
//   * every animation is tracked and cancelled on finish/cancel/skip;
//   * `playStarterRitual` has one idempotent resolution: skip, cancel, visibility loss and a new
//     match can never leave a half-shown overlay or a locked game behind;
//   * the overlay is static markup, so there is no first-frame creation flicker or layout shift.
import { OPP } from '../../../src/strings.js';
import { SUIT_NAMES } from '../../../src/engine/index.js';
import type { Card } from '../../../src/engine/index.js';
import { cardFace, suitClass } from '../ui/effects.js';
import { preloadCardArt } from './cards.js';
import type { RitualCard, StarterRitualView } from '../logic/starter-ritual.js';
import { RITUAL_DECK_SIZE } from '../logic/starter-ritual.js';

/** How long the outcome ("You start" / "Opponent starts") is held before the deck gathers. */
export const RESULT_HOLD_MS = 1000;

export type StarterRitualPhase = 'idle' | 'arrive' | 'shuffle' | 'deal' | 'reveal' | 'result' | 'exit' | 'done';

export type StarterRitualTempo = 'slow' | 'normal' | 'fast' | 'skip';

/** A home tile as the browser rendered it; null when the board is not measurable yet. */
export type RitualHomeRects = { you: DOMRect | null; opponent: DOMRect | null };

export type StarterRitualOptions = {
  readonly view: StarterRitualView;
  readonly reduceMotion: boolean;
  readonly tempo: StarterRitualTempo;
  readonly youLabel?: string;
  readonly opponentLabel?: string;
  /** The real in-game draw pile, measured at exit so every card lands in it, not on a guess. */
  readonly deckTarget?: () => DOMRect | null;
  /** The two home tiles in screen space: where each dealt card belongs. */
  readonly homeRects?: () => RitualHomeRects;
  readonly onPhase?: (phase: StarterRitualPhase) => void;
};

const TEMPO_SCALE: Record<StarterRitualTempo, number> = { slow: 1.16, normal: 1, fast: 0.82, skip: 1 };
/** One layer per card in the nine-card deck; the DOM stack and the logic deck must agree. */
const DECK_LAYERS = RITUAL_DECK_SIZE;
/** Distance from the edge of the viewport that a dealt card may never cross. */
const SAFE_MARGIN = 14;

let running: StarterRitual | null = null;

/** True while the ritual owns the screen. The game's input/bot gate reads this. */
export const isStarterRitualPlaying = (): boolean => running !== null;

/** The one external cancel: leaving the duel, starting another match, page teardown. */
export const cancelStarterRitual = (): void => running?.cancel();

type Point = { x: number; y: number };

type Refs = {
  overlay: HTMLElement;
  deckAnchor: HTMLElement;
  deck: HTMLElement;
  layers: HTMLElement[];
  youSlot: HTMLElement;
  opponentSlot: HTMLElement;
  youCard: HTMLElement;
  opponentCard: HTMLElement;
  youInner: HTMLElement;
  opponentInner: HTMLElement;
  youFront: HTMLElement;
  opponentFront: HTMLElement;
  youBack: HTMLElement;
  opponentBack: HTMLElement;
  title: HTMLElement;
  outcome: HTMLElement;
};

const readRefs = (): Refs | null => {
  const overlay = document.getElementById('starter-lottery');
  const deckAnchor = document.getElementById('lottery-deck-anchor');
  const deck = document.getElementById('lottery-deck');
  const youSlot = document.getElementById('lottery-lane-you');
  const opponentSlot = document.getElementById('lottery-lane-opponent');
  const youCard = document.getElementById('lottery-card-you');
  const opponentCard = document.getElementById('lottery-card-opponent');
  const youInner = document.getElementById('lottery-inner-you');
  const opponentInner = document.getElementById('lottery-inner-opponent');
  const youFront = document.getElementById('lottery-face-you');
  const opponentFront = document.getElementById('lottery-face-opponent');
  const youBack = document.getElementById('lottery-back-you');
  const opponentBack = document.getElementById('lottery-back-opponent');
  const title = document.getElementById('lottery-title');
  const outcome = document.getElementById('lottery-outcome');
  if (!overlay || !deckAnchor || !deck || !youSlot || !opponentSlot || !youCard || !opponentCard || !youInner
    || !opponentInner || !youFront || !opponentFront || !youBack || !opponentBack || !title
    || !outcome) return null;
  return {
    overlay,
    deckAnchor,
    deck,
    layers: [...overlay.querySelectorAll<HTMLElement>('.ritual-deck-layer')],
    youSlot,
    opponentSlot,
    youCard,
    opponentCard,
    youInner,
    opponentInner,
    youFront,
    opponentFront,
    youBack,
    opponentBack,
    title,
    outcome,
  };
};

const asCard = (card: RitualCard): Card => ({ id: 0, suit: card.suit, rank: card.rank });

const faceMarkup = (card: RitualCard): string => {
  const cardLike = asCard(card);
  return `<div class="card ${suitClass(cardLike)}">${cardFace(cardLike)}</div>`;
};

const cardWords = (card: RitualCard, who: string): string =>
  `${who}: ${card.rank} of ${SUIT_NAMES[card.suit as 0 | 1 | 2 | 3]}`;

const centerOfRect = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

class StarterRitual {
  private readonly options: StarterRitualOptions;
  private readonly refs: Refs;
  private readonly done: Promise<void>;
  private resolveDone: () => void = () => undefined;
  private readonly animations: Animation[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly waiters = new Set<() => void>();
  private finished = false;
  private cancelled = false;
  private skipRequested = false;
  private skipHandled = false;
  private exiting = false;
  private deckScale = 1;
  private settleTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: StarterRitualOptions, refs: Refs) {
    this.options = options;
    this.refs = refs;
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  play(): Promise<void> {
    this.reset();
    this.listen();
    this.refs.overlay.hidden = false;
    this.refs.overlay.dataset.starter = this.options.view.starter;
    this.refs.overlay.dataset.youRank = String(this.options.view.you.rank);
    this.refs.overlay.dataset.opponentRank = String(this.options.view.opponent.rank);
    this.refs.youCard.setAttribute('aria-label', cardWords(this.options.view.you, 'Your card'));
    this.refs.opponentCard.setAttribute(
      'aria-label',
      cardWords(this.options.view.opponent, `${this.options.opponentLabel ?? OPP.label}'s card`),
    );
    this.stampDeck();
    this.layout();
    // The board can settle its own layout one frame after the game screen is shown; refine the two
    // dealt-card positions then, while both cards are still face down and invisible.
    requestAnimationFrame(() => {
      if (!this.cancelled && !this.finished) this.layout();
    });
    this.setPhase('arrive');
    void this.timeline();
    return this.done;
  }

  cancel(): void {
    if (this.finished) return;
    this.cancelled = true;
    this.finish();
  }

  // ---------------------------------------------------------------- geometry

  private cardSize(): { w: number; h: number } {
    const rect = this.refs.youSlot.getBoundingClientRect();
    return { w: rect.width || 96, h: rect.height || 136 };
  }

  /**
   * Places the two dealt cards and the deck from measured board geometry.
   *
   * Each card belongs beside its owner's home tile, pushed a little further out from the centre of
   * the screen so it sits against the home rather than covering it. The deck waits between the two
   * cards — that is where the eye is, and it is where the result can appear over the dimmed stack
   * without ever covering a card. On a phone this reads as top card, deck/result, bottom card.
   */
  private layout(): void {
    const r = this.refs;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { w: cw, h: ch } = this.cardSize();
    const marginX = SAFE_MARGIN + cw / 2;
    const marginY = SAFE_MARGIN + ch / 2;

    const homes = this.options.homeRects?.() ?? { you: null, opponent: null };
    const youHome = homes.you && homes.you.width > 1 ? centerOfRect(homes.you) : null;
    const oppHome = homes.opponent && homes.opponent.width > 1 ? centerOfRect(homes.opponent) : null;
    // The two homes define the ritual's axis. Each card is pushed away from the OTHER home, so the
    // pair always reads as one card at your home and one at theirs — top and bottom on a phone,
    // diagonally on a wide board — whatever the camera is doing.
    const axis = youHome && oppHome
      ? { x: (youHome.x + oppHome.x) / 2, y: (youHome.y + oppHome.y) / 2 }
      : { x: vw / 2, y: vh / 2 };
    const place = (home: Point | null, fallback: Point): Point => {
      if (!home) return fallback;
      const dx = home.x - axis.x;
      const dy = home.y - axis.y;
      const len = Math.hypot(dx, dy) || 1;
      // The card lies ON its home: a small outward nudge keeps the landmark's silhouette readable
      // while the card clearly belongs to that tile.
      const push = Math.min(12, ch * 0.08);
      return {
        x: clamp(home.x + (dx / len) * push, marginX, vw - marginX),
        y: clamp(home.y + (dy / len) * push, marginY, vh - marginY),
      };
    };
    const you = place(youHome, { x: vw * 0.26, y: vh * 0.76 });
    const opponent = place(oppHome, { x: vw * 0.74, y: vh * 0.24 });
    r.youSlot.style.left = `${you.x.toFixed(1)}px`;
    r.youSlot.style.top = `${you.y.toFixed(1)}px`;
    r.opponentSlot.style.left = `${opponent.x.toFixed(1)}px`;
    r.opponentSlot.style.top = `${opponent.y.toFixed(1)}px`;

    // The deck waits on the same axis, halfway between the two cards, and shrinks to the free gap
    // between them so it never sits behind a dealt card. The result takes the deck's own place;
    // the deck dims underneath it during the reveal, then returns for the final gather.
    const midY = (you.y + opponent.y) / 2;
    const gap = Math.abs(you.y - opponent.y) - ch;
    this.deckScale = clamp(gap / (ch * 1.12), 0.58, 1);
    const deck: Point = {
      x: clamp((you.x + opponent.x) / 2, marginX, vw - marginX),
      y: clamp(midY, marginY, vh - marginY),
    };
    r.deckAnchor.style.left = `${deck.x.toFixed(1)}px`;
    r.deckAnchor.style.top = `${deck.y.toFixed(1)}px`;
    r.deckAnchor.style.setProperty('--ritual-deck-scale', this.deckScale.toFixed(3));
    // Keep the result's own box inside the viewport even when the deck sits off-centre (a phone in
    // landscape puts the board's homes on the left); the words stay centred on the ritual.
    const outcomeHalf = Math.min(vw * 0.86, 520) / 2 + 8;
    r.outcome.style.left = `${clamp(deck.x, outcomeHalf, vw - outcomeHalf).toFixed(1)}px`;
    r.outcome.style.top = `${clamp(deck.y, 40, vh - 32).toFixed(1)}px`;
  }

  /** Re-place the composition on a real viewport change; safe at any phase and cheap to repeat. */
  private onResize = (): void => {
    this.followHomes();
  };

  /**
   * A viewport change re-fits (and on a phone rotates) the board over a few frames, so the homes
   * keep moving after the resize event itself. Follow them until two samples agree, re-placing the
   * two cards and the deck each time — every animation is relative to these slots, so the ritual
   * simply continues around the homes' new positions instead of stranding the cards mid-screen.
   */
  private followHomes(): void {
    clearInterval(this.settleTimer);
    const started = performance.now();
    let last = '';
    let stable = 0;
    const step = (): void => {
      if (this.cancelled || this.finished) {
        clearInterval(this.settleTimer);
        this.settleTimer = undefined;
        return;
      }
      this.layout();
      const now = this.homeSignature();
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 2 || performance.now() - started > 1_500) {
        clearInterval(this.settleTimer);
        this.settleTimer = undefined;
      }
    };
    step();
    this.settleTimer = setInterval(step, 90);
  }

  private homeSignature(): string {
    const homes = this.options.homeRects?.() ?? { you: null, opponent: null };
    const sig = (r: DOMRect | null): string =>
      r && r.width > 1 && r.height > 1
        ? `${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)}`
        : '-';
    return `${sig(homes.you)}|${sig(homes.opponent)}`;
  }

  // ---------------------------------------------------------------- choreography

  private async timeline(): Promise<void> {
    try {
      if (this.options.reduceMotion || this.options.tempo === 'skip') {
        // Reduced motion is about immediacy: show the result now, let the art settle underneath.
        void this.ensureCardArt();
      } else {
        await this.ensureCardArt();
      }
      if (this.cancelled) return;
      if (this.skipRequested) {
        await this.finishSkipped();
        return;
      }
      if (this.options.reduceMotion || this.options.tempo === 'skip') {
        await this.reducedTimeline();
        return;
      }
      await this.fullTimeline();
    } catch {
      // A visual flourish must never be able to hold the match hostage.
      if (!this.finished) this.finish();
    }
  }

  private async fullTimeline(): Promise<void> {
    await this.arrival();
    if (this.cancelled || this.skipRequested) return;

    this.setPhase('shuffle');
    await this.shuffle();
    if (this.cancelled || this.skipRequested) return;

    this.setPhase('deal');
    await this.deal();
    if (this.cancelled || this.skipRequested) return;

    this.setPhase('reveal');
    await this.reveal();
    if (this.cancelled || this.skipRequested) return;

    this.setPhase('result');
    this.showOutcome();
    // "You start" / "Opponent starts" stays readable for a full second (owner, 2026-10-23).
    await this.sleep(this.ms(RESULT_HOLD_MS));
    if (this.cancelled || this.skipRequested) return;

    await this.exit(false);
  }

  private async reducedTimeline(): Promise<void> {
    // No deck, no cut, no flight: the two faces and the result are simply present, held long
    // enough to read. The game is still prepared underneath and becomes interactive on the same beat.
    this.setPhase('result');
    this.showFinalState();
    await this.sleep(this.options.tempo === 'skip' ? 180 : 760);
    if (this.cancelled) return;
    await this.exit(true);
  }

  private async arrival(): Promise<void> {
    const r = this.refs;
    const ms = this.ms(320);
    const deck = this.animate(r.deck, [
      { translate: '12vw 24vh', rotate: '9deg', scale: 0.86, opacity: 0 },
      { translate: '0px 0px', rotate: '-1.1deg', scale: 1.012, opacity: 1, offset: 0.76 },
      { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.16,.84,.28,1)' });
    await this.playAnimations([deck]);
    await this.sleep(this.ms(20));
  }

  /**
   * A cut, a riffle, a square-up — read as handling a real deck.
   *
   * The stack splits into two visible packets. Each packet is fanned while held (so the eye sees
   * several cards, not two blocks), then its cards are released one at a time, alternating between
   * the packets, each lifting off its packet, crossing the gap and landing into the growing centre
   * stack. The packets only compress again in the final square-up.
   */
  private async shuffle(): Promise<void> {
    const r = this.refs;
    const { w, h } = this.cardSize();
    const sep = w * 0.52;
    const lift = h * 0.055;
    const base = this.baseOffsets();

    type Pose = { x: number; y: number; rot: number };
    const cutPose: Pose[] = base.map((b, index) => {
      if (index >= 5) {
        const k = index - 5;
        return {
          x: sep + k * 2.6,
          y: b.y - lift + k * 1.2,
          rot: b.rot + 2.4 - k * 0.5,
        };
      }
      // The lower packet fans to the left, its topmost card furthest out.
      return {
        x: -sep * 0.34 - index * 2.6,
        y: b.y + index * 0.9,
        rot: b.rot - 1.2 - index * 0.3,
      };
    });

    // Beat 1 — the cut: one stack becomes two fanned packets.
    const cutMs = this.ms(140);
    const cutAnimations: (Animation | null)[] = r.layers.map((layer, index) => {
      const b = base[index]!;
      const c = cutPose[index]!;
      return this.animate(layer, [
        { translate: `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`, rotate: `${b.rot.toFixed(2)}deg` },
        { translate: `${c.x.toFixed(2)}px ${c.y.toFixed(2)}px`, rotate: `${c.rot.toFixed(2)}deg` },
      ], {
        duration: cutMs,
        delay: this.ms(Math.abs(index - 5) * 9),
        easing: 'cubic-bezier(.28,.72,.22,1)',
      });
    });
    await this.playAnimations(cutAnimations);
    if (this.cancelled || this.skipRequested) return;
    // A short held beat: the two packets are visibly apart before the riffle begins.
    await this.sleep(this.ms(24));
    if (this.cancelled || this.skipRequested) return;

    // Beat 2 — the riffle: alternate releases, top packet then bottom, each card peeling off its
    // own packet, arcing over the gap and settling into the centre.
    const order: number[] = [];
    for (let top = 8, bottom = 4; top >= 5 || bottom >= 0; top--, bottom--) {
      if (top >= 5) order.push(top);
      if (bottom >= 0) order.push(bottom);
    }
    const riffleMs = this.ms(270);
    const stagger = this.ms(13);
    const riffleAnimations: (Animation | null)[] = [];
    order.forEach((index, step) => {
      const layer = r.layers[index];
      const b = base[index]!;
      const c = cutPose[index]!;
      if (!layer) return;
      riffleAnimations.push(this.animate(layer, [
        { translate: `${c.x.toFixed(2)}px ${c.y.toFixed(2)}px`, rotate: `${c.rot.toFixed(2)}deg` },
        {
          translate: `${c.x.toFixed(2)}px ${(c.y - 9).toFixed(2)}px`,
          rotate: `${(c.rot + 1.8).toFixed(2)}deg`,
          offset: 0.16,
        },
        {
          translate: `${lerp(c.x, b.x, 0.62).toFixed(2)}px ${(lerp(c.y, b.y, 0.62) - 7).toFixed(2)}px`,
          rotate: `${lerp(c.rot, b.rot, 0.62).toFixed(2)}deg`,
          offset: 0.58,
        },
        {
          translate: `${b.x.toFixed(2)}px ${(b.y + 2).toFixed(2)}px`,
          rotate: `${b.rot.toFixed(2)}deg`,
          offset: 0.9,
        },
        { translate: `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`, rotate: `${b.rot.toFixed(2)}deg` },
      ], {
        duration: riffleMs,
        delay: step * stagger,
        easing: 'cubic-bezier(.34,.02,.22,1)',
      }));
    });
    await this.playAnimations(riffleAnimations);
    if (this.cancelled || this.skipRequested) return;

    // Beat 3 — square up: the stack is pressed back into one neat deck.
    const squareMs = this.ms(110);
    const squareAnimations: (Animation | null)[] = r.layers.map((layer, index) => {
      const b = base[index]!;
      return this.animate(layer, [
        { translate: `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`, rotate: `${b.rot.toFixed(2)}deg` },
        {
          translate: `${(b.x * 0.35).toFixed(2)}px ${b.y.toFixed(2)}px`,
          rotate: `${(b.rot * 0.6).toFixed(2)}deg`,
          offset: 0.55,
        },
        { translate: `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`, rotate: `${b.rot.toFixed(2)}deg` },
      ], { duration: squareMs, easing: 'cubic-bezier(.3,.8,.3,1)' });
    });
    squareAnimations.push(this.animate(r.deck, [
      { scale: 1 },
      { scale: 1.008, offset: 0.5 },
      { scale: 1 },
    ], { duration: this.ms(130), easing: 'ease-out' }));
    await this.playAnimations(squareAnimations);
    // Every layer ended at its resting offset; drop the finished animations so the stack returns to
    // its inline baseline and nothing piles up during the deal.
    this.cancelAnimations();
    await this.sleep(this.ms(24));
  }

  private async deal(): Promise<void> {
    const r = this.refs;
    const deckRect = r.deck.getBoundingClientRect();
    const deckC = centerOfRect(deckRect);
    const duration = this.ms(370);
    const fly = (slot: HTMLElement, card: HTMLElement, side: 'you' | 'opponent', delay: number): Animation | null => {
      const rect = slot.getBoundingClientRect();
      const c = centerOfRect(rect);
      const dx = deckC.x - c.x;
      const dy = deckC.y - c.y;
      const len = Math.hypot(dx, dy) || 1;
      // A gentle arc off the straight line, in opposite directions for the two cards.
      const bend = (side === 'you' ? 1 : -1) * Math.min(26, len * 0.09);
      const px = (-dy / len) * bend;
      const py = (dx / len) * bend;
      const angle = side === 'you' ? -8 : 8;
      return this.animate(card, [
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: `${angle}deg`, scale: 0.88, opacity: 0 },
        { translate: `${(dx * 0.94).toFixed(2)}px ${(dy * 0.94).toFixed(2)}px`, rotate: `${(angle * 0.94).toFixed(2)}deg`, scale: 0.9, opacity: 1, offset: 0.1 },
        {
          translate: `${(dx * 0.5 + px).toFixed(2)}px ${(dy * 0.5 + py).toFixed(2)}px`,
          rotate: `${(angle * 0.5).toFixed(2)}deg`,
          scale: 0.94,
          opacity: 1,
          offset: 0.54,
        },
        { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 1 },
      ], { duration, delay, easing: 'cubic-bezier(.2,.74,.16,1)' });
    };
    const you = fly(r.youSlot, r.youCard, 'you', 0);
    const opponent = fly(r.opponentSlot, r.opponentCard, 'opponent', this.ms(70));
    // The two dealt cards are the top two cards of the stack, so the stack behind them shrinks to
    // seven as they leave. That keeps the count honest at every moment: nine cards in all, never
    // nine backs plus two faces.
    const leaving = this.dealtLayers().map((layer, index) => this.animate(layer, [
      { opacity: 1 },
      { opacity: 0 },
    ], { duration: this.ms(110), delay: index === 0 ? this.ms(20) : this.ms(90), easing: 'ease-out' }));
    // The deck rocks back very slightly as the two cards leave it.
    const recoil = this.animate(r.deck, [
      { scale: 1, translate: '0px 0px' },
      { scale: 0.986, translate: '0px 1.5px', offset: 0.34 },
      { scale: 1, translate: '0px 0px' },
    ], { duration: this.ms(330), easing: 'ease-out' });
    await this.playAnimations([you, opponent, ...leaving, recoil]);
    await this.sleep(this.ms(24));
  }

  private async reveal(): Promise<void> {
    const r = this.refs;
    const flipMs = this.ms(370);
    const half = this.ms(170);
    // Each face turns edge-on and the other continues from edge-on: no nested 3D, no culling.
    const collapse = (back: HTMLElement): Animation | null => this.animate(back, [
      { transform: 'rotateY(0deg)', opacity: 1 },
      { transform: 'rotateY(90deg)', opacity: 1, offset: 0.92 },
      { transform: 'rotateY(90deg)', opacity: 0 },
    ], { duration: half, easing: 'cubic-bezier(.45,.05,.85,.35)' });
    const expand = (front: HTMLElement): Animation | null => {
      front.style.opacity = '1';
      return this.animate(front, [
        { transform: 'rotateY(-90deg)' },
        { transform: 'rotateY(0deg)' },
      ], {
        duration: flipMs - half,
        delay: half,
        easing: 'cubic-bezier(.1,.45,.2,1)',
      });
    };
    // The deck eases back a touch as the two faces become the subject; it never leaves the screen,
    // because the exit gathers every one of its cards into the real draw pile.
    const deckBack = this.animate(r.deck, [
      { scale: 1, opacity: 1 },
      { scale: 0.972, opacity: 0.1 },
    ], { duration: flipMs, easing: 'ease-out' });
    await this.playAnimations([
      collapse(r.youBack),
      collapse(r.opponentBack),
      expand(r.youFront),
      expand(r.opponentFront),
      deckBack,
    ]);
    if (this.cancelled || this.skipRequested) return;

    const starter = this.options.view.starter;
    const winningCard = starter === 'you' ? r.youCard : r.opponentCard;
    const losingCard = starter === 'you' ? r.opponentCard : r.youCard;
    const winningSlot = starter === 'you' ? r.youSlot : r.opponentSlot;
    const losingSlot = starter === 'you' ? r.opponentSlot : r.youSlot;
    winningSlot.classList.add('is-winner');
    losingSlot.classList.add('is-losing');
    r.youCard.classList.add('is-revealed');
    r.opponentCard.classList.add('is-revealed');
    this.animate(winningCard, [
      { translate: '0px 0px' },
      { translate: '0px -7px' },
    ], { duration: this.ms(280), easing: 'cubic-bezier(.2,.72,.24,1)' });
    this.animate(losingCard, [
      { opacity: 1 },
      { opacity: 0.86 },
    ], { duration: this.ms(280), easing: 'ease-out' });
    await this.sleep(this.ms(110));
  }

  /** A short reverse flip: the named face folds away and the back comes back up. */
  private faceDown(front: HTMLElement, back: HTMLElement, delay: number): Animation | null {
    const ms = this.ms(190);
    this.animate(back, [
      { transform: 'rotateY(90deg)', opacity: 0 },
      { transform: 'rotateY(0deg)', opacity: 1 },
    ], { duration: ms, delay, easing: 'cubic-bezier(.2,.5,.3,1)' });
    return this.animate(front, [
      { transform: 'rotateY(0deg)', opacity: 1 },
      { transform: 'rotateY(-90deg)', opacity: 0 },
    ], { duration: ms, delay, easing: 'cubic-bezier(.5,.1,.8,.4)' });
  }

  private showOutcome(): void {
    const r = this.refs;
    const starter = this.options.view.starter;
    const opponent = this.options.opponentLabel ?? OPP.label;
    // The cards have just said which rank was higher; the outcome only needs to name the starter.
    r.title.textContent = starter === 'you' ? 'You start' : `${opponent} starts`;
    r.outcome.classList.add('is-shown');
  }

  private showFinalState(): void {
    const r = this.refs;
    const starter = this.options.view.starter;
    r.deck.style.opacity = '0';
    for (const card of [r.youCard, r.opponentCard]) {
      card.style.translate = '0px 0px';
      card.style.rotate = '0deg';
      card.style.scale = '1';
      card.style.opacity = '1';
      card.classList.add('is-revealed');
    }
    for (const face of [r.youFront, r.opponentFront]) {
      face.style.opacity = '1';
      face.style.transform = 'rotateY(0deg)';
    }
    for (const back of [r.youBack, r.opponentBack]) {
      back.style.opacity = '0';
      back.style.transform = 'rotateY(90deg)';
    }
    const winningSlot = starter === 'you' ? r.youSlot : r.opponentSlot;
    const losingSlot = starter === 'you' ? r.opponentSlot : r.youSlot;
    winningSlot.classList.add('is-winner');
    losingSlot.classList.add('is-losing');
    this.showOutcome();
  }

  private async finishSkipped(): Promise<void> {
    if (this.skipHandled || this.finished) return;
    this.skipHandled = true;
    this.cancelAnimations();
    this.showFinalState();
    this.setPhase('result');
    await this.sleep(this.options.reduceMotion ? 240 : 220);
    if (this.cancelled || this.finished) return;
    await this.exit(true);
  }

  /**
   * The exit, in two readable beats:
   *   1. the two revealed cards are gathered back onto the deck at the middle of the screen;
   *   2. every card — all nine deck layers and the two dealt ones — travels to the real draw pile,
   *      each on its own short arc with a small stagger, fading only as it arrives.
   * The overlay then fades, so the finished pile is the last thing the eye rests on.
   */
  private async exit(fast: boolean): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    this.setPhase('exit');
    const r = this.refs;
    r.outcome.classList.remove('is-shown');

    if (fast) {
      await this.playAnimations([this.animate(r.overlay, [{ opacity: 1 }, { opacity: 0 }], {
        duration: this.ms(170),
        easing: 'ease-out',
      })]);
      this.finish();
      return;
    }

    // Beat 1: gather the two dealt cards over the deck, and bring the deck itself back up as they
    // arrive — the ritual's stack visibly re-forms before it is filed away.
    const deckC = centerOfRect(r.deck.getBoundingClientRect());
    const gatherMs = this.ms(175);
    this.animate(r.deck, [
      { opacity: 0.1, scale: 0.972 },
      { opacity: 1, scale: 1 },
    ], { duration: gatherMs, easing: 'ease-out' });
    const gather = ([slot, card]: [HTMLElement, HTMLElement], delay: number): Animation | null => {
      const slotC = centerOfRect(slot.getBoundingClientRect());
      const cardRect = card.getBoundingClientRect();
      const cardC = centerOfRect(cardRect);
      const fromX = cardC.x - slotC.x;
      const fromY = cardC.y - slotC.y;
      const dx = deckC.x - slotC.x;
      const dy = deckC.y - slotC.y;
      return this.animate(card, [
        { translate: `${fromX.toFixed(2)}px ${fromY.toFixed(2)}px`, rotate: '0deg', scale: 1 },
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: '0deg', scale: 0.95 },
      ], { duration: gatherMs, delay, easing: 'cubic-bezier(.4,.05,.2,1)' });
    };
    await this.playAnimations([
      gather([r.youSlot, r.youCard], 0),
      gather([r.opponentSlot, r.opponentCard], this.ms(36)),
      // Turned face down on the way back, so the deck that files into the pile is a normal deck.
      this.faceDown(r.youFront, r.youBack, 0),
      this.faceDown(r.opponentFront, r.opponentBack, this.ms(36)),
    ]);
    if (this.cancelled || this.skipRequested) return;

    // Beat 1½: the two cards are back on the deck, so the stack is whole again — nine. Swap the
    // travelling cards for their own layers at the same point on screen (cancelling the fills
    // restores the layers the deal hid), so exactly nine cards leave for the pile, not eleven.
    this.cancelAnimations();
    for (const card of [r.youCard, r.opponentCard]) card.style.opacity = '0';
    for (const slot of [r.youSlot, r.opponentSlot]) slot.classList.remove('is-winner', 'is-losing');

    // Beat 2: every card files into the real draw pile.
    const pileRect = this.options.deckTarget?.() ?? null;
    const pile = pileRect && pileRect.width > 1 && pileRect.height > 1 ? pileRect : null;
    const pileTarget = pile
      ? centerOfRect(pile)
      : { x: window.innerWidth * 0.2, y: window.innerHeight * 0.9 };
    const { w: cardW, h: cardH } = this.cardSize();
    // Land at the pile's own on-screen size: the cards finish inside the tile, on top of the pile's
    // own card, instead of floating over it at a guessed scale.
    const pileScale = pile
      ? clamp(Math.min(pile.width / cardW, pile.height / cardH), 0.08, 1)
      : 0.4;
    const streamMs = this.ms(440);
    const stagger = this.ms(10);
    const stream: (Animation | null)[] = [];
    /** How far into each card's own flight the group has formed up on the line into the tile. */
    const CONVERGE_AT = 0.62;
    /** How much of the whole distance is already covered when the group has formed up. */
    const CONVERGED_DISTANCE = 0.92;
    const toPile = (
      el: Element,
      order: number,
      parentScale: number,
    ): Animation | null => {
      const c = centerOfRect(el.getBoundingClientRect());
      // Screen-space travel, converted back into this element's own (possibly scaled) coordinates.
      const k = parentScale || 1;
      const dx = (pileTarget.x - c.x) / k;
      const dy = (pileTarget.y - c.y) / k;
      const len = Math.hypot(dx, dy) || 1;
      // One shared line into the tile. Each card gets its own lane, but the lanes are a few pixels
      // wide at most and close to nothing while most of the flight is still ahead, so what the eye
      // follows is a single stream forming up — not nine cards on nine different arcs. The very last
      // stretch is a short, almost straight drop onto the pile's own card.
      const lane = DECK_LAYERS > 1 ? (order / (DECK_LAYERS - 1)) * 2 - 1 : 0;
      const spread = lane * Math.min(7, len * 0.05);
      const ux = -dy / len;
      const uy = dx / len;
      // Under 2° even at its widest, and gone well before the landing.
      const tilt = lane * 1.6;
      const localScale = clamp(pileScale / k, 0.05, 1);
      return this.animate(el, [
        // Ease out of the deck, build speed gently, then settle into the tile: one gesture, no
        // keyframe where the direction visibly changes.
        { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 1, easing: 'cubic-bezier(.33,.03,.43,.99)' },
        {
          translate: `${(dx * 0.34 + ux * spread).toFixed(2)}px ${(dy * 0.34 + uy * spread).toFixed(2)}px`,
          rotate: `${tilt.toFixed(2)}deg`,
          scale: lerp(1, localScale, 0.2),
          opacity: 1,
          offset: 0.3,
          easing: 'linear',
        },
        {
          translate: `${(dx * CONVERGED_DISTANCE + ux * spread * 0.08).toFixed(2)}px ${(dy * CONVERGED_DISTANCE + uy * spread * 0.08).toFixed(2)}px`,
          rotate: `${(tilt * 0.08).toFixed(2)}deg`,
          scale: lerp(1, localScale, 0.78),
          opacity: 1,
          offset: CONVERGE_AT,
          easing: 'cubic-bezier(.22,.32,.18,1)',
        },
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: '0deg', scale: localScale, opacity: 0 },
      ], {
        duration: streamMs,
        delay: order * stagger,
        easing: 'linear',
      });
    };
    r.layers.forEach((layer, index) => {
      stream.push(toPile(layer, DECK_LAYERS - 1 - index, this.deckScale));
    });

    // The veil leaves while the cards are still travelling, so the pile receives them in the
    // already-visible game rather than behind a closed curtain.
    stream.push(this.animate(r.overlay, [{ opacity: 1 }, { opacity: 0 }], {
      duration: this.ms(220),
      delay: this.ms(380),
      easing: 'ease-out',
    }));
    await this.playAnimations(stream);
    this.finish();
  }

  // ---------------------------------------------------------------- helpers

  private baseOffsets(): { x: number; y: number; rot: number }[] {
    return Array.from({ length: DECK_LAYERS }, (_, index) => {
      const depth = DECK_LAYERS - 1 - index;
      return { x: depth * 0.3, y: depth * 0.72, rot: (index - (DECK_LAYERS - 1)) * 0.13 };
    });
  }

  /** The top two cards of the stack: the ones the deal takes off the deck and puts on the table. */
  private dealtLayers(): HTMLElement[] {
    return this.refs.layers.slice(-2);
  }

  /**
   * The stack in the overlay IS the ritual deck: every layer is stamped with the card it stands for,
   * so the nine distinct strengths are the stack's own, not a story told around it.
   */
  private stampDeck(): void {
    const deck = this.options.view.deck;
    this.refs.layers.forEach((layer, index) => {
      const card = deck[index];
      if (!card) {
        delete layer.dataset.rank;
        delete layer.dataset.suit;
        return;
      }
      layer.dataset.rank = String(card.rank);
      layer.dataset.suit = String(card.suit);
    });
  }

  private setPhase(phase: StarterRitualPhase): void {

    this.refs.overlay.dataset.phase = phase;
    this.options.onPhase?.(phase);
  }

  private ms(base: number): number {
    return Math.round(base * TEMPO_SCALE[this.options.tempo]);
  }

  private animate(el: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
    if (this.cancelled || this.finished) return null;
    try {
      const animation = el.animate(frames, { fill: 'both', ...options });
      this.animations.push(animation);
      return animation;
    } catch {
      return null;
    }
  }

  private async playAnimations(animations: (Animation | null)[]): Promise<void> {
    await Promise.all(animations.map((a) => (a ? a.finished.catch(() => undefined) : Promise.resolve(undefined))));
  }

  private sleep(ms: number): Promise<void> {
    if (this.cancelled || this.finished) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      let id: ReturnType<typeof setTimeout> | undefined;
      const finish = (): void => {
        if (done) return;
        done = true;
        if (id !== undefined) clearTimeout(id);
        if (id !== undefined) this.timers.delete(id);
        this.waiters.delete(finish);
        resolve();
      };
      id = setTimeout(finish, Math.max(0, ms));
      this.timers.add(id);
      this.waiters.add(finish);
    });
  }

  private resolveWaits(): void {
    for (const finish of [...this.waiters]) finish();
    this.waiters.clear();
  }

  private cancelAnimations(): void {
    for (const animation of [...this.animations]) {
      try {
        animation.cancel();
      } catch {
        /* already gone */
      }
    }
    this.animations.length = 0;
  }

  private listen(): void {
    this.refs.overlay.addEventListener('pointerdown', this.onPointer, { passive: false });
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  private unlisten(): void {
    this.refs.overlay.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
  }

  private readonly onPointer = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    this.requestSkip();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    // Let browser/OS shortcuts (reload, tab switching) through untouched; only swallow keys that
    // would otherwise reach the game's own keyboard controls.
    if (event.metaKey || event.ctrlKey || event.altKey || /^F\d+$/.test(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.requestSkip();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.cancel();
  };

  private readonly onPageHide = (): void => {
    this.cancel();
  };

  private requestSkip(): void {
    if (this.cancelled || this.finished || this.skipRequested) return;
    if (this.exiting) {
      this.finish();
      return;
    }
    this.skipRequested = true;
    this.cancelAnimations();
    this.resolveWaits();
    void this.finishSkipped();
  }

  private async ensureCardArt(): Promise<void> {
    try {
      await Promise.race([preloadCardArt().catch(() => undefined), this.sleep(220)]);
    } catch {
      /* the cards can render with their readable fallback faces */
    }
  }

  private reset(): void {
    this.cancelAnimations();
    clearInterval(this.settleTimer);
    this.settleTimer = undefined;
    const r = this.refs;
    r.overlay.classList.remove('is-reduced', 'is-exiting');
    r.overlay.style.opacity = '';
    r.overlay.hidden = true;
    r.deck.style.opacity = '1';
    r.deckAnchor.style.setProperty('--ritual-deck-scale', '1');
    r.deck.style.translate = '';
    r.deck.style.rotate = '';
    r.deck.style.scale = '';
    const base = this.baseOffsets();
    r.layers.forEach((layer, index) => {
      const b = base[index]!;
      layer.style.translate = `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`;
      layer.style.rotate = `${b.rot.toFixed(2)}deg`;
      layer.style.scale = '';
      layer.style.opacity = '';
    });
    for (const card of [r.youCard, r.opponentCard]) {
      card.style.translate = '';
      card.style.rotate = '';
      card.style.scale = '';
      card.style.opacity = '0';
      card.classList.remove('is-revealed');
    }
    r.youInner.style.transform = '';
    r.opponentInner.style.transform = '';
    for (const face of [r.youFront, r.opponentFront]) {
      face.style.opacity = '';
      face.style.transform = '';
    }
    for (const back of [r.youBack, r.opponentBack]) {
      back.style.opacity = '';
      back.style.transform = '';
    }
    for (const slot of [r.youSlot, r.opponentSlot]) slot.classList.remove('is-winner', 'is-losing');
    r.outcome.classList.remove('is-shown');
    r.title.textContent = '';
    r.youFront.innerHTML = faceMarkup(this.options.view.you);
    r.opponentFront.innerHTML = faceMarkup(this.options.view.opponent);
    r.overlay.classList.toggle('is-reduced', this.options.reduceMotion || this.options.tempo === 'skip');
    delete r.overlay.dataset.phase;

  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.cancelAnimations();
    this.resolveWaits();
    for (const id of [...this.timers]) clearTimeout(id);
    this.timers.clear();
    clearInterval(this.settleTimer);
    this.settleTimer = undefined;
    this.unlisten();
    const r = this.refs;
    r.overlay.hidden = true;
    r.overlay.style.opacity = '';
    r.overlay.classList.remove('is-reduced', 'is-exiting');
    delete r.overlay.dataset.phase;
    delete r.overlay.dataset.starter;
    delete r.overlay.dataset.youRank;
    delete r.overlay.dataset.opponentRank;
    r.outcome.classList.remove('is-shown');
    r.title.textContent = '';
    r.youSlot.classList.remove('is-winner', 'is-losing');
    r.opponentSlot.classList.remove('is-winner', 'is-losing');
    r.youCard.classList.remove('is-revealed');
    r.opponentCard.classList.remove('is-revealed');
    r.youCard.style.opacity = '0';
    r.opponentCard.style.opacity = '0';
    r.deck.style.opacity = '';
    if (running === this) running = null;
    this.resolveDone();
  }
}

/**
 * Play the ritual once. Always resolves exactly once — normally after the exit, or immediately on
 * cancellation. The game underneath is never modified.
 */
export const playStarterRitual = (options: StarterRitualOptions): Promise<void> => {
  const refs = readRefs();
  if (!refs) return Promise.resolve();
  running?.cancel();
  const ritual = new StarterRitual(options, refs);
  running = ritual;
  try {
    return ritual.play();
  } catch {
    // A DOM/CSS failure must never leave the overlay claiming the screen.
    ritual.cancel();
    return Promise.resolve();
  }
};
