import asyncio

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from workers.sse_bus import sse_bus

router = APIRouter()


@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: int):
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
