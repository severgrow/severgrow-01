// THE FINISH CARD'S OWN RULES (owner direction, 2026-10-16; four-key planet card 2026-11-11). The
// card is shared by every mode, so what it leads with, what it keeps on screen, what lives in RESULT
// and what waits behind "More" on a classic card is pinned here — the layout measurement itself (no
// scrolling at 360x640 in each mode) is asserted in a real browser by `web/e2e/finish-fit.ts`,
// because only a browser has a layout to measure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, LESSON, ONLINE, RESULT, TUTORIAL_REPLAY } from '../../src/strings.js';
import { PLANET_TEACH } from '../src/online/seed-icon.js';
import { barFor, canGrowAt, growKeyLabel } from '../src/online/endgame-planet.js';
import { CAMPAIGN_LEVELS, nextCampaignLevel } from '../../src/campaign/index.js';
import { finishLead } from '../src/logic/finish-actions.js';
import { LESSONS, lessonFor } from '../src/lessons/lessons.js';
import { resultTitle } from '../src/logic/log.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const goCard = html.slice(html.indexOf('<div class="go-card">'), html.indexOf('</section>', html.indexOf('<div class="go-card">')));
/**
 * The keys block. It has its own closing marker because the planet card wraps the four keys in two
 * row containers (the pause panel's derived-column grid), so "up to the next </div>" would stop at
 * the end of the first row.
 */
const goButtons = html.slice(html.indexOf('<div class="go-buttons">'), html.indexOf('<!-- /go-buttons -->'));

describe('which action leads the finish card, per mode', () => {
  it('online always leads with the rematch it has always had', () => {
    const online = { online: true, campaign: false, won: true, hasNext: false };
    expect(finishLead(online)).toBe('rematch');
    expect(finishLead({ ...online, won: false })).toBe('rematch'); // a loss offers it too
  });

  it('a WON campaign level leads with the next level', () => {
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: true })).toBe('next-level');
    expect(CAMPAIGN.nextLevel).toBe('Next level');
  });

  it('the last built level has no next level, so the same slot plays it again', () => {
    // Owner brief 2026-11-11: "we remove back to levels in campaign — player should only be able to
    // play his latest level". The card therefore never points back at the list.
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: false })).toBe('play-again');
    expect(CAMPAIGN.back).toBe('Back to levels'); // the words still exist for the list's own screens
  });

  it('a LOSS never offers the next level (the win flow is the win flow)', () => {
    expect(finishLead({ online: false, campaign: true, won: false, hasNext: true })).toBe('try-again');
    expect(finishLead({ online: false, campaign: false, won: false, hasNext: false })).toBe('try-again');
  });

  it('a plain offline game keeps its own two words', () => {
    expect(finishLead({ online: false, campaign: false, won: true, hasNext: false })).toBe('play-again');
  });

  it('a REPLAY of a level behind the place plays it again, never forward and never back to the list', () => {
    // Owner (2026-10-24): "you always go from the one you finished on". After replaying level 1 the
    // finish card must not march the player through levels 2, 3, … they already passed, and (2026-11-11)
    // there is no list key to go back to: the same level, from its own fixed seed, is the honest lead.
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: true, replay: true })).toBe('play-again');
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: false, replay: true })).toBe('play-again');
    expect(finishLead({ online: false, campaign: true, won: false, hasNext: true, replay: true })).toBe('try-again');
  });

  it('a TUTORIAL replay returns to the Tutorial, never into campaign progression', () => {
    expect(finishLead({ online: false, campaign: true, won: true, hasNext: true, tutorial: true })).toBe('back-to-tutorial');
    expect(finishLead({ online: false, campaign: true, won: false, hasNext: false, tutorial: true })).toBe('back-to-tutorial');
    expect(TUTORIAL_REPLAY.back).toBe('Back to Tutorial');
  });
});

