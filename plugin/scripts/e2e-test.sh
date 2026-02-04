#!/bin/bash
# E2E test script for the RevealInteract plugin
#
# This script:
#   1. Sets up keys
#   2. Deploys the Docker infrastructure
#   3. Builds the plugin
#   4. Starts example server
#   5. Runs Cucumber tests
#   6. Cleans up infrastructure
#
# Usage:
#   ./scripts/e2e-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PLUGIN_DIR")"
INFRA_DIR="$ROOT_DIR/api/packages/infra-docker"
E2E_TESTS_DIR="$PLUGIN_DIR/e2e-tests"

# Source keys setup (exports PUBLIC_KEY)
source "$ROOT_DIR/scripts/setup-keys.sh"

# Configuration
export API_URL="${API_URL:-http://localhost:3000}"
export EXAMPLE_PORT="${EXAMPLE_PORT:-8080}"
export EXAMPLE_URL="http://localhost:$EXAMPLE_PORT"

systemctl --user start podman.socket

SERVER_PID=""

# Cleanup function
cleanup() {
  if [ -n "$E2E_NO_CLEANUP" ]; then
    echo "Skipping cleanup as requested by E2E_NO_CLEANUP"
    exit 0
  fi


  echo ""
  echo "Cleaning up..."
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
  echo "Destroying infrastructure..."
  LOGFILE=$(mktemp)
  cd "$INFRA_DIR" && npm run destroy > "$LOGFILE" 2>&1 || ( echo "Error destroying" && tail "$LOGFILE" && echo "See full log in $LOGFILE")

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

# Generate tokens
echo "Generating host token..."
export HOST_TOKEN=$("$ROOT_DIR/scripts/generate-token.sh" "E2E Test Host" "$(date -I)")
echo "Host token: ${HOST_TOKEN:0:50}..."

echo "Generating user token..."
export USER_TOKEN=$("$ROOT_DIR/scripts/generate-token.sh" "E2E Test User" "$(date -I)")
echo "User token: ${USER_TOKEN:0:50}..."

# Start example server in background
echo "Starting example server..."
node example-presentation/serve.js $EXAMPLE_PORT &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Install e2e test dependencies if needed
echo ""
echo "Setting up e2e tests..."
cd "$E2E_TESTS_DIR"
if [ ! -d "node_modules" ]; then
  npm install
fi

# Run Cucumber tests
echo ""
echo "Running Cucumber tests..."
npm run test:live

echo ""
echo "=== All tests passed ==="
