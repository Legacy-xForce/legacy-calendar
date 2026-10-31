#!/bin/sh
set -eu

echo "Applying database migrations..."
bunx --bun prisma migrate deploy

echo "Migrations applied. Starting server..."
exec bun src/main.ts
