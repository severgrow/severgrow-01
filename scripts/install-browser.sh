#!/usr/bin/env bash
# Installs the Playwright browser a CI suite drives. Ubuntu's package mirrors sometimes stop
# answering (2026-11-11: "Temporary failure resolving 'azure.archive.ubuntu.com'" failed every browser
# job after 10 minutes, before a single test ran). Chromium's packages get 3 minutes before its
# browser-only fallback (the runner already carries those libraries). WebKit needs its native
# dependencies and therefore uses a longer bounded install without that fallback.
set -u
engine="${1:?usage: install-browser.sh chromium|webkit}"
# WebKit cannot start without its native libraries. The November runner image is missing them,
# and downloading its larger dependency set exceeded the old three-minute ceiling. A browser-only
# fallback gave every *-ios job a false install success followed by a launch failure. Keep the
# short fallback for Chromium, whose libraries are already present on the runner, but give WebKit
# enough time to install real dependencies and fail honestly if the package mirror stays down.
if [[ "$engine" == webkit ]]; then
  timeout 1800 npx playwright-core install --with-deps webkit && exit 0
  echo "::error::WebKit system dependencies could not be installed; browser-only WebKit cannot run on this runner."
  exit 1
fi
if timeout 180 npx playwright-core install --with-deps "$engine"; then exit 0; fi
echo "::warning::System packages for $engine did not install (package mirror unreachable); installing the browser alone."
npx playwright-core install "$engine"
