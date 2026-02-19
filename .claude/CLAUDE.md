# Axiom - LLM Agent Benchmarking Platform

## Overview
Axiom is a full-stack platform for evaluating, comparing, and grading AI agent performance against benchmark datasets. It supports running multiple LLM agents against standardized test suites, collecting detailed execution traces, manual grading, analytics, and cost tracking.

## Architecture
See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for detailed architecture documentation.

## Tech Stack
- **Backend**: FastAPI (async), SQLAlchemy 2.0 (async), PostgreSQL 16+, Alembic
- **Frontend**: Next.js 14 (App Router), TypeScript, TanStack Query, Tailwind CSS v4
- **Agent SDK**: OpenAI Agents SDK (`openai-agents`)
- **Real-time**: SSE via `sse-starlette`
- **Package Managers**: uv (Python), npm (frontend)

## Development

### Running Locally
```bash
# Backend
uv sync
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Database
docker-compose up db
alembic upgrade head
```

### Key Conventions
- Backend is fully async (async/await from routes to DB)
- All database models are in `models/` as SQLAlchemy ORM classes
- API schemas use Pydantic and live in `schemas/`
- Frontend API client modules are in `frontend/src/lib/api/`
- Frontend types mirror backend schemas in `frontend/src/lib/types.ts`
- Agent executors implement the abstract `AgentExecutor` interface in `executors/base.py`
- Real-time updates use an in-process SSE bus (`workers/sse_bus.py`)

### Database Migrations
```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

### Project Structure
```
api/          - FastAPI routers
executors/    - Pluggable agent execution backends
workers/      - Background job execution + SSE bus
services/     - Business logic
models/       - SQLAlchemy ORM models
schemas/      - Pydantic schemas
frontend/     - Next.js application
alembic/      - Database migrations
data/         - Static data (pricing, etc.)
```
