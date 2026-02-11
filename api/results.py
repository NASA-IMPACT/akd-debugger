from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.grade import Grade
from models.result import Result
from schemas.schemas import ResultOut

router = APIRouter()


@router.get("", response_model=list[ResultOut])
async def list_results(run_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Result)
        .where(Result.run_id == run_id)
        .options(selectinload(Result.grade), selectinload(Result.query))
        .order_by(Result.created_at.desc())
    )
    result = await db.execute(stmt)
    return [ResultOut.model_validate(r) for r in result.scalars().all()]


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
