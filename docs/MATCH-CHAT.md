# FUTASAKU match chat — integration handoff

Feature branch: `feature/futasaku-match-chat`  
Worktree: `/workspace/futasaku-match-chat`  
Feature implementation commit: `dd2381c`. Documentation/screenshots follow in a separate commit.

Base: online commit `1c326f8` (2026-10-25). No merge, production migration or deployment performed.

## Experience

A 44px communication key directly above the cockpit context button opens a nonmodal transcript over the board. It uses the
actual `--dark-glass`, `--dark-glass-blur`, `--font-ui` and `--font` materials. Cream text, fine rules,
small seat labels, no avatars/bubbles. Finite opacity and tiny-transform transitions use the existing interface easing: 150ms open,
100ms close, with effects skipped for reduced motion. Incoming messages never open the panel or steal focus. A temporary preview and
small unread dot remain secondary to play. The panel closes on Escape/outside interaction; outside
taps still reach the board. Touch controls retain 44px targets.

One-line plain text, 280 Unicode characters; Enter sends, and IME composition cannot accidentally
send Japanese text. Quick phrases persist **stable IDs**, rendered through `MATCH_CHAT.phrases`.
All new interface copy is in `src/strings.ts` → `MATCH_CHAT`. `mountMatchChat` accepts a replacement
copy object for the localisation agent. Timestamps use Intl and the browser locale. No translation
framework, dependency or localised text is persisted. Only English copy is supplied in this branch.

Updated design: portrait chat fills the available viewport over the board and cockpit; desktop grows to 480×680px. Transcript text is 14px. Quick phrases live in a compact picker behind the icon beside Send, hidden by default. Controls retain 44px hit areas with slimmer visual surfaces. The visual viewport controls panel height/offset without resizing the game. Font-size 16px avoids
iOS focus zoom; safe areas, contained transcript scrolling and no document scroll locks. Desktop
keyboard navigation and a quiet live region are supported. The panel is nonmodal, so it deliberately
does not trap focus or make gameplay inert. Turn changes preserve drafts. Drafts exist only for the
mounted match; leaving/reloading intentionally clears unsent text. Device-local read cursors (no
text/tokens) persist for the latest 50 match seats; they are not synchronised across devices and
are never exposed to the opponent as read receipts. Server-side mute/block preferences persist.

## Authority and security

The game's existing bearer identity remains the authority, including authenticated guests and
accounts upgraded through Supabase Auth. Never use `auth.uid()` as a substitute for the game player
ID. Browser Supabase JWTs/anon keys cannot directly read or write chat tables.

`GET /v1/matches/:id/chat` and all mutations authenticate the bearer, then derive membership and
opponent from `match_participants`. A missing/foreign chat is the same 404. No client sender, seat,
status or claimed membership is trusted. Text is rendered only with `textContent`.

The Postgres adapter takes **the same `matches FOR UPDATE` lock as move batches, resignation and
live autoplay**. It checks `matches.state.actor`, phase, status and `turn_start_revision` under that
lock before insert. A queued request for an earlier turn cannot become a send in a later turn.
The row is never changed by chat. A due deadline refuses new sends: existing gameplay authority
alone can spend grace, autoplay or finish a match. No timers, engine rules, RNG, saves or deadlines
were changed. Both live and 24-hour turns use this path; offline opponents receive persisted history
when returning. Finished matches retain readable history and cannot accept new sends.

Idempotency is `(match_id,sender_id,request_id)`, with a conflict if the body changes. Previously
committed sends replay even after a turn/match ends; they do not create another message. The UI
keeps a stable UUID for an ambiguous failure and only retries on explicit input. A new click is
locked while pending. Explicit retries can use the current turn epoch without double insertion.

A sorted participant-pair advisory lock serialises **global chat blocking across matches**; the
sender advisory lock serialises rate checks across matches and Edge instances. Lock order is always
match → pair → sender. Blocking is communication-only: either player's block stops both directions
in all their matches. It does not alter existing matchmaking, account identity or gameplay.
Unblocking your side cannot remove the opponent's block. Muting suppresses previews and alerts,
while history remains readable. No automation is claimed for content moderation.

Abuse/spam/other reports must identify an actual opponent message in this match. They are deduplicated
and transactionally copied into the existing `feedback_reports` admin triage queue, including message
evidence. An evidence insert failure rolls the report receipt back. Report evidence follows the
existing private feedback retention/access policy; it survives chat-history cleanup.

Limits: 4KiB request bodies, 120 authenticated chat requests/minute/player, minimum 1s between new
messages, at most 5/10s and 200/rolling 24h across matches, 2,000 messages/match, 10 new reports/hour.
Reports and policies do not consume the send budget. History pages contain at most 40 messages,
ordered by database insertion sequence (not client clocks). The browser keeps at most 160 rows and
can page backward/jump back to latest. Idempotent retries do not consume the send budget.

