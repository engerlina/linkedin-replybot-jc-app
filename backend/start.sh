#!/bin/bash

echo "=== LinkedIn Automation Backend Startup ==="
echo "PORT: ${PORT:-8000}"
echo "DATABASE_URL set: $(if [ -n "$DATABASE_URL" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "ANTHROPIC_API_KEY set: $(if [ -n "$ANTHROPIC_API_KEY" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "JWT_SECRET set: $(if [ -n "$JWT_SECRET" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo "ADMIN_PASSWORD set: $(if [ -n "$ADMIN_PASSWORD" ]; then echo 'yes'; else echo 'NO - MISSING!'; fi)"
echo ""

# Generate Prisma client at runtime (ensures correct binaries for this platform)
echo "Generating Prisma client..."
prisma generate 2>&1 || {
    echo "ERROR: Prisma generate failed!"
    exit 1
}
echo ""

# Test Python imports before starting
echo "Testing Python imports..."
python -c "
import sys
print(f'Python version: {sys.version}')
print('Testing imports...')
try:
    print('  - fastapi...', end=' ')
    from fastapi import FastAPI
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    sys.exit(1)

try:
    print('  - app.config...', end=' ')
    from app.config import settings
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    sys.exit(1)

try:
    print('  - app.db.client...', end=' ')
    from app.db.client import prisma
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    sys.exit(1)

try:
    print('  - app.main...', end=' ')
    from app.main import app
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

print('All imports successful!')
" || {
    echo "Python import test failed!"
    exit 1
}
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
