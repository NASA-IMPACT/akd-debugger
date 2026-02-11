from executors.base import AgentExecutor
from executors.openai_agents import OpenAIAgentsExecutor

_REGISTRY: dict[str, type[AgentExecutor]] = {}


def register(cls: type[AgentExecutor]):
    _REGISTRY[cls.executor_type()] = cls


def get_executor(executor_type: str) -> AgentExecutor:
    cls = _REGISTRY.get(executor_type)
    if cls is None:
        raise ValueError(
            f"Unknown executor type: {executor_type}. Available: {list(_REGISTRY.keys())}"
        )
    return cls()


# Register built-in executors
register(OpenAIAgentsExecutor)