## Realtime, recovery and cost

Chat reuses the active duel's `MatchChannel` and its existing Supabase WebSocket/match topic. It
adds **no socket or channel subscription**. The pre-existing lobby/player channel is separate and
unchanged. A second consumer no longer sends a duplicate `phx_join` for the same topic.

`chat` broadcasts carry only `{revision:0,status:'changed'}`: no message text, sender, message/request
ID or unread count. This existing public hint channel is not a message-access channel; knowing a
topic still cannot fetch anyone else's chat. Authenticated bounded API reads are always the truth.
The publisher reuses the game's Supabase REST Broadcast transport and awaits a bounded 1.5s attempt,
so an Edge isolate does not suspend a fire-and-forget notification. Notification failures cannot
undo persisted messages. Duplicate hints/delivery are harmless; hints coalesce and are limited to
one fetch/second, with no constant chat polling. An offline/reconnecting client's subsequent join,
focus, online event or reopen fetches the gap. Realtime outages therefore retain messages, but an
individual missed hint is not guaranteed to appear until one of those recovery events occurs.

All in-flight browser requests abort on teardown; subscriptions, preview/coalescing timeouts, focus,
visibility, keyboard and visualViewport listeners are removed. A late response from a previous match
cannot enter the next transcript. There is no typing, presence, read-receipt or background render loop.

Indexes cover `(match_id,sequence)` and sender/time rate checks. Migration 0017 installs an hourly,
5,000-row bounded cleanup job when pg_cron exists: only matches finished over 90 days ago qualify.
Active matches are never aged out. Plain Postgres without pg_cron needs the same SQL scheduled by
the host. At very high message volumes monitor cleanup backlog, message storage, Realtime events
and concurrent connections; these share the game's allowances. Nothing assumes unlimited free use.

## Integration and rollout — for the integrating agent/operator

1. Inspect current online HEAD/worktrees; integrate this feature commit series into a separate
   candidate branch. Do not overwrite another agent's files or copy this worktree over theirs.
2. Reconcile the small `web/src/main.ts` hunks: one import, one shared channel, mount after creating
   OnlineSession, update on driver change, stop through `tearDownOnlineDuel`. Keep the channel import
   first (storage prefix setup). Menu/animation agents may touch these lifecycle locations.
3. Reconcile `src/strings.ts`'s additive `MATCH_CHAT` export with the localisation system. Pass the
   translated copy at mount if it has a runtime copy provider. Stable phrase IDs must not change.
4. Keep new optional `MatchChannel` callbacks (`onChat`, `onReconnect`) and the shared-topic join fix.
   Do not replace a newer channel implementation wholesale. Compose the chat router alongside newer
   Edge/Node routers; do not lose another agent's router or regenerated bundle.
5. Confirm no other unshipped migration uses `0017`. If there is a collision, choose the next unused
   migration name **before applying**; never rename/edit an already applied migration. Earlier
   migrations are untouched. 0017 depends on the existing matches, participants and feedback schema.
6. In the candidate worktree run `npm ci`, `npm run check`, the focused chat/database/browser suite
   below, both channel builds/assets checks, and relevant online/visual regression tests. Regenerate
   the Edge bundle from the final combined sources (`npm run server:build-edge`), rather than merging
   generated text. Review the final diff/branch before rollout.
7. Only when separately authorised for that integration: review `npm run server:migrate -- --status`
   and `--dry-run`; apply the additive migration with the existing DATABASE_URL credential. No table
   is dropped, no save is rewritten. Verify RLS/privileges and the retention cron. Deploy the final
   duel Edge bundle using the existing `--no-verify-jwt` architecture, then publish the frontend.
   Existing clients ignore the new event, so backend-first rollout is compatible.
8. Run a short two-device check on the hosted project, including account/guest and live/async turns.
   If rolling back, revert client/API code and leave the additive tables/history intact; do not drop
   player data. Remove/disable only the named retention cron if a later rollback requires it.

No actual conflicts were resolved with other agents: this worktree was isolated throughout. Likely
integration overlaps: `main.ts`, `strings.ts`, channel/types, Edge/Node router composition, migration
number and generated bundle. No protected branch, other worktree or shared uncommitted file changed.

## Repeatable local verification

Never point automated chat tests at production. `CHAT_TEST_DATABASE_URL` refuses non-local hosts.
Use a disposable Postgres 17 database with credentials chosen for local testing. The database suite
applies the real versioned schema except the pre-existing Supabase-only pg_cron/pg_net keepalive
migrations 0005/0007. It creates `anon`/`authenticated` roles for actual privilege/RLS checks.

