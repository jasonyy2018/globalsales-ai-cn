#!/bin/sh
set -e

# Ensure data and users directory exist
mkdir -p /app/data/users 2>/dev/null || true

# Fix permissions on mounted volume /app/data so nextjs user can read/write SQLite WAL and DB files
chown -R nextjs:nodejs /app/data 2>/dev/null || chmod -R 777 /app/data 2>/dev/null || true

if [ "$1" = "node" ]; then
  exec su-exec nextjs "$@"
fi

exec "$@"
