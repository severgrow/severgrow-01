// A hidden tab must stop painting. The gate pauses exactly the animations that were playing and
// resumes exactly those on the way back, so an animation that was already paused on purpose (the
// hand's breath under a finger, a frozen screenshot state) is left alone.
import { describe, expect, it } from 'vitest';
import { pausePlayingAnimations, resumePausedAnimations } from '../src/ui/hidden-pause.js';
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
