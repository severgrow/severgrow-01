# Putting FUTASAKU on a custom domain (GitHub Pages + Cloudflare DNS)

> **Decision (owner, 2026-10-14):** the website **stays on GitHub Pages**. Cloudflare is used **only
> as DNS** (plus its usual caching/proxy) so the custom domain points at the existing GitHub Pages
> site. There is **no Cloudflare Pages project**, no `wrangler`, and no Cloudflare build — nothing in
> this repo has to be deployed anywhere new.
>
> **Custom domain: `www.futasaku.com`** (with the bare `futasaku.com` also allowed — see §1).
>
> Related: [`DEPLOY-ONLINE.md`](DEPLOY-ONLINE.md) (the duel API), [`ONLINE.md`](ONLINE.md) (index).

## What changes and what does NOT

| Piece | Where it lives | Does it move? |
| --- | --- | --- |
| The website (`/` = FUTASAKU 0.5, `/firststep/` = Main/"Severor", `/futa0.4/`, `/futa-test/`, `/test/`, `/test2/`) | GitHub Pages | **No.** Still GitHub Pages. Only the address players type changes. |
| The duel API | Supabase Edge Function `duel` | **No.** Untouched. |
| The database | Supabase Postgres | **No.** Untouched. |
| The name in front of the website | Cloudflare DNS | **New.** A DNS record + proxy in front of GitHub Pages. |

So the only thing that genuinely moves is the **front-end origin** — the scheme + host part of the
address the browser shows. That single fact drives everything below: the browser only allows the API
to be called from origins the API itself lists, and until today that list held exactly one value.

## 0. What each address serves (the published map, after the 2026-10-14 root move)

The site ROOT used to be Main — the original build, titled **Severor**. The owner moved it: the root
is now **FUTASAKU 0.5**, and Main moved to `/firststep/` with its build unchanged.

| Address | Serves | Notes |
| --- | --- | --- |
| `/` | **FUTASAKU 0.5** (the `futa05` channel) | The product. Title/manifest say FUTASAKU. |
| `/firststep/` | **Main** — the original "Severor" build | Same build, same code, same saves; only its path moved. `base: './'`, so its assets travel with it. |
| `/futa0.5/` | a forwarding page to `/` | Shared links keep working; the query string and `#/join/CODE` hash are preserved. |
| `/futa0.4/`, `/futa-test/`, `/test/`, `/test2/` | unchanged | Byte-for-byte what they served before. |
| `/release.json` | the published Main/Test/Test2 SHAs | Stays at the root: the preview workflow reads it there. |

**Why this is deterministic when TWO workflows publish the same Pages site.** Both
`pages.yml` (main + `/test/` + `/test2/`) and `futasaku04-preview.yml` (the same three, rebuilt from
their published SHAs, plus the futa routes) deploy with concurrency group `pages`, so whichever lands
last decides the bytes. Only `futasaku04-preview.yml` has actually published since 2026-10-06, and it
is the one that composes the futa routes. The root map therefore lives entirely in
`scripts/compose-futa05-preview.mjs`, which that workflow runs **as `futa05/scripts/…`, i.e. always
from the `futa0.5-online` checkout** — so a push to `futa0.4` and a push to `futa0.5-online` compose
the identical root. Nothing in the map depends on which branch the workflow was triggered by, and no
workflow file had to be edited. (A push to `main` would still run `pages.yml` and reset the root to
Main — that has been true of every futa route since 2026-10-06 and `main` has not moved since
2026-10-05.)

## 1. The one code change that made this possible: the CORS allow-list

**Why it mattered.** The duel API runs on Supabase, but the page runs on GitHub Pages — two different
hosts. The browser therefore checks with the API before every call ("is the page's host allowed?").
That check is **CORS**. The API used to answer with exactly **one** hardcoded origin,
`https://severgrow.github.io`. At a new address the browser would ask from a different origin, the API
would not list it, and the browser would **block every API call**: creating a duel, joining, live
duels — online play would stop entirely, while the site itself still looked fine.

**What it is now.** That single value became a **list** (`server/src/config.ts`), so the API accepts
the old and the new address at the same time.