describe('the last level is decided by the DATA, never a hardcoded count', () => {
  it('the next-level lookup answers from the level list itself', () => {
    // The campaign worker is adding levels (>10) as this lands, so the count is read, never assumed.
    expect(CAMPAIGN_LEVELS.length).toBeGreaterThanOrEqual(10);
    const last = CAMPAIGN_LEVELS.at(-1)!;
    expect(nextCampaignLevel(last.number)).toBeNull();
    expect(nextCampaignLevel(CAMPAIGN_LEVELS[0]!.number)).not.toBeNull();
  });

  it('main.ts asks the level data, so a growing campaign needs no change here', () => {
    expect(mainSource).toMatch(/const lead = finishLead\(\{ online: false, campaign: !!campaign, won, hasNext: !!next, tutorial, replay \}\)/);
    expect(mainSource).toMatch(/const next = campaign && won && !tutorial && !replay \? nextCampaignLevel\(campaign\.number\) : null/);
    expect(mainSource).not.toMatch(/campaign\.number\s*===?\s*(10|30)\b/);
  });

  it('the leading button really starts that next level, and plays the same level otherwise', () => {
    expect(mainSource).toMatch(/if \(campaignLevel && wonNow\) \{[\s\S]{0,200}const next = campaignReplay \? null : nextCampaignLevel\(campaignLevel\.number\)/);
    expect(mainSource).toMatch(/if \(next\) return startCampaignLevel\(next\)/);
    // No card path reaches the level list any more (owner brief, 2026-11-11).
    expect(mainSource).not.toMatch(/hideGameOver\(\);\n    resultAdvance = false;\n    return showScreen\('campaign'\);/);
    expect(mainSource).toMatch(/if \(campaignLevel\) return startCampaignLevel\(campaignLevel\);/);
  });

  it('every mode labels its keys for a screen reader, not just for the eye', () => {
    // The offline branch sets the label from the same word it shows; so does the online branch.
    expect(mainSource).toMatch(/\$\('go-rematch'\)\.setAttribute\('aria-label', leadWord\)/);
    expect(mainSource).toMatch(/\$\('go-rematch'\)\.setAttribute\('aria-label', ONLINE\.rematch\)/);
    expect(mainSource).toMatch(/other\.setAttribute\('aria-label', otherWord\)/);
    expect(mainSource).toMatch(/other\.setAttribute\('aria-label', ONLINE\.backToMatches\)/);
    // The fourth key's words and its route are decided together (Back to matches on a duel).
    expect(mainSource).toMatch(/menuKey\.textContent = anatomy === 'planet' \? ONLINE\.backToMatches : ONLINE\.menuButton;/);
    expect(mainSource).toMatch(/menuKey\.dataset\.target = anatomy === 'planet' \? 'matches' : 'menu';/);
  });
});

describe('the card is one screen: the result leads, the rest waits behind RESULT (or "More")', () => {
  it('keeps the outcome, the final score and the Seeds on every card', () => {
    for (const id of ['go-title', 'go-score', 'go-seeds']) {
      expect(goCard, `${id} must not be behind the disclosure`).toContain(`id="${id}"`);
      expect(goCard).not.toMatch(new RegExp(`id="${id}"[^>]*data-go-extra`));
    }
    // And the one way forward, the result window, the replay and the way out are never behind it.
    expect(goButtons).not.toMatch(/id="go-rematch"[^>]*data-go-extra/);
    expect(goButtons).not.toMatch(/id="go-result"[^>]*data-go-extra/);
    expect(goButtons).not.toMatch(/id="go-menu"[^>]*data-go-extra/);
  });

  it('the planet card moves every detail line into RESULT, and keeps the card for the world', () => {
    // The result window is a real surface inside the finish dialog, with its own board and keys.
    expect(html).toContain('id="go-result-pane"');
    expect(html).toContain('id="go-result-board"');
    for (const id of ['go-result-reason', 'go-result-break', 'go-result-moves', 'go-result-highlights', 'go-result-stats', 'go-result-share', 'go-result-cut']) {
      expect(html, `${id} lives in the result window`).toContain(`id="${id}"`);
    }
    // main.ts fills it from the ONE model, once per card, and freezes the planet behind it.
    expect(mainSource).toMatch(/finishResult = \{/);
    expect(mainSource).toMatch(/function openFinishResult\(\): void \{/);
    expect(mainSource).toMatch(/endgamePlanet\?\.freeze\(true\);/);
    expect(mainSource).toMatch(/endgamePlanet\?\.freeze\(false\);/);
    // A classic card keeps its reason on the card; a planet card shows it in RESULT. The anatomy is
    // decided once, in the header block, because the header, the pane and the keys all read it.
    expect(mainSource).toMatch(/const planetCard = ENDGAME_PLANET && !\(taughtEarly && taughtEarly\.level !== FINAL_LESSON\.level\);/);
    expect(mainSource).toMatch(/go\.dataset\.anatomy = planetCard \? 'planet' : 'classic';/);
  });


  it('the detail lines and the extra actions are behind it, hidden by default', () => {
    // `go-board` is deliberately NOT here: it is how a player looks at the final position, and the
    // documented way for a suite to put the card away (`web/e2e/smoke.ts` uses `#go-board:visible`).
    for (const id of ['go-break', 'go-moves', 'go-highlights', 'go-stats', 'go-share', 'go-cut']) {
      expect(goCard, `${id} is a detail line or an extra action`).toMatch(new RegExp(`id="${id}"[^>]*data-go-extra`));
      expect(goCard, `${id} starts hidden`).toMatch(new RegExp(`id="${id}"[^>]*data-go-extra[^>]*hidden|id="${id}"[^>]*hidden[^>]*data-go-extra`));
    }
    expect(goCard).not.toMatch(/id="go-board"[^>]*data-go-extra/);
    expect(RESULT.more).toBe('More');
    expect(RESULT.less).toBe('Less');
  });

  it('the four keys are two rows of two, in the product\'s order', () => {
    // Owner feedback (2026-11-11): half-width keys, 2x2, no full-width rows, no orphaned slot.
    const rows = [...goButtons.matchAll(/<div class="go-key-row">([\s\S]*?)<\/div>/g)].map((m) =>
      [...m[1]!.matchAll(/<button id="([^"]+)"/g)].map((b) => b[1]!));
    expect(rows.slice(0, 2)).toEqual([['go-rematch', 'go-result'], ['go-replay', 'go-menu']]);
    // Each row derives its columns from what is VISIBLE (the pause panel's own trick): one key fills
    // the row, two split it. No fixed template, and no `:has()` deciding a width.
    const css = read('../src/style.css');
    expect(css).toMatch(/#gameover\[data-anatomy='planet'\] \.go-key-row \{\n  display: grid;\n  grid-auto-flow: column;\n  grid-auto-columns: 1fr;/);
    expect(css).toMatch(/#gameover\[data-anatomy='planet'\] \.go-key-row:not\(:has\(> \.btn:not\(\[hidden\]\)\)\) \{ display: none; \}/);
    // The lead key is the only FILLED one; the rest are the same quiet tonal plate, and NO key
    // carries a contour (owner house rule, 2026-11-11: tone, never a border).
    expect(css).toMatch(/#gameover\[data-anatomy='planet'\] \.go-buttons \.btn \{[\s\S]*?border: 0;\n  background: color-mix\(in srgb, var\(--fu-cream\) 7%, transparent\);/);
    expect(css).toMatch(/#gameover\[data-anatomy='planet'\] \.go-buttons \.btn\.primary \{\n  min-height: 46px;\n  border: 0;\n  background: var\(--fu-cream\);/);
    // The campaign card never offers a level list, and a classic card only offers Change difficulty.
    expect(mainSource).toMatch(/other\.hidden = !!campaign \|\| ENDGAME_PLANET;/);
    expect(mainSource).toMatch(/const otherWord = 'Change difficulty';/);
  });

  it('is driven by one disclosure in main.ts, shared by every mode', () => {
    expect(mainSource).toMatch(/function syncGoExtras\(\)/);
    expect(mainSource).toMatch(/document\.querySelectorAll<HTMLElement>\('#gameover \[data-go-extra\]'\)/);
    expect(mainSource).toMatch(/more\.hidden = available\.length === 0/);
    // The online and offline branches both go through it, so the three modes cannot drift.
    expect((mainSource.match(/setGoExtrasOpen\(false\)/g) ?? []).length).toBe(2);
    expect((mainSource.match(/else syncGoExtras\(\);/g) ?? []).length).toBe(2);
    // A mode with nothing to offer marks it unavailable rather than showing a dead control.
    expect(mainSource).toMatch(/setGoExtra\('go-cut', false\)/);
    expect(mainSource).toMatch(/setGoExtra\('go-moves', !!moves\)/);
  });
});

describe('after the tutorial, the player lands in a level (never back at a menu)', () => {
  const start = mainSource.indexOf('function completeTutorial()');
  const complete = mainSource.slice(start, start + 1800);

  it('hands off through the campaign entry point, not the menu', () => {
    expect(complete).toMatch(/if \(FEATURES\.campaign\) return enterCampaign\(\)/);
    // The legacy channels (no campaign) keep the menu they always had — they have no levels.
    expect(complete).toMatch(/showScreen\('menu'\)/);
  });

  it('the campaign entry point is the ONE way to start a level', () => {
    const entry = mainSource.slice(mainSource.indexOf('function enterCampaign()'), mainSource.indexOf('function completeTutorial()'));
    // ONE decision drives both the menu label and this press, so they cannot disagree. That is the
    // fix for the old mismatch where the label said LEVEL 70 and the press resumed level 31.
    expect(entry).toMatch(/const entry = campaignEntry\(campaignProgress, campaignResume\(\)\?\.level \?\? null\)/);
    expect(entry).toMatch(/startCampaignLevel\(entry\.level\)/);
    expect(entry).toMatch(/return askCampaignStart\(entry\.next, entry\.saved\)/);
    // No path may start a level straight from progress any more, and none may silently resume a save:
    // owner decision (2026-10-19) removed the resume branch, so every saved match asks on entry.
    expect(entry).not.toMatch(/startCampaignLevel\(currentLevel\(/);
    expect(entry).not.toMatch(/if \(resume\) return continueCampaignMatch\(resume\)/);
    expect(entry).not.toContain("entry.kind === 'resume'");
    // The campaign screen's own leading button goes through it too: no second path.
    expect(mainSource).toContain("bind('campaign-continue', () => enterCampaign())");
  });

  it('a new player starts at LEVEL 1, a progressed player at their own level', () => {
    // `currentLevel(progress)` is the existing campaign getter: an untouched progress is level 1.
    expect(mainSource).not.toMatch(/startCampaignLevel\(CAMPAIGN_LEVELS\[0\]/);
    expect(mainSource).toMatch(/enterCampaign\(\)/);
  });
});

describe('the review face is gone (owner, 2026-10-30)', () => {
  it('leaves no review ids in the markup', () => {
    // The owner chose "remove the whole review feature": no key, no face, no "Show me" path.
    expect(html).not.toMatch(/go-review/);
    expect(goCard).not.toMatch(/go-review/);
    expect(goButtons).not.toMatch(/go-review/);
  });

  it('leaves no review state or wiring in main.ts', () => {
    // No REVIEW copy, no worker review request, no face toggling, no `go-reviewing` branch.
    expect(mainSource).not.toMatch(/\bREVIEW\b/);
    expect(mainSource).not.toMatch(/askReview|reviewPoint|reviewFor|openReview|closeReview|syncReview|showBetterMove/);
    expect(mainSource).not.toMatch(/go-review/);
    expect(mainSource).not.toMatch(/\.classList\.(?:add|remove)\('reviewing'\)/);
  });

  it('leaves no review CSS, and the source copy is gone', () => {
    const css = read('../src/style.css');
    expect(css).not.toMatch(/go-review/);
    expect(css).not.toMatch(/\.go-card\.reviewing/);
    expect(read('../../src/strings.ts')).not.toMatch(/export const REVIEW\b/);
  });

  it('keeps a way back to the final position: RESULT, not a "Board" key', () => {
    // The board's own "Results" key still brings the card back; the final position is shown large
    // inside RESULT (owner brief, 2026-11-11: "we remove board" from the key row).
    expect(mainSource).toMatch(/button\('Results', 'ghost'/);
    expect(html).toContain('id="go-result-board"');
    expect(mainSource).toMatch(/board\.hidden = !m\.harvest;/);
    // The classic card keeps its documented board key (smoke/live suites put the card away with it),
    // and the planet card hides it in favour of RESULT: a stylesheet rule, not a second branch.
    expect(goButtons).toContain('id="go-board"');
    expect(read('../src/style.css')).toMatch(/#gameover\[data-anatomy='planet'\] #go-board \{/);
  });
});

describe('the won lockup (owner, 2026-10-24)', () => {
  it('the level title ends in a capital Complete, as the outcome stamp of the lockup', () => {
    // "Level 6 Complete": the number is the kicker, the outcome word is the stamp under it. A
    // lowercase tail read as a sentence someone forgot to finish.
    expect(CAMPAIGN.levelWon(6)).toBe('Level 6 Complete');
    expect(CAMPAIGN.levelWon(12)).toBe('Level 12 Complete');
    // main.ts still splits on the LAST space, so the kicker/outcome halves keep working.
    expect(mainSource).toMatch(/const at = split \? text\.lastIndexOf\(' '\) : -1;/);
  });

  it('no amber rule under the title: the words are the shape', () => {
    // Owner: "remove the awkward line that separates whatever's below". It was a real element
    // (a 2px ::after on the title), so its absence is asserted at the source.
    expect(read('../src/style.css')).not.toMatch(/#gameover\.won \.go-title::after/);
    expect(read('../src/style.css')).not.toMatch(/@keyframes go-rule/);
  });
});

describe('a won lesson’s own lockup (owner, 2026-11-12)', () => {
  it('paints LESSON n over LEARNED for levels 1-9, and keeps level 10 on one line', () => {
    // The same paintGoTitle machinery as a campaign win: only the WORDS differ.
    expect(mainSource).toMatch(/if \(taught && won\) paintGoTitle\(taught\.finish\.title, taught\.level !== FINAL_LESSON\.level\);/);
    expect(LESSON.learnedTitle(3)).toBe('Lesson 3 Learned');
    for (const l of LESSONS.filter((x) => x.level < 10)) {
      expect(l.finish.title, `L${l.level}`).toBe(LESSON.learnedTitle(l.level));
    }
    expect(lessonFor(10)!.finish.title).toBe(LESSON.canPlay);
    // The DOM keeps the whole phrase for a screen reader: the halves are joined by a real space.
    expect(mainSource).toMatch(/el\.replaceChildren\(kicker, document\.createTextNode\(' '\), outcome\);/);
  });

  it('a LOSS never claims it was learned: the honest outcome words are painted instead', () => {
    // main.ts paints the lesson title only on a win; a loss falls through to resultTitle.
    expect(mainSource).toMatch(/\$\('go-title'\)\.textContent = won\n\s*\? campaign \? CAMPAIGN\.levelWon\(campaign\.number\) : RESULT\.won\n\s*: resultTitle\(r, HUMAN\);/);
    expect(resultTitle({ winner: 1, scores: [1, 2], reason: 'deck_exhaustion' }, 0)).toBe(RESULT.lost);
    expect(resultTitle({ winner: null, scores: [2, 2], reason: 'turn_limit' }, 0)).toBe(RESULT.draw);
  });
});

describe('the double harvest stamp (surprise, 2026-10-29)', () => {
  // Owner rule change (2026-10-30): the one-line match summary ("the inquest") is removed from the
  // finish card. These tests used to pin that line; they now pin its absence and keep the stamp.
  it('lives INSIDE the finish card, and starts hidden', () => {
    expect(goCard).toContain('id="go-verdict"');
    expect(goCard).toContain('id="go-harvest"');
    expect(goCard).toMatch(/id="go-verdict"[^>]*hidden/);
  });

  it('carries no one-line match summary any more (owner, 2026-10-30)', () => {
    expect(html).not.toContain('go-inquest');
    expect(mainSource).not.toMatch(/inquest/i);
    expect(read('../src/style.css')).not.toContain('.go-inquest');
  });

  it('is never behind "More": the final position is part of the result', () => {
    expect(goCard).not.toMatch(/id="go-verdict"[^>]*data-go-extra/);
    expect(goCard).not.toMatch(/id="go-harvest"[^>]*data-go-extra/);
  });

  it('adds no new panel, tab, badge or screen: only the card grows a row', () => {
    const block = html.slice(html.indexOf('id="go-verdict"'), html.indexOf('</figure>') + '</figure>'.length);
    expect(block).not.toMatch(/<button|<section|<dialog|role=/);
    expect(html).not.toMatch(/<section id="go-(harvest|verdict)"/);
    expect(goButtons).not.toMatch(/id="go-(harvest|verdict)"/);
  });

  it('is static: one opacity-only beat, and Reduce motion removes it', () => {
    const css = read('../src/style.css');
    expect(css).toMatch(/#gameover\[data-fresh='1'\] \.go-verdict \{\s*animation: go-verdict-in/);
    expect(css).toMatch(/@keyframes go-verdict-in \{\s*from \{\s*opacity: 0;/);
    expect(css).toMatch(/\.reduce-motion #gameover\[data-fresh='1'\] \.go-verdict \{\s*animation: none;/);
    const stampRules = css.slice(css.indexOf('#gameover .go-harvest-svg'), css.indexOf('#gameover[data-fresh=\'1\'] .go-verdict'));
    expect(stampRules).not.toMatch(/animation|filter|transition/);
  });

  it('main.ts paints the stamp from the final board, online and offline', () => {
    expect(mainSource).toMatch(/const harvest = info\.harvest \?\? harvestFigure\(os\.state\.board, os\.state\.config, HUMAN, os\.state\.terrain\);/);
    expect(mainSource).toMatch(/paintVerdict\(harvest\);/);
    expect(mainSource).toMatch(/paintVerdict\(offlineVerdict\(st\)\);/);
    expect(mainSource).toMatch(/box\.hidden = !figure;/);
    expect(mainSource).toMatch(/return st\.result \? harvestFigure\(st\.board, st\.config, HUMAN, st\.terrain\) : null;/);
  });
});

describe('THE PLANET on the card (owner brief, 2026-11-11)', () => {
  it('is the Planet page\'s own map and words, without its menu row', () => {
    // The pane ships in the card, hidden until a planet card paints it.
    expect(goCard).toContain('id="go-world"');
    expect(goCard).toMatch(/id="go-world"[^>]*hidden/);
    expect(goCard).toContain('id="go-world-surface"');
    expect(goCard).toContain('id="go-world-wallet"');
    expect(goCard).toContain('id="go-world-grow"');
    // The menu row is NOT part of this surface: no ranking, challenges, achievements, colour, chat.
    const pane = html.slice(html.indexOf('id="go-world"'), html.indexOf('id="go-world-teach"'));
    expect(pane).not.toMatch(/world-key|world-panel|online-world-menu|online-world-chat|world-colour/);
    // It is the shared renderer, mounted by the lobby (one client, one identity), never a second map.
    // (2026-11-12: it also reports the wallet balance it reads, which the card's window choice remembers.)
    expect(mainSource).toMatch(/endgamePlanet = onlineLobbyCtl\?\.mountEndgamePlanet\(host, \(\) => campaignLevel\?\.number \?\? null, rememberBalance\) \?\? null;/);
    expect(mainSource).toMatch(/function syncEndgamePlanet\(show: boolean, teach: boolean\): void \{/);
  });

  it('offers exactly one action: grow a free tile, two presses, the Planet page\'s wording', () => {
    // THE RESTING HINT IS THE OWNER'S TWO WORDS (owner feedback, 2026-11-11: "Tap a tile"). The
    // richer owner/value line still belongs to the tile bar once a tile is picked.
    expect(RESULT.planetHint).toBe('Tap a tile');
    expect(barFor({ kind: 'none' }, false)).toEqual({ line: 'Tap a tile', spoken: 'Tap a tile', key: null });
    // Pure matrix: no selection, your tile, a rival's tile, a guest, too few Seeds, out of reach.
    expect(barFor({ kind: 'held', line: 'RYK · YOURS', spoken: 'RYK #TAG · YOURS' }, false)).toEqual({
      line: 'RYK · YOURS', spoken: 'RYK #TAG · YOURS', key: null,
    });
    expect(barFor({ kind: 'pentagon' }, false).key).toBeNull();
    expect(barFor({ kind: 'free', growable: true, cost: 100, balance: 150, account: true }, false).key).toBe('grow');
    expect(barFor({ kind: 'free', growable: true, cost: 100, balance: 150, account: true }, true).key).toBe('confirm');
    // A GUEST GETS A PRESSABLE KEY, not a dead instruction (owner, 2026-11-12).
    expect(barFor({ kind: 'free', growable: true, cost: 100, balance: 150, account: false }, false)).toEqual({
      line: 'SIGN IN TO GROW', spoken: 'SIGN IN TO GROW', key: 'signin',
    });
    // A SIGNED-IN PLAYER NEVER SEES IT — even when the tile or the Seeds are out of reach.
    for (const tile of [
      { kind: 'free', growable: true, cost: 100, balance: 150, account: true },
      { kind: 'free', growable: true, cost: 100, balance: 20, account: true },
      { kind: 'free', growable: false, cost: 100, balance: 150, account: true },
    ] as const) expect(barFor(tile, false).key).not.toBe('signin');
    expect(barFor({ kind: 'free', growable: true, cost: 100, balance: 20, account: true }, false).key).toBeNull();
    expect(barFor({ kind: 'free', growable: false, cost: 100, balance: 150, account: true }, false).key).toBeNull();
    // The one key is the game's own sentence, never an invented one.
    expect(goCard).toContain('id="go-world-grow"');
    expect(read('../src/online/endgame-planet.ts')).toMatch(/if \(state\.key === 'grow'\) \{/);
  });

  it('the guest’s key opens the product’s ONE login, and the pane re-reads on a sign-in', () => {
    const source = read('../src/online/endgame-planet.ts');
    // The same entry the Planet page uses: there is no second login UI.
    expect(source).toMatch(/getElementById\('menu-login'\)/);
    expect(source).toMatch(/if \(state\.key === 'signin'\) \{ signIn\(\); return; \}/);
    // The sign-in wording is the product's own (the Planet page's key), never a new string.
    expect(growKeyLabel('signin')).toBe(ONLINE.worldSignInKey);
    expect(growKeyLabel('grow')).toBe(ONLINE.worldGrowKey);
    expect(growKeyLabel('confirm')).toBe(ONLINE.worldGrowConfirm);
    // After signing in, the pane hears about it (never polls) and re-reads world + wallet.
    expect(source).toMatch(/subscribeIdentityChanges\(identityChanged\)/);
    expect(source).toMatch(/'futasaku:identity'/);
    expect(source).toMatch(/isIdentityStorageEvent\(event\.key, STORAGE_PREFIX\)/);
    expect(source).toMatch(/const identityChanged = \(\): void => \{\n\s+if \(disposed \|\| host\.hidden\) return;\n\s+read\(\);/);
    // And it lets go of them when the card closes.
    expect(source).toMatch(/releaseListeners\(\)/);
  });

  it('only grows where this server would take the tile', () => {
    const claim = (cellId: string, ownerId = 'me') => ({ cellId, ownerId, colour: 'hsl(120 34% 49%)', claimedAt: 1 });
    const world = { claims: [claim('0,0')], growAnywhere: true };
    expect(canGrowAt('1,0', world, 'me')).toBe(true);
    expect(canGrowAt('0,0', world, 'me')).toBe(false); // already held
    expect(canGrowAt('nope', world, 'me')).toBe(false);
    // An older server keeps the adjacency rule: beside your land, never across the world.
    const old = { claims: [claim('0,0')], growAnywhere: false };
    expect(canGrowAt('1,0', old, 'me')).toBe(true);
    expect(canGrowAt('9,9', old, 'me')).toBe(false);
  });

  it('explains the Planet in situ after level 10, without a window that covers it', () => {
    expect(PLANET_TEACH.title).toBe('THE PLANET');
    expect(PLANET_TEACH.lines.join(' ')).toMatch(/season/);
    expect(PLANET_TEACH.lines.join(' ')).toMatch(/prizes/);
    expect(goCard).toContain('id="go-world-teach"');
    // The old lesson window is retired with its module: nothing may cover the map it describes.
    expect(html).not.toContain('planet-intro');
    expect(() => read('../src/player/planet-intro.ts')).toThrow();
    expect(mainSource).not.toMatch(/PLANET_INTRO|planetIntro/);
  });

  it('reads the world once per card, never polls, and lets go of the canvas', () => {
    // No interval anywhere in the pane: a result is a moment, not a dashboard.
    const pane = read('../src/online/endgame-planet.ts');
    expect(pane).not.toMatch(/setInterval/);
    expect(pane).toMatch(/deps\.client\.worldMap\(\)/);
    expect(mainSource).toMatch(/endgamePlanet\?\.dispose\(\);/);
    expect(mainSource).toMatch(/endgamePlanet = null;/);
  });
});
