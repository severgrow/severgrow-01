// The pre-game card ritual: arrival, shuffle, deal, simultaneous reveal, result, exit.
//
// This is presentation only. The winner is decided by the engine/server and handed in as
// `view.starter`; the two faces are chosen by `logic/starter-ritual.ts` from a public key, so the
// higher card always belongs to that same seat. Nothing here reads or writes game state.
//
// Engineering rules this file keeps:
//   * one explicit phase at a time (`data-phase`), no chains of stray timeouts;
//   * WAAPI transform/opacity only — no layout animation, no backdrop-filter animation;
//   * every animation is tracked and cancelled on finish/cancel/skip;
//   * `playStarterRitual` has one idempotent resolution: skip, cancel, visibility loss and a new
//     match can never leave a half-shown overlay or a locked game behind;
//   * the overlay is static markup, so there is no first-frame creation flicker or layout shift.
import { OPP } from '../../../src/strings.js';
import type { Card } from '../../../src/engine/index.js';
import { cardFace, suitClass } from '../ui/effects.js';
import { preloadCardArt } from './cards.js';
import type { RitualCard, StarterRitualView } from '../logic/starter-ritual.js';

export type StarterRitualPhase = 'idle' | 'arrive' | 'shuffle' | 'deal' | 'reveal' | 'result' | 'exit' | 'done';

export type StarterRitualTempo = 'slow' | 'normal' | 'fast' | 'skip';

export type StarterRitualOptions = {
  readonly view: StarterRitualView;
  readonly reduceMotion: boolean;
  readonly tempo: StarterRitualTempo;
  readonly youLabel?: string;
  readonly opponentLabel?: string;
  /** The real in-game draw pile, measured at exit so the deck lands on it rather than guesswork. */
  readonly deckTarget?: () => DOMRect | null;
  readonly onPhase?: (phase: StarterRitualPhase) => void;
};

const TEMPO_SCALE: Record<StarterRitualTempo, number> = { slow: 1.18, normal: 1, fast: 0.8, skip: 1 };
const DECK_LAYERS = 9;

let running: StarterRitual | null = null;

/** True while the ritual owns the screen. The game's input/bot gate reads this. */
export const isStarterRitualPlaying = (): boolean => running !== null;

/** The one external cancel: leaving the duel, starting another match, page teardown. */
export const cancelStarterRitual = (): void => running?.cancel();

type Refs = {
  overlay: HTMLElement;
  deck: HTMLElement;
  layers: HTMLElement[];
  kicker: HTMLElement | null;
  youCard: HTMLElement;
  opponentCard: HTMLElement;
  youInner: HTMLElement;
  opponentInner: HTMLElement;
  youFront: HTMLElement;
  opponentFront: HTMLElement;
  youLane: HTMLElement;
  opponentLane: HTMLElement;
  youLabel: HTMLElement;
  opponentLabel: HTMLElement;
  title: HTMLElement;
  result: HTMLElement;
  outcome: HTMLElement;
};

const readRefs = (): Refs | null => {
  const overlay = document.getElementById('starter-lottery');
  const deck = document.getElementById('lottery-deck');
  const youCard = document.getElementById('lottery-card-you');
  const opponentCard = document.getElementById('lottery-card-opponent');
  const youInner = document.getElementById('lottery-inner-you');
  const opponentInner = document.getElementById('lottery-inner-opponent');
  const youFront = document.getElementById('lottery-face-you');
  const opponentFront = document.getElementById('lottery-face-opponent');
  const youLane = document.getElementById('lottery-lane-you');
  const opponentLane = document.getElementById('lottery-lane-opponent');
  const youLabel = document.getElementById('lottery-you-label');
  const opponentLabel = document.getElementById('lottery-opponent-label');
  const title = document.getElementById('lottery-title');
  const result = document.getElementById('lottery-result');
  const outcome = document.getElementById('lottery-outcome');
  if (!overlay || !deck || !youCard || !opponentCard || !youInner || !opponentInner || !youFront
    || !opponentFront || !youLane || !opponentLane || !youLabel || !opponentLabel || !title
    || !result || !outcome) return null;
  return {
    overlay,
    deck,
    layers: [...overlay.querySelectorAll<HTMLElement>('.ritual-deck-layer')],
    kicker: overlay.querySelector<HTMLElement>('.ritual-kicker'),
    youCard,
    opponentCard,
    youInner,
    opponentInner,
    youFront,
    opponentFront,
    youLane,
    opponentLane,
    youLabel,
    opponentLabel,
    title,
    result,
    outcome,
  };
};