```sh
npm ci
npm run check
# Set CHAT_TEST_DATABASE_URL to the disposable localhost database, not DATABASE_URL.
npx vitest run server/tests/match-chat*.test.ts web/tests/match-chat.test.ts web/tests/online-realtime.test.ts
PW_CHROMIUM=/path/to/chromium SHOTS=/tmp/chat-shots npx tsx web/e2e/match-chat.ts
npm run server:build-edge
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
# futa05 assets checks require real-shaped PUBLIC Supabase/duel configuration, not privileged keys.
```

`.github/workflows/match-chat.yml` runs an isolated Postgres service, focused integration/security
checks and the two-browser suite; screenshots upload for review. Browser tests use real authenticated
API clients, real local Postgres persistence/locks, and production channel/view code. Playwright
simulates the Supabase Realtime wire (join acknowledgements, broadcast and reconnect) to avoid live
quota. This verifies integration behavior, not the hosted provider or real mobile operating-system
keyboards. Simulated visualViewport keyboard checks are not a claim of physical iOS/Android testing.

## Verification completed in this worktree

- `npm ci` passed with a writable temporary npm cache; package manifests/lockfile are unchanged.
- Full `npm run check`: **282 files passed, 2,897 tests passed**, 1 existing expected failure and
  64 optional/database-dependent skips. New chat Postgres tests were separately enabled below.
- Final focused suite with disposable Postgres 17: **45 checks passed** across chat API/storage,
  controller/unread/history navigation, Realtime contract and bounded notifier. Includes actual
  client-role RLS read/write denial, cross-match blocking, report-evidence rollback, idempotency,
  stale-turn rejection and a concurrent match-row-lock test.
- Two actual authenticated Chromium clients against local Postgres: **28 browser checks passed**.
  Production Realtime subscriber code consumes the simulated Supabase wire. Verified immediate
  delivery, previews/unread, quick phrases, a committed-but-lost HTTP response followed by safe retry,
  untrusted text, mute/block/report, preserved drafts at turn change, reconnect, and complete teardown.
- Screenshots/geometry inspected at **320×568, 360×640, 390×844, 844×390 and 1280×800**. Assertions
  require a visible panel, expanded reading space and 18px transcript text, no page overflow, 44px targets and no
  menu/logo collision. Visual viewport keyboard resizing and Escape focus restoration passed.
- Existing `web/e2e/futa04-motion.ts` passed: Draw/Throw, Bloom, both cut sizes, Reduce motion and
  Mega Bomb. Existing board motion tokens/engine logic were not changed.
- `CHANNEL=futa04` production build and asset isolation passed (99 files); `CHANNEL=futa05` build
  and asset isolation passed (100 files, public test-shaped configuration). The browser suite also
  builds the actual futa05 production client against its local API.
- Final TypeScript checks, Edge bundle generation and `git diff --check` passed.
- Hosted Supabase, physical mobile keyboards, human usability and GitHub-hosted CI were **not**
  tested here. The new CI workflow is supplied for integration; this branch was not deployed.

Reviewed captures: [small phone](screens/match-chat/phone.png),
[desktop](screens/match-chat/desktop.png), [landscape](screens/match-chat/landscape.png).
These are test conversations, not real players or production chat data.

## Expanded panel design follow-up

Owner direction supersedes the original cockpit-clearance design: mobile chat may cover the board
and cockpit. The panel now uses the available portrait viewport, and grows to 480×680px on desktop.
The transcript uses 18px text with more line spacing. Controls have slimmer visible surfaces while
retaining 44px touch targets. No gameplay layout is resized to accommodate the larger overlay.

Quick phrases are hidden by default behind the icon beside Send. The picker closes after selection,
outside interaction or Escape; Escape first returns focus to its trigger without closing chat.
Its choices retain the same authoritative turn restrictions. It stays usable with the keyboard open,
with bounded scrolling in short viewports. Chat controls and phrases use mutually exclusive drawers.
The new `MATCH_CHAT.quickPhrases` copy key must be included when integrating translations.

The redesign's two-client browser run used the local in-memory authority and simulated Realtime
wire: **32 checks passed**, including expanded panel geometry, 18px text, hidden phrases, selection,
Escape focus, five screen sizes and simulated keyboard resizing (including following the latest message when already at the end). Earlier Postgres/security evidence
above remains applicable; this follow-up changes presentation only. Updated captures replace the
original small-panel screenshots, including [the quick-phrase picker](screens/match-chat/quick-phrases.png).

