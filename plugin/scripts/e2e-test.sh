#!/bin/bash
# E2E test script for the RevealInteract plugin
#
# This script:
#   1. Sets up keys
#   2. Deploys the Docker infrastructure
#   3. Runs plugin tests
#   4. Cleans up infrastructure
#
# Usage:
#   ./scripts/e2e-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PLUGIN_DIR")"
INFRA_DIR="$ROOT_DIR/api/packages/infra-docker"

# Source keys setup (exports PUBLIC_KEY)
source "$ROOT_DIR/scripts/setup-keys.sh"

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
EXAMPLE_PORT="${EXAMPLE_PORT:-8080}"
WEB_UI_URL="http://localhost:$EXAMPLE_PORT/join"

SERVER_PID=""

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up..."
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
  echo "Destroying infrastructure..."
  cd "$INFRA_DIR" && npm run destroy 2>/dev/null || true
}
trap cleanup EXIT

echo "=== RevealInteract Plugin E2E Test ==="
echo "API URL: $API_URL"
echo "Example Port: $EXAMPLE_PORT"
echo ""

# Deploy infrastructure
echo "Deploying Docker infrastructure..."
cd "$INFRA_DIR" && npm run deploy

echo "Waiting for containers to be ready..."
sleep 10

# Build the plugin
echo ""
echo "Building plugin..."
cd "$PLUGIN_DIR"
npm run build

# Generate host token
echo "Generating host token..."
HOST_TOKEN=$("$ROOT_DIR/scripts/generate-token.sh" "E2E Test Session" "$(date -I) true")
echo "Token generated: ${HOST_TOKEN:0:50}..."

# Start example server in background
echo "Starting example server..."
node example/serve.js $EXAMPLE_PORT &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Test 1: Verify server is running
echo ""
echo "Test 1: Verify example server is running..."
if curl -s "http://localhost:$EXAMPLE_PORT" > /dev/null; then
  echo "  PASS: Server is running"
else
  echo "  FAIL: Server not responding"
  exit 1
fi

# Test 2: Create session via API directly (verify API is up)
echo ""
echo "Test 2: Verify API is running and accepts token..."
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/session/new/$(echo -n "$HOST_TOKEN" | jq -sRr @uri)" -c /tmp/cookies.txt)
if echo "$RESPONSE" | jq -e '.uid' > /dev/null 2>&1; then
  HOST_UID=$(echo "$RESPONSE" | jq -r '.uid')
  echo "  PASS: Session created, host UID: $HOST_UID"
else
  echo "  FAIL: Could not create session"
  echo "  Response: $RESPONSE"
  exit 1
fi

# Test 3: Set state (simulating slide change)
echo ""
echo "Test 3: Set state via API..."
STATE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/session/$(echo -n "$HOST_TOKEN" | jq -sRr @uri)/state/0.0/slide" -b /tmp/cookies.txt)
if echo "$STATE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  echo "  PASS: State set successfully"
else
  echo "  FAIL: Could not set state"
  echo "  Response: $STATE_RESPONSE"
  exit 1
fi

# Test 4: Get state
echo ""
echo "Test 4: Get state via API..."
GET_STATE_RESPONSE=$(curl -s "$API_URL/api/v1/session/$(echo -n "$HOST_TOKEN" | jq -sRr @uri)/state" -b /tmp/cookies.txt)
if echo "$GET_STATE_RESPONSE" | jq -e '.page' > /dev/null 2>&1; then
  PAGE=$(echo "$GET_STATE_RESPONSE" | jq -r '.page')
  echo "  PASS: State retrieved, page: $PAGE"
else
  echo "  FAIL: Could not get state"
  echo "  Response: $GET_STATE_RESPONSE"
  exit 1
fi

# Test 5: Verify plugin JS loads
echo ""
echo "Test 5: Verify plugin JavaScript loads..."
if curl -s "http://localhost:$EXAMPLE_PORT/dist/reveal-interact.js" | grep -q "RevealInteract"; then
  echo "  PASS: Plugin JavaScript available"
else
  echo "  FAIL: Plugin JavaScript not found or invalid"
  exit 1
fi

# Test 6: Verify example page loads with token
echo ""
echo "Test 6: Verify example page loads..."
EXAMPLE_URL="http://localhost:$EXAMPLE_PORT/?token=$(echo -n "$HOST_TOKEN" | jq -sRr @uri)&apiUrl=$API_URL&webUiUrl=$WEB_UI_URL"
if curl -s "$EXAMPLE_URL" | grep -q "RevealInteract Demo"; then
  echo "  PASS: Example page loads correctly"
else
  echo "  FAIL: Example page not loading correctly"
  exit 1
fi

echo ""
echo "=== All tests passed ==="