### The final allow-list (this is what ships by default)

| # | Origin | Why |
| --- | --- | --- |
| 1 | `https://severgrow.github.io` | The existing link keeps working during the switch and afterwards. |
| 2 | `https://www.futasaku.com` | The owner's custom domain. |
| 3 | `https://futasaku.com` | The bare/apex domain. Both `www` and the bare domain usually resolve; allowing both means a visitor who lands on the other one is not blocked. |

Local development is unchanged: the dev server default is still the wildcard `*`, and the deployed
API never allows `*`.

| | |
| --- | --- |
| Setting name | `CORS_ORIGINS` (Supabase Edge secret / environment variable) |
| Built-in default | `https://severgrow.github.io,https://www.futasaku.com,https://futasaku.com` — so a fresh deploy needs **no** secret |
| Format | comma-separated origins, **no spaces needed**, no trailing slash |
| Value shape | `https://www.futasaku.com` — scheme + host only, **no path** |
| Overrides the default? | **Yes, entirely.** Set it to add *or remove* a domain without a rebuild. |

### Adding or removing a domain later (no code change)

Set the secret to the **complete** list you want (it replaces the default, it does not add to it):

```
CORS_ORIGINS=https://severgrow.github.io,https://www.futasaku.com,https://futasaku.com
```

Example — after the switch is complete and you no longer need the GitHub Pages address:

```
CORS_ORIGINS=https://www.futasaku.com,https://futasaku.com
```

### Three safety rules built in (and proven by tests)

- An origin **on the list** is echoed back, so the new domain can play.
- An origin **not on the list** is **never** echoed — any other website receives the configured
  production origin instead, so a foreign site cannot drive the API with a player's stored token.
- `*` can never sneak into the deployed allow-list, even if it is typed into the secret.

## 2. How the custom domain is applied in this repo

This repo publishes Pages **from a GitHub Actions workflow**, not from a branch, and the workflow
**composes one `site/` directory** out of several channels:

- `.github/workflows/pages.yml` — Main + `/test/` + `/test2/`
- `.github/workflows/futasaku04-preview.yml` — the above, plus `/futa0.4/`, `/futa-test/`, the
  **site root map** (FUTASAKU 0.5 at `/`, Main at `/firststep/`, a forwarding `/futa0.5/`);
  **this is the workflow that publishes the online channel**
- `.github/workflows/futa05-preview.yml` — builds the FUTASAKU 0.5 dist only (artifact, no deploy)

**Verified against GitHub's own documentation, and it is good news:** for a site published from a
**custom GitHub Actions workflow**, GitHub keeps the custom domain in the repository settings and
says plainly that no `CNAME` file is created, and that "any existing `CNAME` file is **ignored** and
is **not required**" ([GitHub Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)).

So:

- **No `CNAME` file is needed in the deployed artifact, and no workflow change was made.**
- The compose scripts (`scripts/compose-pages.mjs`, `compose-futa05-preview.mjs`) run from the
  `Main2.0` / `futa0.5-online` checkouts in CI, so editing them on one branch would not even take
  effect across the published site.
- *Trap to remember:* a `CNAME` file **is** required if the repository is ever switched back to
  "Deploy from a branch". The domain would then need re-entering in Settings.

### Owner clicks — GitHub

1. <https://github.com/severgrow/severgrow-01> → **Settings**.
2. Left sidebar → **Pages**.
3. Under **Custom domain**, type `www.futasaku.com` → **Save**.
   Do this **before** creating the DNS record: GitHub's docs warn that configuring DNS first can let
   someone else claim a subdomain.
4. Wait for the DNS check to go green, then tick **Enforce HTTPS** (can take up to ~24 h to appear —
   see §3 if it stays greyed out).
5. Recommended: **Settings → Pages → Verified domains** → add the `_github-pages-challenge-…` TXT
   record it shows to Cloudflare. This proves the domain is yours and blocks domain-takeover attacks.

## 3. Cloudflare DNS + settings

