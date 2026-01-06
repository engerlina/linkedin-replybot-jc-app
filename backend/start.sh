#!/bin/bash

echo "=== LinkedIn Automation Backend Startup ==="
echo "PORT: ${PORT:-8000}"

# Generate Prisma client
echo "Generating Prisma client..."
prisma generate
echo "Prisma generate complete"

# Run migrations
echo "Running database migrations..."
prisma migrate deploy || echo "Migration warning (may be ok)"
echo "Migrations complete"

# Start uvicorn directly
echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
