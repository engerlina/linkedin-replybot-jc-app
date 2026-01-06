#!/bin/bash

echo "=== LinkedIn Automation Backend Startup ==="
echo "PORT: ${PORT:-8000}"
echo "DATABASE_URL set: $(if [ -n "$DATABASE_URL" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "ANTHROPIC_API_KEY set: $(if [ -n "$ANTHROPIC_API_KEY" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "JWT_SECRET set: $(if [ -n "$JWT_SECRET" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "ADMIN_PASSWORD set: $(if [ -n "$ADMIN_PASSWORD" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo ""

# Run migrations (continue even if it fails - might be first deploy or connection issue)
echo "Running database migrations..."
prisma migrate deploy 2>&1 || {
    echo "Warning: Migration command failed (exit code: $?)"
    echo "This may be expected on first deploy. Continuing..."
}
echo ""

# Start the application
echo "Starting uvicorn server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
