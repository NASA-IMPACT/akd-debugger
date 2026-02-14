import asyncio
import json as json_mod
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import get_settings
from database import async_session, get_db
from executors.registry import get_executor
from models.agent import AgentConfig
from models.query import Query
from models.result import Result
from models.run import Run
from models.app_notification import AppNotification
from models.run_cost_preview import RunCostPreview
from models.suite import BenchmarkSuite
from models.trace_log import TraceLog
from schemas.schemas import (
    RunningJobItem,
    RunningJobsOut,
    RunCostPreviewOut,
    RunCostPreviewRecordOut,
    RunCreate,
    RunDetailOut,
    RunOut,
)
from services.openai_pricing import calculate_cost, load_pricing
from services.db_utils import get_or_404

router = APIRouter()


def _normalize_output_dir(body: RunCreate) -> Path:
    safe_label = body.label.replace(" ", "_").replace("/", "_")
    if body.output_dir:
        return Path(body.output_dir).expanduser()
    return Path(get_settings().OUTPUT_BASE_DIR).expanduser() / safe_label


async def _resolve_run_inputs(
    body: RunCreate, db: AsyncSession
) -> tuple[BenchmarkSuite, AgentConfig, list[Query], list[int]]:
    suite = await get_or_404(db, BenchmarkSuite, body.suite_id, "Suite")
    agent = await get_or_404(db, AgentConfig, body.agent_config_id, "Agent config")

    if body.query_ids:
        q_stmt = select(Query).where(
            Query.id.in_(body.query_ids), Query.suite_id == body.suite_id
        )
    else:
        q_stmt = select(Query).where(Query.suite_id == body.suite_id)
    queries = (await db.execute(q_stmt)).scalars().all()
    if not queries:
        raise HTTPException(400, "No queries found for this suite")
    return suite, agent, queries, [q.id for q in queries]


