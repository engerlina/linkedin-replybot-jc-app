FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy Prisma schema (generate at runtime for correct binaries)
COPY prisma ./prisma

# Copy application code
COPY app ./app

# Copy Python entrypoint
COPY entrypoint.py ./entrypoint.py

# Expose port
EXPOSE 8000

# Use Python entrypoint for better logging
CMD ["python", "entrypoint.py"]
