#!/bin/bash
set -e

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
E2E_DIR="$INFRA_DIR/../e2e-tests"
PROJECT_ROOT="$INFRA_DIR/../../.."

# Load keys (exports PUBLIC_KEY)
source "$PROJECT_ROOT/scripts/setup-keys.sh"

# Load Cloudflare-specific config from .env
set -a
source "$INFRA_DIR/.env"
set +a

# Get API token for terraform operations
export CLOUDFLARE_API_TOKEN=$(npx --yes wrangler auth token --json 2>/dev/null | jq -r .token)

# Function to cleanup on exit
cleanup() {
    echo "Destroying infrastructure..."
    cd "$INFRA_DIR" && cdktf destroy --auto-approve
}

# Trap exits to ensure cleanup
trap cleanup EXIT

echo "Deploying infrastructure..."
cd "$INFRA_DIR" && npm run build:worker && cdktf deploy --auto-approve

echo "Getting worker URL from terraform output..."
cd "$INFRA_DIR/cdktf.out/stacks/cloudflare"
WORKER_URL=$(terraform output -raw worker-url 2>/dev/null)

if [ -z "$WORKER_URL" ] || [ "$WORKER_URL" = "null" ]; then
    echo "Error: Could not get worker URL from terraform output"
    exit 1
fi

echo "Worker URL: $WORKER_URL"

echo "Waiting for worker to be ready..."
sleep 3

echo "Running E2E tests..."
cd "$E2E_DIR" && BASE_URL="$WORKER_URL" npm test
