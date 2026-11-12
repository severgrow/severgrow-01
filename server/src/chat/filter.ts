// THE CHAT FILTER (launch readiness, 2026-11-12). Duel chat and the Territory chat both pass every
// message through `maskChat` on the SERVER (`contentFrom`, chat/rules.ts), so no client can skip it.
//
// It MASKS rather than refuses: a message is never lost, and a player is not told which word
// tripped it (which only teaches the next spelling). The blocklist is the display-name list
// (display-name.ts), compared in the same leetspeak-proof form.
//
// Word by word, never across the whole line, so innocent words are left alone: a word is masked
// when it IS a blocked word, or a blocked word plus a common ending ("bitches", "shitty"). The two
// words no innocent word contains are also masked inside longer words ("motherfucker").
// Deliberately imperfect: a determined player can still spell around it. The report button and the
// owner's silence (/admin) are the real moderation; this keeps the ordinary case clean.
import { BLOCKED_FORMS, filterForm } from '../display-name.js';

/** Endings that still make the same word. Compared after `filterForm` (runs collapsed). */
const ENDINGS = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'in', 'y', 'ty', 'head', 'heads', 'face', 'hole', 'holes'];
/** Blocked anywhere inside a word: no innocent English word contains these. */
const INSIDE = ['fuck', 'fagot'].map(filterForm);
/** Real words that would otherwise read as a blocked word plus an ending. */
const ALLOWED = new Set(['cocky']);

/** A word: starts and ends with a letter or digit; the leet symbols may sit inside ("f@ggot", "sh!t"). */
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}@$!|+£*]*[\p{L}\p{N}\p{M}])?/gu;

const blocked = (word: string): boolean => {
  const form = filterForm(word);
  if (!form || ALLOWED.has(form)) return false;
  if (INSIDE.some((root) => form.includes(root))) return true;
  return BLOCKED_FORMS.some((root) => form.startsWith(root) && ENDINGS.includes(form.slice(root.length)));
};

/** The line with every blocked word masked as its first letter and dots ("f•••"). */
export const maskChat = (text: string): string =>
  text.replace(WORD, (word) => {
    if (!blocked(word)) return word;
    const chars = [...word];
    return chars[0] + '•'.repeat(chars.length - 1);
  });
