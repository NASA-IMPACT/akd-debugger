import asyncio

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.run import Run
from services.context import get_request_context
from services.db_utils import get_or_404
from services.permissions import require_permission
from workers.sse_bus import sse_bus

router = APIRouter()


@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "runs.read")
    await get_or_404(db, Run, run_id, "Run")

    async def event_generator():
        q = sse_bus.subscribe(run_id)
        try:
            while True:
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=30)
                    yield {"event": event, "data": data}
                    if event == "complete" or event == "error":
                        break
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            sse_bus.unsubscribe(run_id, q)

    return EventSourceResponse(event_generator())
