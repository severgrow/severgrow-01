// THE PAUSE PANEL, locked at the source (owner direction, 2026-10-20).
//
// The owner asked for something between the old menu, the Instrument and the Bare Rail: one machine
// face — warm off-white type on the warm panel, ONE amber lamp, hairlines only where they separate
// things — with Settings moved to the bottom-right corner as a small utility key, LAST in tab order.
// `web/e2e/pause-panel.ts` measures the built page; this test guards the markup and CSS that produce
// those numbers, so a later edit cannot quietly re-introduce a second content edge, a stray colour,
// a hand-picked duration, or a Settings key that is no longer last.
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
/** The panel block as written, comments and media wrappers included (minus its comments). */
const panelBlock = styleCss.slice(
  styleCss.indexOf('the pause panel: one machine face'),
  styleCss.indexOf('\n.row {', styleCss.indexOf('the pause panel: one machine face')),
);
const panelCss = panelBlock.replace(/\/\*[\s\S]*?\*\//g, '');
const declsFor = (needle: string) => panelRules.filter((r) => r.prelude.trim().endsWith(needle)).map((r) => r.body).join('\n');
const rulesFor = (needle: string) => panelRules.filter((r) => r.prelude.includes(needle));
const bodyFor = (needle: string) => rulesFor(needle).map((r) => r.body).join('\n');

const buttonIds = [...panel.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]!);

