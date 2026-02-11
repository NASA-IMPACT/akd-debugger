# Benchmark App — Application Guide

## Overview

FastAPI web application for running, grading, and comparing LLM agent benchmarks. PostgreSQL-backed. Background execution with SSE live progress. Tags for team separation (no auth). Shareable HTML/CSV/JSON export.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | FastAPI |
| Templates | Jinja2 (server-rendered pages + client-side JS) |
| ORM | SQLAlchemy 2.0 async (asyncpg driver) |
| Migrations | Alembic (psycopg2 sync driver) |
| DB | PostgreSQL 16+ |
| SSE | sse-starlette |
| Agent SDK | openai-agents (`agents` package) |
| Package manager | uv |

---

## Project Structure

```
benchmark_app/
  APP_GUIDE.md           # This file
  main.py                # FastAPI app factory, lifespan, router mounting
  config.py              # Pydantic Settings (DATABASE_URL, OPENAI_API_KEY, OUTPUT_BASE_DIR)
  database.py            # Async engine + session factory + DeclarativeBase

  models/                # SQLAlchemy ORM models
    suite.py             # BenchmarkSuite
    query.py             # Query
    agent.py             # AgentConfig
    run.py               # Run (with run_group, run_number for repeat runs)
    result.py            # Result
    grade.py             # Grade

  schemas/               # Pydantic request/response models
    schemas.py           # All schemas (SuiteCreate, AgentOut, RunCreate, etc.)

  api/                   # REST API routers
    suites.py            # CRUD + CSV import for suites/queries
    agents.py            # CRUD for agent configurations
    runs.py              # Create (with repeat), list, get, cancel, delete, group
    results.py           # List/get results by run
    grades.py            # Upsert grade (correct/partial/wrong)
    analytics.py         # Single-run and cross-run analytics
    export.py            # HTML, CSV, JSON export endpoints
    sse.py               # SSE stream endpoint for live progress

  executors/             # Pluggable agent execution backends
    base.py              # ABC: AgentExecutor + ExecutionResult dataclass
    openai_agents.py     # OpenAI Agents SDK executor (HostedMCPTool, Runner)
    registry.py          # Register/get executor by type string

  workers/               # Background job execution
    runner.py            # execute_run() — batch processing, SSE events, JSON output
    sse_bus.py           # In-process pub/sub with asyncio.Queue per subscriber

  services/              # Business logic
    analytics.py         # compute_run_analytics(), compute_compare_analytics()
    html_export.py       # generate_export_html() — self-contained shareable HTML

  pages/                 # Jinja2 page routes
    views.py             # GET /, /runs/new, /runs/{id}, /suites, /suites/{id}, /agents, /compare

  templates/             # Jinja2 HTML templates
    base.html            # Navbar, global tag filter, CSS/JS includes
    runs/
      list.html          # Runs table with checkboxes for compare
      new.html           # New run form (suite, agent, label, tags, output dir, batch, repeat, query picker)
      detail.html        # Live progress (SSE) or grading/dashboard (tabbed for groups)
    suites/
      list.html          # Suite list with create/edit modal
      detail.html        # Suite detail: CSV import, queries table, add query modal
    agents/
      list.html          # Agent list with paste-code & manual entry modes
    compare.html         # Compare view (ad-hoc cross-run comparison)

  static/
    css/main.css         # All styles
    js/grading.js        # Single-run + compare tabbed grading logic
    js/dashboard.js      # Single-run + compare dashboard rendering

  alembic/
    env.py               # Uses DATABASE_URL_SYNC from Settings
    versions/
      001_initial.py     # All 6 tables
      002_add_output_dir.py
      003_add_run_group.py

  seed.py                # Seeds Astro Gold v1 suite + GPT-5.2 CARE Agent config
```

---

## Database Schema

### benchmark_suites
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| description | TEXT | nullable |
| tags | TEXT[] | PostgreSQL array, overlap filter |
| created_at | TIMESTAMPTZ | auto |
| updated_at | TIMESTAMPTZ | auto |

### queries
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| suite_id | FK -> benchmark_suites | CASCADE delete |
| ordinal | INT | display order |
| tag | VARCHAR(100) | e.g. "archive_driven" |
| query_text | TEXT | the benchmark question |
| expected_answer | TEXT | ground truth |
| comments | TEXT | nullable |
| metadata | JSONB | nullable, extra data |

### agent_configs
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| executor_type | VARCHAR(100) | default "openai_agents" |
| model | VARCHAR(255) | e.g. "gpt-5.2" |
| system_prompt | TEXT | agent instructions |
| tools_config | JSONB | MCP server URL + allowed tools |
| model_settings | JSONB | store, reasoning effort/summary |
| tags | TEXT[] | |
| created_at | TIMESTAMPTZ | auto |