async def _create_runs(
    *,
    body: RunCreate,
    query_ids: list[int],
    query_count: int,
    db: AsyncSession,
) -> list[Run]:
    repeat = max(1, body.repeat)
    run_group = str(uuid.uuid4())[:12] if repeat > 1 else None
    base_dir = _normalize_output_dir(body)
    created_runs: list[Run] = []

    for i in range(repeat):
        run_num = i + 1
        if repeat > 1:
            label = f"{body.label} ({run_num}/{repeat})"
            output_dir = str(base_dir / f"run_{run_num}")
        else:
            label = body.label
            output_dir = str(base_dir)

        run = Run(
            suite_id=body.suite_id,
            agent_config_id=body.agent_config_id,
            label=label,
            tags=body.tags,
            batch_size=body.batch_size,
            progress_total=query_count,
            output_dir=output_dir,
            run_group=run_group,
            run_number=run_num,
            status="pending",
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        created_runs.append(run)
        task = asyncio.create_task(_start_run_job(run.id, query_ids, body.batch_size))
        task.add_done_callback(_task_done_callback)

    return created_runs


async def _build_preview(
    body: RunCreate, db: AsyncSession, preview: RunCostPreview | None = None
) -> RunCostPreviewOut:
    suite, agent, queries, query_ids = await _resolve_run_inputs(body, db)
    if agent.executor_type != "openai_agents":
        raise HTTPException(
            400, "Cost preview is only required for openai_agents executor"
        )

    sample_size = min(3, len(queries))
    sampled_queries = random.sample(queries, sample_size)
    sampled_query_ids = [q.id for q in sampled_queries]
    sampled_ordinals = [q.ordinal for q in sampled_queries]

    executor = get_executor(agent.executor_type)
    exec_config = {
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools_config": agent.tools_config,
        "model_settings": agent.model_settings,
    }

    async def _run_sample(query: Query):
        started_at = datetime.now(timezone.utc)
        try:
            exec_result = await executor.execute(query.query_text, exec_config)
            return exec_result, started_at, datetime.now(timezone.utc)
        except Exception as exc:
            return exc, started_at, datetime.now(timezone.utc)

    tasks = [_run_sample(q) for q in sampled_queries]
    sample_results = await asyncio.gather(*tasks, return_exceptions=False)

    usage_totals = {
        "requests": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cached_tokens": 0,
        "reasoning_tokens": 0,
        "web_search_calls": 0,
        "errors": 0,
    }
    aggregate_cost = {
        "input_cost_usd": 0.0,
        "cached_input_cost_usd": 0.0,
        "output_cost_usd": 0.0,
        "reasoning_output_cost_usd": 0.0,
        "web_search_cost_usd": 0.0,
        "total_usd": 0.0,
    }
    per_query_costs: list[dict] = []
    missing_pricing = False

    for q, result_item in zip(sampled_queries, sample_results):
        item, started_at, completed_at = result_item
        latency_ms = int((completed_at - started_at).total_seconds() * 1000)

        if isinstance(item, Exception):
            usage_totals["errors"] += 1
            trace = TraceLog(
                run_id=None,
                query_id=q.id,
                agent_config_id=agent.id,
                trace_type="preview",
                provider="openai",
                endpoint="agents.runner.run.preview",
                model=agent.model,
                status="failed",
                started_at=started_at,
                completed_at=completed_at,
                latency_ms=latency_ms,
                request_payload={
                    "query": q.query_text,
                    "system_prompt": exec_config.get("system_prompt"),
                    "model": exec_config.get("model"),
                    "tools_config": exec_config.get("tools_config"),
                    "model_settings": exec_config.get("model_settings"),
                    "mode": "cost_preview",
                },
                error=str(item),
            )
            db.add(trace)
            per_query_costs.append(
                {
                    "query_id": q.id,
                    "ordinal": q.ordinal,
                    "error": str(item),
                    "usage": {},
                    "cost": {
                        "input_cost_usd": 0.0,
                        "cached_input_cost_usd": 0.0,
                        "output_cost_usd": 0.0,
                        "reasoning_output_cost_usd": 0.0,
                        "web_search_cost_usd": 0.0,
                        "total_usd": 0.0,
                    },
                }
            )
            continue

        usage = item.usage or {}
        usage_totals["requests"] += int(usage.get("requests", 1) or 1)
        usage_totals["input_tokens"] += int(usage.get("input_tokens", 0) or 0)
        usage_totals["output_tokens"] += int(usage.get("output_tokens", 0) or 0)
        usage_totals["cached_tokens"] += int(usage.get("cached_tokens", 0) or 0)
        usage_totals["reasoning_tokens"] += int(usage.get("reasoning_tokens", 0) or 0)
        if item.error:
            usage_totals["errors"] += 1
        breakdown = calculate_cost(agent.model, usage, item.tool_calls)
        usage_totals["web_search_calls"] += breakdown.web_search_calls
        missing_pricing = missing_pricing or breakdown.missing_model_pricing
        aggregate_cost["input_cost_usd"] += breakdown.input_cost_usd
        aggregate_cost["cached_input_cost_usd"] += breakdown.cached_input_cost_usd
        aggregate_cost["output_cost_usd"] += breakdown.output_cost_usd
        aggregate_cost["reasoning_output_cost_usd"] += (
            breakdown.reasoning_output_cost_usd
        )
        aggregate_cost["web_search_cost_usd"] += breakdown.web_search_cost_usd
        aggregate_cost["total_usd"] += breakdown.total_usd
        per_query_costs.append(
            {
                "query_id": q.id,
                "ordinal": q.ordinal,
                "error": item.error,
                "usage": breakdown.usage,
                "cost": {
                    "input_cost_usd": breakdown.input_cost_usd,
                    "cached_input_cost_usd": breakdown.cached_input_cost_usd,
                    "output_cost_usd": breakdown.output_cost_usd,
                    "reasoning_output_cost_usd": breakdown.reasoning_output_cost_usd,
                    "web_search_cost_usd": breakdown.web_search_cost_usd,
                    "total_usd": breakdown.total_usd,
                },
                "web_search_calls": breakdown.web_search_calls,
                "model_key": breakdown.model_key,
            }
        )
        trace = TraceLog(
            run_id=None,
            query_id=q.id,
            agent_config_id=agent.id,
            trace_type="preview",
            provider="openai",
            endpoint="agents.runner.run.preview",
            model=agent.model,
            status="failed" if item.error else "completed",
            started_at=started_at,
            completed_at=completed_at,
            latency_ms=latency_ms,
            request_payload={
                "query": q.query_text,
                "system_prompt": exec_config.get("system_prompt"),
                "model": exec_config.get("model"),
                "tools_config": exec_config.get("tools_config"),
                "model_settings": exec_config.get("model_settings"),
                "mode": "cost_preview",
            },
            response_payload={
                "response": item.response,
                "tool_calls": item.tool_calls,
                "reasoning": item.reasoning,
            },
            usage=item.usage or None,
            error=item.error,
        )
        db.add(trace)

    sample_cost_usd = round(aggregate_cost["total_usd"], 6)
    estimated_total_calls = len(queries) * max(1, body.repeat)
    per_query_avg_cost = sample_cost_usd / max(1, sample_size)
    estimated_total_cost_usd = round(per_query_avg_cost * len(queries), 6)
    pricing = load_pricing()

    record = preview or RunCostPreview(
        suite_id=body.suite_id,
        agent_config_id=body.agent_config_id,
        label=body.label,
        tags=body.tags,
        batch_size=body.batch_size,
        repeat=max(1, body.repeat),
        output_dir=body.output_dir,
        query_ids=query_ids,
        sample_query_ids=sampled_query_ids,
        total_query_count=len(queries),
        sample_usage={},
        sample_cost_usd=0.0,
        estimated_total_cost_usd=0.0,
        pricing_version=str(pricing.get("version", "unknown")),
        currency=str(pricing.get("currency", "USD")),
    )
    record.sample_query_ids = sampled_query_ids
    record.total_query_count = len(queries)
    record.sample_usage = {
        "usage_totals": usage_totals,
        "cost_breakdown": {k: round(v, 6) for k, v in aggregate_cost.items()},
        "sampled_query_ordinals": sampled_ordinals,
        "per_query_costs": per_query_costs,
    }
    record.sample_cost_usd = sample_cost_usd
    record.estimated_total_cost_usd = estimated_total_cost_usd
    record.pricing_version = str(pricing.get("version", "unknown"))
    record.currency = str(pricing.get("currency", "USD"))
    record.status = "completed"
    record.error_message = None
    record.completed_at = datetime.now(timezone.utc)
    if preview is None:
        db.add(record)
    await db.commit()
    await db.refresh(record)

    return RunCostPreviewOut(
        id=record.id,
        suite_id=record.suite_id,
        suite_name=suite.name,
        agent_config_id=record.agent_config_id,
        agent_name=agent.name,
        model=agent.model,
        total_query_count=record.total_query_count,
        sampled_query_ids=record.sample_query_ids,
        sampled_query_ordinals=sampled_ordinals,
        sample_size=sample_size,
        repeat=record.repeat,
        estimated_total_calls=estimated_total_calls,
        status=record.status,
        error_message=record.error_message,
        pricing_version=record.pricing_version,
        currency=record.currency,
        missing_model_pricing=missing_pricing,
        usage_totals=usage_totals,
        cost_breakdown={k: round(v, 6) for k, v in aggregate_cost.items()},
        per_query_costs=per_query_costs,
        sample_cost_usd=record.sample_cost_usd,
        estimated_total_cost_usd=record.estimated_total_cost_usd,
    )


async def _create_notification(
    db: AsyncSession,
    *,
    notif_type: str,
    title: str,
    message: str,
    related_id: int | None = None,
):
    db.add(
        AppNotification(
            notif_type=notif_type,
            title=title,
            message=message,
            related_id=related_id,
        )
    )
    await db.commit()


async def _start_cost_preview_job(preview_id: int, mark_running: bool = True):
    async with async_session() as db:
        preview = await db.get(RunCostPreview, preview_id)
        if not preview:
            return
        if mark_running:
            preview.status = "running"
            preview.started_at = datetime.now(timezone.utc)
            await db.commit()

        body = RunCreate(
            suite_id=preview.suite_id,
            agent_config_id=preview.agent_config_id,
            label=preview.label,
            tags=preview.tags or [],
            batch_size=preview.batch_size,
            query_ids=preview.query_ids,
            output_dir=preview.output_dir,
            repeat=preview.repeat,
        )
        try:
            await _build_preview(body, db, preview=preview)
            await _create_notification(
                db,
                notif_type="cost_preview_completed",
                title="Cost preview completed",
                message=f"Cost preview #{preview_id} for '{preview.label}' is ready.",
                related_id=preview_id,
            )
        except Exception as exc:
            preview.status = "failed"
            preview.error_message = str(exc)
            preview.completed_at = datetime.now(timezone.utc)
            await db.commit()
            await _create_notification(
                db,
                notif_type="cost_preview_failed",
                title="Cost preview failed",
                message=f"Cost preview #{preview_id} failed: {exc}",
                related_id=preview_id,
            )


async def _enqueue_pending_previews(db: AsyncSession):
    now = datetime.now(timezone.utc)
    stale_running_cutoff = now.timestamp() - (15 * 60)

    stale_running_stmt = (
        select(RunCostPreview)
        .where(
            RunCostPreview.status == "running",
            RunCostPreview.started_at.is_not(None),
            RunCostPreview.completed_at.is_(None),
        )
        .order_by(RunCostPreview.started_at.asc())
        .limit(20)
    )
    stale_running = (await db.execute(stale_running_stmt)).scalars().all()
    for p in stale_running:
        started = p.started_at
        if started and started.timestamp() < stale_running_cutoff:
            p.status = "pending"
            p.error_message = "Recovered stale background job; re-queued automatically."

    pending_stmt = (
        select(RunCostPreview)
        .where(RunCostPreview.status == "pending")
        .order_by(RunCostPreview.created_at.asc())
        .limit(20)
    )
    pending = (await db.execute(pending_stmt)).scalars().all()
    if not pending:
        if stale_running:
            await db.commit()
        return

    for p in pending:
        p.status = "running"
        p.started_at = p.started_at or now
    await db.commit()
    for p in pending:
        task = asyncio.create_task(_start_cost_preview_job(p.id, mark_running=False))
        task.add_done_callback(_task_done_callback)


def _preview_record_out(
    preview: RunCostPreview,
    model: str,
    suite_name: str = "",
    agent_name: str = "",
) -> RunCostPreviewRecordOut:
    usage = preview.sample_usage if isinstance(preview.sample_usage, dict) else {}
    sampled_ordinals = usage.get("sampled_query_ordinals") or []
    usage_totals = usage.get("usage_totals") or {}
    cost_breakdown = usage.get("cost_breakdown") or {}
    per_query_costs = usage.get("per_query_costs") or []
    return RunCostPreviewRecordOut(
        id=preview.id,
        suite_id=preview.suite_id,
        suite_name=suite_name,
        agent_config_id=preview.agent_config_id,
        agent_name=agent_name,
        label=preview.label,
        model=model,
        total_query_count=preview.total_query_count,
        sampled_query_ids=preview.sample_query_ids or [],
        sampled_query_ordinals=sampled_ordinals,
        sample_size=len(preview.sample_query_ids or []),
        repeat=preview.repeat,
        estimated_total_calls=preview.total_query_count * max(1, preview.repeat),
        status=preview.status,
        error_message=preview.error_message,
        pricing_version=preview.pricing_version,
        currency=preview.currency,
        missing_model_pricing=model == "unknown",
        usage_totals=usage_totals,
        cost_breakdown=cost_breakdown,
        per_query_costs=per_query_costs,
        sample_cost_usd=preview.sample_cost_usd,
        estimated_total_cost_usd=preview.estimated_total_cost_usd,
        approved_at=preview.approved_at,
        consumed_at=preview.consumed_at,
        started_at=preview.started_at,
        completed_at=preview.completed_at,
        created_at=preview.created_at,
    )


@router.get("", response_model=list[RunDetailOut])
async def list_runs(tag: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Run).options(selectinload(Run.suite), selectinload(Run.agent_config))
    if tag:
        stmt = stmt.where(Run.tags.overlap([tag]))
    stmt = stmt.order_by(Run.created_at.desc())
    result = await db.execute(stmt)
    runs = result.scalars().all()
    out = []
    for r in runs:
        d = RunDetailOut.model_validate(r)
        d.suite_name = r.suite.name if r.suite else ""
        d.agent_name = r.agent_config.name if r.agent_config else ""
        out.append(d)
    return out


@router.get("/jobs", response_model=RunningJobsOut)
async def list_running_jobs(db: AsyncSession = Depends(get_db)):
    runs_stmt = (
        select(Run)
        .where(Run.status.in_(("pending", "running")))
        .options(selectinload(Run.suite), selectinload(Run.agent_config))
        .order_by(Run.created_at.desc())
    )
    runs = (await db.execute(runs_stmt)).scalars().all()
    run_items = [
        RunningJobItem(
            id=r.id,
            kind="benchmark",
            status=r.status,
            label=r.label,
            created_at=r.created_at,
            started_at=r.started_at,
            run_id=r.id,
            agent_name=r.agent_config.name if r.agent_config else None,
            suite_name=r.suite.name if r.suite else None,
        )
        for r in runs
    ]

    previews_stmt = (
        select(RunCostPreview)
        .where(RunCostPreview.status.in_(("pending", "running")))
        .order_by(RunCostPreview.created_at.desc())
    )
    previews = (await db.execute(previews_stmt)).scalars().all()
    preview_items = [
        RunningJobItem(
            id=p.id,
            kind="cost_preview",
            status=p.status,
            label=p.label,
            created_at=p.created_at,
            started_at=p.started_at,
        )
        for p in previews
    ]

    retry_stmt = (
        select(TraceLog)
        .where(TraceLog.trace_type == "retry", TraceLog.status == "started")
        .order_by(TraceLog.created_at.desc())
    )
    retry_traces = (await db.execute(retry_stmt)).scalars().all()
    retry_items = [
        RunningJobItem(
            id=t.id,
            kind="single_query_retry",
            status=t.status,
            label=f"Retry trace #{t.id}",
            created_at=t.created_at,
            started_at=t.started_at,
            run_id=t.run_id,
            query_id=t.query_id,
        )
        for t in retry_traces
    ]

    return RunningJobsOut(
        runs=run_items, cost_previews=preview_items, single_queries=retry_items
    )


@router.post("", response_model=list[RunOut], status_code=201)
async def create_run(body: RunCreate, db: AsyncSession = Depends(get_db)):
    _, agent, queries, query_ids = await _resolve_run_inputs(body, db)
    if agent.executor_type == "openai_agents" and len(queries) > 3:
        stmt = (
            select(RunCostPreview)
            .where(
                RunCostPreview.suite_id == body.suite_id,
                RunCostPreview.agent_config_id == body.agent_config_id,
                RunCostPreview.status == "completed",
                RunCostPreview.approved_at.is_not(None),
            )
            .order_by(RunCostPreview.approved_at.desc())
            .limit(1)
        )
        approved_preview = (await db.execute(stmt)).scalar_one_or_none()
        if not approved_preview:
            raise HTTPException(
                400,
                "Runs with more than 3 queries require a completed and approved cost preview for this dataset/agent.",
            )
    created_runs = await _create_runs(
        body=body, query_ids=query_ids, query_count=len(queries), db=db
    )
    return [RunOut.model_validate(r) for r in created_runs]


@router.post("/cost-preview", response_model=RunCostPreviewOut)
async def create_cost_preview(body: RunCreate, db: AsyncSession = Depends(get_db)):
    return await _build_preview(body, db)


@router.post("/cost-preview/start", response_model=RunCostPreviewRecordOut)
async def start_cost_preview(body: RunCreate, db: AsyncSession = Depends(get_db)):
    suite, agent, queries, query_ids = await _resolve_run_inputs(body, db)
    if agent.executor_type != "openai_agents":
        raise HTTPException(400, "Cost preview is only supported for openai_agents")

    sample_size = min(3, len(queries))
    sampled_queries = random.sample(queries, sample_size)
    record = RunCostPreview(
        suite_id=body.suite_id,
        agent_config_id=body.agent_config_id,
        label=body.label,
        tags=body.tags,
        batch_size=body.batch_size,
        repeat=max(1, body.repeat),
        output_dir=body.output_dir,
        query_ids=query_ids,
        sample_query_ids=[q.id for q in sampled_queries],
        total_query_count=len(queries),
        sample_usage={},
        sample_cost_usd=0.0,
        estimated_total_cost_usd=0.0,
        pricing_version=str(load_pricing().get("version", "unknown")),
        currency=str(load_pricing().get("currency", "USD")),
        status="pending",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    task = asyncio.create_task(_start_cost_preview_job(record.id))
    task.add_done_callback(_task_done_callback)
    return _preview_record_out(record, agent.model, suite.name, agent.name)


@router.get("/cost-preview", response_model=list[RunCostPreviewRecordOut])
async def list_cost_previews(limit: int = 100, db: AsyncSession = Depends(get_db)):
    await _enqueue_pending_previews(db)
    q = min(max(limit, 1), 500)
    stmt = select(RunCostPreview).order_by(RunCostPreview.created_at.desc()).limit(q)
    previews = (await db.execute(stmt)).scalars().all()

    agent_ids = {p.agent_config_id for p in previews}
    suite_ids = {p.suite_id for p in previews}
    model_by_agent_id: dict[int, str] = {}
    name_by_agent_id: dict[int, str] = {}
    name_by_suite_id: dict[int, str] = {}
    if agent_ids:
        a_stmt = select(AgentConfig).where(AgentConfig.id.in_(agent_ids))
        agents = (await db.execute(a_stmt)).scalars().all()
        model_by_agent_id = {a.id: a.model for a in agents}
        name_by_agent_id = {a.id: a.name for a in agents}
    if suite_ids:
        s_stmt = select(BenchmarkSuite).where(BenchmarkSuite.id.in_(suite_ids))
        suites = (await db.execute(s_stmt)).scalars().all()
        name_by_suite_id = {s.id: s.name for s in suites}

    return [
        _preview_record_out(
            p,
            model_by_agent_id.get(p.agent_config_id, "unknown"),
            name_by_suite_id.get(p.suite_id, ""),
            name_by_agent_id.get(p.agent_config_id, ""),
        )
        for p in previews
    ]


@router.get("/cost-preview/{preview_id}", response_model=RunCostPreviewRecordOut)
async def get_cost_preview(preview_id: int, db: AsyncSession = Depends(get_db)):
    preview = await get_or_404(db, RunCostPreview, preview_id, "Cost preview")
    agent = await db.get(AgentConfig, preview.agent_config_id)
    suite = await db.get(BenchmarkSuite, preview.suite_id)
    model = agent.model if agent else "unknown"
    return _preview_record_out(
        preview,
        model,
        suite.name if suite else "",
        agent.name if agent else "",
    )


@router.post("/cost-preview/{preview_id}/retry", response_model=RunCostPreviewRecordOut)
async def retry_cost_preview(preview_id: int, db: AsyncSession = Depends(get_db)):
    preview = await db.get(RunCostPreview, preview_id)
    if not preview:
        raise HTTPException(404, "Cost preview not found")
    if preview.status == "running":
        raise HTTPException(400, "Cost preview is already running")

    preview.status = "running"
    preview.error_message = None
    preview.started_at = datetime.now(timezone.utc)
    preview.completed_at = None
    preview.sample_usage = {}
    preview.sample_cost_usd = 0.0
    preview.estimated_total_cost_usd = 0.0
    await db.commit()
    await db.refresh(preview)

    task = asyncio.create_task(_start_cost_preview_job(preview.id, mark_running=False))
    task.add_done_callback(_task_done_callback)

    agent = await db.get(AgentConfig, preview.agent_config_id)
    suite = await db.get(BenchmarkSuite, preview.suite_id)
    model = agent.model if agent else "unknown"
    return _preview_record_out(
        preview,
        model,
        suite.name if suite else "",
        agent.name if agent else "",
    )


@router.post(
    "/cost-preview/{preview_id}/approve-and-start", response_model=list[RunOut]
)
async def approve_preview_and_start(
    preview_id: int, db: AsyncSession = Depends(get_db)
):
    preview = await db.get(RunCostPreview, preview_id)
    if not preview:
        raise HTTPException(404, "Cost preview not found")
    if preview.status != "completed":
        raise HTTPException(400, f"Cost preview is not ready yet (status={preview.status})")
    if preview.consumed_at is not None:
        raise HTTPException(400, "Cost preview already consumed")

    body = RunCreate(
        suite_id=preview.suite_id,
        agent_config_id=preview.agent_config_id,
        label=preview.label,
        tags=preview.tags or [],
        batch_size=preview.batch_size,
        query_ids=preview.query_ids,
        output_dir=preview.output_dir,
        repeat=preview.repeat,
    )
    _, agent, queries, query_ids = await _resolve_run_inputs(body, db)
    if agent.executor_type != "openai_agents":
        raise HTTPException(
            400, "Cost preview approvals are only valid for openai_agents executor"
        )
    created_runs = await _create_runs(
        body=body, query_ids=query_ids, query_count=len(queries), db=db
    )
    now = datetime.now(timezone.utc)
    preview.approved_at = now
    preview.consumed_at = now
    await db.commit()
    return [RunOut.model_validate(r) for r in created_runs]


from loguru import logger as _run_logger


def _task_done_callback(task: asyncio.Task):
    exc = task.exception()
    if exc:
        _run_logger.opt(exception=exc).error("Background run task failed")


async def _start_run_job(run_id: int, query_ids: list[int], batch_size: int):
    from workers.runner import execute_run

    await execute_run(run_id, query_ids, batch_size)


@router.get("/group/{run_group}", response_model=list[RunDetailOut])
async def list_group_runs(run_group: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Run)
        .where(Run.run_group == run_group)
        .options(selectinload(Run.suite), selectinload(Run.agent_config))
        .order_by(Run.run_number)
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    out = []
    for r in runs:
        d = RunDetailOut.model_validate(r)
        d.suite_name = r.suite.name if r.suite else ""
        d.agent_name = r.agent_config.name if r.agent_config else ""
        out.append(d)
    return out


@router.get("/{run_id}/config")
async def get_run_config(run_id: int, db: AsyncSession = Depends(get_db)):
    """Return run configuration including agent and suite details."""
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
        raise HTTPException(404, "Run not found")
    agent = run.agent_config
    suite = run.suite
    return {
        "run": {
            "id": run.id,
            "label": run.label,
            "status": run.status,
            "tags": run.tags or [],
            "batch_size": run.batch_size,
            "progress_total": run.progress_total,
            "output_dir": run.output_dir,
            "run_group": run.run_group,
            "run_number": run.run_number,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        },
        "agent": {
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
        "suite": {
            "id": suite.id,
            "name": suite.name,
            "description": suite.description or "",
            "query_count": len(suite.queries) if suite.queries else 0,
        }
        if suite
        else None,
    }


@router.get("/{run_id}", response_model=RunDetailOut)
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Run)
        .where(Run.id == run_id)
        .options(selectinload(Run.suite), selectinload(Run.agent_config))
    )
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    d = RunDetailOut.model_validate(run)
    d.suite_name = run.suite.name if run.suite else ""
    d.agent_name = run.agent_config.name if run.agent_config else ""
    return d


@router.post("/{run_id}/cancel", response_model=RunOut)
async def cancel_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status not in ("pending", "running"):
        raise HTTPException(400, "Run cannot be cancelled")
    run.status = "cancelled"
    run.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(run)
    return RunOut.model_validate(run)


@router.delete("/{run_id}", status_code=204)
async def delete_run(
    run_id: int, delete_data: bool = False, db: AsyncSession = Depends(get_db)
):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    output_dir = run.output_dir
    run_group = run.run_group
    await db.delete(run)
    await db.commit()
    if delete_data and output_dir:
        import shutil

        p = Path(output_dir)
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)


