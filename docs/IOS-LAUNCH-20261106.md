# Installed-app launch follow-up

Based on 15f80b7c, preserving Claude's Beta 0.8 and startup-image changes.

The supplied 60fps recording shows a bright saved menu in iOS's opening zoom, followed by a dark
cover and another menu reveal. Analysis of all 275 downscaled frames found no full white frame in
this particular clip. Other native launch flashes cannot be ruled out by this recording.

The page cover now waits for the actual Planet canvas paint and loaded fonts, not just the
planet-on mount class. Cold launch uses the same one-second reveal as /test; /test no longer stacks
that body entrance with a second cover. The existing 1.2-second readiness deadline remains.

Installed apps retain the same cover as a hidden reusable snapshot shield. visibilitychange/pagehide
show it synchronously when backgrounding; foreground/BFCache restoration reveal the unchanged app
with one 220ms fade. Duplicate lifecycle events share one reveal. Ordinary browser tabs do not get
this resume curtain. Reduced motion skips fades. Frame requests and timers are cancelled when the
app suspends or the reveal completes. No saved data, gameplay or navigation is changed.

Native iOS launch screens and cached snapshots precede page JavaScript. The existing dark startup
PNGs and color-scheme metadata remain necessary. The snapshot shield is best effort, not a claim
that web code controls every native animation frame. Existing installs may need one updated
open/background cycle before their saved preview becomes dark. Do not delete app or save data.

Verification: lifecycle unit tests; real Chromium page tests for installed/browser startup,
background snapshots, resume, BFCache, unchanged storage and JavaScript-disabled first paint.
Physical iPhone home-screen verification is still required. Browser emulation is not native iOS.
