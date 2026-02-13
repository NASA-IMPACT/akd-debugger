import time
from typing import Any

from executors.base import AgentExecutor, ExecutionResult


class OpenAIAgentsExecutor(AgentExecutor):
    @staticmethod
    def executor_type() -> str:
        return "openai_agents"

    async def _execute_conversation(
        self, conversation: list[dict], config: dict
    ) -> ExecutionResult:
        from agents import (
            Agent,
            HostedMCPTool,
            ModelSettings,
            RunConfig,
            Runner,
            WebSearchTool,
        )
        from agents.items import ReasoningItem, ToolCallItem
        from openai.types.shared.reasoning import Reasoning

        start = time.time()
        try:
            # Build tools
            tools = []
            tc_raw = config.get("tools_config")
            # Normalise to list (legacy single-dict format still supported)
            tc_list: list[dict] = []
            if isinstance(tc_raw, list):
                tc_list = tc_raw
            elif isinstance(tc_raw, dict):
                tc_list = [tc_raw]

            for tc in tc_list:
                if not isinstance(tc, dict):
                    continue
                tool_type = tc.get("type")
                if tool_type == "mcp":
                    tools.append(
                        HostedMCPTool(
                            tool_config={
                                "type": "mcp",
                                "server_label": tc.get(
                                    "server_label", "MCP Server"
                                ),
                                "allowed_tools": tc.get("allowed_tools", []),
                                "require_approval": "never",
                                "server_url": tc.get("server_url", ""),
                            }
                        )
                    )
                elif tool_type == "web_search":
                    ws_kwargs: dict = {}
                    if tc.get("user_location"):
                        ws_kwargs["user_location"] = tc["user_location"]
                    if tc.get("search_context_size"):
                        ws_kwargs["search_context_size"] = tc[
                            "search_context_size"
                        ]
                    tools.append(WebSearchTool(**ws_kwargs))

            # Build model settings
            ms_raw = config.get("model_settings", {}) or {}
            ms_kwargs: dict[str, Any] = {}
            if ms_raw.get("store") is not None:
                ms_kwargs["store"] = ms_raw["store"]
            if ms_raw.get("reasoning"):
                r = ms_raw["reasoning"]
                ms_kwargs["reasoning"] = Reasoning(
                    effort=r.get("effort", "medium"),
                    summary=r.get("summary", "auto"),
                )
            model_settings = (
                ModelSettings(**ms_kwargs) if ms_kwargs else ModelSettings()
            )

            agent = Agent(
                name="Benchmark Agent",
                instructions=config.get("system_prompt") or "",
                model=config.get("model", "gpt-4o"),
                tools=tools,
                model_settings=model_settings,
            )

            result = await Runner.run(
                agent,
                input=conversation,
                run_config=RunConfig(trace_metadata={"__trace_source__": "axiom"}),
            )

            elapsed = time.time() - start
            response = result.final_output_as(str) or ""

            # Extract tool calls and reasoning
            tool_calls = []
            reasoning = []
            for item in result.new_items:
                if isinstance(item, ToolCallItem):
                    raw = item.raw_item
                    raw_type = getattr(raw, "type", "")

                    if raw_type == "web_search_call":
                        # Web search item — extract action details
                        action = getattr(raw, "action", None)
                        tc_entry: dict[str, Any] = {
                            "type": "web_search",
                            "name": "web_search",
                            "status": getattr(raw, "status", ""),
                        }
                        if action:
                            action_type = getattr(action, "type", "")
                            tc_entry["action_type"] = action_type
                            if action_type == "search":
                                tc_entry["query"] = getattr(
                                    action, "query", ""
                                )
                                sources = getattr(action, "sources", None)
                                if sources:
                                    tc_entry["sources"] = [
                                        {
                                            "url": getattr(s, "url", ""),
                                        }
                                        for s in sources
                                    ]
                            elif action_type in ("open_page", "find_in_page"):
                                tc_entry["url"] = getattr(
                                    action, "url", ""
                                )
                                if action_type == "find_in_page":
                                    tc_entry["pattern"] = getattr(
                                        action, "pattern", ""
                                    )
                        tool_calls.append(tc_entry)
                    else:
                        # MCP / function tool call
                        tc_entry = {
                            "name": getattr(raw, "name", "unknown"),
                            "arguments": getattr(raw, "arguments", "{}"),
                        }
                        if hasattr(raw, "output") and raw.output:
                            tc_entry["response"] = raw.output
                        elif hasattr(raw, "content"):
                            tc_entry["response"] = str(raw.content)
                        tool_calls.append(tc_entry)
                elif isinstance(item, ReasoningItem):
                    raw = item.raw_item
                    r_entry = {}
                    if hasattr(raw, "summary") and raw.summary:
                        r_entry["summary"] = [
                            s.text if hasattr(s, "text") else str(s)
                            for s in raw.summary
                        ]
                    if hasattr(raw, "content") and raw.content:
                        r_entry["content"] = [
                            c.text if hasattr(c, "text") else str(c)
                            for c in raw.content
                        ]
                    if r_entry:
                        reasoning.append(r_entry)

            # Extract usage
            usage = result.context_wrapper.usage
            usage_dict = {
                "requests": usage.requests,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "total_tokens": usage.total_tokens,
                "reasoning_tokens": usage.output_tokens_details.reasoning_tokens
                if usage.output_tokens_details
                else 0,
                "cached_tokens": usage.input_tokens_details.cached_tokens
                if usage.input_tokens_details
                else 0,
            }

            return ExecutionResult(
                response=response,
                tool_calls=tool_calls,
                reasoning=reasoning,
                usage=usage_dict,
                execution_time_seconds=round(elapsed, 2),
            )

        except Exception as e:
            elapsed = time.time() - start
            return ExecutionResult(
                error=str(e),
                execution_time_seconds=round(elapsed, 2),
            )

    async def execute(self, query: str, config: dict) -> ExecutionResult:
        conversation = [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": query}],
            }
        ]
        return await self._execute_conversation(conversation, config)

    async def execute_chat(self, messages: list[dict], config: dict) -> ExecutionResult:
        conversation: list[dict] = []
        for message in messages:
            role = str(message.get("role", "user"))
            content = str(message.get("content", ""))
            if not content.strip():
                continue
            content_type = "input_text" if role == "user" else "output_text"
            conversation.append(
                {
                    "role": role,
                    "content": [{"type": content_type, "text": content}],
                }
            )
        if not conversation:
            return ExecutionResult(error="No chat messages provided")
        return await self._execute_conversation(conversation, config)
