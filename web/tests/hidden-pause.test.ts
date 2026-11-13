// A hidden tab must stop painting. The gate pauses exactly the animations that were playing and
// resumes exactly those on the way back, so an animation that was already paused on purpose (the
// hand's breath under a finger, a frozen screenshot state) is left alone.
import { describe, expect, it } from 'vitest';
import { mountHiddenPause, pausePlayingAnimations, resumePausedAnimations } from '../src/ui/hidden-pause.js';
import type { PlayableAnimation } from '../src/ui/hidden-pause.js';

const fake = (playState: string) => {
  const a: PlayableAnimation & { log: string[] } = {
    playState,
    log: [],
    pause() { this.log.push('pause'); this.playState = 'paused'; },
    play() { this.log.push('play'); this.playState = 'running'; },
  };
  return a;
};

describe('the hidden-tab animation gate', () => {
  const lifecycle = () => {
    const animation = fake('running'), alreadyPaused = fake('paused');
    const doc = Object.assign(new EventTarget(), {hidden:false,getAnimations:()=>[animation,alreadyPaused],defaultView:new EventTarget()});
    const dispose = mountHiddenPause(doc as unknown as Document);
    return {animation,alreadyPaused,doc,dispose};
  };
  it('duplicate hidden events do not forget the animations to resume',()=>{
    const t=lifecycle();t.doc.hidden=true;
    t.doc.dispatchEvent(new Event('visibilitychange'));
    t.doc.dispatchEvent(new Event('visibilitychange'));
    t.doc.hidden=false;t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.animation.log).toEqual(['pause','play']);
    expect(t.alreadyPaused.log).toEqual([]);t.dispose();
  });
  it('pauses on pagehide before visibility changes and resumes only on pageshow in a visible page',()=>{
    const t=lifecycle();
    t.doc.defaultView.dispatchEvent(new Event('pagehide'));
    expect(t.animation.playState).toBe('paused');
    t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.animation.playState).toBe('paused');
    t.doc.hidden=true;t.doc.defaultView.dispatchEvent(new Event('pageshow'));
    expect(t.animation.playState).toBe('paused');
    t.doc.hidden=false;t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.animation.playState).toBe('running');t.dispose();
    t.doc.defaultView.dispatchEvent(new Event('pagehide'));
    expect(t.animation.playState).toBe('running');
  });
  it('pauses only the animations that are actually playing', () => {
    const running = fake('running');
    const already = fake('paused');
    const finished = fake('finished');
    const paused = pausePlayingAnimations([running, already, finished]);
    expect(paused).toEqual([running]);
    expect(running.playState).toBe('paused');
    expect(already.log).toEqual([]);
    expect(finished.log).toEqual([]);
  });

  it('resumes exactly what it paused, and nothing that finished in the meantime', () => {
    const a = fake('running');
    const b = fake('running');
    const paused = pausePlayingAnimations([a, b]);
    b.playState = 'finished'; // e.g. a one-shot effect ended while the tab was hidden
    resumePausedAnimations(paused);
    expect(a.playState).toBe('running');
    expect(a.log).toEqual(['pause', 'play']);
    expect(b.log).toEqual(['pause']);
  });

  it('is a no-op when nothing is playing', () => {
    expect(pausePlayingAnimations([])).toEqual([]);
    expect(pausePlayingAnimations([fake('idle')])).toEqual([]);
  });
});
