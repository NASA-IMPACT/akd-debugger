### Stage 1: Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

### Stage 2: Python application
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev

COPY . .

# Copy built frontend static output
COPY --from=frontend-build /frontend/.next/standalone ./frontend-standalone
COPY --from=frontend-build /frontend/.next/static ./frontend-standalone/.next/static
COPY --from=frontend-build /frontend/public ./frontend-standalone/public

EXPOSE 8000 3000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--timeout-keep-alive", "120"]
