// THE PAUSE PANEL, locked at the source.
//
// Owner direction (2026-10-20): one face, warm off-white type, ONE amber lamp, hairlines where they
// separate things, Settings last in tab order. Owner direction (2026-10-23): "even tho reworked is
// kinda lame — try to work on it a bit ... using the existing dark glass concept with the blurred,
// darkened game interface under it". So the panel is now DARK GLASS over a veiled match: ONE lead
// key, ONE pair of keys (New game, Main menu), the duel's own rows when they apply, and a quiet row
// of icon tools (How to play, What happened, Report, Settings). `web/e2e/pause-panel.ts` measures the
// built page; this test guards the markup and CSS that produce those numbers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const styleCss = read('../src/style.css');
const mainSource = read('../src/main.ts');

const start = html.indexOf('<section id="sheet-menu"');
const panel = html.slice(start, html.indexOf('</section>', start));

type Rule = { prelude: string; body: string };
const rules = (css: string): Rule[] => {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = (m[1] ?? '').trim();
    if (prelude.startsWith('@')) continue;
    out.push({ prelude, body: m[2] ?? '' });
  }
  return out;
};
const panelRules = rules(styleCss).filter((r) => r.prelude.includes('#sheet-menu'));
/** The panel block as written (its own section of style.css, minus comments). */
const panelBlock = styleCss.slice(
  styleCss.indexOf('the pause panel: dark glass over the paused game'),
  styleCss.indexOf("the player's profile: the pause panel's language"),
);
const panelCss = panelBlock.replace(/\/\*[\s\S]*?\*\//g, '');
const rulesFor = (needle: string) => panelRules.filter((r) => r.prelude.includes(needle));
const bodyFor = (needle: string) => rulesFor(needle).map((r) => r.body).join('\n');

const buttonIds = [...panel.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]!);

