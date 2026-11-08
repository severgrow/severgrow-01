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
    // Both finish paths count through `noteInstallFinished` (2026-11-06: it retries if a game ends
    // while the page is still booting, before the invitation is mounted), which hands each finish to
    // the one recorder, `installPrompt.noteFinished`.
    const calls = mainSource.match(/^\s+noteInstallFinished\(/gm) ?? [];
    expect(calls.length).toBe(2);
    // OWNER CHANGED THE RULE (2026-11-08: never mid-game): the finish is remembered and handed to the
    // one recorder when the end screen is up (offerEndOfGamePrompts), still once per finish.
    expect(mainSource).toMatch(/function noteInstallFinished\([^)]*\): void \{[\s\S]*?installOutcomeWaiting = outcome;\s*offerEndOfGamePrompts\(\);/);
    expect(mainSource).toMatch(/installPrompt\.noteFinished\(waiting\);/);
  });

  it('counts an online result once per match (the finish screen re-renders)', () => {
    expect(mainSource).toContain('onlineResultNoted');
    expect(mainSource).toMatch(/onlineResultNoted !== matchId/);
  });

  it('never counts a tutorial step (the recorder sits behind the tutorial guard)', () => {
    // The offline call sits behind the same tutorial guard as the stats recorder (`countsTowardRecord`
    // with `tutorial: !!coach.tutorial`). (The Blitz timeout-loss path that also matched an older
    // `!coach.tutorial` spelling was removed in 0.82: a Blitz timeout no longer finishes the match.)
    expect(mainSource).toMatch(/tutorial: !!coach\.tutorial[\s\S]{0,1200}noteFinishedForInstall\(/);
  });

  it('no longer mounts the removed menu button', () => {
    expect(mainSource).not.toContain('mountInstallButton');
  });
});