### runs
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| suite_id | FK -> benchmark_suites | |
| agent_config_id | FK -> agent_configs | |
| label | VARCHAR(255) | user-chosen name |
| run_group | VARCHAR(64) | nullable, links repeated runs |
| run_number | INT | 1-based, position in group |
| status | VARCHAR(50) | pending/running/completed/cancelled/failed |
| progress_current | INT | queries completed so far |
| progress_total | INT | total queries |
| batch_size | INT | queries per concurrent batch |
| error_message | TEXT | nullable |
| output_dir | TEXT | filesystem path for JSON output |
| tags | TEXT[] | |
| started_at | TIMESTAMPTZ | nullable |
| completed_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | auto |

### results
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| run_id | FK -> runs | CASCADE delete |
| query_id | FK -> queries | |
| agent_response | TEXT | nullable (null on error) |
| tool_calls | JSONB | [{name, arguments, response}] |
| reasoning | JSONB | [{summary: [...], content: [...]}] |
| usage | JSONB | {requests, input_tokens, output_tokens, ...} |
| execution_time_seconds | FLOAT | |
| error | TEXT | nullable |
| created_at | TIMESTAMPTZ | auto |

### grades
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| result_id | FK -> results UNIQUE | one grade per result |
| grade | VARCHAR(50) | correct / partial / wrong |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | auto |
| updated_at | TIMESTAMPTZ | auto |

---

## API Endpoints

### Suites
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/suites | List suites (optional ?tag= filter) |
| POST | /api/suites | Create suite |
| GET | /api/suites/{id} | Suite detail with queries |
| PUT | /api/suites/{id} | Update suite |
| POST | /api/suites/{id}/import-csv | Import queries from CSV |
| POST | /api/suites/{id}/queries | Add single query |

### Agents
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/agents | List agents (optional ?tag=) |
| POST | /api/agents | Create agent config |
| GET | /api/agents/{id} | Get agent detail |
| PUT | /api/agents/{id} | Update agent config |

### Runs
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/runs | List all runs (optional ?tag=) |
| POST | /api/runs | Create run(s). Returns array. Set `repeat` > 1 for multiple. |
| GET | /api/runs/group/{run_group} | List all runs in a group |
| GET | /api/runs/{id} | Get single run detail |
| POST | /api/runs/{id}/cancel | Cancel a running run |
| DELETE | /api/runs/{id} | Delete a run |

### Results & Grades
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/results?run_id= | List results for a run (with query + grade) |
| GET | /api/results/{id} | Single result detail |
| PUT | /api/grades/results/{result_id}/grade | Upsert grade (body: {grade, notes?}) |

### Analytics
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/analytics/runs/{run_id} | Single-run analytics |
| GET | /api/analytics/compare?run_ids=1,2,3 | Cross-run comparison analytics |

### Export
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/export/html?run_ids= | Self-contained shareable HTML |
| GET | /api/export/csv?run_ids= | CSV export |
| GET | /api/export/json?run_ids= | JSON export |

### SSE
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/runs/{run_id}/stream | EventSource for live progress |

---

## Key Features & Logic

### Tags (replaces auth)
- All entities have `tags TEXT[]`
- Global tag filter dropdown in navbar
- Filter uses PostgreSQL array overlap: `WHERE tags && ARRAY['tag']`
- Tags are free-form, comma-separated on input

### Run Execution Flow
1. `POST /api/runs` creates Run(s) with status=pending
2. `asyncio.create_task()` launches background `execute_run()` for each
3. Global semaphore limits to **max 3 concurrent runs**
4. Runner processes queries in batches (batch_size concurrent per batch)
5. Each result saved to DB + JSON file in output_dir
6. SSE events published via in-process `SSEBus` for live UI updates
7. On completion, status set to "completed"

### Repeat Runs (Run Groups)
- New Run form has "Repeat" field (default 1)
- When repeat > 1:
  - All runs share a `run_group` UUID
  - Labels: "My Run (1/3)", "My Run (2/3)", "My Run (3/3)"
  - Output dirs: `<base>/run_1/`, `<base>/run_2/`, `<base>/run_3/`
  - Runs execute in parallel (up to 3 concurrent via semaphore)
- Viewing any run in a group auto-shows the tabbed compare view
  - Live mode: individual progress bars for each run
  - Grading mode: per-query cards with tab per run (like non-care HTML viewer)
  - Dashboard mode: cross-run accuracy, consistency, performance comparison

### Output Directory
- Default: `~/benchmark_app_data/<label>/`
- For grouped runs: `~/benchmark_app_data/<label>/run_N/`
- Structure: `<output_dir>/json/<ordinal>.json`
- JSON format matches legacy `run_0/json/` format:
  ```json
  {
    "id": "1",
    "query": "...",
    "expected_answer": "...",
    "agent_response": "...",
    "tool_calls": [...],
    "reasoning": [...],
    "usage": {...},
    "execution_time_seconds": 79.82
  }
  ```
- All data also persisted in PostgreSQL (results table)

### Executor Plugin System
- Abstract base: `AgentExecutor` with `execute(query, config) -> ExecutionResult`
- Registry pattern: `register()` / `get_executor(type_str)`
- Ships with `openai_agents` executor:
  - Builds `HostedMCPTool` from tools_config JSON
  - Creates `Agent` with model, instructions, ModelSettings
  - Runs via `Runner.run()` from agents SDK
  - Extracts tool calls (ToolCallItem), reasoning (ReasoningItem), usage stats

### Grading
- Three grades: correct, partial, wrong
- One grade per result (last writer wins)
- Grades stored in DB (not localStorage)
- Weighted score: correct=1, partial=0.5, wrong=0
- Real-time UI updates: response box color, tab dots, summary counters

### Analytics
- Grade counts + accuracy + weighted score
- Breakdown by tag
- Performance stats: mean, median, std, min, max for time/tokens/tools/reasoning
- Tool usage counters
- Cross-run consistency analysis (all_correct, all_wrong, inconsistent)

---

## UI Pages

### Runs List (GET /)
- Table of all runs with label, suite, agent, status, progress, tags
- Checkboxes for selecting runs to compare
- Tag filter pills

### New Run (GET /runs/new)
- Suite dropdown, Agent dropdown
- Label, Tags, Output Directory
- Batch Size, Repeat (default 1)
- Query picker: All / Select Specific
  - Select All / Deselect All
  - Pick N with Top/Bottom/Random toggle (auto-updates on number input)

### Run Detail (GET /runs/{id})
- **Running mode**: Live progress bars + SSE-driven result stream
  - For groups: individual progress bar per run
- **Completed mode**: Grading / Dashboard toggle
  - For groups: auto-uses tabbed compare view
  - Per-query cards with grade buttons
  - Tab bar per query showing each run's response
  - Export buttons (HTML, CSV, JSON)

### Suites (GET /suites)
- List of suites with query counts
- Create/edit modal
- Suite detail: CSV import, queries table (all columns), add query

### Agents (GET /agents)
- List of agent configs with model, executor, tool count
- **Paste Code mode** (default for new): paste OpenAI agent Python code, click "Extract Config"
  - Parses: Agent name, model, instructions/system_prompt, HostedMCPTool config, ModelSettings
- **Manual Entry mode**: direct form fields
- Clone/Edit use manual mode

### Compare (GET /compare?run_ids=1,2,3)
- Ad-hoc comparison of any runs (not necessarily grouped)
- Same tabbed grading + dashboard as grouped runs

---

## CSS Design System

- **Colors**: Primary #0066cc, Success #28a745, Warning #ffc107, Danger #dc3545
- **Navbar**: Dark (#1a1a2e), sticky, with brand + nav links + tag filter
- **Cards**: White, 12px border-radius, subtle box-shadow
- **Forms**: 8px border-radius, 2px border, blue focus ring
- **Buttons**: Primary (blue), Secondary (gray), Danger (red), small variant
- **Tags**: Blue chips (#e7f1ff text on #004085 bg)
- **Grade colors**: Correct=green bg, Partial=yellow bg, Wrong=red bg
- **Tables**: White background, hover rows, uppercase headers
- **Progress bars**: Blue gradient fill, smooth transitions
- **Modals**: Centered overlay, max-width 700px (lg: 900px)

---

## Configuration

### Environment Variables (.env)
```
DATABASE_URL=postgresql+asyncpg://user@localhost:5432/benchmark
DATABASE_URL_SYNC=postgresql://user@localhost:5432/benchmark
OPENAI_API_KEY=sk-...
OUTPUT_BASE_DIR=~/benchmark_app_data
```

### Running Locally
```bash
# Database setup
createdb benchmark
uv run alembic upgrade head

# Seed data (optional)
uv run python3 -m benchmark_app.seed

# Start server
uv run uvicorn benchmark_app.main:app --reload

# Open http://localhost:8000
```

### Docker
```bash
docker compose up -d
```
