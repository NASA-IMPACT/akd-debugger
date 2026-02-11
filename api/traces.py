from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.trace_log import TraceLog
from schemas.schemas import TraceLogOut, TraceSummaryOut
from services.openai_pricing import calculate_cost

router = APIRouter()


def _apply_filters(stmt, run_id: int | None, status: str | None):
    if run_id is not None:
        stmt = stmt.where(TraceLog.run_id == run_id)
    if status:
        stmt = stmt.where(TraceLog.status == status)
    return stmt


def _trace_to_out(trace: TraceLog) -> TraceLogOut:
    response_payload = trace.response_payload if isinstance(trace.response_payload, dict) else {}
    tool_calls = response_payload.get("tool_calls")
    breakdown = calculate_cost(trace.model or "", trace.usage or {}, tool_calls)
    return TraceLogOut(
        id=trace.id,
        run_id=trace.run_id,
        query_id=trace.query_id,
        provider=trace.provider,
        endpoint=trace.endpoint,
        model=trace.model,
        status=trace.status,
        request_payload=trace.request_payload,
        response_payload=trace.response_payload,
        usage=trace.usage,
        error=trace.error,
        estimated_cost_usd=breakdown.total_usd,
        cost_breakdown={
            "input_cost_usd": breakdown.input_cost_usd,
            "cached_input_cost_usd": breakdown.cached_input_cost_usd,
            "output_cost_usd": breakdown.output_cost_usd,
            "reasoning_output_cost_usd": breakdown.reasoning_output_cost_usd,
            "web_search_cost_usd": breakdown.web_search_cost_usd,
            "total_usd": breakdown.total_usd,
            "web_search_calls": breakdown.web_search_calls,
        },
        missing_model_pricing=breakdown.missing_model_pricing,
        latency_ms=trace.latency_ms,
        started_at=trace.started_at,
        completed_at=trace.completed_at,
        created_at=trace.created_at,
    )


@router.get("", response_model=list[TraceLogOut])
async def list_traces(
    run_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    q = min(max(limit, 1), 1000)
    stmt = _apply_filters(select(TraceLog), run_id, status)
    stmt = stmt.order_by(TraceLog.created_at.desc()).limit(q)
    result = await db.execute(stmt)
    return [_trace_to_out(r) for r in result.scalars().all()]


@router.get("/summary", response_model=TraceSummaryOut)
async def traces_summary(
    run_id: int | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = _apply_filters(select(TraceLog).order_by(TraceLog.created_at.desc()), run_id, status)
    traces = (await db.execute(stmt)).scalars().all()
    total_cost = 0.0
    missing = 0
    for t in traces:
        response_payload = t.response_payload if isinstance(t.response_payload, dict) else {}
        tool_calls = response_payload.get("tool_calls")
        breakdown = calculate_cost(t.model or "", t.usage or {}, tool_calls)
        total_cost += breakdown.total_usd
        if breakdown.missing_model_pricing:
            missing += 1
    return TraceSummaryOut(
        count=len(traces),
        total_cost_usd=round(total_cost, 6),
        missing_model_pricing_count=missing,
    )


@router.get("/{trace_id}", response_model=TraceLogOut)
async def get_trace(trace_id: int, db: AsyncSession = Depends(get_db)):
    trace = await db.get(TraceLog, trace_id)
    if not trace:
        raise HTTPException(404, "Trace not found")
    return _trace_to_out(trace)
