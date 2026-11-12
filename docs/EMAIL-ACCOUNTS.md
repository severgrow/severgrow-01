# In-game accounts — email code, Google optional

Built on `29aeb238` (31 October 2026). No password database, new dependency, migration, or new
player model. The same Supabase Auth project verifies email codes. Enter email → enter code →
choose nickname on first upgrade. Returning players use the same steps. Guest play stays available.

## Safe rollout — server operator

The web feature checks BOTH `/v1/auth/methods` and Supabase's email provider setting. Before the
server supports it or while the enable flag is false, email is hidden and Google keeps working.

1. In the existing Supabase project enable the **Email** provider. Keep email confirmation enabled.
2. Configure production SMTP and a verified sending domain. The Supabase development mail service
   is restricted and unsuitable for arbitrary player addresses. Review provider delivery limits.
3. Set the sign-in/signup email template to show `{{ .Token }}` prominently. Default magic-link-only
   templates do not let a player complete this in-game code form. Use a 6–10 digit OTP and a short
   expiry (10 minutes recommended). Supabase enforces expiry, attempts and resend limits. Do not
   disable its rate limits. CAPTCHA requires a future UI integration; don't enable a challenge the
   current form cannot present.
4. Deploy the rebuilt `supabase/functions/duel/bundle.ts` using the usual server deployment.
5. Set server secret/config `EMAIL_ACCOUNTS_ENABLED=true` only after the above are ready (and ensure
   the usual Supabase service-role binding exists for account deletion). No email or SMTP secrets
   belong in Vite variables. `false` hides email without disabling Google or invalidating accounts.
6. On `/test/`, verify a REAL code to a new address, a returning address, a second device, expired
   code, resend and account deletion. Local browser tests use fake delivery; they cannot prove
   production SMTP. Promote only after those checks and the owner's promote instruction.

Existing signed-in accounts keep their profile/management access when new email sign-ins are disabled.
No SQL is needed. `/test/` uses the live server, so enable only when mail setup is complete.

## Identity and security contract

- `/v1/auth/email` accepts ONLY a Supabase access token, resolves it via `/auth/v1/user`, and requires
  a confirmed email from that server response. Browser-supplied email, subject and confirmation
  cannot identify a player. `/v1/auth/google` keeps its Google-provider check for compatibility.
- Identity is the **Supabase user UUID**, never an email string or display name. Both routes share
  the same link lookup and uniqueness constraints. If Supabase gives Google and email the same UUID,
  they reach the same player. We never merge distinct UUIDs based on matching emails ourselves.
- Existing `player_identities.provider='google'` is a historical storage namespace whose subject
  already contains the Supabase UUID. Both sign-in methods use it deliberately: no data rewrite,
  duplicate identity namespace, migration window or old/new server disagreement. It does not claim
  a Google credential was used. Device records carry the actual method for Settings. Future methods
  should reuse this canonical subject path, with their own authoritative verification requirements.
- A guest upgrade preserves player ID, matches, Seeds and Territory ownership. A different existing
  account switches identity; it cannot overwrite the guest or steal an account's link.
- Both exchange routes share the existing per-IP rate bucket. Supabase handles mail/verification
  limits, with an additional 60-second in-form resend cooldown. Requests have 15-second deadlines
  through the response body. No polling, background render loop or auth SDK is added.
- Codes and temporary Supabase tokens stay in memory, never URL/storage/logs. An interrupted game
  exchange retries the already verified session instead of reusing a consumed code. The usual
  game bearer token is persisted after success. A reload during a failed exchange requires a new
  code; this deliberately avoids persisting a second authentication session.
- Account deletion confirms Supabase deletion BEFORE destroying the recovery link; failure remains
  retryable and is never shown as success. All other game-device tokens are revoked as before.
- Labels live in `src/strings.ts`; the existing privacy page is generated from that same source.

## Code and checks

