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
and physical-device limitations are in [REVIEW-2026-10-31.md](REVIEW-2026-10-31.md).

## Activation handoff — 31 October quiet polish

The owner confirmed production SMTP is **not configured yet**. Keep `EMAIL_ACCOUNTS_ENABLED=false`
until delivery is configured and the real-mail checks above pass. The cloud development environment
has no Supabase administration identity or SMTP credentials, so it cannot safely perform that setup.
The rest of the web release works against the current server independently.

## Branded mail — live on the project (2 November 2026)

The Supabase Auth mailer is set from [`server/email-templates/`](../server/email-templates), and that
folder is the source of truth — not the Supabase dashboard. Six templates are live: confirmation,
recovery, magic link, email change, invite and reauthentication. Each is table-based and inline
styled, with no `<style>` block, image, SVG, web font or CSS variable (the things Gmail and other
clients strip). The FUTASAKU wordmark is letter-spaced type, not an image; the palette is the game's
cream-on-ink; one cream button sits above the raw link in small muted text.

| type | subject |
| --- | --- |
| confirmation | confirm your futasaku account |
| recovery | reset your futasaku password |
| magic_link | your futasaku sign-in code |
| email_change | confirm your new email |
| invite | your futasaku invitation |
| reauthentication | your futasaku verification code |

The game signs in with a code, so confirmation, magic link and reauthentication show the 8-digit
`{{ .Token }}` in a plate as the primary action, with the button as the desktop path. The copy says
"valid for one hour" because `mailer_otp_exp` is 3600; the apply script warns if that changes.
Notification templates (password changed, identity linked, phone changed, …) are disabled on this
project (`mailer_notifications_*_enabled = false`), so they are not branded.

```sh
node scripts/apply-email-templates.mjs --dry-run   # validate the HTML, no network
node scripts/apply-email-templates.mjs             # PATCH the six subjects + contents, then read back
node scripts/render-email-templates.mjs            # /tmp/futasaku-email-<type>.png, 600px, dark + light
```

`tests/email-templates.test.ts` pins the variables and the inbox rules on every `npm run check`. The
apply script writes only `mailer_subjects_*` and `mailer_templates_*_content`; SMTP, rate limits and
`mailer_otp_exp` are never touched. The older hand-paste `server/templates/email-signin.html` was
removed so there is not a second, conflicting copy.

Operator checklist:

- Configure a production mail provider in Supabase Auth → SMTP, with a verified sender/domain.
  Set the provider's required DNS records (SPF/DKIM and its recommended DMARC policy).
- Email OTPs are 8 digits (`mailer_otp_length`) and expire in one hour (`mailer_otp_exp` = 3600);
  the templates state that. Keep mail/verification limits enabled. No SMTP or service credentials
  belong in browser config.
- Deploy the existing Edge bundle, then enable `EMAIL_ACCOUNTS_ENABLED=true` after real delivery
  is verified. Follow the full rollout steps above; there is no new migration in this polish batch.
- Verify new-account signup and returning-account recovery on `/test/`, including an actual phone,
  a second device, an expired code, resend, an interrupted exchange and account deletion.

Turning the flag off hides new email sign-ins while preserving Google, guest play and existing
account-management access. The UI automatically reveals email once both server and Auth advertise it.
