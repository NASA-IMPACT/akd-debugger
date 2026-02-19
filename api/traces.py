from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.trace_log import TraceLog
from schemas.schemas import TraceLogOut, TraceSummaryOut
from services.openai_pricing import calculate_cost
from services.trace_utils import trace_to_out
from services.db_utils import get_or_404
from services.context import get_request_context
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter

router = APIRouter()


def _apply_filters(
    stmt,
    run_id: int | None,
    status: str | None,
    trace_type: str | None = None,
    agent_config_id: int | None = None,
    conversation_id: str | None = None,
):
    if run_id is not None:
        stmt = stmt.where(TraceLog.run_id == run_id)
    if status:
        stmt = stmt.where(TraceLog.status == status)
    if trace_type:
        stmt = stmt.where(TraceLog.trace_type == trace_type)
    if agent_config_id is not None:
        stmt = stmt.where(TraceLog.agent_config_id == agent_config_id)
    if conversation_id:
        stmt = stmt.where(TraceLog.conversation_id == conversation_id)
    return stmt





@router.get("", response_model=list[TraceLogOut])
async def list_traces(
    run_id: int | None = None,
    status: str | None = None,
    trace_type: str | None = None,
    agent_config_id: int | None = None,
    conversation_id: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    await require_permission(db, ctx, "traces.read")
    q = min(max(limit, 1), 1000)
    stmt = _apply_filters(
        stmt=select(TraceLog),
        run_id=run_id,
        status=status,
        trace_type=trace_type,
        agent_config_id=agent_config_id,
        conversation_id=conversation_id,
    )
    stmt = apply_workspace_filter(stmt, TraceLog, ctx)
    stmt = stmt.order_by(TraceLog.created_at.desc()).limit(q)
    result = await db.execute(stmt)
    return [trace_to_out(r) for r in result.scalars().all()]


@router.get("/summary", response_model=TraceSummaryOut)
async def traces_summary(
    run_id: int | None = None,
    status: str | None = None,
    trace_type: str | None = None,
    agent_config_id: int | None = None,
    conversation_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    await require_permission(db, ctx, "traces.read")
    stmt = _apply_filters(
        stmt=select(TraceLog).order_by(TraceLog.created_at.desc()),
        run_id=run_id,
        status=status,
        trace_type=trace_type,
        agent_config_id=agent_config_id,
        conversation_id=conversation_id,
    )
    stmt = apply_workspace_filter(stmt, TraceLog, ctx)
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
    ctx = get_request_context()
    await require_permission(db, ctx, "traces.read")
    trace = await get_or_404(db, TraceLog, trace_id, "Trace")
    return trace_to_out(trace)