class RunImport(BaseModel):
    suite_id: int
    agent_config_id: int
    label: str
    json_dir: str  # path to directory containing JSON files
    tags: list[str] = []
    run_group: Optional[str] = None
    run_number: int = 1


@router.post("/import", response_model=RunOut, status_code=201)
async def import_run(body: RunImport, db: AsyncSession = Depends(get_db)):
    """Import a completed run from existing JSON files on disk."""
    suite = await db.get(BenchmarkSuite, body.suite_id)
    if not suite:
        raise HTTPException(404, "Suite not found")
    agent = await db.get(AgentConfig, body.agent_config_id)
    if not agent:
        raise HTTPException(404, "Agent config not found")

    json_dir = Path(body.json_dir).expanduser()
    if not json_dir.exists():
        raise HTTPException(400, f"Directory not found: {json_dir}")

    # Load all JSON files
    json_files = sorted(
        json_dir.glob("*.json"), key=lambda f: int(f.stem) if f.stem.isdigit() else 0
    )
    if not json_files:
        raise HTTPException(400, f"No JSON files found in {json_dir}")

    # Load queries for matching
    q_stmt = (
        select(Query).where(Query.suite_id == body.suite_id).order_by(Query.ordinal)
    )
    queries = (await db.execute(q_stmt)).scalars().all()
    ordinal_to_query = {q.ordinal: q for q in queries}

    # Create the run as completed
    now = datetime.now(timezone.utc)
    run = Run(
        suite_id=body.suite_id,
        agent_config_id=body.agent_config_id,
        label=body.label,
        tags=body.tags,
        batch_size=0,
        progress_total=len(json_files),
        progress_current=len(json_files),
        output_dir=str(json_dir.parent),
        run_group=body.run_group,
        run_number=body.run_number,
        status="completed",
        started_at=now,
        completed_at=now,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Import each JSON file as a result
    imported = 0
    for jf in json_files:
        try:
            data = json_mod.loads(jf.read_text())
        except Exception:
            continue

        ordinal = (
            int(data.get("id", jf.stem))
            if str(data.get("id", jf.stem)).isdigit()
            else 0
        )
        query = ordinal_to_query.get(ordinal)
        if not query:
            continue

        result = Result(
            run_id=run.id,
            query_id=query.id,
            agent_response=data.get("agent_response") or None,
            tool_calls=data.get("tool_calls") or None,
            reasoning=data.get("reasoning") or None,
            usage=data.get("usage") or None,
            execution_time_seconds=data.get("execution_time_seconds", 0),
            error=data.get("error") or None,
        )
        db.add(result)
        imported += 1

    await db.commit()

    # Update progress
    run.progress_current = imported
    run.progress_total = imported
    await db.commit()
    await db.refresh(run)

    return RunOut.model_validate(run)


@router.delete("/group/{run_group}", status_code=204)
async def delete_group(
    run_group: str, delete_data: bool = False, db: AsyncSession = Depends(get_db)
):
    stmt = select(Run).where(Run.run_group == run_group)
    result = await db.execute(stmt)
    runs = result.scalars().all()
    if not runs:
        raise HTTPException(404, "Run group not found")
    dirs = [r.output_dir for r in runs if r.output_dir]
    for r in runs:
        await db.delete(r)
    await db.commit()
    if delete_data:
        import shutil

        for d in dirs:
            p = Path(d)
            if p.exists():
                shutil.rmtree(p, ignore_errors=True)
