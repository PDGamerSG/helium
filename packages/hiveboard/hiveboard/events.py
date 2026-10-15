"""Events between agents: `{event, payload, ts}` messages per tenant.

Two sources feed the same listeners on a `HiveDB`:

- `publish()` (this module): the writer announces what it just did, in-process, with the full payload the
  hiveboard write functions build. This is the default (`HIVE_EVENTS=memory`).
- `hiveboard.cdc.CdcTailer`: Neo4j Change Data Capture (Enterprise). A poller reads the tenant database's
  change log and turns Task, Fact, Episode and Skill changes into the same event names, so writes made by
  another process (the MCP server, the seed script, a Cypher shell) wake the agents too. When the tailer is
  running, `publish()` only records the message for replay and leaves delivery to the change log.
"""

from __future__ import annotations

import asyncio
import queue
from collections.abc import AsyncIterator, Iterator
from typing import Any

from .db import HiveDB
from .temporal import now_ms

EVENT_NAMES = frozenset(
    {
        "episode.ingested",
        "fact.created",
        "fact.superseded",
        "commitment.created",
        "commitment.updated",
        "task.submitted",
        "task.claimed",
        "task.handed_off",
        "task.completed",
        "task.failed",
        "task.input_required",
        "skill.learned",
        "skill.ran",
    }
)


def channel(tenant: str) -> str:
    """`team_<slug>:events`, the logical channel name (one per tenant)."""
    return f"team_{tenant}:events"


def publish(db: HiveDB, tenant: str, event: str, payload: dict[str, Any]) -> None:
    """Deliver one event to every listener of the tenant (synchronously, on the caller's thread)."""
    message = {"event": event, "payload": payload, "ts": now_ms(), "source": "writer"}
    if getattr(db, "cdc_active", False):
        db.record_only(tenant, message)
        return
    db.dispatch(tenant, message)


def subscribe(db: HiveDB, tenant: str, idle_timeout: float | None = None) -> Iterator[dict[str, Any]]:
    """Blocking iterator of events. The listener is attached before this returns, so events published afterwards
    are not missed. With `idle_timeout` (seconds) iteration stops after that long without a message."""
    inbox: queue.Queue = queue.Queue()
    db.add_listener(tenant, inbox.put)
    return _drain(db, tenant, inbox, idle_timeout)


def _drain(db: HiveDB, tenant: str, inbox: queue.Queue, idle_timeout: float | None) -> Iterator[dict[str, Any]]:
    idle = 0.0
    try:
        while True:
            try:
                yield inbox.get(timeout=1.0)
                idle = 0.0
            except queue.Empty:
                idle += 1.0
                if idle_timeout is not None and idle >= idle_timeout:
                    return
    finally:
        db.remove_listener(tenant, inbox.put)


async def asubscribe(db: HiveDB, tenant: str) -> AsyncIterator[dict[str, Any]]:
    """Async generator over the same channel (listeners may fire on any thread; delivery hops to the loop)."""
    loop = asyncio.get_running_loop()
    inbox: asyncio.Queue = asyncio.Queue()

    def listener(message: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(inbox.put_nowait, message)

    db.add_listener(tenant, listener)
    try:
        while True:
            yield await inbox.get()
    finally:
        db.remove_listener(tenant, listener)
