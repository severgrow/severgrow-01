// The terms of use. Kept OUT of src/strings.ts because they name the currency, and that word lives
// only with the economy (web/src/online/seed-icon.ts SEEDS_WORD; web/tests/seed-words.test.ts keeps
// src/strings.ts free of it). Rendered in the app at #terms and as the static page /terms.
import { SEEDS_WORD } from './online/seed-icon.js';

/**
 * The terms of use (launch readiness, 2026-11-12), opened at futasaku.com/#terms and published as the
 * static page futasaku.com/terms (web/src/privacy-page.ts). Same shape as PRIVACY. Keep it TRUE to
 * the code: chat pauses and name resets are the /admin moderation actions, rewards are server-verified.
 * Change the rules, change this, change `updated`.
 */
export const TERMS = Object.freeze({
  title: 'Terms of use',
  updated: 'Last updated 12 November 2026',
  intro:
    'FUTASAKU is a free game made by one person. By playing it you agree to these few rules. They are here to keep the game fair and friendly.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'Who runs FUTASAKU',
      lines: Object.freeze([
        'FUTASAKU is run by Patryk Socha. You can reach us at info@futasaku.com.',
        'How we handle your data is in the privacy policy, at futasaku.com/privacy.',
      ]),
    }),
    Object.freeze({
      heading: 'Who can play',
      lines: Object.freeze([
        'FUTASAKU is not made for children under 13. Online play, chat and accounts are for players aged 13 and over.',
        'Playing against the computer works without an account. Online play works as a guest or with an account.',
      ]),
    }),
    Object.freeze({
      heading: 'Your account',
      lines: Object.freeze([
        'A guest lives on one device. If you clear your browser data, a guest and its progress are gone. Sign in to keep them.',
        'Keep your sign-in to yourself. You are responsible for what is done with your account.',
        `One person, one account for online play. Do not use extra accounts to win ${SEEDS_WORD} or tiles from yourself.`,
      ]),
    }),
    Object.freeze({
      heading: 'Chat and names',
      lines: Object.freeze([
        'Be kind. No insults, harassment, hate, threats, sexual content, spam or advertising, in chat or in your name.',
        'Do not share anyone’s personal details, your own included: no phone numbers, addresses or social accounts.',
        'Rude words are hidden automatically. Use Report on a message if something is wrong, and Block to stop seeing a player.',
        'We may remove messages, pause a player’s chat, replace a name, or close an account that breaks these rules. Chat pauses never stop you playing.',
      ]),
    }),
    Object.freeze({
      heading: 'Playing fair',
      lines: Object.freeze([
        'No cheating: no programs or scripts playing for you, no changing the game or its traffic, no using a bug to win. If you find a bug, please report it.',
        'Do not try to break, overload or get around the game’s limits or servers.',
      ]),
    }),
    Object.freeze({
      heading: `${SEEDS_WORD} and territory`,
      lines: Object.freeze([
        `${SEEDS_WORD} and territory tiles are part of the game and have no money value: they cannot be bought, sold, traded for money or paid out.`,
        `${SEEDS_WORD} are only paid for games our server can check. We may correct a balance or a tile that came from a bug, an error or cheating.`,
        'The game is still growing: rewards, prices, levels and the map may change.',
      ]),
    }),
    Object.freeze({
      heading: 'What you write',
      lines: Object.freeze([
        'Your chat messages and your name stay yours. You let us store them and show them to other players, which is how chat and the map work.',
      ]),
    }),
    Object.freeze({
      heading: 'Leaving',
      lines: Object.freeze([
        'You can stop playing at any time. Settings → Delete my account removes your sign-in and your email at once.',
        'We may suspend or close an account that seriously or repeatedly breaks these rules.',
      ]),
    }),
    Object.freeze({
      heading: 'The game as it is',
      lines: Object.freeze([
        'FUTASAKU is free and offered as it is. We work hard to keep it running and your progress safe, but we cannot promise it will always be available or free of bugs.',
        'Nothing in these terms takes away rights you have under the law where you live.',
      ]),
    }),
    Object.freeze({
      heading: 'Changes',
      lines: Object.freeze([
        'If these terms change, the date above changes with it. A big change is announced in the game first.',
      ]),
    }),
  ]),
  close: 'Close',
});
