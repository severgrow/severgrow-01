# Replay film and typography — 1 November 2026

The downloaded replay did paint film last, but that alone did not preserve it. Decoding an
existing MP4 showed that H.264 had erased most of the one-pixel texture. Raising bitrate alone
did not solve it. The fallback recorder also needed its own measurement.

- Keep the game's exact SVG film tile, pixel size, normal blending and `.085` screen opacity.
  Warm that real tile even if an earlier diagnostic/still paint used the safe procedural fallback.
- Before the first export with an encoder configuration, compare at most three decoded probes
  against the canonical film. Encoders that preserve it keep gain 1. Others receive bounded
  pre-emphasis, with a small material-balance correction. The native recorder is measured through
  its own actual file; it does not borrow the MP4 encoder's setting.
- Cache only the measured scalar, with at most four configurations. The entire probe has a
  five-second ceiling, responds to Cancel, and closes codecs, tracks, timers and object URLs.
  There is no idle work, new dependency, polling or gameplay render loop. Bitrate caps are unchanged.
- Composite film once, after the board, changing tiles, Bomb/Blast effects, names and signature.
  Bare-frame caches never contain it. Stills and in-game viewing keep the canonical strength.
- Use the game's body-scoped UI family and its real regular Fragment Mono face for functional
  labels. Canvas waits for that face before painting; it must not synthesize 600/700 weights from
  a font that only ships 400. Besley remains the display/signature face and the LED remains its
  existing instrument.

Verification includes lifecycle/cancellation/cache unit tests and
`CHANNEL=futa04 PW_CHROMIUM=/usr/bin/chromium npx tsx web/e2e/replay-film-quality.ts` (requires
ffmpeg). That suite independently decodes actual MP4 and WebM downloads, measures fine texture
and dark-material brightness, checks film above an opaque UI surface, checks the loaded label
font, and cancels a cold recorder probe to verify all tracks end. It is not a CSS-only grain check.

Full replay export/sharing and browser/build checks remain required. Physical iPhone playback
has not been tested here; the checks judge the original downloaded files, before any sharing
service recompresses them.
