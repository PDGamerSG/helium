"""Exercise the flattened function layout without the checkout on sys.path."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import textwrap


def test_vercel_function_starts_without_apps_directory(tmp_path):
    service = tmp_path / "function"
    shutil.copytree(
        Path(__file__).resolve().parents[1], service,
        ignore=shutil.ignore_patterns("tests", "__pycache__"),
    )
    env = {
        **os.environ,
        "HIVE_BACKEND": "fake",
        "LLM_BACKEND": "fake",
        "EMBED_BACKEND": "fake",
        "WORKERS_ENABLED": "false",
        "SEED_TENANTS": "orbit",
    }
    result = subprocess.run(
        [sys.executable, "-I", "-c", textwrap.dedent("""
            import importlib.util
            import sys
            from fastapi import FastAPI
            from fastapi.testclient import TestClient
            from hiveboard.queries import load_cypher

            spec = importlib.util.spec_from_file_location("entrypoint", sys.argv[1])
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            assert isinstance(module.app, FastAPI)
            assert load_cypher("active_facts")
            with TestClient(module.app) as client:
                health = client.get("/health")
                assert health.status_code == 200, health.text
                assert health.json()["ok"] is True
                assert client.get("/tenants").status_code == 200
        """), str(service / "vercel.py")],
        cwd=tmp_path, env=env, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
