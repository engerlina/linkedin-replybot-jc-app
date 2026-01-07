FROM python:3.11-slim

# Force Python to run unbuffered for immediate log output
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies including Playwright browser dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    # Playwright Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium browser
RUN playwright install chromium

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
