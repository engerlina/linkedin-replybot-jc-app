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

# Copy and make startup script executable
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Expose port
EXPOSE 8000

# Run the application with startup script for better error handling
CMD ["./start.sh"]
