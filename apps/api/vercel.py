"""Vercel entrypoint for the FastAPI service.

The service root is ``apps/api``, while the application imports as part of the
``apps.api`` package so its relative imports keep working in Vercel Functions.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.main import app  # noqa: E402

__all__ = ["app"]
