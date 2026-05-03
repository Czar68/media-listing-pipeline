FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app

# Install dependencies first (layer-cached separately from source code)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Default command is overridden per-service in docker-compose.yml
CMD ["python", "-m", "core.ai_broker.identity_worker"]
