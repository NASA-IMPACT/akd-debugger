import ast
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import AgentConfig
from schemas.schemas import AgentCreate, AgentOut, AgentUpdate

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

    # --- Find HostedMCPTool(tool_config={...}) ---
    mcp_calls = _find_calls(tree, "HostedMCPTool")
    if mcp_calls:
        tc_node = _get_kwarg(mcp_calls[0], "tool_config")
        if tc_node:
            result["tools_config"] = _eval_literal(tc_node)

    return result


@router.post("/parse-code")
async def parse_code(body: ParseCodeRequest):
    try:
        extracted = parse_agent_code(body.code)
    except SyntaxError as e:
        raise HTTPException(400, f"Python syntax error: {e.msg} (line {e.lineno})")
    return extracted


@router.get("", response_model=list[AgentOut])
async def list_agents(tag: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(AgentConfig)
    if tag:
        stmt = stmt.where(AgentConfig.tags.overlap([tag]))
    stmt = stmt.order_by(AgentConfig.created_at.desc())
    result = await db.execute(stmt)
    return [AgentOut.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = AgentConfig(**body.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return AgentOut.model_validate(agent)


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: int, body: AgentUpdate, db: AsyncSession = Depends(get_db)
):
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(agent, k, v)
    await db.commit()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    agent = await db.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    await db.delete(agent)
    await db.commit()
