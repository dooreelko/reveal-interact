#!/bin/bash
# Generates RSA keys for session signing and exports PUBLIC_KEY.
# Source this script to set the environment variable:
#   source scripts/setup-keys.sh

KEYS_DIR="$HOME/.ssh"
PRIVATE_KEY="$KEYS_DIR/revint-private.pem"
PUBLIC_KEY_FILE="$KEYS_DIR/revint-public.pem"

# Create keys directory if it doesn't exist
mkdir -p "$KEYS_DIR"

# Generate keys if they don't exist
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "Generating new key pair..." >&2
    openssl genrsa -out "$PRIVATE_KEY" 2048 2>/dev/null
    openssl rsa -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY_FILE" 2>/dev/null
    echo "Keys generated in $KEYS_DIR" >&2
fi

# Export PUBLIC_KEY
export PUBLIC_KEY="$(cat "$PUBLIC_KEY_FILE")"