`web/src/accounts/email-auth.ts` owns bounded Auth HTTP; `email-panel.ts` owns the two-step form;
`mount.ts` reuses the existing sheet, focus, keyboard viewport, identity persistence and nickname flow.
`server/src/accounts/accounts.ts` owns authoritative verification and canonical account linking.

Unit/security checks: `server/tests/accounts.test.ts`, `web/tests/email-auth.test.ts`, account-key and
account-core tests. Browser: `PW_CHROMIUM=/usr/bin/chromium node --import tsx web/e2e/accounts-email.ts`.
That browser suite has a real account router and two browser clients, but fake Supabase mail and
verification; it checks an in-place guest upgrade, bad codes, resend, lost-response retry without
re-verifying the consumed OTP, recovery, nickname, small layout, and old-server compatibility.

Verification: full check passed 3,553 tests (1 expected failure, 66 optional skips); final focused checks 62,
email browser checks 18, Google/nickname checks 33, and both production builds passed. The full audit
and physical-device limitations are in [REVIEW-2026-10-31.md](history/REVIEW-2026-10-31.md).

## Activation handoff — 31 October quiet polish

Superseded on 2 November 2026: production SMTP **is** configured now (see *Live mail transport*
below), so this handoff note is history rather than current state. It is kept because it explains why
the flag defaults to off.

## Live mail transport (2 November 2026)

Resend sends for `futasaku.com`: SPF, DKIM (`resend._domainkey`) and the `send.` bounce MX are
published, and Supabase Auth's SMTP points at `smtp.resend.com:465` as `resend`, sender
`FUTASAKU <noreply@futasaku.com>`. A real send returned 200, so the domain is verified.

`EMAIL_ACCOUNTS_ENABLED=true` is set as an Edge Function secret, so `/v1/auth/methods` answers
`{"email":true}`. The client only reveals email once **both** that and Auth's `external.email` are
true — with either missing, the menu's LOG IN key falls straight through to Google, which is exactly
how it looked before the secret was set. If email ever disappears from the sign-in sheet again, check
those two answers before reading any UI code.

Raised at the same time: `rate_limit_email_sent` 2 → 30 per hour (two per hour locked real users out
after two sign-ups). `mailer_otp_exp` stays 3600, and the templates say "one hour" to match.

Still open: `_dmarc` is not published, which pushes deliverability in the wrong direction; a
`v=DMARC1; p=none; rua=mailto:…` record is the smallest fix. `info@futasaku.com` is referenced by the
privacy page but the domain has no mailbox, so those replies are lost.

## Branded mail — live on the project (2 November 2026)

The Supabase Auth mailer is set from [`server/email-templates/`](../server/email-templates), and that
folder is the source of truth — not the Supabase dashboard. Six templates are live: confirmation,
recovery, magic link, email change, invite and reauthentication. Each is table-based and inline
styled, with no `<style>` block, SVG, web font or CSS variable (the things Gmail and other clients
strip), and the page is dark by declaration rather than by preference: `color-scheme: dark`, an
explicit ground on the body and the outer table, so a client that forces light mode still shows the
intended near-black card.

**The wordmark is the real one.** The header carries the game's own treeless wordmark (the HUD badge
and Profile nameplate asset, not the tree emblem), served from this site at
`https://www.futasaku.com/email/futasaku-wordmark.png`. The committed file is
`web/public/email/futasaku-wordmark.png`: 300×92 PNG, i.e. exactly 2× the 150×46 CSS box the mail
declares, tinted `#efe5cb` on the card's ink `#18191a`. It is generated from
`web/src/assets/futasaku-wordmark-silhouette.webp` by `scripts/build-email-wordmark.mjs`, so the mail
and the game cannot drift to two different marks.

