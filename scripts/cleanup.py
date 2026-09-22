import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from apps.api.db import AppSetting, Project, Session
from apps.api.main import delete_project
from apps.api.services import active_job

parser = argparse.ArgumentParser(description="Preview expired projects; --apply deletes them.")
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
with Session() as db:
    setting = db.get(AppSetting, "app")
    days = setting.data["retentionDays"] if setting else 30
    threshold = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    candidates = list(db.scalars(select(Project).where(Project.updated_at < threshold)))
    for p in candidates:
        if not active_job(db, p.id):
            print(("Deleting " if args.apply else "Would delete ") + p.id)
            if args.apply:
                delete_project(p.id, db)
