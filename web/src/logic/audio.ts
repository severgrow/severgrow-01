// Step 7: the audio mix. Two buses (effects, music) each with a volume slider (0-100, on a
// squared curve so the slider feels even to the ear), both into the master, which runs
// through a limiter so stacked effects never clip. Pure numbers; the Web Audio wiring is in
// ui/sound.ts.

export type Mix = { sound: boolean; music: boolean; sfxVolume: number; musicVolume: number };

const curve = (v: number) => {
  const x = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0)) / 100;
  return x * x;
};

/** The gain of each bus (0..1). The Sound and Music toggles switch their bus off. */
export const busGains = (m: Mix): { sfx: number; music: number } => ({
  sfx: m.sound ? curve(m.sfxVolume) : 0,
  music: m.music ? curve(m.musicVolume) : 0,
});

/** The master limiter: a fast, hard compressor just under full scale. */
export const LIMITER = { threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.25 } as const;
