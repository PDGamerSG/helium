"""Fail when public product files still expose the old prototype name."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORED = {".git", ".venv", "node_modules", ".next", "uv.lock", "pnpm-lock.yaml"}
ALLOWED = {"docs/UPSTREAM.md", "docs/superpowers/specs/2026-10-16-helium-rebrand-design.md", "docs/superpowers/plans/2026-10-16-helium-rebrand.md"}
FORBIDDEN = ("Minutes", "MINUTES_", "minutes-neo4j", "minutes-api", "minutes-web", "minutes-workspace")

for path in ROOT.rglob("*"):
    if not path.is_file() or any(part in IGNORED for part in path.parts):
        continue
    rel = path.relative_to(ROOT).as_posix()
    if rel in ALLOWED or rel == "README.md" or rel == "scripts/check-helium-brand.py" or path.suffix not in {".md", ".py", ".ts", ".tsx", ".css", ".json", ".yml", ".yaml", ".toml", ".html"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    if any(word in text for word in FORBIDDEN):
        raise SystemExit(f"stale product name in {rel}")
print("Helium brand scan passed")
