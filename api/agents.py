import ast
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from executors.registry import get_executor
from models.agent import AgentConfig
from models.project import Project
from models.project_membership import ProjectMembership
from models.trace_log import TraceLog
from models.user_permission_grant import UserPermissionGrant
from schemas.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentCreate,
    AgentOut,
    AgentUpdate,
    TraceLogOut,
)
from services.openai_pricing import calculate_cost
from services.trace_utils import trace_to_out
from services.db_utils import get_or_404
from services.context import WorkspaceContext, get_request_context
from services.error_format import format_exception_details
from services.openai_tools import build_openai_tools
from services.permissions import require_permission
from services.tenancy import apply_workspace_filter, assign_workspace_fields

router = APIRouter()


# ---------------------------------------------------------------------------
# AST-based Python agent code parser
# ---------------------------------------------------------------------------


class ParseCodeRequest(BaseModel):
    code: str


def _eval_literal(node):
    """Safely evaluate an AST node to a Python literal (str, int, bool, list, dict, None)."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.List):
        return [_eval_literal(el) for el in node.elts]
    if isinstance(node, ast.Dict):
        return {
            _eval_literal(k): _eval_literal(v) for k, v in zip(node.keys, node.values)
        }
    if isinstance(node, ast.Name):
        if node.id == "True":
            return True
        if node.id == "False":
            return False
        if node.id == "None":
            return None
        return f"<var:{node.id}>"
    if isinstance(node, ast.Attribute):
        # e.g. SomeEnum.value — return as string
        return (
            f"{_eval_literal(node.value)}.{node.attr}"
            if isinstance(node.value, ast.Name)
            else str(ast.dump(node))
        )
    if isinstance(node, ast.Call):
        # Handle Reasoning(effort="medium", summary="auto") etc.
        result = {}
        for kw in node.keywords:
            result[kw.arg] = _eval_literal(kw.value)
        return result
    if isinstance(node, ast.JoinedStr):
        # f-string — collect the string parts
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append(str(v.value))
            else:
                parts.append("{...}")
        return "".join(parts)
    return None


def _find_calls(tree, func_name: str) -> list[ast.Call]:
    """Find all Call nodes where the function name matches."""
    results = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        if isinstance(fn, ast.Name) and fn.id == func_name:
            results.append(node)
        elif isinstance(fn, ast.Attribute) and fn.attr == func_name:
            results.append(node)
    return results


def _get_kwarg(call_node: ast.Call, name: str):
    """Get a keyword argument value from a Call node."""
    for kw in call_node.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _resolve_var(tree, var_name: str):
    """Find top-level assignment `var_name = <value>` and return the value node."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == var_name:
                    return node.value
    return None


def parse_agent_code(code: str) -> dict:
    """Parse Python agent code using AST and extract config fields."""
    tree = ast.parse(code)
    result = {}

    # --- Find Agent(...) call ---
    agent_calls = _find_calls(tree, "Agent")
    if agent_calls:
        agent = agent_calls[0]

        # name
        name_node = _get_kwarg(agent, "name")
        if name_node:
            result["name"] = _eval_literal(name_node)

        # model
        model_node = _get_kwarg(agent, "model")
        if model_node:
            result["model"] = _eval_literal(model_node)

        # instructions / system_prompt
        instr_node = _get_kwarg(agent, "instructions")
        if instr_node:
            if isinstance(instr_node, ast.Name):
                # Variable reference — resolve it
                resolved = _resolve_var(tree, instr_node.id)
                if resolved:
                    result["system_prompt"] = _eval_literal(resolved)
            else:
                result["system_prompt"] = _eval_literal(instr_node)

        # model_settings
        ms_node = _get_kwarg(agent, "model_settings")
        if ms_node:
            result["model_settings"] = _eval_literal(ms_node)

    # --- Extract all tools ---
    tools_list = []

    # HostedMCPTool(tool_config={...})
    mcp_calls = _find_calls(tree, "HostedMCPTool")
    for call in mcp_calls:
        tc_node = _get_kwarg(call, "tool_config")
        if tc_node:
            tools_list.append(_eval_literal(tc_node))

    # WebSearchTool(user_location={...}, search_context_size="...")
    ws_calls = _find_calls(tree, "WebSearchTool")
    for call in ws_calls:
        ws_config: dict = {"type": "web_search"}
        loc_node = _get_kwarg(call, "user_location")
        if loc_node:
            ws_config["user_location"] = _eval_literal(loc_node)
        ctx_node = _get_kwarg(call, "search_context_size")
        if ctx_node:
            ws_config["search_context_size"] = _eval_literal(ctx_node)
        tools_list.append(ws_config)

    if tools_list:
        result["tools_config"] = tools_list

    return result


