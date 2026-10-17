"""Vercel entrypoint for the FastAPI service.

Vercel copies the contents of ``apps/api`` to the function root, without the
parent ``apps`` directory. Load that directory as a package explicitly so the
application's relative imports work in both layouts.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent
PACKAGE_NAME = "helium_api"
spec = importlib.util.spec_from_file_location(
    PACKAGE_NAME, API_ROOT / "__init__.py", submodule_search_locations=[str(API_ROOT)]
)
if spec is None or spec.loader is None:
    raise ImportError(f"Cannot load the Helium API package from {API_ROOT}")
package = importlib.util.module_from_spec(spec)
sys.modules[PACKAGE_NAME] = package
spec.loader.exec_module(package)

from helium_api.main import app  # noqa: E402

__all__ = ["app"]
