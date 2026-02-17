from typing import Any


def _normalize_tools_config(tc_raw: Any) -> list[dict[str, Any]]:
    if isinstance(tc_raw, list):
        return [tc for tc in tc_raw if isinstance(tc, dict)]
    if isinstance(tc_raw, dict):
        return [tc_raw]
    return []


def _build_mcp_tool_config(tc: dict[str, Any]) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "type": "mcp",
        "server_label": tc.get("server_label", "MCP Server"),
        "require_approval": tc.get("require_approval", "never"),
    }
    passthrough_keys = (
        "allowed_tools",
        "authorization",
        "connector_id",
        "headers",
        "server_description",
        "server_url",
    )
    for key in passthrough_keys:
        if key in tc and tc[key] is not None:
            cfg[key] = tc[key]

    has_server_url = bool(cfg.get("server_url"))
    has_connector = bool(cfg.get("connector_id"))
    if not has_server_url and not has_connector:
        raise ValueError(
            "Invalid MCP tool config: provide either `server_url` or "
            "`connector_id` (+ `authorization`)."
        )
    if has_connector and not cfg.get("authorization"):
        raise ValueError(
            "Invalid MCP tool config: `authorization` is required when "
            "`connector_id` is set."
        )

    return cfg


def build_openai_tools(tc_raw: Any) -> list[Any]:
    from agents import HostedMCPTool, WebSearchTool

    tools: list[Any] = []
    for tc in _normalize_tools_config(tc_raw):
        tool_type = tc.get("type")
        if tool_type == "mcp":
            tools.append(HostedMCPTool(tool_config=_build_mcp_tool_config(tc)))
            continue
        if tool_type == "web_search":
            ws_kwargs: dict[str, Any] = {}
            if tc.get("user_location"):
                ws_kwargs["user_location"] = tc["user_location"]
            if tc.get("search_context_size"):
                ws_kwargs["search_context_size"] = tc["search_context_size"]
            tools.append(WebSearchTool(**ws_kwargs))
    return tools
