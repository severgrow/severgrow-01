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
    // Nothing was renamed or dropped: Back to the game still leads, then the quiet rows, then the
    // corner key. Exit tutorial stays ABOVE the resume so a lesson can leave the lock first.
    expect(buttonIds).toEqual([
      'gm-exit-tutorial', 'gm-resume', 'gm-new', 'gm-howto', 'gm-history',
      'gm-resign', 'gm-main', 'gm-settings',
    ]);
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
    expect(bodyFor('.gm-lead')).toContain('min-height: 48px');
    expect(bodyFor('.gm-key')).toContain('min-height: 44px');
    // A row only ever states a MINIMUM: a fixed height would clip Large text.
    expect(declsFor('.gm-act')).toContain('height: auto');
    expect(declsFor('.gm-act')).not.toMatch(/(?:^|;)\s*height:\s*(?:\d|var\()/m);
  });

  it('separates the rows with hairlines only, never a second border', () => {
    // The lines between rows must come from ONE rule that draws the line ABOVE each following row.
    expect(bodyFor('.gm-act + .gm-act::before')).toContain('height: 1px');
    expect(bodyFor('.gm-act')).not.toContain('border-bottom');
    expect(bodyFor('.gm-act')).not.toContain('border-top');
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

  it('draws the scores in the players own meaning colours and the rest from the palette', () => {
    expect(bodyFor('.gm-you b')).toContain('var(--c-you)');
    expect(bodyFor('.gm-bot b')).toContain('var(--c-bot)');
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
  it('keeps the level label and the tutorial exit words on their existing elements', () => {
    // The title still names the campaign level (`onboarding` reads it); the exit still says what it
    // does. Neither moved into the new read-out.
    expect(panel).toContain('<h2 id="gm-title">Paused</h2>');
    expect(mainSource).toMatch(/title\.textContent = campaignLevel \? CAMPAIGN\.levelLabel\(campaignLevel\.number\) : 'Paused'/);
    expect(mainSource).toMatch(/exitBtn\.textContent = TUTORIAL\.exit/);
  });

  it('names the mode in the corner plate, and never as a control', () => {
    expect(mainSource).toMatch(/function syncMenuMode\(\)/);
    expect(mainSource).toMatch(/el\.textContent = campaignLevel \? 'Campaign' : isOnlineDuel\(\) \? 'Duel' : 'Practice'/);
    // A <p>, not a button: it is a read-out.
    expect(panel).toMatch(/<p class="gm-mode" id="gm-mode">/);
  });

  it('fills the read-out from the elements the slim header already updates', () => {
    // The scores stay the HUD's own nodes, copied in; no second scoring path.
    expect(mainSource).toMatch(/you\.textContent = \$\('score-you'\)\.textContent/);
    expect(panel).toContain('id="gm-score-you"');
    expect(panel).toContain('id="gm-score-bot"');
    expect(panel).toContain('id="gm-turn"');
  });
});
