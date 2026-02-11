from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.grade import Grade
from models.result import Result
from schemas.schemas import GradeCreate, GradeOut

router = APIRouter()


@router.put("/results/{result_id}/grade", response_model=GradeOut)
async def upsert_grade(
    result_id: int, body: GradeCreate, db: AsyncSession = Depends(get_db)
):
    result = await db.get(Result, result_id)
    if not result:
        raise HTTPException(404, "Result not found")
    if body.grade not in ("correct", "partial", "wrong"):
        raise HTTPException(400, "Grade must be correct, partial, or wrong")

    stmt = select(Grade).where(Grade.result_id == result_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.grade = body.grade
        existing.notes = body.notes
        await db.commit()
        await db.refresh(existing)
        return GradeOut.model_validate(existing)
    else:
        grade = Grade(result_id=result_id, grade=body.grade, notes=body.notes)
        db.add(grade)
        await db.commit()
        await db.refresh(grade)
        return GradeOut.model_validate(grade)
