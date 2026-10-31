#!/bin/bash
# Deploys Divisha Wellness to fly.io from this folder (divisha/).
#   FLY_API_TOKEN=... bash deploy.sh          (or after `fly auth login`)
# Safe to run again: it creates the app and volume only if they're missing.
set -euo pipefail
cd "$(dirname "$0")"
APP=${APP:-divisha-wellness}
REGION=${REGION:-bom}

if ! command -v flyctl >/dev/null; then
  curl -fsSL https://fly.io/install.sh | sh
  export PATH="$HOME/.fly/bin:$PATH"
fi

flyctl status -a "$APP" >/dev/null 2>&1 || flyctl apps create "$APP"
flyctl volumes list -a "$APP" 2>/dev/null | grep -q divisha_data \
  || flyctl volumes create divisha_data --app "$APP" --region "$REGION" --size 1 --yes

if ! flyctl secrets list -a "$APP" 2>/dev/null | grep -q ANTHROPIC_API_KEY; then
  echo "Note: ANTHROPIC_API_KEY isn't set on Fly yet, so Claude won't answer until it is:"
  echo "  fly secrets set ANTHROPIC_API_KEY=... -a $APP"
fi

flyctl deploy --app "$APP" --ha=false --remote-only --primary-region "$REGION"
echo "Live at: https://$APP.fly.dev"