def _usage_to_dict(usage) -> dict | None:
    if usage is None:
        return None
    try:
        return {
            "requests": getattr(usage, "requests", 1),
            "input_tokens": getattr(usage, "input_tokens", 0),
            "output_tokens": getattr(usage, "output_tokens", 0),
            "total_tokens": getattr(usage, "total_tokens", 0),
            "reasoning_tokens": getattr(
                getattr(usage, "output_tokens_details", None), "reasoning_tokens", 0
            ),
            "cached_tokens": getattr(
                getattr(usage, "input_tokens_details", None), "cached_tokens", 0
            ),
        }
    except Exception:
        return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_project_import_context(
    db: AsyncSession,
    ctx: WorkspaceContext,
    source_project_id: int,
) -> WorkspaceContext:
    project = await db.get(Project, source_project_id)
    if not project or project.organization_id != ctx.organization_id:
        raise HTTPException(404, "Source project not found in organization")

    membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.organization_id == ctx.organization_id,
                ProjectMembership.project_id == source_project_id,
                ProjectMembership.user_id == ctx.user.id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if not membership and not ctx.is_org_admin:
        grant_stmt = select(UserPermissionGrant.id).where(
            UserPermissionGrant.organization_id == ctx.organization_id,
            UserPermissionGrant.user_id == ctx.user.id,
            or_(
                UserPermissionGrant.project_id.is_(None),
                UserPermissionGrant.project_id == source_project_id,
            ),
            or_(
                UserPermissionGrant.expires_at.is_(None),
                UserPermissionGrant.expires_at > _utcnow(),
            ),
        )
        has_any_grant = (
            await db.execute(grant_stmt.limit(1))
        ).scalar_one_or_none() is not None
        if not has_any_grant:
            raise HTTPException(403, "You are not a member of the source project")

    return WorkspaceContext(
        user=ctx.user,
        organization_id=ctx.organization_id,
        project_id=source_project_id,
        organization_membership=ctx.organization_membership,
        project_membership=membership,
        is_org_admin=ctx.is_org_admin,
    )


@router.post("/parse-code")
async def parse_code(body: ParseCodeRequest):
    try:
        extracted = parse_agent_code(body.code)
    except SyntaxError as e:
        raise HTTPException(400, f"Python syntax error: {e.msg} (line {e.lineno})")
    return extracted


