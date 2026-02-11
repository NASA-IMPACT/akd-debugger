import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
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
    browse,
    comparisons,
    export,
    grades,
    notifications,
    results,
    runs,
    sse,
    suites,
    traces,
)
from config import get_settings
from pages import views

settings = get_settings()

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


app = FastAPI(title=settings.APP_TITLE, lifespan=lifespan)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Templates
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# API routes
app.include_router(suites.router, prefix="/api/suites", tags=["suites"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(results.router, prefix="/api/results", tags=["results"])
app.include_router(grades.router, prefix="/api/grades", tags=["grades"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(sse.router, prefix="/api", tags=["sse"])
app.include_router(browse.router, prefix="/api/browse", tags=["browse"])
app.include_router(comparisons.router, prefix="/api/comparisons", tags=["comparisons"])
app.include_router(traces.router, prefix="/api/traces", tags=["traces"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])

# Page routes
app.include_router(views.router)
