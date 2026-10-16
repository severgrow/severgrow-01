# Beta testing kit

Three small things for the first 5–10 testers. Code: `web/src/feedback/`, `server/src/feedback/`,
migration `server/migrations/0009_feedback.sql`. Tests: `server/tests/feedback.test.ts`,
`web/tests/feedback-core.test.ts`, `web/e2e/beta-feedback.ts` (local API only, never Supabase).

## 1. Report a problem

- Where: the pause menu (☰ in a game) and the bottom of Settings.
- The tester writes what happened. The app adds: the build (`index-<hash>.js · 0.5.0 · rules`),
  channel, page path (never the query or `#…`, which can hold an invite code), screen size, phone
  type (user agent), touch / installed / online, a few settings (Reduce motion, Large text, speed,
  sound), where they are (screen; turn number, step, whose turn, cards left in the Draw pile), the
  online match id and gate state if in a duel, the last 15 animation steps, the last 3 crash
  messages and how long the app has been open.
- **Never sent:** the hand, the deck order, the seed, tokens, invite codes, names. The server also
  drops any such key if a client ever sent one (tested).
- Offline: the report is saved on the phone and sent when the connection returns.
- Limits: 20 reports and 30 crash reports per player (or per IP) per hour.

## 2. Crash reports (silent)

Any uncaught error or rejected promise is sent once (same message = one report), at most 5 per
page load, with a short stack (site address and query strings stripped). Browser noise
("Script error.", ResizeObserver loops, aborted fetches) is ignored. It never shows the player
anything and can never break the game.

## 3. Tester guide

Open **futasaku.com/#beta** — the guide opens inside the game (install it, learn it, play a friend,
how to report). Send testers that link. Words live in `src/strings.ts` (`BETA_GUIDE`). It is a
`#beta` link rather than a separate page on purpose: the app's offline worker would cache a
separate page as the game's offline copy.

## Reading reports

**From the terminal, newest first:**

```sh
npm run feedback:recent                 # the newest 20
npm run feedback:recent -- --limit=50   # more
npm run feedback:recent -- --kind=crash # crashes only
npm run feedback:recent -- --json       # raw records, for scripting
```

It prints how many arrived **since you last looked** (a timestamp in
`~/.futasaku-feedback-last-seen`) and marks those rows `NEW`, so "check the reports" is a one-command
habit rather than a dashboard visit. It only records the "seen" mark on an unfiltered run, so
glancing at `--kind=crash` cannot silently hide fresh bug reports.

**In the dashboard** (for the full context of one report): Supabase dashboard → your project →
**Table Editor** (left menu) → **feedback_reports**. Newest first: click the `created_at` column
header to sort descending. `kind` is `report` or `crash`; `message` is what the tester wrote (or the
error); `context` holds the details above; `build` says which release they had. Filter `kind = crash`
to see only crashes.

**Nothing notifies you.** There is no email, webhook or push when a report arrives — the row is
written and waits. That is deliberate for now (one owner, one database) but it means *nobody knows
until they look*, so the habit above is what makes the feature worth having.

**Planned: `futasaku.com/admin`.** The owner's next project is an admin dashboard for managing
players, maps and feedback. When it is built, reuse `postgresFeedbackStore(pool).recent()` in
`server/src/feedback/feedback.ts` — it is already the one reader, and `feedback-recent.ts` is only a
thin CLI over it. The dashboard is also the right home for a **DB-backed** seen flag, since that
should work from any machine, not just one laptop's home directory.

**Who may read them:** nobody but the owner. `feedback_reports` is under RLS with `anon` and
`authenticated` revoked (migration `0009_feedback.sql`), so reports are reachable only through the
service role — the tooling above — and never from the public API.

## What a person must do to switch it on

1. Apply the migration (adds one table, locked down like the others): `npm run server:migrate`
   with the project's `DATABASE_URL` in `.env`.
2. Deploy the server: `supabase functions deploy duel` (the bundle in
   `supabase/functions/duel/bundle.ts` is rebuilt in this change).
3. The site picks up the app side on its next normal build of `futa0.5-online`.

**Do 1 and 2 before inviting testers.** Until then the live server does not know `/v1/feedback`:
the app treats that as "refused" (so it never retries in a loop) and those reports are lost.
