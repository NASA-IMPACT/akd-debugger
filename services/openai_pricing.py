import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


_PRICING_FILE = Path(__file__).resolve().parent.parent / "data" / "openai_pricing.json"


@lru_cache(maxsize=1)
def load_pricing() -> dict:
    return json.loads(_PRICING_FILE.read_text())


def _find_model_key(model: str, pricing: dict) -> str | None:
    models = pricing.get("models", {})
    if model in models:
        return model
    # Resolve dated/suffixed variants like gpt-4.1-2025-xx
    by_length = sorted(models.keys(), key=len, reverse=True)
    for prefix in by_length:
        if model.startswith(prefix):
            return prefix
    return None


def _web_search_calls(tool_calls: list[dict] | None) -> int:
    if not tool_calls:
        return 0
    count = 0
    for call in tool_calls:
        name = str(call.get("name") or "").lower()
        if "web_search" in name or "web-search" in name:
            count += 1
    return count


def _web_search_price_per_call(model: str, pricing: dict) -> float:
    tools = pricing.get("tools", {}).get("web_search", {})
    default_rate = float(tools.get("default_per_call_usd", 0))
    for prefix, rate in (tools.get("per_call_by_model_prefix", {}) or {}).items():
        if model.startswith(prefix):
            return float(rate)
    return default_rate


def get_rate_card(model: str) -> dict:
    pricing = load_pricing()
    model_key = _find_model_key(model, pricing)
    model_prices = pricing.get("models", {}).get(model_key or "", {})
    missing = model_key is None
    input_rate = float(model_prices.get("input_per_million", 0))
    cached_rate = float(model_prices.get("cached_input_per_million", input_rate))
    output_rate = float(model_prices.get("output_per_million", 0))
    reasoning_rate = float(model_prices.get("reasoning_output_per_million", output_rate))
    web_search_rate = _web_search_price_per_call(model, pricing)
    return {
        "pricing_version": str(pricing.get("version", "unknown")),
        "currency": str(pricing.get("currency", "USD")),
        "model_key": model_key,
        "missing_model_pricing": missing,
        "input_per_million": input_rate,
        "cached_input_per_million": cached_rate,
        "output_per_million": output_rate,
        "reasoning_output_per_million": reasoning_rate,
        "web_search_per_call": web_search_rate,
    }


@dataclass
class CostBreakdown:
    total_usd: float
    input_cost_usd: float
    cached_input_cost_usd: float
    output_cost_usd: float
    reasoning_output_cost_usd: float
    web_search_cost_usd: float
    web_search_calls: int
    model_key: str | None
    missing_model_pricing: bool
    usage: dict


def calculate_cost(model: str, usage: dict | None, tool_calls: list[dict] | None) -> CostBreakdown:
    usage = usage or {}
    pricing = load_pricing()
    model_key = _find_model_key(model, pricing)
    model_prices = pricing.get("models", {}).get(model_key or "", {})

    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    cached_tokens = int(usage.get("cached_tokens", 0) or 0)
    reasoning_tokens = int(usage.get("reasoning_tokens", 0) or 0)

    if not model_key:
        return CostBreakdown(
            total_usd=0.0,
            input_cost_usd=0.0,
            cached_input_cost_usd=0.0,
            output_cost_usd=0.0,
            reasoning_output_cost_usd=0.0,
            web_search_cost_usd=0.0,
            web_search_calls=_web_search_calls(tool_calls),
            model_key=None,
            missing_model_pricing=True,
            usage={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cached_tokens": cached_tokens,
                "reasoning_tokens": reasoning_tokens,
            },
        )

    input_rate = float(model_prices.get("input_per_million", 0))
    cached_rate = float(model_prices.get("cached_input_per_million", input_rate))
    output_rate = float(model_prices.get("output_per_million", 0))
    reasoning_rate = float(model_prices.get("reasoning_output_per_million", output_rate))

    cached_count = max(min(cached_tokens, input_tokens), 0)
    non_cached_count = max(input_tokens - cached_count, 0)
    reasoning_count = max(min(reasoning_tokens, output_tokens), 0)
    non_reasoning_count = max(output_tokens - reasoning_count, 0)

    input_cost = (non_cached_count / 1_000_000.0) * input_rate
    cached_input_cost = (cached_count / 1_000_000.0) * cached_rate
    output_cost = (non_reasoning_count / 1_000_000.0) * output_rate
    reasoning_cost = (reasoning_count / 1_000_000.0) * reasoning_rate

    web_search_calls = _web_search_calls(tool_calls)
    web_search_rate = _web_search_price_per_call(model, pricing)
    web_search_cost = web_search_calls * web_search_rate

    total = input_cost + cached_input_cost + output_cost + reasoning_cost + web_search_cost
    return CostBreakdown(
        total_usd=round(total, 6),
        input_cost_usd=round(input_cost, 6),
        cached_input_cost_usd=round(cached_input_cost, 6),
        output_cost_usd=round(output_cost, 6),
        reasoning_output_cost_usd=round(reasoning_cost, 6),
        web_search_cost_usd=round(web_search_cost, 6),
        web_search_calls=web_search_calls,
        model_key=model_key,
        missing_model_pricing=False,
        usage={
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cached_tokens": cached_count,
            "reasoning_tokens": reasoning_count,
        },
    )
