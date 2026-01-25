#!/bin/bash
# Generates a host token for use with the RevealInteract plugin.
#
# Usage: ./generate-host-token.sh <session-name> [date]
#   session-name: Name of the presentation session
#   date: Optional date string (defaults to current date in ISO format)
#
# Environment:
#   REVINT_PRIVATE_KEY: Path to private key (default: ~/.ssh/revint-private.pem)
#
# Output: The host token string to stdout
#
# Example:
#   ./generate-host-token.sh "My Presentation" "2025-01-25"
#   # Outputs: eyJuYW1lIjoiTXkgUHJlc2VudGF0aW9uIiwiZGF0ZSI6IjIwMjUtMDEtMjUiLCJob3N0Ijp0cnVlfQ.base64signature

set -e

PRIVATE_KEY="${REVINT_PRIVATE_KEY:-$HOME/.ssh/revint-private.pem}"

if [ -z "$1" ]; then
    echo "Usage: $0 <session-name> [date]" >&2
    echo "  session-name: Name of the presentation session" >&2
    echo "  date: Optional date string (defaults to current date)" >&2
    exit 1
fi

SESSION_NAME="$1"
SESSION_DATE="${2:-$(date -I)}"

if [ ! -f "$PRIVATE_KEY" ]; then
    echo "Error: Private key not found at $PRIVATE_KEY" >&2
    echo "Run 'source scripts/setup-keys.sh' to generate keys first." >&2
    exit 1
fi

# Create the payload JSON with host:true
PAYLOAD=$(jq -c -n \
    --arg name "$SESSION_NAME" \
    --arg date "$SESSION_DATE" \
    '{name: $name, date: $date, host: true}')

# Base64url encode the payload (no padding, URL-safe)
PAYLOAD_B64=$(echo -n "$PAYLOAD" | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Sign the payload with the private key and base64url encode
SIGNATURE_B64=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -sign "$PRIVATE_KEY" | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Output the token
echo "${PAYLOAD_B64}.${SIGNATURE_B64}"
