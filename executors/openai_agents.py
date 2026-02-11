import time
from typing import Any

from executors.base import AgentExecutor, ExecutionResult


class OpenAIAgentsExecutor(AgentExecutor):
    @staticmethod
    def executor_type() -> str:
        return "openai_agents"

    async def execute(self, query: str, config: dict) -> ExecutionResult:
        from agents import Agent, HostedMCPTool, ModelSettings, RunConfig, Runner
        from agents.items import ReasoningItem, ToolCallItem
        from openai.types.shared.reasoning import Reasoning

        start = time.time()
        try:
            # Build tools
            tools = []
            tc = config.get("tools_config")
            if tc and tc.get("type") == "mcp":
                mcp = HostedMCPTool(
                    tool_config={
                        "type": "mcp",
                        "server_label": tc.get("server_label", "MCP Server"),
                        "allowed_tools": tc.get("allowed_tools", []),
                        "require_approval": "never",
                        "server_url": tc.get("server_url", ""),
                    }
                )
                tools = [mcp]

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

            conversation = [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": query}],
                }
            ]

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
