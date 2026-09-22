"""Run real Alembic migrations against a separate, empty SQLite database."""

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="paper-migration-") as folder:
    db = Path(folder) / "empty.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = "sqlite:///" + str(db).replace("\\", "/")
    env["STORAGE_DIR"] = folder
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, env=env, check=True)
    with sqlite3.connect(db) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {
            "projects",
            "assets",
            "analyses",
            "storyboards",
            "scenes",
            "presets",
            "jobs",
            "outputs",
            "settings",
        }.issubset(tables)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0002"
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='uq_job_active_project'").fetchone()
    connection.close()
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, env=env, check=True)
print("Empty database migration to 0002, all tables/indexes, repeated upgrade: passed.")
