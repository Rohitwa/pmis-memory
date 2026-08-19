#!/usr/bin/env bash
# Install playwright-core (uses the pre-installed Chromium at /opt/pw-browsers)
# and run the nominal.so crawler. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

# Local, throwaway install so we don't touch the repo's own deps.
if [ ! -d node_modules/playwright-core ]; then
  echo "Installing playwright-core..."
  npm init -y >/dev/null 2>&1 || true
  npm install playwright-core >/dev/null 2>&1
fi

node crawl.mjs
