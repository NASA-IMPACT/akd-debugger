# Axiom Architecture

Axiom is an LLM Agent Benchmarking Platform for evaluating, comparing, and grading AI agent performance against benchmark datasets.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.115+, async SQLAlchemy 2.0, asyncpg |
| Database | PostgreSQL 16+ |
| Migrations | Alembic (psycopg2 sync driver) |
| Agent SDK | OpenAI Agents SDK (`openai-agents`) |
| Real-time | SSE via `sse-starlette` |
| Frontend | Next.js 14 (App Router), TypeScript, TanStack Query |
| Styling | Tailwind CSS v4 (CSS variables, glass morphism) |
| Package Managers | uv (Python), npm (frontend) |
| Deployment | Docker + docker-compose, Uvicorn |

## Project Structure

```
axiom/
├── api/                    # FastAPI routers (REST endpoints)
│   ├── agents.py           # CRUD + code parsing for agent configs
│   ├── runs.py             # Create/execute/cancel/list runs
│   ├── results.py          # Query results and grading
│   ├── traces.py           # Trace log viewer with cost summaries
│   ├── analytics.py        # Single-run and cross-run analytics
│   ├── export.py           # HTML/CSV/JSON export
│   ├── sse.py              # Server-sent events for live progress
│   ├── auth.py             # Authentication
│   └── organizations.py, projects.py  # Multi-tenancy
│
├── executors/              # Pluggable agent execution backends
│   ├── base.py             # Abstract AgentExecutor interface
│   ├── openai_agents.py    # OpenAI Agents SDK executor
│   └── registry.py         # Executor registry
│
├── workers/                # Background job execution
│   ├── runner.py           # Batch processing, SSE events, JSON output
│   └── sse_bus.py          # In-process pub/sub (asyncio.Queue per subscriber)
│
├── services/               # Business logic
│   ├── analytics.py        # Grade counts, performance stats, tool usage
│   ├── openai_pricing.py   # Model pricing + cost calculation
│   ├── html_export.py      # Self-contained shareable HTML generation
│   └── trace_utils.py      # Trace log conversion with cost breakdown
│
├── models/                 # SQLAlchemy ORM models
│   ├── suite.py, query.py  # Benchmark datasets
│   ├── agent.py            # Agent configurations
│   ├── run.py, result.py   # Execution and results
│   ├── grade.py            # Manual grading
│   ├── trace_log.py        # API call tracing
│   └── user.py, organization.py, project.py  # RBAC
│
├── schemas/                # Pydantic request/response schemas
├── data/                   # Static data (e.g., openai_pricing.json)
├── alembic/                # Database migrations
├── database.py             # Async engine + session factory
├── config.py               # Pydantic Settings (env vars)
├── main.py                 # FastAPI app factory, middleware, router mounting
│
├── frontend/
│   ├── src/app/            # Next.js App Router pages
│   │   ├── page.tsx        # Dashboard (runs list + live SSE progress)
│   │   ├── agents/         # Agent list, detail, chat
│   │   ├── datasets/       # Suite list, detail, CSV import
│   │   ├── runs/           # Run detail, live grading, dashboard tabs
│   │   ├── compare/        # Multi-run comparison
│   │   ├── traces/         # Trace log viewer
│   │   └── notifications/  # Notification center
│   ├── src/components/     # ~111 React components
│   │   ├── dashboard/      # Analytics cards, charts, comparisons
│   │   ├── grading/        # Grading interface, grade buttons
│   │   ├── tool-calls/     # Tool call visualization (pills, modals)
│   │   ├── agents/         # Agent detail tabs, chat, traces
│   │   └── ui/             # Shared UI primitives
│   └── src/lib/
│       ├── api/            # Typed API client modules
│       └── types.ts        # TypeScript interfaces
│
├── docker-compose.yml
└── Dockerfile
```

## Core Concepts

### Benchmark Suites (Datasets)
Named collections of queries, each with query text, expected answer, tag (category), and optional metadata. Support CSV import for bulk creation.

### Agent Configs
Agent definitions storing model selection (gpt-5, gpt-4o, o3, etc.), system prompt, MCP tool server URLs, model settings (reasoning effort, summary mode), and optional source code.

### Runs
A benchmark run pairs a suite with an agent config. Queries are executed concurrently (configurable batch size, max 3 concurrent runs via semaphore). Progress streams in real-time via SSE.

### Results & Grading
Each query execution produces a result with the agent response, tool calls, reasoning chain, token usage, and execution time. Results are manually graded as Correct (1.0), Partial (0.5), or Wrong (0.0). Weighted score = `(correct + 0.5 * partial) / total * 100`.

### Trace Logs
Every agent SDK API call is logged with provider, endpoint, model, request/response payloads, token usage (input/output/cached/reasoning), latency, and calculated cost.

### Comparisons
Saved multi-run comparisons with side-by-side analytics: accuracy comparison, consistency analysis (all_correct/inconsistent/all_wrong), cross-run performance metrics.

## Key Design Patterns

1. **Pluggable Executor System** - Abstract `AgentExecutor` interface allows swapping agent backends. Default is `openai_agents`.
2. **In-Process SSE Bus** - Pub/sub with `asyncio.Queue` per subscriber for real-time progress updates without external message brokers.
3. **Async-First Backend** - Full async/await from API routes through database queries for high concurrency.
4. **Trace-Driven Cost** - Costs calculated from actual API trace data, not estimates. Pre-run cost previews sample queries to estimate total cost.
5. **TanStack Query** - Frontend data fetching with automatic caching, background refresh, and optimistic updates.
6. **Multi-Turn Chat** - Conversation IDs track agent message history for interactive testing.

## Database Schema (Core Tables)

| Table | Purpose |
|-------|---------|
| `benchmark_suites` | Datasets with name, description, tags |
| `queries` | Individual benchmark questions + expected answers |
| `agent_configs` | Agent definitions (model, prompt, tools) |
| `runs` | Benchmark run records (status, progress, timestamps) |
| `results` | Per-query execution results (response, tool calls, usage) |
| `grades` | Manual grades for results |
| `trace_logs` | API call tracing (request, response, cost) |
| `run_cost_previews` | Pre-execution cost estimates |
| `comparisons` / `comparison_runs` | Saved multi-run comparisons |
| `organizations` / `projects` | Multi-tenancy |
| `users` / `user_permission_grant` | Auth & RBAC |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `DATABASE_URL_SYNC` | PostgreSQL sync connection (Alembic) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OUTPUT_BASE_DIR` | Base directory for run JSON outputs |
| `CORS_ORIGINS` | Comma-separated CORS origins |

## API Overview (~50+ endpoints)

- **Agents** - CRUD, code parsing, chat
- **Runs** - Create, list, cancel, delete, cost preview, repeat runs
- **Results** - List/get per run, grade updates
- **Analytics** - Single-run and cross-run metrics
- **Export** - HTML, CSV, JSON
- **SSE** - Live progress streaming
- **Traces** - List, filter, cost summaries
- **Comparisons** - Save/view/delete multi-run comparisons
- **Notifications** - List, mark read, delete
- **RBAC** - Users, orgs, projects, roles, permissions, invitations
