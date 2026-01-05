FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN prisma generate

# Copy application code
COPY app ./app

# Expose port
EXPOSE 8000

# Run the application
CMD ["sh", "-c", "prisma migrate deploy && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