describe('the pause panel is one machine face', () => {
  it('keeps the familiar actions, in a sensible order', () => {
    // Owner direction (2026-10-22): Resume leads; Restart and Main menu are the secondary keys;
    // How to play and What happened are compact utilities BELOW them, never peers of Resume;
    // Settings stays the corner key. In a lesson, Exit tutorial still sits above Resume so a lock
    // can be left first. Resign (a duel only) keeps its own row.
    expect(buttonIds).toEqual([
      'gm-exit-tutorial', 'gm-resume', 'gm-new', 'gm-resign', 'gm-main',
      'gm-howto', 'gm-history', 'gm-settings',
    ]);
    // There is exactly ONE cream fill on a normal pause and it is Resume: no second primary competes
    // with it. (Exit tutorial is a primary in markup, but it exists only inside a lesson, hidden.)
    const primary = [...panel.matchAll(/<button[^>]*class="([^"]*\bprimary\b[^"]*)"[^>]*>/g)]
      .filter((m) => !/\bhidden\b/.test(m[0]))
      .map((m) => m[0]);
    expect(primary).toHaveLength(1);
    expect(primary[0]).toContain('id="gm-resume"');
    // Restart is a secondary key, not a filled one.
    expect(panel).toMatch(/<button id="gm-new" class="btn ghost gm-act"/);
  });

  it('has ONE content axis: a mirrored nameplate, a mirrored read-out, one column', () => {
    // The nameplate is three cells (spacer | title | close), so the title is centred on the panel,
    // not on the space beside Close.
    expect(bodyFor('gm-head')).toContain('grid-template-columns: 44px 1fr 44px');
    // The read-out is two equal halves either side of a 1px rule that sits on that axis.
    expect(bodyFor('gm-scores')).toContain('grid-template-columns: 1fr 1px 1fr');
    // The lead key and every row are full-width: a single left and right edge, no alternate widths.
    for (const sel of ['.gm-lead', '.gm-act']) {
      expect(bodyFor(sel), `${sel} is full width`).toContain('width: 100%');
    }
  });

  it('gives every action row ONE height, from ONE token, never below 44px', () => {
    // One token holds the row height; the rows only read it. A second literal height would be drift.
    expect(bodyFor('--gm-row')).toBe('');
    expect(panelCss).toContain('--gm-row: 46px');
    expect(bodyFor('.gm-act')).toContain('min-height: var(--gm-row)');
    expect(bodyFor('.gm-lead')).toMatch(/min-height: (48|50)px/);
    expect(bodyFor('.gm-key')).toContain('min-height: 44px');
    // A row only ever states a MINIMUM: a fixed height would clip Large text or a longer language.
    expect(declsFor('.gm-act')).toContain('height: auto');
    expect(declsFor('.gm-act')).not.toMatch(/(?:^|;)\s*height:\s*(?:\d|var\()/m);
  });

  it('separates the secondary keys by their frames, never by a second border', () => {
    // Owner direction (2026-10-22): Restart and Main menu are two framed secondary keys, so each
    // owns its edge; the old inter-row hairline is explicitly switched off rather than stacked on.
    expect(bodyFor('.gm-act')).toContain('border: 1px solid');
    expect(bodyFor('.gm-act + .gm-act::before')).toContain('display: none');
    expect(bodyFor('.gm-act')).not.toContain('border-bottom');
    expect(bodyFor('.gm-act')).not.toContain('border-top');
    // Utilities are compact, but still a real 44px target.
    expect(bodyFor('.gm-tool')).toContain('min-height: 44px');
  });
});

describe('Settings is a quiet utility key in the bottom-right corner, last in tab order', () => {
  it('is the LAST button in the markup, so it is last in tab order', () => {
    expect(buttonIds[buttonIds.length - 1]).toBe('gm-settings');
    // And it is the only control in the corner plate, after the mode read-out.
    const foot = panel.slice(panel.indexOf('class="gm-foot"'));
    expect(foot).toContain('id="gm-mode"');
    expect(foot.indexOf('gm-mode')).toBeLessThan(foot.indexOf('gm-settings'));
  });

  it('is a full 44px target with its own label, not an icon', () => {
    expect(panel).toMatch(/<button id="gm-settings"[^>]*aria-label="Settings"[^>]*>Settings<\/button>/);
    expect(bodyFor('.gm-key')).toContain('min-height: 44px');
  });

  it('is separated from the action column by its own rule and the mode read-out', () => {
    const foot = bodyFor('.gm-foot');
    expect(foot).toContain('border-top');
    expect(foot).toContain('justify-content: space-between');
  });

  it('nothing can insert another control after it', () => {
    // The two modules that add a pause row (the report link and the live "leave" item) must target
    // the action column, never the corner plate.
    const feedback = read('../src/feedback/mount.ts');
    expect(feedback).toContain("querySelector('#sheet-menu .gm-acts')");
    expect(feedback).not.toContain("settingsBtn?.parentElement?.insertBefore");
    const live = read('../src/online/live/ui.ts');
    expect(live).toContain("'#sheet-menu .gm-acts'");
  });
});

describe('the face reads as 1970s hardware, not a second app', () => {
  it('has exactly one amber note, read from the LIGHT contract', () => {
    // The lamp reads the published light core; the lead key's edge reads the light bloom. Neither
    // invents a colour and neither glows.
    expect(bodyFor('gm-head h2::before')).toContain('var(--light-core');
    expect(bodyFor('.gm-lead')).toContain('var(--light-bloom');
    // No decorative gradients and no glow on the panel.
    expect(panelCss).not.toContain('radial-gradient');
    expect(panelCss).not.toMatch(/filter:\s*blur/);
  });

  it('draws the scores NEUTRAL and the rest from the palette', () => {
    // Owner (2026-10-20): no green/red on the points. Both digits use the palette's text ink;
    // whose score is whose is said by which side it sits on and by the label under it.
    expect(bodyFor('.gm-you b')).toContain('var(--c-text)');
    expect(bodyFor('.gm-bot b')).toContain('var(--c-text)');
    expect(bodyFor('.gm-you b')).not.toContain('var(--c-you)');
    expect(bodyFor('.gm-bot b')).not.toContain('var(--c-bot)');
    // The turn line is a word in the panel's ink, not a coloured score.
    expect(bodyFor('.gm-turn')).toContain('var(--c-text)');
    // Quiet rows recede to the palette's muted ink; the loud row does not.
    expect(bodyFor('.gm-act-quiet')).toContain('var(--c-muted)');
    expect(bodyFor('.gm-mode')).toContain('var(--c-muted)');
    expect(bodyFor('.gm-key')).toContain('var(--c-muted)');
    // Every colour in the block is a token (or a mix of one), never a literal hex.
    const literals = panelCss.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(literals.filter((c) => c.toLowerCase() !== '#f5d8a4'), 'only the light fallback may be a literal').toEqual([]);
  });

  it('moves on the two tempo tokens only, with transform-free motion', () => {
    expect(bodyFor('#sheet-menu')).toContain('animation: gm-panel-in var(--dur-quick) var(--ease-standard)');
    // No raw duration or easing anywhere in the panel's rules.
    expect(panelCss).not.toMatch(/\b\d+(?:\.\d+)?(?:ms|s)\b/);
    expect(panelCss).not.toMatch(/cubic-bezier|ease-in-out|ease-out|\blinear\b/);
    // The slide uses `translate`, never `transform`: on wide screens the sheet is centred with a
    // transform, and animating transform would drop that centring.
    expect(panelCss).not.toMatch(/@keyframes[^{]*\{[^}]*transform/);
  });

  it('has a designed reduce-motion state: the panel is simply there', () => {
    expect(panelCss).toMatch(/\.reduce-motion #sheet-menu[\s\S]*?animation: none/);
    expect(panelCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*#sheet-menu \{\s*animation: none/);
  });
});

describe('the panel keeps the pause behaviour it borrowed', () => {
  it('anchors the state in the heading and leaves the level to the corner read-out', () => {
    // Owner direction (2026-10-22): a pause is a state, so the heading says PAUSED offline and
    // MATCH MENU online; a campaign level is named in the corner plate instead of the title.
    expect(panel).toContain('<h2 id="gm-title">Paused</h2>');
    expect(PAUSE.title).toBe('Paused');
    expect(PAUSE.matchTitle).toBe('Match menu');
    expect(mainSource).toMatch(/title\.textContent = isOnlineDuel\(\) \? PAUSE\.matchTitle : PAUSE\.title/);
    // The tutorial exit keeps its own words and its own place above the lead key.
    expect(mainSource).toMatch(/exitBtn\.textContent = TUTORIAL\.exit/);
  });

  it('names the mode and the campaign level in the corner plate, never as a control', () => {
    expect(mainSource).toMatch(/function syncMenuMode\(\)/);
    expect(mainSource).toMatch(/el\.textContent = campaignLevel\s*\n?\s*\? CAMPAIGN\.levelLabel\(campaignLevel\.number\)/);
    expect(mainSource).toMatch(/isOnlineDuel\(\) \? PAUSE\.duelMode : PAUSE\.practiceMode/);
    // The corner reads the campaign's own label, not a second "Campaign" word that would compete
    // with the level number the player actually needs.
    expect(CAMPAIGN.levelLabel(12)).toBe('Level 12');
    // A <p>, not a button: it is a read-out.
    expect(panel).toMatch(/<p class="gm-mode" id="gm-mode">/);
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
});
