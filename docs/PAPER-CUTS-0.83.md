# Paper cuts — 0.83 polish pass

Notes from a parallel helper on `misc-polish-futa05` (files outside the branding / startup /
planet dirty set).

## Board active-turn LED contour

**Already improved** in `web/src/polish-075.css` (other agent, 2026-11-07): FUTASAKU amber kept,
narrow bright core + softer outer wash, short dash segments, cheap-hardware strip feel on
`.planet-turn-line` / `.planet-turn-glow` when `data-turn='you'`.

`web/src/style.css` was still being edited in parallel, so this helper did **not** add a second
LED refinement there. No gap to fill unless that polish-075 block is later dropped.

## Fixed here (scoped)

1. **Profile unknown value** — restored the real em dash (`U+2014`) for `PROFILE.unknown`. A
   hyphenation sweep had left a plain `-` while comments, unit titles and `menu-profile` e2e still
   required an em dash bar.
2. **Settings storage note** — `ONLINE.storageNote` no longer says “until accounts exist” (accounts
   shipped). It now matches the guest/account wording: guest matches stay on this device; sign in
   to keep them everywhere. Classic Settings only (`data-only="classic"`); product essentials hide it.
3. **Territory Seeds invitation** — `ONLINE.worldInviteLater` / `worldInviteBody` fill the card that
   previously hardcoded those lines beside `worldInviteOpen`.

## Skipped (conflicts / dirty set)

Branding, boot cover, startup, fonts, planet lockup, sphere, layout, main, style.css,
polish-075.css, CI workflow, icons, and their related tests — left alone.
