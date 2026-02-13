from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from executors.registry import get_executor
from models.grade import Grade
from models.query import Query
from models.result import Result
from models.run import Run
from models.trace_log import TraceLog
from schemas.schemas import ResultListOut, ResultOut

router = APIRouter()


def _base_result_id(result: Result) -> int:
    return result.parent_result_id or result.id


async def _load_result_with_context(result_id: int, db: AsyncSession) -> Result | None:
    stmt = (
        select(Result)
        .where(Result.id == result_id)
        .options(
            selectinload(Result.grade),
            selectinload(Result.query),
            selectinload(Result.run).selectinload(Run.agent_config),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get("", response_model=list[ResultOut])
async def list_results(run_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Result)
        .where(Result.run_id == run_id)
        .options(selectinload(Result.grade), selectinload(Result.query))
        .order_by(Result.query_id.asc(), Result.version_number.asc(), Result.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    by_base: dict[int, list[Result]] = {}
    for row in rows:
        base_id = _base_result_id(row)
        by_base.setdefault(base_id, []).append(row)

    default_results: list[ResultOut] = []
    for base_id, versions in by_base.items():
        versions_sorted = sorted(
            versions, key=lambda r: (r.version_number, r.created_at or datetime.min)
        )

        default = next((v for v in versions_sorted if v.is_default_version), None)
        if default is None:
            default = versions_sorted[-1]
        default_results.append(ResultOut.model_validate(default))

    default_results.sort(key=lambda r: r.query_id)
    return default_results


@router.get("/families", response_model=ResultListOut)
async def list_results_with_families(run_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Result)
        .where(Result.run_id == run_id)
        .options(selectinload(Result.grade), selectinload(Result.query))
        .order_by(Result.query_id.asc(), Result.version_number.asc(), Result.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    by_base: dict[int, list[Result]] = {}
    for row in rows:
        base_id = _base_result_id(row)
        by_base.setdefault(base_id, []).append(row)

    default_results: list[ResultOut] = []
    versions_by_base_result: dict[int, list[ResultOut]] = {}
    for base_id, versions in by_base.items():
        versions_sorted = sorted(
            versions, key=lambda r: (r.version_number, r.created_at or datetime.min)
        )
        versions_out = [ResultOut.model_validate(v) for v in versions_sorted]
        versions_by_base_result[base_id] = versions_out

        default = next((v for v in versions_sorted if v.is_default_version), None)
        if default is None:
            default = versions_sorted[-1]
        default_results.append(ResultOut.model_validate(default))

    default_results.sort(key=lambda r: r.query_id)
    return ResultListOut(results=default_results, versions_by_base_result=versions_by_base_result)


@router.get("/{result_id}", response_model=ResultOut)
async def get_result(result_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Result)
        .where(Result.id == result_id)
        .options(selectinload(Result.grade), selectinload(Result.query))
    )
    result = await db.execute(stmt)
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Result not found")
    return ResultOut.model_validate(r)


@router.post("/{result_id}/retry", response_model=ResultOut)
async def retry_result(result_id: int, db: AsyncSession = Depends(get_db)):
    current = await _load_result_with_context(result_id, db)
    if not current:
        raise HTTPException(404, "Result not found")

    base_id = _base_result_id(current)
    base = await _load_result_with_context(base_id, db)
    if not base:
        raise HTTPException(404, "Base result not found")
    if not base.run or not base.run.agent_config:
        raise HTTPException(400, "Result has no agent context for retry")

    query = base.query
    if not query:
        query = await db.get(Query, base.query_id)
    if not query:
        raise HTTPException(400, "Result query not found")

    run = base.run
    agent = run.agent_config
    executor = get_executor(agent.executor_type)
    exec_config = {
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools_config": agent.tools_config,
        "model_settings": agent.model_settings,
    }

    started_at = datetime.now(timezone.utc)
    trace = TraceLog(
        run_id=base.run_id,
        query_id=base.query_id,
        agent_config_id=agent.id,
        trace_type="retry",
        provider="openai",
        endpoint="agents.runner.retry",
        model=agent.model,
        status="started",
        started_at=started_at,
        request_payload={
            "query": query.query_text,
            "model": agent.model,
            "system_prompt": agent.system_prompt,
            "tools_config": agent.tools_config,
            "model_settings": agent.model_settings,
            "source_result_id": base.id,
        },
    )
    db.add(trace)
    await db.flush()
    await db.commit()
    await db.refresh(trace)

    exec_result = await executor.execute(query.query_text, exec_config)
    completed_at = datetime.now(timezone.utc)
    latency_ms = int((completed_at - started_at).total_seconds() * 1000)
    trace.response_payload = {
        "response": exec_result.response,
        "tool_calls": exec_result.tool_calls,
        "reasoning": exec_result.reasoning,
    }
    trace.usage = exec_result.usage or None
    trace.error = exec_result.error
    trace.status = "failed" if exec_result.error else "completed"
    trace.completed_at = completed_at
    trace.latency_ms = latency_ms

    max_stmt = select(func.max(Result.version_number)).where(
        or_(Result.id == base.id, Result.parent_result_id == base.id)
    )
    max_version = (await db.execute(max_stmt)).scalar_one() or 1
    new_version = Result(
        run_id=base.run_id,
        query_id=base.query_id,
        parent_result_id=base.id,
        version_number=int(max_version) + 1,
        is_default_version=False,
        version_status="active",
        trace_log_id=trace.id,
        agent_response=exec_result.response if not exec_result.error else None,
        tool_calls=exec_result.tool_calls or None,
        reasoning=exec_result.reasoning or None,
        usage=exec_result.usage or None,
        execution_time_seconds=exec_result.execution_time_seconds,
        error=exec_result.error,
    )
    db.add(new_version)
    await db.commit()
    await db.refresh(new_version)
    return ResultOut.model_validate(new_version)


@router.post("/{result_id}/versions/{version_id}/accept", response_model=ResultOut)
async def accept_result_version(
    result_id: int, version_id: int, db: AsyncSession = Depends(get_db)
):
    base = await _load_result_with_context(result_id, db)
    if not base:
        raise HTTPException(404, "Result not found")
    base_id = _base_result_id(base)
    if base.id != base_id:
        base = await _load_result_with_context(base_id, db)
        if not base:
            raise HTTPException(404, "Base result not found")

    family_stmt = select(Result).where(
        or_(Result.id == base.id, Result.parent_result_id == base.id)
    )
    family = (await db.execute(family_stmt)).scalars().all()
    target = next((v for v in family if v.id == version_id), None)
    if not target:
        raise HTTPException(404, "Version not found in this result family")

    for item in family:
        item.is_default_version = item.id == target.id

    family_ids = [item.id for item in family]
    await db.execute(delete(Grade).where(Grade.result_id.in_(family_ids)))
    await db.commit()
    await db.refresh(target)
    return ResultOut.model_validate(target)


@router.delete("/{result_id}/versions/{version_id}", status_code=204)
async def delete_result_version(
    result_id: int, version_id: int, db: AsyncSession = Depends(get_db)
):
    base = await _load_result_with_context(result_id, db)
    if not base:
        raise HTTPException(404, "Result not found")
    base_id = _base_result_id(base)
    if base.id != base_id:
        base = await _load_result_with_context(base_id, db)
        if not base:
            raise HTTPException(404, "Base result not found")

    version = await db.get(Result, version_id)
    if not version:
        raise HTTPException(404, "Version not found")
    version_base_id = _base_result_id(version)
    if version_base_id != base.id:
        raise HTTPException(400, "Version is not part of this result family")
    if version.id == base.id or version.is_default_version:
        raise HTTPException(400, "Default/base version cannot be ignored")

    await db.delete(version)
    await db.commit()
    return Response(status_code=204)
