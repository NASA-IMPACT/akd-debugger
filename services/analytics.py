import math
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.query import Query
from models.result import Result
from models.run import Run
from models.agent import AgentConfig
from schemas.schemas import (
    CompareAnalyticsOut,
    GradeCountsOut,
    RunAnalyticsOut,
    StatsOut,
)
from services.openai_pricing import calculate_cost, get_rate_card


def _compute_stats(values: list[float]) -> StatsOut:
    if not values:
        return StatsOut()
    n = len(values)
    mean = sum(values) / n
    s = sorted(values)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    variance = sum((x - mean) ** 2 for x in values) / n
    std = math.sqrt(variance)
    return StatsOut(
        mean=round(mean, 2),
        median=round(median, 2),
        std=round(std, 2),
        min=round(min(values), 2),
        max=round(max(values), 2),
        n=n,
    )


def _grade_counts(grades: list[str]) -> GradeCountsOut:
    c = p = w = 0
    for g in grades:
        if g == "correct":
            c += 1
        elif g == "partial":
            p += 1
        elif g == "wrong":
            w += 1
    total = c + p + w
    acc = round(c / total * 100, 1) if total else 0
    score = round((c + 0.5 * p) / total * 100, 1) if total else 0
    return GradeCountsOut(
        correct=c, partial=p, wrong=w, total=total, accuracy=acc, weighted_score=score
    )


async def compute_run_analytics(run_id: int, db: AsyncSession) -> RunAnalyticsOut:
    run = await db.get(Run, run_id)
    if not run:
        raise ValueError("Run not found")
    agent = await db.get(AgentConfig, run.agent_config_id)
    model = agent.model if agent else ""

    results = (
        (
            await db.execute(
                select(Result)
                .where(Result.run_id == run_id)
                .options(selectinload(Result.grade), selectinload(Result.query))
            )
        )
        .scalars()
        .all()
    )

    grades = [r.grade.grade for r in results if r.grade]
    grade_counts = _grade_counts(grades)

    # By query type
    by_type: dict[str, list[str]] = {}
    for r in results:
        qt = r.query.tag or "unknown"
        if qt not in by_type:
            by_type[qt] = []
        if r.grade:
            by_type[qt].append(r.grade.grade)
    by_type_out = {qt: _grade_counts(gs) for qt, gs in by_type.items()}

    # Performance
    times = [
        r.execution_time_seconds
        for r in results
        if r.execution_time_seconds is not None
    ]
    tokens = [r.usage.get("total_tokens", 0) for r in results if r.usage]
    tool_counts = [len(r.tool_calls) if r.tool_calls else 0 for r in results]
    reasoning = [
        r.usage.get("reasoning_tokens", 0)
        for r in results
        if r.usage and r.usage.get("reasoning_tokens")
    ]

    perf = {
        "time": _compute_stats(times),
        "tokens": _compute_stats([float(t) for t in tokens]),
        "tools": _compute_stats([float(t) for t in tool_counts]),
        "reasoning": _compute_stats([float(r) for r in reasoning]),
    }

    # Tool usage
    tool_counter: Counter = Counter()
    for r in results:
        if r.tool_calls:
            for tc in r.tool_calls:
                tool_counter[tc.get("name", "unknown")] += 1

    # Cost summary + per-query cost breakdown
    cost_totals = {
        "total_cost_usd": 0.0,
        "input_cost_usd": 0.0,
        "cached_input_cost_usd": 0.0,
        "output_cost_usd": 0.0,
        "reasoning_output_cost_usd": 0.0,
        "web_search_cost_usd": 0.0,
        "web_search_calls": 0,
        "input_tokens": 0,
        "cached_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
    }
    query_costs: list[dict] = []
    for r in results:
        b = calculate_cost(model, r.usage or {}, r.tool_calls if isinstance(r.tool_calls, list) else None)
        cost_totals["total_cost_usd"] += b.total_usd
        cost_totals["input_cost_usd"] += b.input_cost_usd
        cost_totals["cached_input_cost_usd"] += b.cached_input_cost_usd
        cost_totals["output_cost_usd"] += b.output_cost_usd
        cost_totals["reasoning_output_cost_usd"] += b.reasoning_output_cost_usd
        cost_totals["web_search_cost_usd"] += b.web_search_cost_usd
        cost_totals["web_search_calls"] += b.web_search_calls
        cost_totals["input_tokens"] += int(b.usage.get("input_tokens", 0) or 0)
        cost_totals["cached_tokens"] += int(b.usage.get("cached_tokens", 0) or 0)
        cost_totals["output_tokens"] += int(b.usage.get("output_tokens", 0) or 0)
        cost_totals["reasoning_tokens"] += int(b.usage.get("reasoning_tokens", 0) or 0)

        query_costs.append(
            {
                "query_id": r.query_id,
                "ordinal": r.query.ordinal if r.query else 0,
                "query_text": (r.query.query_text[:120] if r.query and r.query.query_text else ""),
                "total_cost_usd": round(b.total_usd, 6),
                "input_cost_usd": round(b.input_cost_usd, 6),
                "cached_input_cost_usd": round(b.cached_input_cost_usd, 6),
                "output_cost_usd": round(b.output_cost_usd, 6),
                "reasoning_output_cost_usd": round(b.reasoning_output_cost_usd, 6),
                "web_search_cost_usd": round(b.web_search_cost_usd, 6),
                "web_search_calls": b.web_search_calls,
                "usage": b.usage,
            }
        )
    query_costs.sort(key=lambda x: x["ordinal"])
    cost_totals = {
        k: (round(v, 6) if isinstance(v, float) else v)
        for k, v in cost_totals.items()
    }

    return RunAnalyticsOut(
        run_id=run_id,
        label=run.label,
        grade_counts=grade_counts,
        by_type=by_type_out,
        performance=perf,
        tool_usage=dict(tool_counter),
        pricing_rates=get_rate_card(model),
        cost_summary=cost_totals,
        query_costs=query_costs,
    )


async def compute_compare_analytics(
    run_ids: list[int], db: AsyncSession
) -> CompareAnalyticsOut:
    runs_analytics = []
    for rid in run_ids:
        try:
            analytics = await compute_run_analytics(rid, db)
            runs_analytics.append(analytics)
        except ValueError:
            pass

    # Consistency across runs — per query
    # Load all results keyed by query_id
    all_grades_by_query: dict[int, list[str]] = {}
    for rid in run_ids:
        results = (
            (
                await db.execute(
                    select(Result)
                    .where(Result.run_id == rid)
                    .options(selectinload(Result.grade))
                )
            )
            .scalars()
            .all()
        )
        for r in results:
            if r.grade:
                all_grades_by_query.setdefault(r.query_id, []).append(r.grade.grade)

    consistency = {
        "all_correct": 0,
        "all_wrong": 0,
        "all_partial": 0,
        "inconsistent": 0,
    }
    for qid, gs in all_grades_by_query.items():
        if len(gs) < 2:
            continue
        s = set(gs)
        if s == {"correct"}:
            consistency["all_correct"] += 1
        elif s == {"wrong"}:
            consistency["all_wrong"] += 1
        elif s == {"partial"}:
            consistency["all_partial"] += 1
        else:
            consistency["inconsistent"] += 1

    return CompareAnalyticsOut(runs=runs_analytics, consistency=consistency)
