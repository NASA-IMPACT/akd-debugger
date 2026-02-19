import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import async_session
from executors.registry import get_executor
from models.agent import AgentConfig
from models.app_notification import AppNotification
from models.query import Query
from models.result import Result
from models.run import Run
from models.trace_log import TraceLog
from workers.sse_bus import sse_bus

# Global semaphore: max 3 concurrent runs
_run_semaphore = asyncio.Semaphore(3)


async def _create_run_notification(
    db,
    *,
    organization_id: int,
    project_id: int | None,
    user_id: int | None,
    run_id: int,
    label: str | None,
    status: str,
    error_message: str | None = None,
):
    run_label = label or f"Run #{run_id}"
    if status == "completed":
        title = "Background run completed"
        message = f"{run_label} finished successfully."
        notif_type = "run_completed"
    elif status == "cancelled":
        title = "Background run cancelled"
        message = f"{run_label} was cancelled."
        notif_type = "run_cancelled"
    else:
        title = "Background run failed"
        suffix = f" Error: {error_message}" if error_message else ""
        message = f"{run_label} failed.{suffix}"
        notif_type = "run_failed"

    db.add(
        AppNotification(
            organization_id=organization_id,
            project_id=project_id,
            user_id=user_id,
            notif_type=notif_type,
            title=title,
            message=message,
            related_id=run_id,
        )
    )


async def execute_run(run_id: int, query_ids: list[int], batch_size: int):
    """Background job: execute benchmark run."""
    logger.info(
        f"Starting run {run_id} with {len(query_ids)} queries (batch={batch_size})"
    )
    try:
        async with _run_semaphore:
            await _execute_run_inner(run_id, query_ids, batch_size)
    except Exception as e:
        logger.exception(f"Run {run_id} failed with unhandled error: {e}")
        try:
            async with async_session() as db:
                run = await db.get(Run, run_id)
                if run and run.status in ("pending", "running"):
                    run.status = "failed"
                    run.error_message = str(e)
                    run.completed_at = datetime.now(timezone.utc)
                    await _create_run_notification(
                        db,
                        organization_id=run.organization_id,
                        project_id=run.project_id,
                        user_id=run.created_by_user_id,
                        run_id=run.id,
                        label=run.label,
                        status="failed",
                        error_message=str(e),
                    )
                    await db.commit()
                await sse_bus.publish(
                    run_id, "complete", {"status": "failed", "error": str(e)}
                )
        except Exception:
            logger.exception(f"Failed to update run {run_id} status after error")


