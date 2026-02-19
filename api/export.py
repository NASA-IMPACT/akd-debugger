import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.grade import Grade
from models.query import Query as QueryModel
from models.result import Result
from models.run import Run
from services.analytics import compute_compare_analytics, compute_run_analytics
from services.html_export import generate_export_html
from services.context import get_request_context
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter

router = APIRouter()


@router.get("/html")
async def export_html(run_ids: str = Query(...), db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "exports.read")
    ids = [int(x.strip()) for x in run_ids.split(",") if x.strip()]
    if not ids:
        raise HTTPException(400, "At least 1 run ID required")
    html = await generate_export_html(ids, db)
    return HTMLResponse(content=html)


@router.get("/csv")
async def export_csv(run_ids: str = Query(...), db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "exports.read")
    ids = [int(x.strip()) for x in run_ids.split(",") if x.strip()]
    if not ids:
        raise HTTPException(400, "At least 1 run ID required")

    rows = []
    header = ["query_id", "tag", "query_text", "expected_answer"]

    # Load runs
    for rid in ids:
        run_stmt = apply_workspace_filter(select(Run).where(Run.id == rid), Run, ctx)
        run = (await db.execute(run_stmt)).scalar_one_or_none()
        if run:
            header.extend(
                [f"{run.label}_response", f"{run.label}_grade", f"{run.label}_time"]
            )

    rows.append(header)

    # Get all results for first run to know query order
    first_results = (
        (
            await db.execute(
                apply_workspace_filter(
                    select(Result)
                    .where(Result.run_id == ids[0])
                    .options(selectinload(Result.query), selectinload(Result.grade))
                    .order_by(Result.query_id),
                    Result,
                    ctx,
                )
            )
        )
        .scalars()
        .all()
    )

    # Build result map for all runs
    result_maps = {}
    for rid in ids:
        results = (
            (
                await db.execute(
                    apply_workspace_filter(
                        select(Result)
                        .where(Result.run_id == rid)
                        .options(selectinload(Result.grade)),
                        Result,
                        ctx,
                    )
                )
            )
            .scalars()
            .all()
        )
        result_maps[rid] = {r.query_id: r for r in results}

    for r in first_results:
        row = [
            r.query_id,
            r.query.tag or "",
            r.query.query_text,
            r.query.expected_answer,
        ]
        for rid in ids:
            rm = result_maps.get(rid, {})
            res = rm.get(r.query_id)
            if res:
                row.extend(
                    [
                        res.agent_response or "",
                        res.grade.grade if res.grade else "not_graded",
                        f"{res.execution_time_seconds:.2f}"
                        if res.execution_time_seconds
                        else "",
                    ]
                )
            else:
                row.extend(["", "not_graded", ""])
        rows.append(row)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerows(rows)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=benchmark_export.csv"},
    )


@router.get("/json")
async def export_json(run_ids: str = Query(...), db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "exports.read")
    ids = [int(x.strip()) for x in run_ids.split(",") if x.strip()]
    if not ids:
        raise HTTPException(400, "At least 1 run ID required")

    data = {"runs": []}
    for rid in ids:
        run_stmt = apply_workspace_filter(select(Run).where(Run.id == rid), Run, ctx)
        run = (await db.execute(run_stmt)).scalar_one_or_none()
        if not run:
            continue
        results = (
            (
                await db.execute(
                    apply_workspace_filter(
                        select(Result)
                        .where(Result.run_id == rid)
                        .options(selectinload(Result.query), selectinload(Result.grade))
                        .order_by(Result.query_id),
                        Result,
                        ctx,
                    )
                )
            )
            .scalars()
            .all()
        )

        run_data = {
            "id": run.id,
            "label": run.label,
            "status": run.status,
            "results": [
                {
                    "query_id": r.query_id,
                    "query_text": r.query.query_text,
                    "tag": r.query.tag,
                    "expected_answer": r.query.expected_answer,
                    "agent_response": r.agent_response,
                    "grade": r.grade.grade if r.grade else "not_graded",
                    "execution_time_seconds": r.execution_time_seconds,
                    "tool_calls": r.tool_calls,
                    "usage": r.usage,
                }
                for r in results
            ],
        }
        data["runs"].append(run_data)

    return StreamingResponse(
        io.BytesIO(json.dumps(data, indent=2).encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=benchmark_export.json"},
    )
