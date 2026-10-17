"""Live check that Claude prompt caching hits (spends a few cents of API credit).

    uv run --package helium-api python scripts/check_claude_cache.py [--model claude-opus-5-5]

Two extraction calls share the static extraction prompt; the second must read it from the cache.
A two-step tool loop must read the first step's prefix on the second step.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.llm.gemma import LLM, ToolSpec  # noqa: E402

PROMPTS = Path(__file__).resolve().parents[1] / "packages" / "ingest" / "ingest" / "prompts"


class Facts(BaseModel):
    facts: list[dict] = []


class LookupArgs(BaseModel):
    key: str


def _delta(llm: LLM, before: dict) -> dict:
    after = llm.usage_summary() or {}
    return {k: after[k] - before.get(k, 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="claude-opus-5-5")
    args = parser.parse_args()
    llm = LLM("anthropic", args.model, max_tokens=1024)
    failures = []

    system = (PROMPTS / "extract_v5.md").read_text(encoding="utf-8")
    for i, line in enumerate(["Priya: the UPI flow is due on 24 September.", "Rahul: we moved the UPI flow to 28 September."]):
        before = llm.usage_summary() or {}
        llm.complete_json(system, f"Episode {i}:\n{line}", Facts)
        delta = _delta(llm, before)
        print(f"extraction call {i + 1}: {delta}")
    if delta["cache_read_input_tokens"] == 0:
        failures.append("second extraction call did not read the cached system prompt")

    def execute(name: str, tool_args: dict) -> dict:
        return {"key": tool_args["key"], "value": "28 September 2026", "source": "email from Rahul, 12 Sep"}

    agent_system = (Path(__file__).resolve().parents[1] / "apps" / "api" / "agents" / "prompts" / "answer.md").read_text(encoding="utf-8")
    calls_before = (llm.usage_summary() or {}).get("requests", 0)
    loop_before = llm.usage_summary() or {}
    result = llm.tool_loop(
        agent_system,
        [{"role": "user", "content": "Use the lookup tool for key 'upi flow|due', then tell me when the UPI flow is due."}],
        [ToolSpec(name="lookup", description="Look up the current value of a fact by key.", args_model=LookupArgs)],
        execute,
    )
    steps = (llm.usage_summary() or {})["requests"] - calls_before
    print(f"tool loop: {steps} requests, steps={[s['tool'] for s in result.steps]}, final={result.final!r}, usage={_delta(llm, loop_before)}")
    if result.failed or not result.steps:
        failures.append(f"tool loop did not complete with a tool call: {result.reason}")
    elif _delta(llm, loop_before)["cache_read_input_tokens"] == 0:
        failures.append("tool loop's second step did not read the first step's prefix")

    print("totals:", llm.usage_summary())
    for failure in failures:
        print("FAIL:", failure)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
