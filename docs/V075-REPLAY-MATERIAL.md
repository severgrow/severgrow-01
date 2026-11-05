# Replay visibility and restrained board finish

- Replay regression: the new planet turn-edge path lacked its own `fill="none"`. Live-only CSS
  supplied it under `#board`, but the replay uses another SVG, so its default black fill covered
  the art. Decorative paths now declare that invariant themselves.
- The turn emitter uses one thin amber core and a tiny static halo, leaving tile art/digits crisp.
- Connected ownership edges use a welded perimeter, a dark recessed seam and a faint reflected
  edge instead of cream/red outlines. Ownership, homes and all legal targets retain their meaning.
- In-game stars reuse a single cached composite layer with compositor drift, pausing during moves
  and hidden tabs. Menu parallax stays intact. No per-frame shader or JavaScript render loop.
- Challenge offer: name's ground, one winner-takes-the-opponent-tile sentence and the response
  deadline. No free/price claim or repeated stake paragraph. Underlying challenge rules are unchanged.
- Player-facing em dashes become plain hyphens, including unknown-value placeholders. Player text
  and historical comments are preserved. Tests pin the owner's changed copy.

Validation must include the actual replay on the futa05 build, visible art, stars drifting at idle,
move/hidden/reduced-motion pause, phone/desktop captures, typechecks and the release CI gates.
No database or server deployment is required.

Local verification: all TypeScript projects pass; focused replay/copy/profile/format tests pass.
The complete offline replay browser suite passes, with the repaired picture inspected at phone size.
The phone visual contract proves actual star translation and exactly one visible gameplay sky canvas.
Full four-viewport checks and release CI remain required before publication.

A browser check reproduced a panel stranded in closing state. Exit surfaces now have one bounded
cleanup fallback, cancelled on completion, reopen or navigation. Normal motion tokens are unchanged.
Unit tests verify single completion and timer cleanup; the browser deliberately pauses a close
animation and requires the actual sheet to become hidden. No repeating timer or frame loop is added.