async def _execute_run_inner(run_id: int, query_ids: list[int], batch_size: int):
    async with async_session() as db:
        run = await db.get(Run, run_id)
        if not run:
            logger.error(f"Run {run_id} not found")
            return

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await db.commit()

        # Create output directory
        output_dir = None
        if run.output_dir:
            output_dir = Path(run.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            json_dir = output_dir / "json"
            json_dir.mkdir(exist_ok=True)

        await sse_bus.publish(run_id, "status", {"status": "running"})

        # Load agent config
        agent_config = await db.get(AgentConfig, run.agent_config_id)
        if not agent_config:
            run.status = "failed"
            run.error_message = "Agent config not found"
            run.completed_at = datetime.now(timezone.utc)
            await _create_run_notification(
                db,
                organization_id=run.organization_id,
                project_id=run.project_id,
                user_id=run.created_by_user_id,
                run_id=run.id,
                label=run.label,
                status="failed",
                error_message=run.error_message,
            )
            await db.commit()
            await sse_bus.publish(
                run_id, "error", {"message": "Agent config not found"}
            )
            return

        executor = get_executor(agent_config.executor_type)
        exec_config = {
            "system_prompt": agent_config.system_prompt,
            "model": agent_config.model,
            "tools_config": agent_config.tools_config,
            "model_settings": agent_config.model_settings,
        }

        # Load queries
        stmt = select(Query).where(Query.id.in_(query_ids)).order_by(Query.ordinal)
        queries = (await db.execute(stmt)).scalars().all()

        # Process in batches
        for i in range(0, len(queries), batch_size):
            # Check for cancellation
            await db.refresh(run)
            if run.status == "cancelled":
                await _create_run_notification(
                    db,
                    organization_id=run.organization_id,
                    project_id=run.project_id,
                    user_id=run.created_by_user_id,
                    run_id=run.id,
                    label=run.label,
                    status="cancelled",
                )
                await db.commit()
                await sse_bus.publish(run_id, "complete", {"status": "cancelled"})
                return

            batch = queries[i : i + batch_size]
            tasks = [
                _execute_single(
                    executor,
                    q,
                    exec_config,
                    run_id,
                    run.agent_config_id,
                    run.organization_id,
                    run.project_id,
                    run.created_by_user_id,
                    db,
                )
                for q in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for q, res in zip(batch, results):
                if isinstance(res, Exception):
                    result = Result(
                        organization_id=run.organization_id,
                        project_id=run.project_id,
                        created_by_user_id=run.created_by_user_id,
                        visibility_scope=run.visibility_scope,
                        run_id=run_id,
                        query_id=q.id,
                        error=str(res),
                        execution_time_seconds=0,
                    )
                else:
                    result = res
                db.add(result)

                run.progress_current += 1
                await db.commit()

                # Save JSON file to output directory
                if output_dir:
                    _save_result_json(
                        output_dir / "json" / f"{q.ordinal}.json", q, result
                    )

                status = "OK" if result.error is None else f"ERR: {result.error[:80]}"
                logger.info(
                    f"Run {run_id} Q{q.ordinal} [{run.progress_current}/{run.progress_total}] {status}"
                )

                # Publish SSE
                await sse_bus.publish(
                    run_id,
                    "progress",
                    {
                        "current": run.progress_current,
                        "total": run.progress_total,
                        "query_id": q.id,
                        "query_ordinal": q.ordinal,
                        "query_text": q.query_text[:100],
                        "success": result.error is None,
                        "time": result.execution_time_seconds,
                    },
                )

        # Mark complete
        await db.refresh(run)
        if run.status == "running":
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            await _create_run_notification(
                db,
                organization_id=run.organization_id,
                project_id=run.project_id,
                user_id=run.created_by_user_id,
                run_id=run.id,
                label=run.label,
                status="completed",
            )
            await db.commit()

        await sse_bus.publish(
            run_id,
            "complete",
            {
                "status": run.status,
                "current": run.progress_current,
                "total": run.progress_total,
            },
        )


def _save_result_json(filepath: Path, query: Query, result: Result):
    """Save result as JSON file matching the existing json/ folder format."""
    data = {
        "id": str(query.ordinal),
        "query": query.query_text,
        "expected_answer": query.expected_answer,
        "agent_response": result.agent_response or "",
        "tool_calls": result.tool_calls or [],
        "reasoning": result.reasoning or [],
        "usage": result.usage or {},
        "execution_time_seconds": result.execution_time_seconds or 0,
    }
    if result.error:
        data["error"] = result.error
    try:
        filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception as e:
        logger.warning(f"Failed to write JSON to {filepath}: {e}")


async def _execute_single(
    executor,
    query: Query,
    config: dict,
    run_id: int,
    agent_config_id: int,
    organization_id: int,
    project_id: int,
    created_by_user_id: int | None,
    db,
) -> Result:
    started_at = datetime.now(timezone.utc)
    trace = TraceLog(
        organization_id=organization_id,
        project_id=project_id,
        created_by_user_id=created_by_user_id,
        run_id=run_id,
        query_id=query.id,
        agent_config_id=agent_config_id,
        trace_type="benchmark",
        provider="openai",
        endpoint="agents.runner.run",
        model=config.get("model"),
        status="started",
        started_at=started_at,
        request_payload={
            "query": query.query_text,
            "system_prompt": config.get("system_prompt"),
            "model": config.get("model"),
            "tools_config": config.get("tools_config"),
            "model_settings": config.get("model_settings"),
        },
    )
    db.add(trace)
    await db.flush()

    exec_result = await executor.execute(query.query_text, config)
    completed_at = datetime.now(timezone.utc)
    latency_ms = int((completed_at - started_at).total_seconds() * 1000)

    trace.response_payload = {
        "response": exec_result.response,
        "tool_calls": exec_result.tool_calls,
        "reasoning": exec_result.reasoning,
    }
    trace.usage = exec_result.usage or None
    trace.error = exec_result.error
    trace.status = "failed" if exec_result.error else "completed"
    trace.completed_at = completed_at
    trace.latency_ms = latency_ms

    return Result(
        organization_id=organization_id,
        project_id=project_id,
        created_by_user_id=created_by_user_id,
        visibility_scope="project",
        run_id=run_id,
        query_id=query.id,
        trace_log_id=trace.id,
        agent_response=exec_result.response if not exec_result.error else None,
        tool_calls=exec_result.tool_calls or None,
        reasoning=exec_result.reasoning or None,
        usage=exec_result.usage or None,
        execution_time_seconds=exec_result.execution_time_seconds,
        error=exec_result.error,
    )
