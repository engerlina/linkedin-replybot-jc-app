#!/usr/bin/env python3
"""Startup entrypoint for Railway deployment"""
import os
import sys
import subprocess

# Immediate output to confirm script is running
print("=" * 50)
print("ENTRYPOINT.PY STARTING")
print("=" * 50)
sys.stdout.flush()

def main():
    port = os.environ.get("PORT", "8000")

    print(f"PORT: {port}")
    print(f"Python: {sys.version}")

    # Check env vars
    for var in ["DATABASE_URL", "ANTHROPIC_API_KEY", "JWT_SECRET", "ADMIN_PASSWORD", "LINKEDAPI_API_KEY"]:
        status = "SET" if os.environ.get(var) else "MISSING"
        print(f"{var}: {status}", flush=True)

    # Generate Prisma client
    print("\nGenerating Prisma client...", flush=True)
    result = subprocess.run(["prisma", "generate"], capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.returncode != 0:
        print(f"Prisma generate error: {result.stderr}", flush=True)

    # Run migrations
    print("\nRunning migrations...", flush=True)
    result = subprocess.run(["prisma", "migrate", "deploy"], capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.returncode != 0:
        print(f"Migration warning: {result.stderr}", flush=True)

    # Test imports
    print("\nTesting imports...", flush=True)
    try:
        from app.main import app
        print("Import successful!", flush=True)
    except Exception as e:
        print(f"Import failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Start uvicorn
    print(f"\nStarting uvicorn on port {port}...", flush=True)
    os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port])

if __name__ == "__main__":
    main()
