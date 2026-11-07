# Primary FUTASAKU logo

The approved master is `web/src/assets/futasaku-primary-logo.svg`, supplied by the owner on
7 November 2026 as `final futa.svg`. It is stored unchanged. Do not redraw it or stretch its paths.
The identical downloadable master is published at `/brand/futasaku-primary-logo.svg`.

`web/src/player/branding.ts` owns the live vector URL and the shared SVG helpers. Menu, HUD,
finish plate, Planet/online headers, profile, replay player, downloaded video and posters all use
that source. Existing layout boxes, lockup width, optical positions, accent tint and opacity stay
in place; contain the new artwork within those boxes, preserving its proportions.

Generate compatibility images, the stamped card back, PWA icons and email header with:

```sh
node scripts/build-primary-logo.mjs
node scripts/build-app-icons.mjs
node scripts/build-email-wordmark.mjs
```

The scripts use the existing Playwright Chromium installation (`PW_CHROMIUM` can select a binary).
The `*-emblem*` and `*-wordmark*` WebP filenames are compatibility derivatives, not alternative
logos. `cards/back-frame.webp` is the existing card's frame/paper with its old central stamp removed;
the primary-logo generator adds the new vector stamp. Keep the frame and dimensions unchanged.
App icons retain the existing ground, square sizes and opaque iOS format. The Android maskable
variant is contained inside its safe circle. Email stays 300x92 pixels for the 150x46 template.

Regenerate the social card from a built product with `node --import tsx web/e2e/og-image.ts --no-build`.
It uses one primary vector in the existing left-hand brand area, without a duplicate emblem.
Increment the `og.jpg?v=` value in both metadata tags when regenerating the committed card.

Run the branding/share-preview/email unit tests and `web/e2e/branding-surfaces.ts`, inspect mobile
and desktop captures, and verify replay exports. Historical screenshots and locked legacy release
branches are records; they are not alternate sources for new branding.
