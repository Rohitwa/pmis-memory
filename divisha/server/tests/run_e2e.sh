#!/bin/bash
# Runs the hosted app for real (server + a stand-in for Anthropic's API) and
# walks through it in a headless browser.   bash server/tests/run_e2e.sh
set -euo pipefail
cd "$(dirname "$0")/../.."                       # divisha/
WORK=${WORK:-$(mktemp -d)}
mkdir -p "$WORK"
export DATA_DIR="$WORK/data" MOCK_LOG="$WORK/mock.jsonl"
rm -rf "$DATA_DIR" "$MOCK_LOG"

python3 server/tests/mock_anthropic.py 8790 & MOCK=$!
trap 'kill $MOCK ${SERVER:-} 2>/dev/null || true' EXIT

DIVISHA_NEW_PASSWORD="test-password-rohit" python3 -m server.manage add-user rohit "Rohit Singh" >/dev/null
DIVISHA_NEW_PASSWORD="test-password-ananya" python3 -m server.manage add-user ananya "Ananya Singh" >/dev/null
DIVISHA_NEW_PASSWORD="test-password-nani" python3 -m server.manage add-user nani "Nani" --viewer >/dev/null

env -u ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://127.0.0.1:8790 ALLOW_HTTP_PUSH=1 REMINDER_INTERVAL=1 \
  python3 -m uvicorn server.main:app --host 127.0.0.1 --port 8791 --log-level warning & SERVER=$!
for _ in $(seq 50); do curl -sf http://127.0.0.1:8791/healthz >/dev/null && break; sleep 0.2; done

BASE=http://127.0.0.1:8791 SHOTS="${SHOTS:-$WORK/shots}" node server/tests/e2e.mjs
