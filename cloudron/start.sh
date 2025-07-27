#!/bin/bash

# Exit on any error
set -e

APP_DATA_DIR="/app/data"
INITIALIZED_FLAG_FILE="$APP_DATA_DIR/.initialized"

# Ensure the data directory exists
mkdir -p "$APP_DATA_DIR"

# Perform one-time initialization if the flag file doesn't exist
if [ ! -f "$INITIALIZED_FLAG_FILE" ]; then
    echo "==> First run detected. Initializing data directory..."
    # Create the flag file to prevent re-initialization
    touch "$INITIALIZED_FLAG_FILE"
    echo "==> Initialization complete."
fi

echo "==> Ensuring correct ownership of /app/data..."
chown -R cloudron:cloudron "$APP_DATA_DIR"

echo "==> Starting services with supervisord..."
# exec replaces the current shell process with supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf