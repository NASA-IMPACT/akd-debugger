import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from loguru import logger

# Configure loguru — remove default, add stderr with INFO level
logger.remove()
logger.add(sys.stderr, level="INFO")

from api import (
    agents,
    analytics,
    auth,
    browse,
    charts,
    comparisons,
    export,
    grades,
    invitations,
    memberships,
    notifications,
    organizations,
    permissions,
    projects,
    roles,
    results,
    runs,
    sse,
    suites,
    traces,
)
from config import get_settings
from pages import views
from services.context import require_org_context, require_project_context

settings = get_settings()
cors_origins = [
    origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()
]
if "*" in cors_origins:
    cors_origins = ["*"]

# Ensure OPENAI_API_KEY is available to the agents SDK
if settings.OPENAI_API_KEY:
    os.environ.setdefault("OPENAI_API_KEY", settings.OPENAI_API_KEY)

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown — clean up SSE bus
    from workers.sse_bus import sse_bus

    sse_bus.clear()


app = FastAPI(
    title=settings.APP_TITLE,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Templates
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# API routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(organizations.router, prefix="/api/organizations", tags=["organizations"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(memberships.router, prefix="/api/memberships", tags=["memberships"])
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])
app.include_router(roles.router, prefix="/api/roles", tags=["roles"])
app.include_router(permissions.router, prefix="/api/permissions", tags=["permissions"])

project_scope = [Depends(require_project_context)]
org_scope = [Depends(require_org_context)]

app.include_router(suites.router, prefix="/api/suites", tags=["suites"], dependencies=project_scope)
app.include_router(agents.router, prefix="/api/agents", tags=["agents"], dependencies=project_scope)
app.include_router(runs.router, prefix="/api/runs", tags=["runs"], dependencies=project_scope)
app.include_router(results.router, prefix="/api/results", tags=["results"], dependencies=project_scope)
app.include_router(grades.router, prefix="/api/grades", tags=["grades"], dependencies=project_scope)
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"], dependencies=project_scope)
app.include_router(export.router, prefix="/api/export", tags=["export"], dependencies=project_scope)
app.include_router(sse.router, prefix="/api", tags=["sse"], dependencies=project_scope)
app.include_router(browse.router, prefix="/api/browse", tags=["browse"], dependencies=org_scope)
app.include_router(comparisons.router, prefix="/api/comparisons", tags=["comparisons"], dependencies=project_scope)
app.include_router(traces.router, prefix="/api/traces", tags=["traces"], dependencies=project_scope)
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"], dependencies=org_scope)
app.include_router(charts.router, prefix="/api/charts", tags=["charts"], dependencies=project_scope)

# Page routes
app.include_router(views.router)
