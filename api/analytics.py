from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.grade import Grade
from models.query import Query as QueryModel
from models.result import Result
from models.run import Run
from schemas.schemas import CompareAnalyticsOut, RunAnalyticsOut
from services.analytics import compute_compare_analytics, compute_run_analytics
from services.db_utils import get_or_404
from services.context import get_request_context
from services.permissions import require_permission

router = APIRouter()


@router.get("/runs/{run_id}", response_model=RunAnalyticsOut)
async def run_analytics(run_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "results.read")
    run = await get_or_404(db, Run, run_id, "Run")
    return await compute_run_analytics(run_id, db)


@router.get("/compare", response_model=CompareAnalyticsOut)
async def compare_analytics(
    run_ids: str = Query(..., description="Comma-separated run IDs"),
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    await require_permission(db, ctx, "results.read")
    ids = [int(x.strip()) for x in run_ids.split(",") if x.strip()]
    if len(ids) < 2:
        raise HTTPException(400, "At least 2 run IDs required")
    return await compute_compare_analytics(ids, db)
