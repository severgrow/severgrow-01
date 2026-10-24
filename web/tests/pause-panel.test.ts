// THE PAUSE PANEL, locked at the source.
//
// Owner direction (2026-10-20): one face, warm off-white type, ONE amber lamp, hairlines where they
// separate things, Settings last in tab order. Owner direction (2026-10-23): "even tho reworked is
// kinda lame — try to work on it a bit ... using the existing dark glass concept with the blurred,
// darkened game interface under it". So the panel is now DARK GLASS over a veiled match: ONE lead
// key, ONE pair of keys (New game, Main menu), the duel's own rows when they apply, and a quiet row
// of icon tools (How to play, What happened, Report, Settings). Merged with the interface pass
// (owner, 2026-10-23: "my look, keep their features"): the panel moves on the shared interface layer,
// Restart resets the match in place, and a finished match never opens it. `web/e2e/pause-panel.ts`
// measures the built page; this test guards the markup and CSS that produce those numbers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, PAUSE } from '../../src/strings.js';

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
    // The game's own dark glass (the lesson window's recipe), never a grey plate.
    expect(bodyFor('#sheet-menu')).toMatch(/backdrop-filter: var\(--dark-glass-blur\)/);
    expect(bodyFor('#sheet-menu')).toMatch(/background: var\(--gm-glass\)/);
    expect(panelCss).toMatch(/--gm-glass: var\(--dark-glass\)/);
    expect(styleCss).toMatch(/--dark-glass: rgba\(8, 10, 10, 0\.42\);\s*--dark-glass-blur: blur\(9px\) saturate\(1\.05\);/);
    // The match behind is blurred and darkened while a sheet or the finish card is up.
    // The veil lives on the BACKDROP, never as a filter on the game (owner, 2026-10-24: on an iPhone a
    // filtered game made the panel appear with no animation).
    expect(styleCss).toMatch(/html\.futasaku-product \.scrim,\s*html\.futasaku-product #gameover,\s*html\.futasaku-product \.install-prompt-scrim \{[^}]*backdrop-filter: var\(--veil\);/);
    expect(styleCss).toMatch(/--veil: blur\(7px\) brightness\(0\.58\) saturate\(0\.85\);/);
    expect(styleCss).not.toMatch(/#game \{\s*filter: blur/);
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
  it('has no lamp dot before the title (owner, 2026-10-23), and its one warm note is the lead key', () => {
    expect(bodyFor('gm-head h2::before')).toContain('content: none');
    expect(bodyFor('gm-head h2::before')).not.toContain('var(--light-core');
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

  it('moves on the shared interface layer, and its own rules carry no raw durations', () => {
    // One choreography per surface: the JS layer (web/src/ui/interface-motion.ts) animates the
    // panel, and the CSS entrance is switched off for it.
    expect(panel).toMatch(/<section id="sheet-menu"[^>]*data-ix-surface>/);
    expect(styleCss).toMatch(/\.sheet,\s*#sheet-menu,[\s\S]{0,80}?\{\s*animation: none;/);
    expect(mainSource).toMatch(/enterSurface\(next\);/);
    expect(panelCss).not.toMatch(/\b\d+(?:\.\d+)?(?:ms|s)\b/);
    expect(panelCss).not.toMatch(/cubic-bezier|ease-in-out|ease-out|\blinear\b/);
    expect(panelCss).not.toMatch(/@keyframes[^{]*\{[^}]*transform/);
  });

  it('has a designed reduce-motion state: the panel is simply there', () => {
    expect(panelCss).toMatch(/\.reduce-motion #sheet-menu[\s\S]*?animation: none/);
    expect(panelCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*#sheet-menu \{\s*animation: none/);
    // the backdrop's own fade is the interface layer's, which stands still under Reduce motion
    expect(styleCss).not.toMatch(/\.screen:not\(#game\):not\(\[hidden\]\) \{\s*filter:/);
  });
});

describe('the panel keeps the pause behaviour it borrowed', () => {
  it('anchors the state in the heading and leaves the level to the kicker read-out', () => {
    // Owner direction (2026-10-22): a pause is a state, so the heading says PAUSED offline and
    // MATCH MENU online; a campaign level is named in the corner plate instead of the title.
    expect(panel).toContain('<h2 id="gm-title">Paused</h2>');
    expect(PAUSE.title).toBe('Paused');
    expect(PAUSE.matchTitle).toBe('Match menu');
    expect(mainSource).toMatch(/title\.textContent = isOnlineDuel\(\) \? PAUSE\.matchTitle : PAUSE\.title/);
    // The tutorial exit keeps its own words and its own place above the lead key.
    expect(mainSource).toMatch(/exitBtn\.textContent = TUTORIAL\.exit/);
  });

  it('names the mode and the campaign level in the kicker over the title, never as a control', () => {
    expect(mainSource).toMatch(/function syncMenuMode\(\)/);
    expect(mainSource).toMatch(/el\.textContent = campaignLevel\s*\n?\s*\? CAMPAIGN\.levelLabel\(campaignLevel\.number\)/);
    expect(mainSource).toMatch(/isOnlineDuel\(\) \? PAUSE\.duelMode : PAUSE\.practiceMode/);
    // The corner reads the campaign's own label, not a second "Campaign" word that would compete
    // with the level number the player actually needs.
    expect(CAMPAIGN.levelLabel(12)).toBe('Level 12');
    // A <p>, not a button: it is a read-out.
    expect(panel).toMatch(/<div class="gm-name">\s*<p class="gm-mode" id="gm-mode">/);
  });

  it('makes Restart honest: the current match, never a silent trip to a level list', () => {
    // The old key left for the level list under two different names ("New game"/"Back to levels").
    // Owner brief 2026-10-22: Restart resets the match in place, with a confirmation only when
    // there is real progress; a campaign keeps its deterministic seed, practice a fresh deal.
    expect(mainSource).not.toMatch(/Start a new game\? This one will be lost/);
    expect(mainSource).toMatch(/function requestRestart\(\)/);
    expect(mainSource).toMatch(/function restartHasConsequence\(\)/);
    expect(mainSource).toMatch(/campaign\.seed, campaign\.botLevel, null, campaign/);
    expect(mainSource).toMatch(/startGame\(randomSeed\(\), level, null, null, difficulty\)/);
    // Rapid taps are stopped by a state guard released by the new session, not by a timer.
    expect(mainSource).toMatch(/if \(!session \|\| restarting \|\| isOnlineDuel\(\)\) return/);
    expect(mainSource).toMatch(/restarting = false;/);
    // A duel never offers Restart: it is hidden by the same paint that names the mode.
    expect(mainSource).toMatch(/restart\.hidden = isOnlineDuel\(\) \|\| !!coach\.tutorial/);
  });

  it('fills the read-out from the elements the slim header already updates', () => {
    // The scores stay the HUD's own nodes, copied in; no second scoring path.
    expect(mainSource).toMatch(/you\.textContent = \$\('score-you'\)\.textContent/);
    expect(panel).toContain('id="gm-score-you"');
    expect(panel).toContain('id="gm-score-bot"');
    expect(panel).toContain('id="gm-turn"');
  });

  it('never lets the plate and the outcome share the screen', () => {
    // Owner review 2026-10-23: a finished match showed "Paused" and "Settings" painted above the
    // result card, because the HUD keys stay above the card and a tap opened the plate over it.
    // Two locks: a finished match opens no menu, and a result puts any open plate away first.
    expect(mainSource).toMatch(/const matchIsFinished = \(\): boolean => !\$\('gameover'\)\.hidden;/);
    expect(mainSource).toMatch(/bind\('hud-menu', \(\) => \{ if \(!matchIsFinished\(\)\) sheet\('sheet-menu'\); \}\);/);
    expect(mainSource).toMatch(/bind\('hud-history', \(\) => \{ if \(!matchIsFinished\(\)\) sheet\('sheet-history'\); \}\);/);
    // The result is the authority: it cannot be painted under a plate, whatever opened it.
    expect(mainSource).toMatch(/function putAwaySheetsForResult\(\): void \{/);
    expect(mainSource).toMatch(/function presentResult\(go: HTMLElement, wasHidden: boolean\): void \{\n {2}putAwaySheetsForResult\(\);/);
    // Putting the plate away also releases the pause it took (a finished match is not paused).
    expect(mainSource).toMatch(/openSheet = null;\n {2}\$\('scrim'\)\.hidden = true;\n {2}setPaused\(false\);/);
  });
});

describe('the icon tools keep their icons when the words are painted', () => {
  it('paints the spoken label and the short word, never the whole button', () => {
    expect(mainSource).toMatch(/tool\('gm-howto', HELP\.howToTitle, PAUSE\.howToShort\);/);
    expect(mainSource).toMatch(/tool\('gm-history', PAUSE\.history, PAUSE\.historyShort\);/);
    expect(mainSource).not.toMatch(/howto\.textContent =|history\.textContent = PAUSE\.history/);
    expect(PAUSE.howToShort).toBe('Rules');
    expect(PAUSE.historyShort).toBe('History');
  });
});
