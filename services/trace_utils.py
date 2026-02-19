"""Shared utilities for trace log processing."""

from models.trace_log import TraceLog
from schemas.schemas import TraceLogOut
from services.openai_pricing import calculate_cost


def trace_to_out(trace: TraceLog) -> TraceLogOut:
    """Convert a TraceLog model to TraceLogOut schema with cost calculations.
    
    Args:
        trace: TraceLog model instance. The response_payload may be None or a 
               non-dict value; in such cases it defaults to an empty dict for 
               safe processing.
        
    Returns:
        TraceLogOut schema with calculated costs and breakdown
    """
    response_payload = trace.response_payload if isinstance(trace.response_payload, dict) else {}
    tool_calls = response_payload.get("tool_calls")
    breakdown = calculate_cost(trace.model or "", trace.usage or {}, tool_calls)
    return TraceLogOut(
        id=trace.id,
        organization_id=trace.organization_id,
        project_id=trace.project_id,
        created_by_user_id=trace.created_by_user_id,
        run_id=trace.run_id,
        query_id=trace.query_id,
        agent_config_id=trace.agent_config_id,
        conversation_id=trace.conversation_id,
        trace_type=trace.trace_type,
        provider=trace.provider,
        endpoint=trace.endpoint,
        model=trace.model,
        status=trace.status,
        request_payload=trace.request_payload,
        response_payload=trace.response_payload,
        usage=trace.usage,
        error=trace.error,
        estimated_cost_usd=breakdown.total_usd,
        cost_breakdown={
            "input_cost_usd": breakdown.input_cost_usd,
            "cached_input_cost_usd": breakdown.cached_input_cost_usd,
            "output_cost_usd": breakdown.output_cost_usd,
            "reasoning_output_cost_usd": breakdown.reasoning_output_cost_usd,
            "web_search_cost_usd": breakdown.web_search_cost_usd,
            "total_usd": breakdown.total_usd,
            "web_search_calls": breakdown.web_search_calls,
        },
        missing_model_pricing=breakdown.missing_model_pricing,
        latency_ms=trace.latency_ms,
        started_at=trace.started_at,
        completed_at=trace.completed_at,
        created_at=trace.created_at,
    )
