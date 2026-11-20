// TEMPORARY: compose two PNGs side by side with labels (no ImageMagick on this machine).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [left, right, out] = [process.env.LEFT!, process.env.RIGHT!, process.env.OUT!];
const [ll, rl] = [process.env.LEFT_LABEL ?? '', process.env.RIGHT_LABEL ?? ''];
mkdirSync(process.env.DIR!, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM!, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });
  await page.goto('data:text/html,<html><body></body></html>');
  const png = await page.evaluate(async ({ l, r, ll, rl, HEIGHT }) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${src}`;
    });
    const [a, b] = await Promise.all([load(l), load(r)]);
    const gap = 26, label = 44, pad = 16;
    // HEIGHT makes both pictures the same height (a card crop, so the two sizes are comparable).
    const H = Number(HEIGHT) || 0;
    const scale = H ? H / Math.max(a.height, b.height) : 1;
    const aw = Math.round(a.width * scale), ah = Math.round(a.height * scale);
    const bw = Math.round(b.width * scale), bh = Math.round(b.height * scale);
    const h = Math.max(ah, bh);
    const o = document.createElement('canvas');
    o.width = pad * 2 + aw + gap + bw; o.height = pad * 2 + h + label;
    const g = o.getContext('2d')!;
    g.fillStyle = '#0e0f10'; g.fillRect(0, 0, o.width, o.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(a, pad, pad + label, aw, ah);
    g.drawImage(b, pad + aw + gap, pad + label, bw, bh);
    g.fillStyle = '#e8ddc9'; g.font = '600 20px system-ui, sans-serif';
    g.fillText(ll, pad, pad + 26);
    g.fillText(rl, pad + aw + gap, pad + 26);
    g.strokeStyle = 'rgba(232,221,201,.3)'; g.lineWidth = 2;
    g.strokeRect(pad - 1, pad + label - 1, aw + 2, ah + 2);
    g.strokeRect(pad + aw + gap - 1, pad + label - 1, bw + 2, bh + 2);
    return o.toDataURL();
  }, { l: readFileSync(left).toString('base64'), r: readFileSync(right).toString('base64'), ll, rl, HEIGHT: process.env.HEIGHT ?? '0' });
  writeFileSync(out, Buffer.from(png.split(',')[1]!, 'base64'));
  console.log(`shot ${out}`);
} finally {
  await browser.close();
}
