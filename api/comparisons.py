from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.comparison import Comparison, comparison_runs
from models.run import Run
from schemas.schemas import ComparisonCreate, ComparisonOut
from services.db_utils import get_or_404
from services.context import get_request_context
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter, assign_workspace_fields

router = APIRouter()


def _to_out(c: Comparison) -> ComparisonOut:
    return ComparisonOut(
        id=c.id,
        organization_id=c.organization_id,
        project_id=c.project_id,
        created_by_user_id=c.created_by_user_id,
        visibility_scope=c.visibility_scope,
        name=c.name,
        suite_id=c.suite_id,
        suite_name=c.suite.name if c.suite else "",
        run_ids=[r.id for r in c.runs],
        run_count=len(c.runs),
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.post("", response_model=ComparisonOut, status_code=201)
async def create_comparison(body: ComparisonCreate, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "comparisons.write")
    if len(body.run_ids) < 2:
        raise HTTPException(400, "At least 2 runs are required for a comparison")

    # Fetch all runs
    stmt = select(Run).where(Run.id.in_(body.run_ids))
    stmt = apply_workspace_filter(stmt, Run, ctx)
    result = await db.execute(stmt)
    runs = result.scalars().all()

    if len(runs) != len(body.run_ids):
        found = {r.id for r in runs}
        missing = [rid for rid in body.run_ids if rid not in found]
        raise HTTPException(404, f"Runs not found: {missing}")

    # Validate all runs share the same suite
    suite_ids = {r.suite_id for r in runs}
    if len(suite_ids) > 1:
        raise HTTPException(
            400,
            "Cannot compare runs from different datasets. All runs must use the same dataset.",
        )

    suite_id = suite_ids.pop()

    # Auto-generate name if not provided
    name = body.name
    if not name:
        labels = [r.label for r in runs]
        name = "Compare: " + " vs ".join(labels[:4])
        if len(labels) > 4:
            name += f" (+{len(labels) - 4} more)"

    comp = Comparison(name=name, suite_id=suite_id)
    assign_workspace_fields(comp, ctx)
    db.add(comp)
    await db.flush()

    # Link runs
    for run in runs:
        await db.execute(
            comparison_runs.insert().values(comparison_id=comp.id, run_id=run.id)
        )

    await db.commit()

    # Reload with relationships
    stmt = (
        select(Comparison)
        .where(Comparison.id == comp.id)
        .options(selectinload(Comparison.suite), selectinload(Comparison.runs))
    )
    stmt = apply_workspace_filter(stmt, Comparison, ctx)
    comp = (await db.execute(stmt)).scalar_one()
    return _to_out(comp)


@router.get("", response_model=list[ComparisonOut])
async def list_comparisons(db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "comparisons.read")
    stmt = (
        select(Comparison)
        .options(selectinload(Comparison.suite), selectinload(Comparison.runs))
        .order_by(Comparison.created_at.desc())
    )
    stmt = apply_workspace_filter(stmt, Comparison, ctx)
    result = await db.execute(stmt)
    return [_to_out(c) for c in result.scalars().all()]


@router.get("/{comparison_id}", response_model=ComparisonOut)
async def get_comparison(comparison_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "comparisons.read")
    stmt = (
        select(Comparison)
        .where(Comparison.id == comparison_id)
        .options(selectinload(Comparison.suite), selectinload(Comparison.runs))
    )
    stmt = apply_workspace_filter(stmt, Comparison, ctx)
    result = await db.execute(stmt)
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(404, "Comparison not found")
    return _to_out(comp)


@router.delete("/{comparison_id}", status_code=204)
async def delete_comparison(comparison_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "comparisons.delete")
    comp = await get_or_404(db, Comparison, comparison_id, "Comparison")
    await db.delete(comp)
    await db.commit()
