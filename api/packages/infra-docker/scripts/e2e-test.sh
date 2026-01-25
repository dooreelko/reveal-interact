#!/bin/bash
set -e

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
E2E_DIR="$INFRA_DIR/../e2e-tests"
PROJECT_ROOT="$INFRA_DIR/../../.."

# Load keys (exports PUBLIC_KEY)
source "$PROJECT_ROOT/scripts/setup-keys.sh"

# Function to cleanup on exit
cleanup() {
    echo "Destroying infrastructure..."
    cd "$INFRA_DIR" && npm run destroy
}

# Trap exits to ensure cleanup
trap cleanup EXIT

echo "Deploying infrastructure..."
cd "$INFRA_DIR" && npm run deploy

echo "Waiting for containers to be ready..."
sleep 10

echo "Running E2E tests..."
cd "$E2E_DIR" && BASE_URL=http://localhost:3000 npm test