**Images-off is a designed state, not a break.** Mail clients block images for unknown senders, so
the image is an upgrade rather than a dependency: the `<img>` carries fixed `width`/`height`
attributes *and* inline sizes (the layout does not move when it fails), and `alt="FUTASAKU"` styled in
the same cream and letter-spacing as the old type wordmark (so a blocked header still reads as the
brand, on purpose). `scripts/render-email-templates.mjs --blocked` renders that state for review.

The palette is the game's cream-on-ink; the heading uses Georgia (the email-safe relative of the
game's Besley display face), the code digits are monospaced like the cockpit readout, one cream
button sits above the raw link in small muted text, and "VALID FOR ONE HOUR" is the quiet brass
instrument label (`#b7a98a`).

| type | subject |
| --- | --- |
| confirmation | confirm your futasaku account |
| recovery | reset your futasaku password |
| magic_link | your futasaku sign-in code |
| email_change | confirm your new email |
| invite | your futasaku invitation |
| reauthentication | your futasaku verification code |

The game signs in with a code, so confirmation, magic link and reauthentication show the 8-digit
`{{ .Token }}` in a plate as the primary action, with the button as the desktop path. Every template
states "VALID FOR ONE HOUR" because `mailer_otp_exp` is 3600; the apply script warns if that changes.
Notification templates (password changed, identity linked, phone changed, …) are disabled on this
project (`mailer_notifications_*_enabled = false`), so they are not branded.

```sh
node scripts/build-email-wordmark.mjs              # regenerate the committed header PNG from the game asset
node scripts/apply-email-templates.mjs --dry-run   # validate the HTML, no network
node scripts/apply-email-templates.mjs             # PATCH the six subjects + contents, then read back
node scripts/render-email-templates.mjs            # /tmp/futasaku-email-<type>.png at 600/390/320, dark + light
node scripts/render-email-templates.mjs --blocked  # the images-off state, on purpose unresolvable
```

The render script prints the logo's box and flags a wrapped button, an overflowing code plate, any
element escaping the card, or sideways scroll. The apply script reports the live HTTP status of the
logo URL — a 404 is not fatal (the alt wordmark still reads), but it must be 200 before recipients
see the mark.

`tests/email-templates.test.ts` pins the variables, the inbox rules, the one-image contract (absolute
URL, alt text, 150×46 box, a 300×92 committed file), the dark-mode declarations and the one-hour
promise on every `npm run check`. The apply script writes only `mailer_subjects_*` and
`mailer_templates_*_content`; SMTP, rate limits and `mailer_otp_exp` are never touched. The older
hand-paste `server/templates/email-signin.html` was removed so there is not a second, conflicting copy.

Operator checklist:

- The production mail provider (Resend) is configured, with a verified sender/domain and its SPF,
  DKIM and bounce records published. DMARC is still the outstanding DNS item.
- **The logo URL follows the site's release flow.** `web/public/**` is copied into the built site, so
  the PNG appears at `/test/email/futasaku-wordmark.png` on the first push to `futa0.5-online` and at
  `www.futasaku.com/email/futasaku-wordmark.png` when that commit is promoted. Until the promote,
  real mail shows the styled alt-text wordmark instead of the image. Check with
  `curl -sI https://www.futasaku.com/email/futasaku-wordmark.png` (expect `200 image/png`).
- Email OTPs are 8 digits (`mailer_otp_length`) and expire in one hour (`mailer_otp_exp` = 3600);
  the templates state that. Keep mail/verification limits enabled. No SMTP or service credentials
  belong in browser config.
- Deploy the existing Edge bundle, then enable `EMAIL_ACCOUNTS_ENABLED=true` after real delivery
  is verified. Follow the full rollout steps above; there is no new migration in this polish batch.
- Verify new-account signup and returning-account recovery on `/test/`, including an actual phone,
  a second device, an expired code, resend, an interrupted exchange and account deletion.

Turning the flag off hides new email sign-ins while preserving Google, guest play and existing
account-management access. The UI automatically reveals email once both server and Auth advertise it.