const asCard = (card: RitualCard): Card => ({ id: 0, suit: card.suit, rank: card.rank });

const faceMarkup = (card: RitualCard): string => {
  const cardLike = asCard(card);
  return `<div class="card ${suitClass(cardLike)}">${cardFace(cardLike)}</div>`;
};

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
    this.refs.youLabel.textContent = this.options.youLabel ?? 'You';
    this.refs.opponentLabel.textContent = this.options.opponentLabel ?? OPP.label;
    this.setPhase('arrive');
    void this.timeline();
    return this.done;
  }

  cancel(): void {
    if (this.finished) return;
    this.cancelled = true;
    this.finish();
  }

  private reset(): void {
    this.cancelAnimations();
    const r = this.refs;
    r.overlay.classList.remove('is-reduced', 'is-exiting');
    r.overlay.style.opacity = '';
    r.overlay.hidden = true;
    r.deck.style.opacity = '0';
    r.deck.style.translate = '';
    r.deck.style.rotate = '';
    r.deck.style.scale = '';
    if (r.kicker) r.kicker.style.opacity = '0';
    r.youLabel.style.opacity = '0';
    r.opponentLabel.style.opacity = '0';
    for (const layer of r.layers) {
      const index = Number(layer.dataset.i ?? '0');
      const depth = DECK_LAYERS - 1 - index;
      layer.style.translate = `${(depth * 0.32).toFixed(2)}px ${(depth * 0.7).toFixed(2)}px`;
      layer.style.rotate = `${((index - (DECK_LAYERS - 1)) * 0.14).toFixed(2)}deg`;
      layer.style.scale = '';
      layer.style.opacity = '';
    }
    for (const card of [r.youCard, r.opponentCard]) {
      card.style.translate = '';
      card.style.rotate = '';
      card.style.scale = '';
      card.style.opacity = '0';
      card.classList.remove('is-revealed');
    }
    r.youInner.style.transform = '';
    r.opponentInner.style.transform = '';
    for (const lane of [r.youLane, r.opponentLane]) lane.classList.remove('is-winner', 'is-losing');
    r.outcome.classList.remove('is-shown');
    r.title.textContent = '';
    r.result.textContent = '';
    r.youFront.innerHTML = faceMarkup(this.options.view.you);
    r.opponentFront.innerHTML = faceMarkup(this.options.view.opponent);
    r.overlay.classList.toggle('is-reduced', this.options.reduceMotion || this.options.tempo === 'skip');
    delete r.overlay.dataset.phase;
  }

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
    await this.sleep(this.ms(560));
    if (this.cancelled || this.skipRequested) return;

    await this.exit(false);
  }

  private async reducedTimeline(): Promise<void> {
    // No deck, no shuffle, no flight: the two faces and the result are simply present, held long
    // enough to read. The game is still prepared underneath and becomes interactive on the same beat.
    this.setPhase('result');
    this.showFinalState();
    await this.sleep(this.options.tempo === 'skip' ? 180 : 620);
    if (this.cancelled) return;
    await this.exit(true);
  }

  private async arrival(): Promise<void> {
    const r = this.refs;
    const ms = this.ms(320);
    const deck = this.animate(r.deck, [
      { translate: '13vw 27vh', rotate: '11deg', scale: 0.84, opacity: 0 },
      { translate: '0px 0px', rotate: '-1.4deg', scale: 1.012, opacity: 1, offset: 0.74 },
      { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.16,.84,.28,1)' });
    const kicker = r.kicker;
    const labels = [r.youLabel, r.opponentLabel];
    const chrome = [
      ...(kicker ? [this.animate(kicker, [{ opacity: 0, translate: '0px 4px' }, { opacity: 1, translate: '0px 0px' }], { duration: this.ms(260), delay: this.ms(90), easing: 'ease-out' })] : []),
      ...labels.map((el) => this.animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: this.ms(240), delay: this.ms(130), easing: 'ease-out' })),
    ];
    await this.playAnimations([deck, ...chrome]);
    await this.sleep(this.ms(18));
  }

  private async shuffle(): Promise<void> {
    const r = this.refs;
    const width = r.deck.getBoundingClientRect().width || 90;
    const x = Math.max(6, width * 0.085);
    const lift = Math.max(3, width * 0.045);
    const duration = this.ms(470);
    const animations: (Animation | null)[] = [];
    r.layers.forEach((layer, index) => {
      const depth = DECK_LAYERS - 1 - index;
      const dir = index % 2 === 0 ? -1 : 1;
      const baseY = depth * 0.7;
      const baseRot = (index - (DECK_LAYERS - 1)) * 0.14;
      const bump = ((index * 7) % 5 - 2) * 0.55;
      animations.push(this.animate(layer, [
        { translate: `0px ${baseY.toFixed(2)}px`, rotate: `${baseRot.toFixed(2)}deg` },
        { translate: `${(dir * x).toFixed(2)}px ${(baseY - lift * 0.55).toFixed(2)}px`, rotate: `${(baseRot + dir * 4.2).toFixed(2)}deg`, offset: 0.15 },
        { translate: `${(dir * x * 1.06).toFixed(2)}px ${(baseY - lift * 0.62).toFixed(2)}px`, rotate: `${(baseRot + dir * 4.4).toFixed(2)}deg`, offset: 0.29 },
        { translate: `${(-dir * x * 1.2).toFixed(2)}px ${(baseY + bump).toFixed(2)}px`, rotate: `${(baseRot - dir * 2.8).toFixed(2)}deg`, offset: 0.5 },
        { translate: `${(-dir * x * 0.95).toFixed(2)}px ${(baseY - lift * 0.12).toFixed(2)}px`, rotate: `${(baseRot - dir * 2.1).toFixed(2)}deg`, offset: 0.68 },
        { translate: `${(dir * x * 0.3).toFixed(2)}px ${(baseY + 1.1).toFixed(2)}px`, rotate: `${(baseRot + dir * 0.6).toFixed(2)}deg`, offset: 0.86 },
        { translate: `0px ${baseY.toFixed(2)}px`, rotate: `${baseRot.toFixed(2)}deg` },
      ], {
        duration,
        delay: this.ms(index * 5),
        easing: 'cubic-bezier(.4,.06,.22,1)',
      }));
    });
    // A small, weighty counter-rotation on the whole stack: the deck is handled, not shaken.
    animations.push(this.animate(r.deck, [
      { rotate: '0deg', scale: 1 },
      { rotate: '-0.9deg', scale: 1.014, offset: 0.28 },
      { rotate: '0.55deg', scale: 1.004, offset: 0.66 },
      { rotate: '0deg', scale: 1 },
    ], { duration: this.ms(520), easing: 'cubic-bezier(.3,.1,.2,1)' }));
    await this.playAnimations(animations);
    await this.sleep(this.ms(24));
  }

  private async deal(): Promise<void> {
    const r = this.refs;
    const deckRect = r.deck.getBoundingClientRect();
    const deckX = deckRect.left + deckRect.width / 2;
    const deckY = deckRect.top + deckRect.height / 2;
    const duration = this.ms(340);
    const fly = (el: HTMLElement, angle: number, delay: number): Animation | null => {
      const rect = el.getBoundingClientRect();
      const dx = deckX - (rect.left + rect.width / 2);
      const dy = deckY - (rect.top + rect.height / 2);
      return this.animate(el, [
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: `${angle}deg`, scale: 0.9, opacity: 0 },
        { translate: `${(dx * 0.86).toFixed(2)}px ${(dy * 0.86).toFixed(2)}px`, rotate: `${(angle * 0.86).toFixed(2)}deg`, scale: 0.92, opacity: 1, offset: 0.16 },
        { translate: `${(dx * 0.42).toFixed(2)}px ${(dy * 0.42).toFixed(2)}px`, rotate: `${(angle * 0.42).toFixed(2)}deg`, scale: 0.96, opacity: 1, offset: 0.56 },
        { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 1 },
      ], { duration, delay, easing: 'cubic-bezier(.2,.72,.16,1)' });
    };
    const you = fly(r.youCard, -7, 0);
    const opponent = fly(r.opponentCard, 7, this.ms(44));
    const recoil = this.animate(r.deck, [
      { scale: 1, translate: '0px 0px' },
      { scale: 0.986, translate: '0px 1.5px', offset: 0.32 },
      { scale: 1, translate: '0px 0px' },
    ], { duration: this.ms(300), easing: 'ease-out' });
    await this.playAnimations([you, opponent, recoil]);
    await this.sleep(this.ms(34));
  }

  private async reveal(): Promise<void> {
    const r = this.refs;
    const flipMs = this.ms(360);
    const flip = (inner: HTMLElement): Animation | null => this.animate(inner, [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(184deg)', offset: 0.72 },
      { transform: 'rotateY(180deg)' },
    ], { duration: flipMs, easing: 'cubic-bezier(.2,.78,.22,1)' });
    const settle = (card: HTMLElement): Animation | null => this.animate(card, [
      { translate: '0px 0px', scale: 1 },
      { translate: '0px -1.5px', scale: 1.006, offset: 0.6 },
      { translate: '0px 0px', scale: 1 },
    ], { duration: this.ms(420), easing: 'ease-out' });
    const youFlip = flip(r.youInner);
    const opponentFlip = flip(r.opponentInner);
    const youSettle = settle(r.youCard);
    const opponentSettle = settle(r.opponentCard);
    // The deck steps back as the two faces become the subject (opacity only: the exit starts here).
    const deckBack = this.animate(r.deck, [
      { opacity: 1 },
      { opacity: 0.34 },
    ], { duration: this.ms(300), easing: 'ease-out' });

    await this.playAnimations([youFlip, opponentFlip, youSettle, opponentSettle, deckBack]);
    if (this.cancelled || this.skipRequested) return;

    // Both faces are already visible; the winner is marked, but only with a restrained lift.
    const starter = this.options.view.starter;
    const winningCard = starter === 'you' ? r.youCard : r.opponentCard;
    const losingCard = starter === 'you' ? r.opponentCard : r.youCard;
    const winningLane = starter === 'you' ? r.youLane : r.opponentLane;
    const losingLane = starter === 'you' ? r.opponentLane : r.youLane;
    winningLane.classList.add('is-winner');
    losingLane.classList.add('is-losing');
    r.youCard.classList.add('is-revealed');
    r.opponentCard.classList.add('is-revealed');
    this.animate(winningCard, [
      { translate: '0px 0px' },
      { translate: '0px -5px' },
    ], { duration: this.ms(260), easing: 'cubic-bezier(.2,.72,.24,1)' });
    this.animate(losingCard, [
      { opacity: 1 },
      { opacity: 0.88 },
    ], { duration: this.ms(260), easing: 'ease-out' });
    await this.sleep(this.ms(150));
  }

  private showOutcome(): void {
    const r = this.refs;
    const starter = this.options.view.starter;
    const opponent = this.options.opponentLabel ?? OPP.label;
    r.title.textContent = starter === 'you' ? 'You start' : `${opponent} starts`;
    r.result.textContent = starter === 'you'
      ? 'You drew the higher card.'
      : `${opponent} drew the higher card.`;
    r.outcome.classList.add('is-shown');
  }

  private showFinalState(): void {
    const r = this.refs;
    const starter = this.options.view.starter;
    r.deck.style.opacity = '0';
    if (r.kicker) r.kicker.style.opacity = '1';
    r.youLabel.style.opacity = '1';
    r.opponentLabel.style.opacity = '1';
    for (const card of [r.youCard, r.opponentCard]) {
      card.style.translate = '0px 0px';
      card.style.rotate = '0deg';
      card.style.scale = '1';
      card.style.opacity = '1';
      card.classList.add('is-revealed');
    }
    r.youInner.style.transform = 'rotateY(180deg)';
    r.opponentInner.style.transform = 'rotateY(180deg)';
    const winningLane = starter === 'you' ? r.youLane : r.opponentLane;
    const losingLane = starter === 'you' ? r.opponentLane : r.youLane;
    winningLane.classList.add('is-winner');
    losingLane.classList.add('is-losing');
    this.showOutcome();
  }

  private async finishSkipped(): Promise<void> {
    if (this.skipHandled || this.finished) return;
    this.skipHandled = true;
    this.cancelAnimations();
    this.showFinalState();
    this.setPhase('result');
    await this.sleep(this.options.reduceMotion ? 220 : 190);
    if (this.cancelled || this.finished) return;
    await this.exit(true);
  }

  private async exit(fast: boolean): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    this.setPhase('exit');
    const r = this.refs;
    r.outcome.classList.remove('is-shown');

    if (fast) {
      await this.playAnimations([this.animate(r.overlay, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        easing: 'ease-out',
      })]);
      this.finish();
      return;
    }

    const cardAnimations: (Animation | null)[] = [];
    const deckRect = r.deck.getBoundingClientRect();
    const deckX = deckRect.left + deckRect.width / 2;
    const deckY = deckRect.top + deckRect.height / 2;
    const starter = this.options.view.starter;
    const winnerCard = starter === 'you' ? r.youCard : r.opponentCard;
    for (const [card, angle] of [[r.youCard, -5], [r.opponentCard, 5]] as const) {
      const rect = card.getBoundingClientRect();
      const dx = deckX - (rect.left + rect.width / 2);
      const dy = deckY - (rect.top + rect.height / 2);
      cardAnimations.push(this.animate(card, [
        { translate: card === winnerCard ? '0px -5px' : '0px 0px', rotate: '0deg', scale: 1, opacity: card === winnerCard ? 1 : 0.88 },
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: `${angle}deg`, scale: 0.86, opacity: 0 },
      ], { duration: this.ms(240), easing: 'cubic-bezier(.4,.05,.25,1)' }));
    }

    let deckFly: Animation | null = null;
    const target = this.options.deckTarget?.() ?? null;
    if (target && target.width > 1 && target.height > 1) {
      const dx = target.left + target.width / 2 - deckX;
      const dy = target.top + target.height / 2 - deckY;
      const scale = Math.max(0.14, Math.min(1, target.height / Math.max(1, deckRect.height)));
      deckFly = this.animate(r.deck, [
        { translate: '0px 0px', rotate: '0deg', scale: 1, opacity: 0.34 },
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: '0deg', scale, opacity: 0.9, offset: 0.78 },
        { translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px`, rotate: '0deg', scale, opacity: 0 },
      ], { duration: this.ms(310), easing: 'cubic-bezier(.3,.08,.2,1)' });
    }

    const veil = this.animate(r.overlay, [{ opacity: 1 }, { opacity: 0 }], {
      duration: this.ms(260),
      delay: this.ms(70),
      easing: 'ease-out',
    });
    await this.playAnimations([...cardAnimations, deckFly, veil]);
    this.finish();
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
  }

  private unlisten(): void {
    this.refs.overlay.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
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

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.cancelAnimations();
    this.resolveWaits();
    for (const id of [...this.timers]) clearTimeout(id);
    this.timers.clear();
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
    r.result.textContent = '';
    r.youLane.classList.remove('is-winner', 'is-losing');
    r.opponentLane.classList.remove('is-winner', 'is-losing');
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
