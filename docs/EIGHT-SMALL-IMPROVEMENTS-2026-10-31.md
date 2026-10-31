# Eight small improvements — 31 October 2026

Built on `0041b1d8`, including the installed-app viewport and in-game email-account feature.
Worktree `/workspace/futasaku-eight-polish`, branch `polish/eight-small-improvements`.

1. **Invite Share respects Cancel.** A native `AbortError` leaves the clipboard and notice alone.
   Actual sharing failures retain the existing copy-link fallback. Verified with a real local
   duel and a cancelled native-share stub, then the normal join/link/code flows.
2. **Replay keyboard seeking stays put.** Arrow/Home/End seeking pauses the replay clock, matching
   the existing pointer scrub behavior. A paused seek no longer leaves an earlier RAF playing,
   and early input cancels the delayed opening autoplay rather than being overwritten by it.
3. **Replay ready-file actions are keyboard reachable.** The existing dialog focus order includes
   visible, enabled Share and Save controls, and excludes a hidden Cancel or disabled key.
4. **Interrupted scrubs retain their position.** Pointer cancellation/lost capture ends the gesture
   without interpreting missing/default coordinates as a new seek. Previous play/pause intent
   is preserved, and capture is released only when held.
5. **Replay file handoff is single-flight and recoverable.** Repeated Share/Save presses cannot
   start overlapping handoffs or another encode. A failed save leaves the finished video ready
   to retry; completion from a closed/replaced replay cannot paint stale status onto a new one.
6. **Pasted email codes accept normal formatting.** Full-width digits, spaces and hyphens normalize
   to the same 6–10 digit code. Arbitrary text is still rejected; the raw field remains bounded.
7. **Email corrections do not inherit another address's cooldown.** The in-memory resend deadline
   belongs to the normalized address. Returning to an earlier address retains its deadline; old
   expired entries are pruned on a successful send. A fresh code request clears the old code.
   Supabase remains authoritative for verification and sending limits.
8. **Viewport recovery is coalesced and disposable.** A focus/resize/orientation burst schedules
   one two-frame recovery; unmount cancels pending frames and removes listeners. It still leaves
   text inputs alone while the keyboard is in use. No idle frame loop or polling was added.

The profile is intentionally non-modal (documented in its markup and tests). Inspection confirmed
that policy, so its Tab behavior was preserved rather than converted into a modal focus trap.

All changes reuse the existing controls, labels/motion conventions and Supabase infrastructure.
No engine rule, dependency, migration or server code changed in this pass. No save keys changed.
The earlier account backend is included in the branch; its separate server/mail activation steps
remain in [EMAIL-ACCOUNTS.md](EMAIL-ACCOUNTS.md).

## Verification and release

Local verification completed:

- Full `npm run check`: 348 files passed, 6 skipped; 3,556 tests passed, 1 expected failure,
  66 optional skips. Final focused tests after the opening-race fix: 47 passed; TypeScript passed.
- Email browser: 20 checks passed; native invite/join/code browser: 177 passed.
- Final offline replay: 33 checks passed, including early seek surviving the opening delay,
  keyboard focus and cancelled pointer capture. Phone replay screenshots were inspected.
- Final real video: 35 checks passed. Duplicate Share events produced one handoff; cancellation
  and a forced save error preserved the file; retry downloaded a valid H.264 MP4. ffprobe and
  ffmpeg decoded 334 moving frames at 1080×1920 with no audio or decode errors.
- Installed-app viewport/Safari/desktop regression passed. Both production builds and asset
  isolation passed (futa04: 100 files; futa05: 101 files).

The final release commit and hosted CI/deployment outcome are supplied in the task handoff. Browser tests use local
in-process services, never production accounts or mail. Physical iPhone/WebKit remain unverified;
the WebKit download was denied by the environment policy in the preceding pass.

Production uses `live`, not the old `main` app. The owner requested production release in this
turn. After checks, fast-forward the release branch and promote the exact combined commit through
`live`; the existing publisher still requires successful CI on that exact commit before publishing.
The production origin is blocked by this environment, but GitHub's public workflow pages are
readable and can verify CI and the deployment job without bypassing the proxy.


One additional race surfaced in the final replay run: the 180ms opening autoplay could overwrite
an immediate keyboard seek. The existing opening timer now yields to deliberate playback/seek
input, and a late art setup repaints that selected frame. The regression test waits beyond the
opening beat and verifies both the paused state and unchanged elapsed position. No timing token
or gameplay animation was changed. Both offline replay and real video suites were rerun green.


## Hosted release handoff

Both CI runs, the extra regressions and staging publisher succeeded for `baa26bf1`. The `live`
ref was fast-forwarded to that exact commit. The resulting live-triggered publisher passed its
build but GitHub rejected deployment because `live` is not an allowed environment trigger branch.
The approved `futa0.5-online` publisher reads the already-selected live head and can publish it;
this documentation update records that operational requirement and runs through the normal
release-branch publication path. No protection setting, workflow or runtime code was changed.
See [RELEASE-FLOW.md](RELEASE-FLOW.md#production-environment-branch-policy).
