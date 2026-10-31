# Eight additional interaction fixes — 31 October 2026

This second batch builds on the first eight fixes, installed-app viewport recovery and gated email
accounts. It adds no dependencies, subscriptions, migrations or gameplay rules.

1. Video downloads always remove their temporary anchor and revoke their object URL, including
   when the browser rejects the click.
2. Native video sharing treats only an abort as cancellation. Other failures show the existing
   recoverable error and retain the encoded file for another Share or Save attempt.
3. Replay scrubbing accepts one primary pointer; secondary clicks, extra fingers and unrelated
   pointer releases cannot move or finish an active scrub.
4. Match chat disables Send for an empty or whitespace-only draft, updating immediately while
   typing and after IME composition. Existing quick phrases remain independent.
5. Escape used to cancel IME composition no longer dismisses match chat, Territory sheets or
   account dialogs. Both local and outer keyboard handlers respect composition.
6. Email sign-in can be dismissed during a request. Generation checks prevent late responses
   from changing a reopened form, persisting an authenticated local session or reloading the
   dismissed device. A request already accepted by the server is not rolled back.
7. Territory Report and Block share a single-flight guard and disable their controls while pending.
   Rapid taps cannot create duplicate moderation requests; failures restore the controls.
8. Visual replays pause when the app goes into the background. An active scrub releases capture
   and discards its automatic-resume intent; returning keeps the last viewed position paused.

Current match-chat policy deliberately allows messaging during either player's turn (owner change
recorded in the existing controller and integration test). This batch preserves that policy.

## Verification

Completed local checks:

- `npm run check`: TypeScript passed; 348 files passed, 6 skipped. 3,557 tests passed,
  1 expected failure and 66 optional skips.
- Final focused video/chat/email unit tests: 41 passed; additional TypeScript check passed.
- Two-authenticated-client match chat: 80 browser checks, including delivery, reconnection,
  duplicate prevention, moderation, IME and eight viewport sizes from 320px to 1920px.
- Email account browser: 23 checks; Territory menu/chat browser: 62 checks.
- Offline replay: 36 checks. Real video export: 36 checks, including native share failure,
  cancellation, failed Save and retry; ffmpeg decoded every frame of a 1080×1920 H.264 MP4.
- Installed-app viewport/Safari/desktop regression passed. Both production channel builds and
  asset isolation passed (futa04: 100 files; futa05: 101 files) using local online test config.
- Actual final phone and desktop screenshots were inspected. The unchanged 240px reading-area
  and desktop alignment assertions pass at both problematic breakpoints.

Browser fixtures use isolated local services and test identities; no production accounts,
moderation actions or email are exercised.
Physical iPhone/WebKit validation remains unavailable in this environment. Email account activation
still requires the separate Supabase configuration and server release in EMAIL-ACCOUNTS.md.

## Release

Production is the `live` ref, not the old `main` app. Publish through the approved
`futa0.5-online` workflow source, with its exact-commit CI gate intact. See RELEASE-FLOW.md.

A screenshot regression also exposed 1024px and 1280px desktop breakpoints: the old 64px top reserve left
slightly less than the required 240px above the cockpit, so chat incorrectly fell back over the
board. Its desktop header clearance now uses 48px / a 4px measured gap, preserving the same
240px minimum reading area and existing alignment assertions. No mobile spacing was changed.
