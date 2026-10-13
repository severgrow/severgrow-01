# Link-first invites (FUTASAKU 0.5)

Owner-approved change to the duel invite flow, on branch `futa0.5-online`. The **link is the
primary action**; the 8-character code stays as a fallback (in-app browsers keep separate storage,
links get truncated, people read codes aloud). A link arrival **confirms** before joining; a typed
code **joins straight away**.

Code: `web/src/online/lobby-ui.ts`, `web/src/online/lobby.ts`, `web/src/online/online-css.ts`,
`src/strings.ts`, `web/index.html` (two lines). Spec: `web/e2e/online-invite-flow.ts`.

## What each screen does

- **Waiting (`#online-waiting`)** — `Share invite` (already `navigator.share` with a copy-link
  fallback) is the headline primary button. Below the buttons the invite code is a smaller,
  secondary chip; tapping it copies just the code and confirms briefly. `Copy link` and
  `Cancel match` are unchanged, and the 48-hour expiry line stays.
- **Link arrival (`#/join/CODE`)** — a confirm first: the code field is hidden, `#online-join-confirm`
  shows the question, and `Join` / `Cancel` are offered. `Cancel` returns to the hub.
- **Typed code** — the code field is normalised (trim, upper-case, spaces/dashes stripped, a pasted
  link reduced to its code) and joins immediately, with no confirm. A malformed code is refused
  with its own short line instead of being sent.
- **Bad link** — a join link that is malformed or truncated lands on the join screen with a brief
  explanation, never a blank screen. An unknown (well-formed) code fails at Join with the same
  friendly line as an expired code — no enumeration.

## The opponent's name before joining

The confirm cannot name the opponent. The API has **no** pre-join way to resolve a code to a
match: `POST /v1/matches/join` is the join itself, and `GET /v1/matches/:id` requires being a
participant (`requireParticipantFresh`). Guest display names are usually `null` anyway (the UI
falls back to "Friend"). No unauthenticated preview endpoint was added — that would leak
participant identity. So the confirm asks the question without a name ("Join this duel?"), which
still gives the graceful exit the confirm is for.

## Copy table

Player-facing words live in `src/strings.ts` (`ONLINE.*`). Every new/changed line:

| State | Old | New |
| --- | --- | --- |
| Waiting body | `Share this code. The duel opens when they join.` | `Send the link. The duel opens when they join.` |
| Code tap hint (new line, `#online-code-hint`) | — | `Tap to copy` |
| Code copied confirmation | — | `Code copied` |
| Link-arrival confirm (`#online-join-confirm`) | `Join this duel?` | `Join this duel?` (unchanged; name unavailable) |
| Join-cancel button (new) | — | `Cancel` (reuses `ONLINE.cancel`) |
| Malformed typed code (new) | — | `Codes are 8 letters and numbers.` |
| Broken invite link (new) | — | `Link looks broken. Enter the code.` |

Unchanged and kept: `Share invite`, `Copy link`, `Link copied`, `Cancel match`,
`Invite expires in 48 hours.`, and the join errors (`That code is wrong or has expired.`,
`That is your own invite code.`, `That duel is already full.`, `You are already in that duel.`,
`Too many open duels. Finish or cancel one first.`, `Too many tries. Wait a moment and try again.`).

## Evidence

`web/e2e/online-invite-flow.ts` (two-context Playwright, local duel API + Vite preview):

```sh
npx tsx web/e2e/online-invite-flow.ts            # PHASE=after (default)
PHASE=before npx tsx web/e2e/online-invite-flow.ts
```

It asserts Share is the primary/big action and the code is a secondary, focusable chip; the code
copies on tap; a link arrival shows the confirm with Join / Cancel and joins; a typed code joins
straight away; a malformed code is refused; a bad link lands on the join screen with its message;
and no overlap at 360x640 / 390x844 / 1280x800 with >= 44px targets.

Screenshots in `docs/screens/online/` (before / after at 390x844 and 1280x800, waiting also 360x640):

- `invite-waiting-{before,after}-{360x640,390x844,1280x800}.png`
- `invite-confirm-{before,after}-{390x844,1280x800}.png`
- `invite-badlink-{before,after}-{390x844,1280x800}.png`
