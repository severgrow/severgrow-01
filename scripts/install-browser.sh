#!/usr/bin/env bash
# Installs the Playwright browser a CI suite drives. Ubuntu's package mirrors sometimes stop
# answering (2026-11-11: "Temporary failure resolving 'azure.archive.ubuntu.com'" failed every browser
# job after 10 minutes, before a single test ran). The system packages get 3 minutes; then the
# browser alone is installed from Playwright's own servers (the runner image already carries most
# of the libraries a headless browser needs). A real install failure still fails the job.
set -u
engine="${1:?usage: install-browser.sh chromium|webkit}"
if timeout 180 npx playwright-core install --with-deps "$engine"; then exit 0; fi
echo "::warning::System packages for $engine did not install (package mirror unreachable); installing the browser alone."
npx playwright-core install "$engine"
