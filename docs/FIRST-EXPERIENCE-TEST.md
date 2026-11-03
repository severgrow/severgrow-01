# First experience — /test/ experiment

This is enabled only by `FEATURES.firstExperience` (`futa05` AND the first `/test/` path segment).
The live root, `/2/`, `/3/`, and other channels retain the approved lesson behaviour and copy.
No lesson positions, goals, progression rules, deck order, power restrictions or bot rules changed.

The existing caption and `tapAnswer` remain the single explanation/feedback system:

- Correct highlighted actions execute immediately, including before three seconds.
- Other legal actions execute immediately where the lesson permits them. Facts about a home,
  score or rock do not impose a mandatory acknowledgement before a legal Draw or card selection.
- Invalid actions keep the explanation and use the existing LED answer/tap feedback.
- Random space taps never dismiss an explanation.
- The caption's small close mark is an intentional target, at least 44px during tactile motion.
  It unlocks after three seconds. Its one timer enables the target; it never dismisses prose.
- LED-only notices have no prose to dismiss. Gameplay continues normally underneath them.
- Seen explanations still use the existing save metadata and same-gesture deferred paint, so
  repainting cannot replace a card before its click runs. New game state outranks stale guidance.

The first three messages reuse the existing home/home/Draw sequence, with short test-only copy in
`FIRST_EXPERIENCE` explaining both victory routes, final turns and Draw → Grow → Throw. Production
`LESSON` strings are unchanged. Shared legality receives the Session's actual filtered actions.

## Isolation

`/test/` now uses `futa05-test:` storage. It never copies, migrates or deletes the live
`futa05:` or `/3/`'s `futa05-3:` saves. Both local and session storage follow the existing channel
wrapper. The existing service worker already has a separate `/test/` cache prefix; its actual
code is tested against root, `/2/`, `/3/` and `/test/` scopes.

Experimental campaign results stay local: no campaign reward-proof queue, offline record upload
or account-level import. This prevents a test lesson run from earning real rewards or changing
account progress. Authentication and normal online-game rules are unchanged.

## Verification

- Focused legality, channel and cache-policy tests passed.
- The existing real-input ten-level course was extended with an opt-in `/test/` route. Its default
  `/3/` run and production assertions remain intact.
- The complete no-dismissal course passed Levels 1–10 with **zero wrong taps**. It never presses
  the dismiss target. Bloom/Blast placement follows the real input state, not direct engine calls.
- A separate complete reader course passed Levels 1–10 with zero wrong taps, using intentional
  dismissal after the reading floor. LED-only notices continue through gameplay, without a fake
  dismiss button.
- Targeted browser checks passed at 320×568, 390×844 and 1280×800: early dismissal stays locked,
  stray touch after the floor keeps prose, one-tap Draw works before three seconds, copy fits (including 320px Large Text),
  reload preserves state/seen messages and production sentinel values stay untouched.
- Hints-off play passed without an invisible caption or acknowledgement gate.

Commands, after a `futa05` build with local placeholder online config:

```sh
node --import tsx web/e2e/first-experience.ts
node --import tsx web/e2e/first-experience-course.ts
EXPERIENCE_TEST=1 EXPERIENCE_NO_READ=0 ONLY=run node --import tsx web/e2e/lessons-3.ts
```

Local Chromium is automated verification, not a physical iPhone/Safari claim. Hosted CI also keeps
the existing production lesson and Territory suites. This experiment must be published to `/test/`
for evaluation, never promoted as part of the approved Territory release.

Reviewed captures: [unchanged production reference](screens/first-experience/production-before-390.png),
[narrow phone](screens/first-experience/objective-320.png),
[large text](screens/first-experience/objective-320-large.png),
[phone](screens/first-experience/objective-390.png),
[desktop](screens/first-experience/objective-1280.png).
