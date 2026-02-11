from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.run import Run
from models.suite import BenchmarkSuite

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=BASE_DIR / "templates")

router = APIRouter()


@router.get("/")
async def home(request: Request):
    return templates.TemplateResponse(
        "runs/list.html", {"request": request, "active": "runs"}
    )


@router.get("/runs/new")
async def new_run(request: Request):
    return templates.TemplateResponse(
        "runs/new.html", {"request": request, "active": "runs"}
    )


@router.get("/runs/{run_id}")
async def run_detail(request: Request, run_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Run)
        .where(Run.id == run_id)
        .options(
            selectinload(Run.suite).selectinload(BenchmarkSuite.queries),
            selectinload(Run.agent_config),
        )
    )
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        return templates.TemplateResponse(
            "runs/list.html", {"request": request, "active": "runs"}
        )

    # Check for group runs
    group_runs = []
    if run.run_group:
        g_stmt = (
            select(Run).where(Run.run_group == run.run_group).order_by(Run.run_number)
        )
        g_result = await db.execute(g_stmt)
        group_runs = [
            {
                "id": r.id,
                "label": r.label,
                "status": r.status,
                "run_number": r.run_number,
                "progress_current": r.progress_current,
                "progress_total": r.progress_total,
            }
            for r in g_result.scalars().all()
        ]

    agent = run.agent_config
    suite = run.suite

    return templates.TemplateResponse(
        "runs/detail.html",
        {
            "request": request,
            "active": "runs",
            "run": {
                "id": run.id,
                "label": run.label,
                "status": run.status,
                "tags": run.tags or [],
                "suite_name": suite.name if suite else "",
                "suite_id": run.suite_id,
                "agent_name": agent.name if agent else "",
                "agent_config_id": run.agent_config_id,
                "progress_current": run.progress_current,
                "progress_total": run.progress_total,
                "run_group": run.run_group,
                "batch_size": run.batch_size,
                "output_dir": run.output_dir,
                "run_number": run.run_number,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat()
                if run.completed_at
                else None,
                "created_at": run.created_at.isoformat() if run.created_at else None,
            },
            "agent_config": {
                "id": agent.id,
                "name": agent.name,
                "executor_type": agent.executor_type,
                "model": agent.model,
                "system_prompt": agent.system_prompt or "",
                "tools_config": agent.tools_config,
                "model_settings": agent.model_settings,
            }
            if agent
            else None,
            "suite_info": {
                "id": suite.id,
                "name": suite.name,
                "description": suite.description or "",
                "query_count": len(suite.queries) if suite.queries else 0,
            }
            if suite
            else None,
            "group_runs": group_runs,
        },
    )


@router.get("/suites")
async def suites_list(request: Request):
    return templates.TemplateResponse(
        "suites/list.html", {"request": request, "active": "suites"}
    )


@router.get("/suites/{suite_id}")
async def suite_detail(request: Request, suite_id: int):
    return templates.TemplateResponse(
        "suites/detail.html",
        {"request": request, "active": "suites", "suite_id": suite_id},
    )


@router.get("/agents")
async def agents_list(request: Request):
    return templates.TemplateResponse(
        "agents/list.html", {"request": request, "active": "agents"}
    )


@router.get("/compare")
async def compare(request: Request, run_ids: list[str] = Query(default=[])):
    # Accept both ?run_ids=1&run_ids=2 (repeated) and ?run_ids=1,2,3 (comma-separated)
    ids = []
    for v in run_ids:
        for part in v.split(","):
            part = part.strip()
            if part.isdigit():
                ids.append(int(part))
    return templates.TemplateResponse(
        "compare.html",
        {
            "request": request,
            "active": "compare",
            "run_ids": ids,
            "run_ids_str": ",".join(str(i) for i in ids),
        },
    )
