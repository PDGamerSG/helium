"""Claude backend for :class:`apps.api.llm.gemma.LLM` (``LLM_BACKEND=anthropic``), with prompt caching.

Caching is a prefix match over ``tools -> system -> messages``, so the layout is:

* one explicit breakpoint on the system prompt. Agent and extraction prompts are static files, so every
  call from the same agent (and its tool list) reads the same entry;
* in tool loops, a top-level automatic breakpoint that follows the growing conversation, so each step
  reads the previous step's prefix and only writes the newly appended turn. Single-shot calls skip it:
  their user turn is unique and caching it would only pay the write premium.

Everything dynamic (task payloads, dates, retrieved facts) already lives in the user turn. Assistant
turns from a tool loop are replayed as the original content blocks (thinking included) so the prefix
stays byte-identical. ``usage`` accumulates the cache counters; ``/health`` reports them.

Current Claude models reject sampling parameters, so ``temperature`` is accepted and ignored. Thinking
cannot be switched off on Claude Opus 5.5; ``think=False`` maps to ``effort="low"`` instead, and
``THINKING_HEADROOM`` is added to ``max_tokens`` so reasoning does not truncate the answer.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any

import anthropic

from .gemma import ChatResponse, LLMError, ToolCall

log = logging.getLogger(__name__)

THINKING_HEADROOM = 4096
JSON_INSTRUCTION = "Respond with exactly one JSON object and nothing else: no prose before or after it, no code fences."
# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
FALLBACK_MODELS = frozenset({"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"})
FALLBACK_BETA = "server-side-fallback-2026-07-01"
CACHE_TTLS = frozenset({"5m", "1h"})


@dataclass
class CacheUsage:
    """Running token totals across requests; the cache fields show whether caching is working."""

    requests: int = 0
    input_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    output_tokens: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def record(self, usage: Any) -> None:
        with self._lock:
            self.requests += 1
            self.input_tokens += getattr(usage, "input_tokens", 0) or 0
            self.cache_creation_input_tokens += getattr(usage, "cache_creation_input_tokens", 0) or 0
            self.cache_read_input_tokens += getattr(usage, "cache_read_input_tokens", 0) or 0
            self.output_tokens += getattr(usage, "output_tokens", 0) or 0

    def as_dict(self) -> dict[str, Any]:
        with self._lock:
            prompt = self.input_tokens + self.cache_creation_input_tokens + self.cache_read_input_tokens
            return {
                "requests": self.requests,
                "input_tokens": self.input_tokens,
                "cache_creation_input_tokens": self.cache_creation_input_tokens,
                "cache_read_input_tokens": self.cache_read_input_tokens,
                "output_tokens": self.output_tokens,
                "cache_hit_rate": round(self.cache_read_input_tokens / prompt, 3) if prompt else 0.0,
            }


class AnthropicBackend:
    """Anthropic Messages API with native tool use and prompt caching."""

    name = "anthropic"
    supports_native_tools = True
    supports_json_mode = True

    def __init__(
        self,
        model: str,
        api_key: str | None,
        *,
        timeout_s: float,
        think: bool,
        effort: str | None = None,
        cache_ttl: str = "5m",
        client: Any = None,
    ) -> None:
        if cache_ttl not in CACHE_TTLS:
            raise ValueError(f"LLM_CACHE_TTL must be one of {sorted(CACHE_TTLS)}, got {cache_ttl!r}")
        self.model = model
        # Effort is pinned for the process: changing it between requests invalidates the cache.
        self.effort = None if effort == "none" else (effort or (None if think else "low"))
        self.cache_control: dict[str, str] = {"type": "ephemeral"} if cache_ttl == "5m" else {"type": "ephemeral", "ttl": cache_ttl}
        self.fallbacks = model in FALLBACK_MODELS
        self.usage = CacheUsage()
        self._client = client or anthropic.Anthropic(api_key=api_key or None, timeout=timeout_s, max_retries=3)

    def chat(
        self,
        system: str,
        messages: list[dict[str, Any]],
        *,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        tools: list[dict[str, Any]] | None,
    ) -> ChatResponse:
        del temperature  # rejected by current Claude models
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens + THINKING_HEADROOM,
            "system": [
                {
                    "type": "text",
                    "text": f"{system}\n\n{JSON_INSTRUCTION}" if json_mode else system,
                    "cache_control": self.cache_control,
                }
            ],
            "messages": to_anthropic_messages(messages),
        }
        if self.effort:
            kwargs["output_config"] = {"effort": self.effort}
        if tools:
            kwargs["tools"] = [_tool_param(t) for t in tools]
            kwargs["cache_control"] = self.cache_control
        try:
            if self.fallbacks:
                response = self._client.beta.messages.create(**kwargs, betas=[FALLBACK_BETA], fallbacks="default")
            else:
                response = self._client.messages.create(**kwargs)
        except anthropic.APIStatusError as exc:
            raise LLMError(f"anthropic request failed ({exc.status_code}): {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"anthropic request failed: {exc}") from exc

        usage = response.usage
        self.usage.record(usage)
        log.debug(
            "claude %s: input=%s cache_write=%s cache_read=%s output=%s",
            self.model,
            getattr(usage, "input_tokens", 0),
            getattr(usage, "cache_creation_input_tokens", 0),
            getattr(usage, "cache_read_input_tokens", 0),
            getattr(usage, "output_tokens", 0),
        )
        if response.stop_reason == "refusal":
            category = getattr(getattr(response, "stop_details", None), "category", None)
            raise LLMError(f"{self.model} declined the request (refusal: {category or 'unspecified'})")
        if response.stop_reason == "max_tokens":
            log.warning("claude %s hit max_tokens=%d; the answer may be truncated", self.model, kwargs["max_tokens"])

        text = "".join(block.text for block in response.content if block.type == "text")
        calls = [ToolCall(name=block.name, args=block.input, id=block.id) for block in response.content if block.type == "tool_use"]
        return ChatResponse(content=text, tool_calls=calls, raw=response)


def to_anthropic_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert the loop's provider-neutral history to Messages API turns.

    Assistant tool-call turns carry the original response in ``raw``; its content blocks are replayed
    unchanged. Consecutive ``tool`` messages become one user turn of ``tool_result`` blocks.
    """
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = msg["role"]
        if role == "tool":
            block = {"type": "tool_result", "tool_use_id": msg.get("tool_call_id") or "", "content": msg["content"]}
            if out and out[-1]["role"] == "user" and _is_tool_results(out[-1]["content"]):
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
        elif role == "assistant" and msg.get("tool_calls"):
            raw_content = getattr(msg.get("raw"), "content", None)
            if raw_content is not None:
                out.append({"role": "assistant", "content": raw_content})
                continue
            blocks: list[dict[str, Any]] = []
            if msg.get("content"):
                blocks.append({"type": "text", "text": msg["content"]})
            blocks += [
                {"type": "tool_use", "id": c.get("id") or f"call_{i}", "name": c["name"], "input": c["args"] if isinstance(c["args"], dict) else {}}
                for i, c in enumerate(msg["tool_calls"])
            ]
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": role, "content": msg.get("content") or ""})
    return out


def _is_tool_results(content: Any) -> bool:
    return isinstance(content, list) and bool(content) and all(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)


def _tool_param(schema: dict[str, Any]) -> dict[str, Any]:
    """OpenAI-format tool (what the native loop builds) -> Anthropic tool definition."""
    fn = schema.get("function", schema)
    return {
        "name": fn["name"],
        "description": fn.get("description", ""),
        "input_schema": _json_schema(fn.get("parameters") or {"type": "object"}),
    }


def _json_schema(node: Any) -> Any:
    """Turn the OpenAPI-style ``nullable`` that ``_clean_schema`` emits back into JSON Schema."""
    if isinstance(node, dict):
        out = {k: _json_schema(v) for k, v in node.items() if k != "nullable"}
        if node.get("nullable") and isinstance(out.get("type"), str):
            out["type"] = [out["type"], "null"]
        return out
    if isinstance(node, list):
        return [_json_schema(v) for v in node]
    return node
