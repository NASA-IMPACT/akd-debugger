import csv
import io
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.grade import Grade
from models.result import Result
from schemas.schemas import GradeCreate, GradeOut
from services.db_utils import get_or_404
from services.context import get_request_context
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter

router = APIRouter()


@router.put("/results/{result_id}/grade", response_model=GradeOut)
async def upsert_grade(
    result_id: int, body: GradeCreate, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "results.grade")
    result = await get_or_404(db, Result, result_id, "Result")
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


@router.post("/runs/{run_id}/import-csv", response_model=dict)
async def import_grades_csv(
    run_id: int,
    file: UploadFile = File(...),
    mapping: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Import grades from CSV with column mapping.

    mapping is a JSON string: {"query_text": "col", "grade": "col", "notes": "col"|null}
    """
    try:
        col_map = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid mapping JSON")

    if not col_map.get("query_text") or not col_map.get("grade"):
        raise HTTPException(400, "query_text and grade mappings are required")

    # Load all results for this run with their queries
    stmt = (
        select(Result)
        .where(Result.run_id == run_id)
        .options(selectinload(Result.query), selectinload(Result.grade))
    )
    stmt = apply_workspace_filter(stmt, Result, ctx)
    results = (await db.execute(stmt)).scalars().all()
    if not results:
        raise HTTPException(404, "No results found for this run")

    # Build lookup: query_text (stripped, lowered) -> result
    lookup: dict[str, Result] = {}
    for r in results:
        if r.query:
            key = r.query.query_text.strip().lower()
            lookup[key] = r

    # Parse CSV
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(400, "Empty CSV or no header row")

    for field in ("query_text", "grade", "notes"):
        csv_col = col_map.get(field)
        if csv_col and csv_col not in reader.fieldnames:
            raise HTTPException(400, f"Column '{csv_col}' not found in CSV")

    VALID_GRADES = {"correct", "partial", "wrong"}
    imported = 0
    skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(reader, start=2):  # row 1 is header
        query_text = row.get(col_map["query_text"], "").strip()
        grade_val = row.get(col_map["grade"], "").strip().lower()
        notes_val = (
            row.get(col_map["notes"], "").strip() if col_map.get("notes") else None
        )

        if not query_text:
            skipped += 1
            continue

        if grade_val not in VALID_GRADES:
            errors.append({"row": i, "reason": f"Invalid grade '{grade_val}'"})
            continue

        key = query_text.strip().lower()
        result = lookup.get(key)
        if not result:
            skipped += 1
            continue

        # Upsert grade
        if result.grade:
            result.grade.grade = grade_val
            result.grade.notes = notes_val or result.grade.notes
        else:
            g = Grade(result_id=result.id, grade=grade_val, notes=notes_val or None)
            db.add(g)

        imported += 1

    await db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}
    ctx = get_request_context()
    await require_permission(db, ctx, "results.grade")
