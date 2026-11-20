import { chromium } from 'playwright-core';
const font = 'file:///Users/patryk/sg-futa-seedcap/web/src/fonts/v2/fragment-mono-latin-400-normal.woff2';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, headless: true });
const p = await b.newPage({ viewport: { width: 320, height: 568 } });
const html = `<html><head><style>
@font-face{font-family:'FM';src:url('${font}') format('woff2');font-weight:400;}
body{margin:0;background:#222}
#gameover{padding:12px;display:block;box-sizing:border-box;width:320px}
.go-card{width:min(440px,100%);padding:26px 18px 14px;box-sizing:border-box}
#go-seeds{font-family:'FM',ui-monospace,monospace;font-size:0.85rem;line-height:1.4;margin:0;white-space:nowrap}
html.large-text #go-seeds{font-size:calc(0.85rem * 1.18)}
</style></head><body><div id="gameover"><div class="go-card"><p id="go-seeds"></p></div></div></body></html>`;
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
const texts = [
 'Seed limit reached today',
 'Seeds limit · resets in 23h',
 'Seeds limit · resets in 4m',
 'Seeds limit · resets in 59m',
 'Seeds limit · resets in 24h',
 'Seed limit reached · resets in 23h',
 'Seed limit reached today · resets in 23h',
 'Seed limit reached today. Resets in 23h.',
];
for (const t of texts) {
  for (const large of [false, true]) {
    const r = await p.evaluate(([t, large]) => {
      document.documentElement.classList.toggle('large-text', large);
      const el = document.getElementById('go-seeds'); el.textContent = t;
      const range = document.createRange(); range.selectNodeContents(el);
      return { textW: range.getBoundingClientRect().width, boxW: el.parentElement.clientWidth - 36, elW: el.getBoundingClientRect().width, scrollW: el.scrollWidth };
    }, [t, large]);
    console.log(JSON.stringify({ t, large, ...r, fits: r.scrollW <= r.elW + 0.5 }));
  }
}
const f = await p.evaluate(() => getComputedStyle(document.getElementById('go-seeds')).fontFamily);
console.log('font:', f, 'loaded:', await p.evaluate(() => document.fonts.check('16px FM')));
await b.close();