@router.get("", response_model=list[AgentOut])
async def list_agents(tag: str | None = None, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.read")
    stmt = select(AgentConfig)
    stmt = apply_workspace_filter(stmt, AgentConfig, ctx)
    if tag:
        stmt = stmt.where(AgentConfig.tags.overlap([tag]))
    stmt = stmt.order_by(AgentConfig.created_at.desc())
    result = await db.execute(stmt)
    return [AgentOut.model_validate(a) for a in result.scalars().all()]


@router.get("/importable", response_model=list[AgentOut])
async def list_importable_agents(
    source_project_id: int,
    tag: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    source_ctx = await _resolve_project_import_context(db, ctx, source_project_id)
    await require_permission(db, source_ctx, "agents.read")

    stmt = select(AgentConfig).where(
        AgentConfig.organization_id == ctx.organization_id,
        AgentConfig.project_id == source_project_id,
    )
    if tag:
        stmt = stmt.where(AgentConfig.tags.overlap([tag]))
    stmt = stmt.order_by(AgentConfig.created_at.desc())
    result = await db.execute(stmt)
    return [AgentOut.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.write")
    agent = AgentConfig(**body.model_dump())
    assign_workspace_fields(agent, ctx)
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.post("/{agent_id}/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    agent_id: int, body: AgentChatRequest, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.read")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    if not body.messages:
        raise HTTPException(400, "messages cannot be empty")

    executor = get_executor(agent.executor_type)
    config = {
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools_config": agent.tools_config,
        "model_settings": agent.model_settings,
    }

    started_at = datetime.now(timezone.utc)
    trace = TraceLog(
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        created_by_user_id=ctx.user.id,
        run_id=None,
        query_id=None,
        agent_config_id=agent.id,
        conversation_id=body.conversation_id,
        trace_type="chat",
        provider="openai",
        endpoint="agents.chat.run",
        model=agent.model,
        status="started",
        started_at=started_at,
        request_payload={"messages": [m.model_dump() for m in body.messages]},
    )
    db.add(trace)
    await db.flush()

    exec_result = await executor.execute_chat(
        [m.model_dump() for m in body.messages], config
    )
    completed_at = datetime.now(timezone.utc)
    trace.completed_at = completed_at
    trace.latency_ms = int((completed_at - started_at).total_seconds() * 1000)
    trace.status = "failed" if exec_result.error else "completed"
    trace.error = exec_result.error
    trace.usage = exec_result.usage or None
    trace.response_payload = {
        "response": exec_result.response,
        "tool_calls": exec_result.tool_calls,
        "reasoning": exec_result.reasoning,
    }
    breakdown = calculate_cost(agent.model or "", exec_result.usage or {}, exec_result.tool_calls)
    await db.commit()
    await db.refresh(trace)
    return AgentChatResponse(
        assistant_message=exec_result.response if not exec_result.error else None,
        tool_calls=exec_result.tool_calls or None,
        reasoning=exec_result.reasoning or None,
        usage=exec_result.usage or None,
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
        execution_time_seconds=exec_result.execution_time_seconds,
        trace_log_id=trace.id,
        error=exec_result.error,
    )


@router.post("/{agent_id}/chat/stream")
async def chat_with_agent_stream(
    agent_id: int, body: AgentChatRequest, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.read")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    if not body.messages:
        raise HTTPException(400, "messages cannot be empty")
    if agent.executor_type != "openai_agents":
        raise HTTPException(400, "Streaming chat is only supported for openai_agents")

    from agents import (
        Agent,
        ModelSettings,
        RunConfig,
        Runner,
    )
    from openai.types.shared.reasoning import Reasoning

    try:
        tools = build_openai_tools(agent.tools_config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ms_raw = agent.model_settings or {}
    ms_kwargs = {}
    if ms_raw.get("store") is not None:
        ms_kwargs["store"] = ms_raw["store"]
    if ms_raw.get("reasoning"):
        r = ms_raw["reasoning"]
        ms_kwargs["reasoning"] = Reasoning(
            effort=r.get("effort", "medium"),
            summary=r.get("summary", "auto"),
        )
    model_settings = ModelSettings(**ms_kwargs) if ms_kwargs else ModelSettings()
    stream_agent = Agent(
        name="Benchmark Agent",
        instructions=agent.system_prompt or "",
        model=agent.model,
        tools=tools,
        model_settings=model_settings,
    )

    conversation = []
    for message in body.messages:
        role = message.role
        text = message.content
        if not text.strip():
            continue
        content_type = "input_text" if role == "user" else "output_text"
        conversation.append(
            {"role": role, "content": [{"type": content_type, "text": text}]}
        )
    if not conversation:
        raise HTTPException(400, "messages cannot be empty")

    started_at = datetime.now(timezone.utc)
    trace = TraceLog(
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        created_by_user_id=ctx.user.id,
        run_id=None,
        query_id=None,
        agent_config_id=agent.id,
        conversation_id=body.conversation_id,
        trace_type="chat",
        provider="openai",
        endpoint="agents.chat.stream",
        model=agent.model,
        status="started",
        started_at=started_at,
        request_payload={"messages": [m.model_dump() for m in body.messages]},
    )
    db.add(trace)
    await db.commit()
    await db.refresh(trace)

    async def event_stream():
        full_text = ""
        message_output_chunks: list[str] = []
        reasoning_chunks: list[str] = []
        tool_calls: list[dict] = []
        usage_dict: dict | None = None
        stream = Runner.run_streamed(
            stream_agent,
            input=conversation,
            run_config=RunConfig(trace_metadata={"__trace_source__": "axiom"}),
        )
        try:
            async for event in stream.stream_events():
                if event.type == "raw_response_event":
                    data = event.data
                    dtype = getattr(data, "type", "")
                    if dtype == "response.output_text.delta":
                        delta = getattr(data, "delta", "")
                        if delta:
                            full_text += delta
                            yield f"event: text_delta\ndata: {json.dumps({'delta': delta})}\n\n"
                    elif dtype == "response.output_text.done":
                        text_done = getattr(data, "text", "")
                        if text_done:
                            message_output_chunks.append(str(text_done))
                    elif dtype == "response.reasoning_summary_text.delta":
                        delta = getattr(data, "delta", "")
                        if delta:
                            reasoning_chunks.append(delta)
                            yield f"event: reasoning_delta\ndata: {json.dumps({'delta': delta})}\n\n"
                    elif dtype == "response.completed":
                        response = getattr(data, "response", None)
                        usage_dict = _usage_to_dict(getattr(response, "usage", None))

                elif event.type == "run_item_stream_event":
                    name = event.name
                    if name == "message_output_created":
                        item = event.item
                        raw = getattr(item, "raw_item", None)
                        content_items = getattr(raw, "content", None)
                        if content_items:
                            for c in content_items:
                                ctype = getattr(c, "type", "")
                                if ctype in ("output_text", "refusal"):
                                    text_val = getattr(c, "text", None) or getattr(
                                        c, "refusal", None
                                    )
                                    if text_val:
                                        message_output_chunks.append(str(text_val))
                    elif name == "reasoning_item_created":
                        item = event.item
                        raw = getattr(item, "raw_item", None)
                        summary = getattr(raw, "summary", None)
                        if summary:
                            parts: list[str] = []
                            for s in summary:
                                text = getattr(s, "text", None)
                                if text:
                                    parts.append(str(text))
                            if parts:
                                yield f"event: reasoning_delta\ndata: {json.dumps({'delta': ''.join(parts)})}\n\n"
                    elif name in ("tool_called", "tool_output"):
                        item = event.item
                        raw = getattr(item, "raw_item", None)
                        entry = {
                            "name": getattr(raw, "name", "tool"),
                            "arguments": getattr(raw, "arguments", "{}"),
                        }
                        output = getattr(raw, "output", None)
                        if output:
                            entry["response"] = output
                        if name == "tool_called":
                            tool_calls.append(entry)
                        elif name == "tool_output" and tool_calls:
                            tool_calls[-1]["response"] = entry.get("response")
                        yield f"event: tool_call\ndata: {json.dumps({'name': entry['name'], 'status': name})}\n\n"

            final_text = (
                stream.final_output_as(str)
                or full_text
                or "".join(message_output_chunks).strip()
            )
            if not final_text:
                final_text = "No assistant text was returned."
            if usage_dict is None:
                usage_dict = {}
            reasoning_payload = [{"summary": ["".join(reasoning_chunks)]}] if reasoning_chunks else []
            breakdown = calculate_cost(agent.model or "", usage_dict, tool_calls)

            completed_at = datetime.now(timezone.utc)
            trace.completed_at = completed_at
            trace.latency_ms = int((completed_at - started_at).total_seconds() * 1000)
            trace.status = "completed"
            trace.error = None
            trace.usage = usage_dict or None
            trace.response_payload = {
                "response": final_text,
                "tool_calls": tool_calls,
                "reasoning": reasoning_payload,
            }
            await db.commit()

            done_payload = {
                "assistant_message": final_text,
                "tool_calls": tool_calls,
                "reasoning": reasoning_payload,
                "usage": usage_dict,
                "estimated_cost_usd": breakdown.total_usd,
                "cost_breakdown": {
                    "input_cost_usd": breakdown.input_cost_usd,
                    "cached_input_cost_usd": breakdown.cached_input_cost_usd,
                    "output_cost_usd": breakdown.output_cost_usd,
                    "reasoning_output_cost_usd": breakdown.reasoning_output_cost_usd,
                    "web_search_cost_usd": breakdown.web_search_cost_usd,
                    "total_usd": breakdown.total_usd,
                    "web_search_calls": breakdown.web_search_calls,
                },
                "missing_model_pricing": breakdown.missing_model_pricing,
                "trace_log_id": trace.id,
            }
            yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"
        except Exception as exc:
            completed_at = datetime.now(timezone.utc)
            trace.completed_at = completed_at
            trace.latency_ms = int((completed_at - started_at).total_seconds() * 1000)
            trace.status = "failed"
            formatted_error = format_exception_details(exc)
            trace.error = formatted_error
            trace.response_payload = {
                "response": full_text,
                "tool_calls": tool_calls,
                "reasoning": [{"summary": ["".join(reasoning_chunks)]}] if reasoning_chunks else [],
            }
            await db.commit()
            yield f"event: error\ndata: {json.dumps({'error': formatted_error, 'trace_log_id': trace.id})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{agent_id}/traces", response_model=list[TraceLogOut])
async def list_agent_traces(
    agent_id: int,
    status: str | None = None,
    trace_type: str | None = None,
    run_id: int | None = None,
    conversation_id: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    await require_permission(db, ctx, "traces.read")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    q = min(max(limit, 1), 1000)
    stmt = select(TraceLog).where(TraceLog.agent_config_id == agent_id)
    stmt = apply_workspace_filter(stmt, TraceLog, ctx)
    if status:
        stmt = stmt.where(TraceLog.status == status)
    if trace_type:
        stmt = stmt.where(TraceLog.trace_type == trace_type)
    if run_id is not None:
        stmt = stmt.where(TraceLog.run_id == run_id)
    if conversation_id:
        stmt = stmt.where(TraceLog.conversation_id == conversation_id)
    stmt = stmt.order_by(TraceLog.created_at.desc()).limit(q)
    rows = (await db.execute(stmt)).scalars().all()
    return [trace_to_out(trace) for trace in rows]


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.read")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    return AgentOut.model_validate(agent)


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: int, body: AgentUpdate, db: AsyncSession = Depends(get_db)
):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.write")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(agent, k, v)
    await db.commit()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "agents.delete")
    agent = await get_or_404(db, AgentConfig, agent_id, "Agent")
    await db.delete(agent)
    await db.commit()
