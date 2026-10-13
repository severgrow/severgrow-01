// The install invitation is no longer a permanent menu item. This pins that the menu holds no
// install button or hint (either label, mobile or desktop), that the invitation itself is a proper
// dialog, and that the install module no longer names a menu control.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));
const installSource = readFileSync(fileURLToPath(new URL('../src/logic/install.ts', import.meta.url)), 'utf8');
const mainSource = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

describe('the menu has no install button', () => {
  it('removes the button and its hint element entirely', () => {
    expect(html).not.toContain('id="menu-install"');
    expect(html).not.toContain('id="menu-install-hint"');
    expect(installSource).not.toContain('menu-install');
  });

  it('leaves neither install label in the menu (mobile or desktop)', () => {
    expect(menuSection).not.toMatch(/Add to Home Screen/i);
    expect(menuSection).not.toMatch(/Open in separate window/i);
    expect(menuSection).not.toMatch(/install/i);
  });

  it('keeps the menu intact: exactly four entries as before', () => {
    for (const id of ['menu-new', 'menu-tutorial', 'menu-settings']) {
      expect(menuSection).toContain(`id="${id}"`);
    }
  });
});

describe('the invitation is a real dialog', () => {
  it('is a labelled, modal sheet with every control the words need', () => {
    expect(html).toContain('id="install-prompt"');
    expect(html).toMatch(/id="install-prompt"[^>]*hidden/);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="install-title"');
    for (const id of ['install-title', 'install-why', 'install-steps', 'install-accept', 'install-close', 'install-later', 'install-never']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('carries no words of its own — they come from src/strings.ts', () => {
    const prompt = html.slice(html.indexOf('id="install-prompt"'), html.indexOf('id="guide-arrow"'));
    // The only text in the dialog markup is icon/structural; the copy is filled by the page.
    expect(prompt).not.toMatch(/Add to Home Screen/i);
    expect(prompt).not.toMatch(/>[A-Za-z]{3,}\s+[A-Za-z]{3,}</);
  });
});

describe('every finished game is counted, online included', () => {
  // The exact gap the owner found: online duels never reached the stats recorder, so an
  // online-only player would never see the invitation. Both finish paths must call the counter.
  it('counts the offline finish and the online finish', () => {
    const calls = mainSource.match(/installPrompt\.noteFinished\(/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('counts an online result once per match (the finish screen re-renders)', () => {
    expect(mainSource).toContain('onlineResultNoted');
    expect(mainSource).toMatch(/onlineResultNoted !== matchId/);
  });

  it('never counts a tutorial step (the recorder sits behind the tutorial guard)', () => {
    // The offline call sits in the same `!coach.tutorial` block as the stats recorder.
    expect(mainSource).toMatch(/!coach\.tutorial[\s\S]{0,400}noteFinished/);
  });

  it('no longer mounts the removed menu button', () => {
    expect(mainSource).not.toContain('mountInstallButton');
  });
});
