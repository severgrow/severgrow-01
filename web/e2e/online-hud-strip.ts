// FUTASAKU 0.5 — evidence shots of the ONLINE duel's top strip (issue 3: the greenish frame).
//
//   npx tsx web/e2e/online-hud-strip.ts [suffix]
//
// Opens a real duel at each size and saves a crop of the header area plus the whole screen, so the
// before/after can be compared. Pass a suffix (e.g. `before`) to keep both runs.
import { mkdirSync } from 'node:fs';
import { openDuel, openSeat, sleep, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const suffix = process.argv[2] ? `-${process.argv[2]}` : '';
const SIZES = [
  { w: 390, h: 844 },
  { w: 1280, h: 800 },
] as const;

const duel = await startLocalDuel({ port: Number(process.env.PREVIEW_PORT ?? 4233) });
try {
  for (const size of SIZES) {
    const match = await duel.newMatch();
    const session = await openSeat(duel, match, 0, {
      viewport: { width: size.w, height: size.h },
      hasTouch: size.w < 500,
      isMobile: size.w < 500,
    });
    try {
      await openDuel(session, match.matchId);
      await sleep(900);
      // The strip itself, then the whole screen for context.
      await session.page.screenshot({
        path: `${OUT}hud-strip-${size.w}x${size.h}${suffix}.jpg`,
        type: 'jpeg',
        quality: 90,
        clip: { x: 0, y: 0, width: size.w, height: Math.min(120, size.h) },
      });
      await session.page.screenshot({
        path: `${OUT}hud-top-${size.w}x${size.h}${suffix}.jpg`,
        type: 'jpeg',
        quality: 85,
      });
      // The measured strip: its own background/border/shadow, for the report.
      const style = await session.page.evaluate(`(() => {
        const el = document.getElementById('duel-hud');
        if (!el) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { background: s.backgroundColor, backgroundImage: s.backgroundImage, border: s.borderTopWidth, radius: s.borderTopLeftRadius, shadow: s.boxShadow, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      })()`);
      console.log(`${size.w}x${size.h}${suffix}: ${JSON.stringify(style)}`);
    } finally {
      await session.context.close();
    }
  }
} finally {
  await duel.close();
}
console.log('hud strip shots done');