1. In Cloudflare, select `futasaku.com` → **DNS → Records → Add record**.
2. Create the record for the host you typed into GitHub:

   | Host in GitHub | Type | Name | Target |
   | --- | --- | --- | --- |
   | `www.futasaku.com` | `CNAME` | `www` | `severgrow.github.io` |

   Point it at `severgrow.github.io` — **without** the repository name, and **not** at the
   `*.pages.github.io` address shown in GitHub's Pages settings.

3. *(Optional but recommended)* add a second record so the **bare** domain also reaches the site
   (its origin is already allowed in CORS):
   **`CNAME`** name `@` target `severgrow.github.io` — Cloudflare flattens `CNAME` at the apex and
   manages the A records for you. (Or add GitHub's four `A` records:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.)
   Then add **Rules → Redirect Rules** (or a Page Rule) so `futasaku.com` redirects to
   `www.futasaku.com`, and type **both** into GitHub's Custom domain field is not possible — GitHub
   takes one domain; the redirect handles the other.

4. **SSL/TLS → Overview → SSL/TLS encryption mode → `Full`.**
   - **Do NOT use `Flexible`.** Flexible makes Cloudflare talk to the origin over plain HTTP while
     GitHub redirects every HTTP request to HTTPS — the two redirects bounce off each other and the
     site enters an **endless redirect loop**. This is the single most common way this setup breaks.
   - **Full (strict)** is fine once GitHub has issued its certificate for the domain.
   - **Always Use HTTPS** may stay **On** — it is safe with `Full`; it is only a problem with
     `Flexible`.
5. **If GitHub cannot issue the certificate** (Settings → Pages shows a DNS/certificate error, or
   **Enforce HTTPS** stays greyed out): set the record to **DNS only** (grey cloud — click the orange
   cloud to toggle), wait for GitHub to finish issuing the certificate, then switch the proxy back on.
   GitHub proves the domain over HTTP and a proxied record can interfere with that first-time check.
   This is a temporary step, not the end state.
6. Otherwise leave the proxy **On** (orange cloud) for Cloudflare's caching. Nothing in this repo
   depends on whether the proxy is on or off.

## 4. The exact URL to open — and how the project path maps

This is a **project site** (`severgrow-01` in the account `severgrow`), currently served at
`https://severgrow.github.io/severgrow-01/`. GitHub's rule for custom domains is that a
user/organisation site's custom domain is **inherited by every project site**, which keeps the
repository path segment. So:

| Where the custom domain is configured | The game ends up at |
| --- | --- |
| **A `severgrow.github.io` user/organisation site** (or nothing configured for this repo) | `https://www.futasaku.com/severgrow-01/` — **the `severgrow-01` part stays** |
| **This repository** (`severgrow/severgrow-01`), as in §2 | `https://www.futasaku.com/` — the shorter URL |

**If you want the short URL, set the custom domain on this repository** (§2 step 3 does exactly
that). Tradeoff, stated plainly: with a custom domain on this repository, GitHub's own
`severgrow.github.io/severgrow-01/…` address may redirect to the custom domain instead of serving
the site. That is harmless here — both origins are in the CORS allow-list, and a redirect lands the
visitor on an origin that is allowed — but it is the one behaviour to be aware of.

> **The CORS value is the same either way**, because an origin is scheme + host + port only, never a
> path: `https://www.futasaku.com`. The `/severgrow-01/` part must **not** appear in
> `CORS_ORIGINS` — and moving a build from `/` to `/firststep/` needs no CORS change at all.

What the app itself does — all **already correct, nothing to change**:

- **Invite links adapt by themselves.** `publicAppOrigin()` (`web/src/online/config.ts`) builds the
  invite base at runtime from `location.origin` + the page path, so at the root a link reads
  `https://www.futasaku.com/#/join/CODE`. The older `…/futa0.5/#/join/CODE` links keep working: that
  address forwards to the root and carries the hash across — **no invite-link bug**. Its hardcoded
  last-resort fallback `https://severgrow.github.io/futa0.5` is used only when there is no `location`
  at all (unit tests).
- **`base: './'` still holds.** `web/vite.config.ts` builds with relative asset paths, so the bundle
  works at any host and any path with no rebuild.
- **The service worker still works.** It registers `./futa04-sw.js` (relative) and derives its scope
  from `self.registration.scope`, so it follows the build to whatever address it is served from. Its
  cache namespace is picked from that same scope, and at the root it shares the `severor-main2-`
  namespace with `/futa-test/`; cache keys are full URLs, so the two never collide.
- **The root's previous worker is retired.** A visitor who opened the root before the move has Main's
  worker registered at scope `/`. The composed root replaces `/sw.js` with a worker that unregisters
  itself (and handles no request), so it cannot answer an offline root visit with the Main page.
- **No `_headers` / `_redirects` / SPA fallback is needed.** Those files are a *Cloudflare Pages*
  feature and do nothing on GitHub Pages — and the app does not need a rewrite anyway: it routes in
  the URL **hash** (`#/join/CODE`), so every route really is `…/index.html`. That is also why
  it works on GitHub Pages today without any 404 fallback. The one forwarding page the move does
  need (`/futa0.5/`) is a plain `index.html` with a `location.replace` — static, no server rules.

## 5. Verify it worked (from a normal browser)

1. Open **`https://www.futasaku.com/`** (or `…/severgrow-01/` — whichever applies, see §4). The game
   loads, padlock shown, no redirect loop.
2. Open **DevTools → Network**, then tap **Create a duel** (or **Find Opponent**).
3. Find the request to `…supabase.co/functions/v1/duel/…`:
   - **Status `201`/`200`** with response header `access-control-allow-origin: https://www.futasaku.com`
     → **CORS is correct.**
   - A red `CORS` / `blocked` error and the on-screen "could not create a guest" message → the origin
     is not allowed. Re-check §1: exactly `https://www.futasaku.com` with no path or trailing slash,
     and the function redeployed after any secret change.
4. **Invite round-trip:** create a duel → **Share invite** → the link starts with the new domain →
   open it in a second browser → the friend joins.
5. **The old address still works:** `https://severgrow.github.io/severgrow-01/` still plays (it
   redirects to the custom domain). `/futa0.5/` forwards to the root. Fully quit the tab first (the
   app caches), and clear site data if you have played there before.

From the terminal (origins are public, never secrets):

```sh
# What the live API resolved at boot:
npx supabase functions logs duel --project-ref wbfrbeedlvjercrukngn | rg 'CORS allow-list'

# Preflight from each allowed origin — each must echo itself back:
for o in https://www.futasaku.com https://futasaku.com https://severgrow.github.io; do
  echo "--- $o"
  curl -si -X OPTIONS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/guests' \
    -H "Origin: $o" -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type' | rg -i 'access-control-allow-origin'
done

# A foreign origin must NOT be echoed (it gets the production origin instead):
curl -si -X OPTIONS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/guests' \
  -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | rg -i 'access-control-allow-origin'
```

## 6. Rollback — if anything goes wrong

Nothing here is one-way, and **the plain `severgrow.github.io` address is never touched**, so it keeps
working throughout. To undo, in any order:

1. **Cloudflare → DNS → Records** → delete the `www` record (or toggle the proxy **off** to serve
   DNS-only). The domain stops pointing at FUTASAKU; nothing else breaks.
2. **GitHub → Settings → Pages → Custom domain → Remove** — the default `severgrow.github.io`
   address goes straight back to normal.
3. **Supabase → Edge Functions → Secrets** → you do **not** have to do anything: the built-in default
   already includes `https://severgrow.github.io`. If you set `CORS_ORIGINS`, either set it back to
   `https://severgrow.github.io` or **delete** the secret (which falls back to the default), then
   redeploy the function once.
4. Confirm `https://severgrow.github.io/severgrow-01/futa0.5/` still plays a full duel.

## 7. Security reminder

- Only **public** values ever go into build configuration: the Supabase project URL and the
  **publishable / anon** key. Those are public by design.
- `DATABASE_URL`, `LIVE_DATABASE_URL`, the **`service_role`** key and any access token are
  **secrets**. They live only in Supabase **Edge Function Secrets** (or the git-ignored local
  `.env`), never in a workflow, a repository Variable, a doc or a chat message.
- Do the **GitHub** custom-domain step before the **DNS** record (§2), or the domain can be claimed
  by somebody else.
