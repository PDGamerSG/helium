"""Claude backend: request shape for prompt caching, tool-loop replay, usage totals, refusals."""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx2
import pytest
from anthropic import APIConnectionError
from pydantic import BaseModel

from apps.api.llm.claude import FALLBACK_BETA, JSON_INSTRUCTION, THINKING_HEADROOM, AnthropicBackend, to_anthropic_messages
from apps.api.llm.gemma import LLM, LLMError, ToolSpec


def _usage(input_tokens=10, write=0, read=0, output=5):
    return SimpleNamespace(input_tokens=input_tokens, cache_creation_input_tokens=write, cache_read_input_tokens=read, output_tokens=output)


def _text(text):
    return SimpleNamespace(type="text", text=text)


def _tool_use(id_, name, args):
    return SimpleNamespace(type="tool_use", id=id_, name=name, input=args)


def _message(*blocks, stop_reason="end_turn", usage=None, stop_details=None):
    return SimpleNamespace(content=list(blocks), stop_reason=stop_reason, usage=usage or _usage(), stop_details=stop_details)


class _Messages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class _Client:
    def __init__(self, replies):
        self.messages = _Messages(replies)
        self.beta = SimpleNamespace(messages=self.messages)


def _llm(replies, model="claude-opus-5-5", **options):
    client = _Client(replies)
    llm = LLM.__new__(LLM)
    llm.backend, llm.model, llm.max_tokens, llm.native_tools = "anthropic", model, 512, True
    llm._backend = AnthropicBackend(model, "test-key", timeout_s=5, think=False, client=client, **options)
    return llm, client.messages.calls


class Verdict(BaseModel):
    verdict: str


class LookupArgs(BaseModel):
    key: str
    as_of: str | None = None


TOOLS = [ToolSpec(name="lookup", description="look up a fact", args_model=LookupArgs)]


def test_single_shot_caches_the_system_prompt_only():
    llm, calls = _llm([_message(_text("plain answer"))])
    assert llm.complete("STATIC PROMPT", "unique question", temperature=0.7, max_tokens=300) == "plain answer"
    call = calls[0]
    assert call["system"] == [{"type": "text", "text": "STATIC PROMPT", "cache_control": {"type": "ephemeral"}}]
    assert "cache_control" not in call  # the unique user turn would only pay the write premium
    assert "temperature" not in call
    assert call["max_tokens"] == 300 + THINKING_HEADROOM
    assert call["output_config"] == {"effort": "low"}
    assert call["betas"] == [FALLBACK_BETA] and call["fallbacks"] == "default"


def test_complete_json_appends_the_json_instruction_inside_the_cached_block():
    llm, calls = _llm([_message(_text('{"verdict": "refinement"}'))])
    assert llm.complete_json("EXTRACT", "episode", Verdict).verdict == "refinement"
    block = calls[0]["system"][0]
    assert block["text"] == f"EXTRACT\n\n{JSON_INSTRUCTION}" and block["cache_control"] == {"type": "ephemeral"}


def test_tool_loop_keeps_a_stable_prefix_and_replays_raw_turns():
    first = _message(
        _text("checking"),
        _tool_use("toolu_1", "lookup", {"key": "upi flow|due"}),
        _tool_use("toolu_2", "lookup", {"key": "gateway"}),
        stop_reason="tool_use",
        usage=_usage(write=900),
    )
    final = _message(_text("Due 28 Sep."), usage=_usage(read=900, write=60))
    llm, calls = _llm([first, final], cache_ttl="1h")

    def execute(name, args):
        return {"value": args["key"]}

    result = llm.tool_loop("AGENT PROMPT", [{"role": "user", "content": "When is UPI due?"}], TOOLS, execute)
    assert not result.failed and result.final == "Due 28 Sep."

    ttl = {"type": "ephemeral", "ttl": "1h"}
    one, two = calls
    for call in calls:
        assert call["cache_control"] == ttl
        assert call["system"][0]["cache_control"] == ttl
    # Tools and system render first; they must be identical across steps for the cache to hit.
    assert json.dumps(one["tools"]) == json.dumps(two["tools"]) and one["system"] == two["system"]
    assert one["tools"][0]["input_schema"]["properties"]["as_of"]["type"] == ["string", "null"]
    assert "nullable" not in json.dumps(one["tools"])

    history = two["messages"]
    assert history[0] == one["messages"][0]
    assert history[1] == {"role": "assistant", "content": first.content}  # verbatim, thinking blocks included
    assert history[2]["role"] == "user" and [b["tool_use_id"] for b in history[2]["content"]] == ["toolu_1", "toolu_2"]
    assert json.loads(history[2]["content"][0]["content"]) == {"value": "upi flow|due"}

    assert llm.usage_summary() == {
        "requests": 2,
        "input_tokens": 20,
        "cache_creation_input_tokens": 960,
        "cache_read_input_tokens": 900,
        "output_tokens": 10,
        "cache_hit_rate": round(900 / 1880, 3),
    }


def test_history_without_raw_is_rebuilt_as_blocks():
    messages = to_anthropic_messages(
        [
            {"role": "user", "content": "go"},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "c1", "name": "lookup", "args": '{"key": "x"}'}]},
            {"role": "tool", "tool_call_id": "c1", "name": "lookup", "content": "{}"},
        ]
    )
    assert messages[1]["content"] == [{"type": "tool_use", "id": "c1", "name": "lookup", "input": {}}]
    assert messages[2] == {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c1", "content": "{}"}]}


def test_models_without_fallback_use_the_plain_endpoint_and_effort_can_be_set():
    llm, calls = _llm([_message(_text("ok"))], model="claude-haiku-5-5", effort="medium")
    llm.complete("s", "u")
    assert "betas" not in calls[0] and "fallbacks" not in calls[0]
    assert calls[0]["output_config"] == {"effort": "medium"}
    llm, calls = _llm([_message(_text("ok"))], effort="none")
    llm.complete("s", "u")
    assert "output_config" not in calls[0]


def test_refusal_and_transport_errors_raise_llm_error():
    refusal = _message(stop_reason="refusal", stop_details=SimpleNamespace(category="cyber"))
    llm, _ = _llm([refusal])
    with pytest.raises(LLMError, match="refusal: cyber"):
        llm.complete("s", "u")
    llm, _ = _llm([APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))])
    with pytest.raises(LLMError, match="anthropic request failed"):
        llm.complete("s", "u")


def test_invalid_cache_ttl_and_factory_wiring():
    with pytest.raises(ValueError):
        AnthropicBackend("claude-opus-5-5", None, timeout_s=5, think=False, cache_ttl="10m", client=object())
    llm = LLM("anthropic", "claude-opus-5-5", api_key="test-key", effort="high", cache_ttl="1h")
    assert llm.native_tools and llm._backend.effort == "high"
    assert llm._backend.cache_control == {"type": "ephemeral", "ttl": "1h"}
