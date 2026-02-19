import csv
import io

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.query import Query as QueryModel
from models.suite import BenchmarkSuite
from schemas.schemas import (
    QueryCreate,
    QueryOut,
    SuiteCreate,
    SuiteDetailOut,
    SuiteOut,
    SuiteUpdate,
)
from services.db_utils import get_or_404
from services.context import get_request_context
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter, assign_workspace_fields

router = APIRouter()


@router.get("", response_model=list[SuiteOut])
async def list_suites(tag: str | None = None, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.read")
    stmt = select(BenchmarkSuite)
    stmt = apply_workspace_filter(stmt, BenchmarkSuite, ctx)
    if tag:
        stmt = stmt.where(BenchmarkSuite.tags.overlap([tag]))
    stmt = stmt.order_by(BenchmarkSuite.created_at.desc())
    result = await db.execute(stmt)
    suites = result.scalars().all()
    out = []
    for s in suites:
        count_stmt = (
            select(func.count())
            .select_from(QueryModel)
            .where(QueryModel.suite_id == s.id)
        )
        count = (await db.execute(count_stmt)).scalar() or 0
        d = SuiteOut.model_validate(s)
        d.query_count = count
        out.append(d)
    return out


@router.post("", response_model=SuiteOut, status_code=201)
async def create_suite(body: SuiteCreate, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.write")
    suite = BenchmarkSuite(
        name=body.name,
        description=body.description,
        tags=body.tags,
        visibility_scope=body.visibility_scope,
    )
    assign_workspace_fields(suite, ctx)
    db.add(suite)
    await db.commit()
    await db.refresh(suite)
    d = SuiteOut.model_validate(suite)
    d.query_count = 0
    return d


@router.get("/{suite_id}", response_model=SuiteDetailOut)
async def get_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.read")
    stmt = (
        select(BenchmarkSuite)
        .where(BenchmarkSuite.id == suite_id)
        .options(selectinload(BenchmarkSuite.queries))
    )
    stmt = apply_workspace_filter(stmt, BenchmarkSuite, ctx)
    result = await db.execute(stmt)
    suite = result.scalar_one_or_none()
    if not suite:
        raise HTTPException(404, "Suite not found")
    d = SuiteDetailOut.model_validate(suite)
    d.query_count = len(suite.queries)
    return d


@router.put("/{suite_id}", response_model=SuiteOut)
async def update_suite(
    suite_id: int, body: SuiteUpdate, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.write")
    suite = await get_or_404(db, BenchmarkSuite, suite_id, "Suite")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(suite, k, v)
    await db.commit()
    await db.refresh(suite)
    count_stmt = (
        select(func.count())
        .select_from(QueryModel)
        .where(QueryModel.suite_id == suite.id)
    )
    count = (await db.execute(count_stmt)).scalar() or 0
    d = SuiteOut.model_validate(suite)
    d.query_count = count
    return d


@router.delete("/{suite_id}", status_code=204)
async def delete_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.delete")
    suite = await get_or_404(db, BenchmarkSuite, suite_id, "Suite")
    await db.delete(suite)
    await db.commit()


@router.post("/{suite_id}/queries", response_model=QueryOut, status_code=201)
async def add_query(
    suite_id: int, body: QueryCreate, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.write")
    suite = await get_or_404(db, BenchmarkSuite, suite_id, "Suite")
    max_ord = (
        await db.execute(
            select(func.coalesce(func.max(QueryModel.ordinal), 0)).where(
                QueryModel.suite_id == suite_id
            )
        )
    ).scalar()
    q = QueryModel(
        suite_id=suite_id,
        ordinal=max_ord + 1,
        tag=body.tag,
        query_text=body.query_text,
        expected_answer=body.expected_answer,
        comments=body.comments,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return QueryOut.model_validate(q)


@router.post("/{suite_id}/import-csv", response_model=dict)
async def import_csv(
    suite_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    """Import queries from CSV. Expected columns: id, tag, query, answer, comments."""
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.write")
    suite = await get_or_404(db, BenchmarkSuite, suite_id, "Suite")

    content = (await file.read()).decode("utf-8")
    reader = csv.reader(io.StringIO(content))
    header = next(reader, None)
    if not header:
        raise HTTPException(400, "Empty CSV")

    # Delete existing queries
    existing = (
        (await db.execute(select(QueryModel).where(QueryModel.suite_id == suite_id)))
        .scalars()
        .all()
    )
    for q in existing:
        await db.delete(q)

    count = 0
    for row in reader:
        if len(row) < 4:
            continue
        q = QueryModel(
            suite_id=suite_id,
            ordinal=int(row[0]) if row[0].strip().isdigit() else count + 1,
            tag=row[1] if len(row) > 1 else None,
            query_text=row[2],
            expected_answer=row[3],
            comments=row[4] if len(row) > 4 else None,
        )
        db.add(q)
        count += 1

    await db.commit()
    return {"imported": count}


@router.post("/{suite_id}/import-csv-mapped", response_model=dict)
async def import_csv_mapped(
    suite_id: int,
    file: UploadFile = File(...),
    mapping: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Import queries from CSV with user-defined column mapping.

    mapping is a JSON string: {"query_text": "col", "expected_answer": "col", "tag": "col"|null, "comments": "col"|null}
    Unmapped columns are stored in metadata_.
    """
    ctx = get_request_context()
    await require_permission(db, ctx, "datasets.write")
    suite = await get_or_404(db, BenchmarkSuite, suite_id, "Suite")

    try:
        col_map = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid mapping JSON")

    if not col_map.get("query_text") or not col_map.get("expected_answer"):
        raise HTTPException(400, "query_text and expected_answer mappings are required")

    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(400, "Empty CSV or no header row")

    # Validate mapped columns exist in CSV
    for field in ("query_text", "expected_answer", "tag", "comments"):
        csv_col = col_map.get(field)
        if csv_col and csv_col not in reader.fieldnames:
            raise HTTPException(400, f"Column '{csv_col}' not found in CSV")

    # Delete existing queries
    existing = (
        (await db.execute(select(QueryModel).where(QueryModel.suite_id == suite_id)))
        .scalars()
        .all()
    )
    for q in existing:
        await db.delete(q)

    # Collect mapped column names to identify unmapped ones
    mapped_cols = {v for v in col_map.values() if v}

    count = 0
    for row in reader:
        query_text = row.get(col_map["query_text"], "").strip()
        expected_answer = row.get(col_map["expected_answer"], "").strip()
        if not query_text:
            continue

        tag = row.get(col_map["tag"], "").strip() if col_map.get("tag") else None
        comments = (
            row.get(col_map["comments"], "").strip() if col_map.get("comments") else None
        )

        # Collect unmapped columns into metadata
        metadata = {}
        for col_name, val in row.items():
            if col_name not in mapped_cols and val and val.strip():
                metadata[col_name] = val.strip()

        q = QueryModel(
            suite_id=suite_id,
            ordinal=count + 1,
            tag=tag or None,
            query_text=query_text,
            expected_answer=expected_answer,
            comments=comments or None,
            metadata_=metadata if metadata else None,
        )
        db.add(q)
        count += 1

    await db.commit()
    return {"imported": count}