describe('the pause panel: dark glass, one lead, one pair, one tool row', () => {
  it('keeps every familiar action, in a sensible order', () => {
    // Nothing was dropped: Back to the game leads (Exit tutorial beside it in a lesson), New game and
    // Main menu pair up, the duel's Resign waits in its own row, and the tools close the panel with
    // Settings LAST. (Report and Leave live are added at runtime, before Settings and before Resign.)
    expect(buttonIds).toEqual([
      'gm-exit-tutorial', 'gm-resume', 'gm-new', 'gm-main', 'gm-resign', 'gm-howto', 'gm-history', 'gm-settings',
    ]);
  });

  it('is dark glass floating over a veiled match', () => {
    expect(bodyFor('#sheet-menu')).toMatch(/backdrop-filter: blur\(18px\) saturate\(1\.15\)/);
    expect(bodyFor('#sheet-menu')).toMatch(/background: var\(--gm-glass\)/);
    expect(panelCss).toMatch(/--gm-glass: color-mix\(in srgb, var\(--c-surface\) 72%, transparent\)/);
    // The match behind is blurred and darkened while a sheet or the finish card is up.
    expect(styleCss).toMatch(/html\.game-veiled #game \{\s*filter: blur\(7px\) brightness\(0\.55\) saturate\(0\.85\);/);
    expect(mainSource).toMatch(/function syncVeil\(\)/);
    expect(mainSource).toMatch(/classList\.toggle\('game-veiled', IS_FUTA04 && inMatch && over\)/);
  });

  it('has ONE content axis: a mirrored nameplate, a mirrored read-out, equal columns', () => {
    expect(bodyFor('gm-head')).toContain('grid-template-columns: 44px 1fr 44px');
    expect(bodyFor('gm-scores')).toContain('grid-template-columns: 1fr 1px 1fr');
    expect(bodyFor('.gm-pair')).toContain('grid-template-columns: 1fr 1fr');
    expect(bodyFor('.gm-tools')).toContain('grid-auto-columns: 1fr');
    expect(bodyFor('.gm-lead')).toContain('width: 100%');
  });

  it('keeps every target at least 44px, and a key only ever states a minimum height', () => {
    expect(panelCss).toContain('--gm-row: 46px');
    expect(bodyFor('.gm-act')).toContain('min-height: var(--gm-row)');
    expect(bodyFor('.gm-act')).toContain('height: auto');
    for (const m of panelCss.matchAll(/min-height: (\d+)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(44);
  });
});

describe('Settings is the last tool, last in tab order', () => {
  it('is the LAST button in the markup', () => {
    expect(buttonIds[buttonIds.length - 1]).toBe('gm-settings');
    expect(panel).toMatch(/<button id="gm-settings" class="gm-tool"[^>]*aria-label="Settings"/);
  });

  it('nothing can insert another control after it', () => {
    // The report key goes into the tool row BEFORE Settings; the live "leave" item goes into the
    // duel's rows. Neither may append after Settings.
    const feedback = read('../src/feedback/mount.ts');
    expect(feedback).toContain("querySelector('#sheet-menu .gm-tools')");
    expect(feedback).toContain("tools.insertBefore(reportKey, document.getElementById('gm-settings'))");
    const live = read('../src/online/live/ui.ts');
    expect(live).toContain("'#sheet-menu .gm-acts'");
  });

  it('every tool says its name twice: a word under the icon, and the spoken label', () => {
    for (const m of panel.matchAll(/<button id="([^"]+)" class="gm-tool"[^>]*aria-label="([^"]+)"[^>]*>[\s\S]*?<span class="gm-tool-word">([^<]+)<\/span>/g)) {
      expect(m[2]!.length, m[1]).toBeGreaterThan(0);
      expect(m[3]!.length, m[1]).toBeGreaterThan(0);
    }
  });
});

describe('the face keeps its palette and its tempo', () => {
  it('has exactly one amber note, read from the LIGHT contract', () => {
    expect(bodyFor('gm-head h2::before')).toContain('var(--light-core');
    expect(bodyFor('.gm-lead')).toContain('var(--light-bloom');
    expect(panelCss).not.toContain('radial-gradient');
  });

  it('draws the scores NEUTRAL and the rest from the palette', () => {
    expect(bodyFor('.gm-you b')).toContain('var(--c-text)');
    expect(bodyFor('.gm-bot b')).toContain('var(--c-text)');
    expect(bodyFor('.gm-you b')).not.toContain('var(--c-you)');
    expect(bodyFor('.gm-bot b')).not.toContain('var(--c-bot)');
    expect(bodyFor('.gm-mode')).toContain('var(--c-muted)');
    expect(panelRules.find((r) => r.prelude === '#sheet-menu .gm-tool')?.body).toContain('var(--c-muted)');
    const literals = panelCss.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(literals.filter((c) => c.toLowerCase() !== '#f5d8a4'), 'only the light fallback may be a literal').toEqual([]);
  });

  it('moves on the tempo tokens only, with transform-free motion', () => {
    expect(bodyFor('#sheet-menu')).toContain('animation: gm-panel-in var(--dur-quick) var(--ease-standard)');
    expect(panelCss).not.toMatch(/\b\d+(?:\.\d+)?(?:ms|s)\b/);
    expect(panelCss).not.toMatch(/cubic-bezier|ease-in-out|ease-out|\blinear\b/);
    expect(panelCss).not.toMatch(/@keyframes[^{]*\{[^}]*transform/);
  });

  it('has a designed reduce-motion state: the panel is simply there', () => {
    expect(panelCss).toMatch(/\.reduce-motion #sheet-menu[\s\S]*?animation: none/);
    expect(panelCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*#sheet-menu \{\s*animation: none/);
    expect(styleCss).toMatch(/\.reduce-motion\.game-veiled #game \{\s*transition: none;/);
  });
});

describe('the panel keeps the pause behaviour it borrowed', () => {
  it('keeps the level label and the tutorial exit words on their existing elements', () => {
    expect(panel).toContain('<h2 id="gm-title">Paused</h2>');
    expect(mainSource).toMatch(/title\.textContent = campaignLevel \? CAMPAIGN\.levelLabel\(campaignLevel\.number\) : 'Paused'/);
    expect(mainSource).toMatch(/exitBtn\.textContent = TUTORIAL\.exit/);
  });

  it('names the mode as a small kicker over the title, never as a control', () => {
    expect(mainSource).toMatch(/function syncMenuMode\(\)/);
    expect(mainSource).toMatch(/el\.textContent = campaignLevel \? 'Campaign' : isOnlineDuel\(\) \? 'Duel' : 'Practice'/);
    expect(panel).toMatch(/<div class="gm-name">\s*<p class="gm-mode" id="gm-mode">/);
  });

  it('fills the read-out from the elements the slim header already updates', () => {
    expect(mainSource).toMatch(/you\.textContent = \$\('score-you'\)\.textContent/);
    expect(panel).toContain('id="gm-score-you"');
    expect(panel).toContain('id="gm-score-bot"');
    expect(panel).toContain('id="gm-turn"');
  });
});
