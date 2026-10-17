"""Health: database, model and embedder status."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response

from ..state import AppContext, get_ctx

router = APIRouter(tags=["health"])


@router.get("/health")
def health(response: Response, ctx: AppContext = Depends(get_ctx)) -> dict[str, Any]:
    ok = False
    graphs: list[str] = []
    version = "unknown"
    error: str | None = None
    try:
        ok = bool(ctx.hive.ping())
        graphs = [ctx.hive.database_name(t) for t in ctx.hive.list_tenants()]
        version = ctx.hive.db_version()
    except Exception as exc:  # noqa: BLE001 - health must answer even when the DB is down
        ok = False
        error = f"{type(exc).__name__}: {exc}"
    if ctx.startup_error:
        ok = False
        error = ctx.startup_error
    if not ok:
        response.status_code = 503
    body: dict[str, Any] = {
        "ok": ok,
        "neo4j": {"version": version, "databases": graphs, "kind": getattr(ctx.hive, "kind", "unknown"), "events": getattr(ctx.hive, "events_mode", "memory")},
        "llm": {"backend": getattr(ctx.llm, "backend", "unknown"), "model": getattr(ctx.llm, "model", "unknown"), "native_tools": bool(getattr(ctx.llm, "native_tools", False))},
        "embeddings": {"model": getattr(ctx.embedder, "model", "unknown"), "dim": getattr(ctx.embedder, "dim", 768), "backend": getattr(ctx.embedder, "name", "unknown"), "source": getattr(ctx.embedder, "source", None)},
        "workers": ctx.workers.status() if ctx.workers is not None else [],
        "started_at": ctx.started_at,
    }
    usage_summary = getattr(ctx.llm, "usage_summary", None)
    usage = usage_summary() if callable(usage_summary) else None
    if usage is not None:
        body["llm"]["usage"] = usage
    if error:
        body["error"] = error
    return body
