# Demo alerting: knowing whether it is the server or the phone

For the 21 November demo (~50 testers). The backend has one log line per request and no metrics or
alerts, so a paused Supabase project or a broken Edge function looks exactly like "my phone is
broken". This tool is the missing signal.

## The one command

```sh
npm run demo:monitor
```

Leave it running in a visible terminal for the whole demo. It checks three public URLs every 15
seconds and prints one line per check:

```
13:27:26  API   UP           446ms  db 162ms
13:27:27  SITE  UP           197ms  HTTP 200
13:27:27  TEST  UP           115ms  HTTP 200
```

Before testers arrive, confirm all three say `UP`. `--once` does a single round and exits:

```sh
npm run demo:monitor -- --once
```

What it checks (all unauthenticated `GET`s — no tokens, no writes, response bodies are never
printed):

| Line | URL | What it proves |
| --- | --- | --- |
| `API` | `/v1/health?db=1` on the live Edge function | the API answered **and** a real database round trip succeeded |
| `SITE` | `https://www.futasaku.com/` | the live site answered with an HTML page |
| `TEST` | `https://www.futasaku.com/test/` | the staging copy answered (optional for the demo) |

Statuses: **UP**, **UP-SLOW** (answered, but over 3 s — watch it, do not panic), **DEGRADED**
(answered, but not healthily), **DOWN** (no useful answer, or slower than the 10 s timeout).

## What fires, and when

- **One loud alert per outage**, not one per check: a banner, then five terminal bells.
- It fires only after **two failed checks in a row** (~30 s at the default interval). One slow or
  lost request is deliberately silent.
- **One recovery notice** after **two good checks in a row**: a banner and two bells.
- A target that keeps failing stays quiet until it recovers; it does not repeat.

The bell may be muted by the terminal or the system volume. The banner is the real signal, so keep
the window visible.

## What each alert means, and what to do

**`API is DOWN`** — the Edge function did not answer usefully (timeout, DNS, or an HTTP error such
as `503 DB_UNAVAILABLE`).

1. Load the site on **your phone with Wi-Fi off** (mobile data). If it works there, suspect the
   laptop or its network first, not the server.
2. Check [status.supabase.com](https://status.supabase.com) and the Supabase dashboard (Edge logs,
   database health). A free project can pause or run out of connections.
3. Solo play, the campaign and Practice are in the browser: if the **site** still loads, those keep
   working. Online duels, accounts and Territory need the API.
4. If it is still down, tell testers plainly: online play is paused, solo play works. Do not spend
   the demo re-installing the app on phones.

**`API is DEGRADED`** — the function answered, but the health body did not confirm the database
round trip. This is usually the database waking up, a pooler limit, or a broken secret. Wait two
checks; if it persists, treat it as `API is DOWN` (steps 1–4). Practice/solo play is unaffected
while the site loads.

**`SITE is DOWN`** — `futasaku.com` itself did not return an HTML page. Nobody can load the game.
Check [githubstatus.com](https://www.githubstatus.com) and open the URL in a browser. `TEST is
DOWN` on its own is only the staging copy and does not affect the demo.

**The monitor is green but a tester cannot play** — this is the case that matters most:

- Try their exact steps on **your own phone on mobile data**. If it works for you, the remaining
  suspects are their device, their network, or a browser-specific bug — not the server.
- Ask them to use **menu (☰) → Report a problem**, so you get their device details.
- Their phone may be on hotel/venue Wi-Fi with a captive portal, or have no data at all. The
  monitor runs on one machine and one network; it cannot see theirs.
- If everyone on every network is failing while the monitor is green, suspect rate limits (`429`s
  do not fail the health check) or a specific route rather than the whole API. Check the admin
  dashboard (Reports, Overview).

## Honest limits

- It checks **three URLs from one machine on one network**. Green means those answered, not that
  every route, the game's JavaScript, Google sign-in, matchmaking or a particular phone works.
- It does **not** log in, create a duel or test gameplay. It is a smoke alarm, not a test suite.
- The 2-check debounce means a real outage is reported **~30 seconds late** by design.
- Health checks may be answered even while player requests are being rate-limited (`429`), so a
  green API is not proof that play is smooth.
- It runs only while the terminal is open and the laptop is awake. Closing the lid, sleeping or
  losing Wi-Fi stops the checks silently — it cannot text or email you.
- A timeout is a guess: a genuinely slow venue network can look like an outage. The default 10 s is
  generous; raise it with `--timeout=15000` if the room's Wi-Fi is bad.

## Two-minute check that it really fires

Point one target at an address that cannot work, and watch the alert:

```sh
npm run demo:monitor -- --test=https://futasaku.invalid/ --interval=3000
```

Within about 10 seconds `TEST` should print `DOWN` twice, then the banner and five bells. It should
**not** repeat the banner on later checks. Press `Ctrl+C`. Then start the real command above and
confirm three `UP` lines.

The recovery notice is for a target that comes back **during the same run** (for example a real
outage that ends); restarting the script clears its memory, so it starts a fresh episode. The
recovery transition is covered by the unit tests rather than this manual check.

## Options

| Flag | Meaning |
| --- | --- |
| `--interval=<ms>` | wait between rounds (default `15000`, minimum `1000`) |
| `--timeout=<ms>` | slower than this is `DOWN` (default `10000`, minimum `1000`) |
| `--api=<url>` / `--site=<url>` / `--test=<url>` | override a target (must be `http`/`https`) |
| `--once` | one round, then exit |
| `--help` | usage |

The pure parts — health-body interpretation, page interpretation and the debounce/alert transitions
— are covered by `tests/demo-alert.test.ts`. `npm run typecheck` checks the script.