Follow-up validation: full `npm run check` passed **283 files / 2,902 tests**, with 1 expected failure
and 65 optional/database skips. Focused chat/channel tests passed (16), final TypeScript checks
passed, both production channel builds/assets checks passed, and the existing Futa04 motion suite
passed. No backend, migration, gameplay or deployment changes were needed for this design revision.

Typography refinement: message text is now 15px with 1.5 line height on mobile and desktop, following the owner’s request for smaller messages. The expanded panel and hidden quick phrases are retained.

Icon/material refinement: the quick-phrase trigger uses a rounded three-dot speech glyph instead
of the angular lightning icon. Close uses the game's shared `ICONS.close` SVG. The panel's outer
border and inset highlight are removed; its dark-glass material remains. The redundant ready-state
caption is removed entirely, while own-turn/read-only/error explanations remain when needed.
Validation for this refinement: 33 two-client browser checks, 16 focused controller/channel tests,
TypeScript checks and the browser suite's futa05 production build passed. Updated screenshots were
visually reviewed. No deployment was performed.

Cockpit integration: the chat trigger now mounts in `#smart-panel`, aligned directly above
`#smart-context` with the same `--control-size`, `--control-gap`, ivory colour and supplied hardware
button-frame artwork. Absolute placement adds no cockpit row or gameplay layout changes, including
when the hand side changes. Its preview follows the same anchor, and both elements are removed on
match teardown. Five viewport checks compare actual key alignment, dimensions, spacing and frame
material against the context button. Header placement remains only a legacy-layout fallback.
Validation for cockpit placement: 33 match-chat browser checks passed, 16 focused tests passed,
TypeScript and Futa04 production build/assets checks passed, and the existing cockpit regression
suite passed **882 checks** across phone/desktop sizes and both hand sides. Reviewed closed-state
[phone capture](screens/match-chat/cockpit.png). No merge or deployment performed.
The cockpit chat key no longer draws a bright focus-outline rectangle. Its native hardware frame
remains; keyboard focus uses the quiet existing glow. Verified in screenshots and 34 browser checks,
including a focused-key assertion that the outline is absent while the glow remains.

## Chat feel and motion

Spacing is tightened without shrinking the transcript or touch targets. The panel and phrase
picker open with a 150ms opacity/4px settle and close in 100ms. New delivered transcript rows enter
once in 160ms; historical rows do not replay their entrance. A closed chat receives a single 280ms
unread-dot pulse, and its restrained preview fades in/out. Header keyboard focus uses a soft icon
highlight rather than a bright rectangular contour.

`chat/motion.ts` owns finite Web Animations effects with the existing interface easing. Only opacity
and transform animate. Closing makes the panel inert, aria-hidden and click-through immediately,
then hides it after the visual exit. A rapid reopen starts from the current rendered pose; an old
completion cannot hide a reopened panel. In-game and operating-system reduced motion skip effects.
Effects cancel on teardown; settled effects release their fill and references. No recurring timer,
render loop, gameplay animation token, engine rule or Realtime subscription is added.

Browser verification includes real running/paused/interrupted Web Animations, immediate input
release, rapid reversals, phrase transitions, both reduced-motion sources, incoming message/dot/
preview effects and exiting a match during an active closing effect. The final run passes 42 chat
browser checks. These test local clients with the simulated Realtime wire, not the hosted provider.
Motion pass validation: full `npm run check` passed (283 files, 2,902 tests; 1 expected failure and
65 optional/database skips). Both production channel builds/assets checks and the existing gameplay
motion regression passed. Final reviewed browser run: 42 checks. No merge or deployment performed.


## Blank composer and live/asynchronous verification

The composer has no visible placeholder. It retains the translated `MATCH_CHAT.message` accessible
name (`Message`), replacing the old `placeholder` copy key. Message text is now 14px on both mobile
and desktop; the input stays at 16px to avoid iOS focus zoom.

Both match modes share the existing chat authority and online-session mount path. Additional tests
exercise a real accepted live challenge using the actual live runtime and both memory/Postgres
adapters: opponent-turn sending, rejection after the turn changes, rejection at an overdue live
clock without chat changing it, and readable history after the live authority finishes by timeout.
Async tests use the normal 24-hour clock, simulate 12 hours offline, then read persisted messages
through a returning authenticated client and verify that the same turn restriction still applies.
No gameplay timers or backend rules were changed.

Validation: 49 focused checks passed with disposable local Postgres; 43 two-client browser checks
passed with local Postgres, including a blank composer with its screen-reader label and 14px text
at five viewport sizes. Hosted Supabase remains untested and no deployment was performed.
The existing live-duel, reconnect and autoplay regression suites also passed: 49 checks. TypeScript
checks and `git diff --check` passed; the browser suite built the production futa05 client.
