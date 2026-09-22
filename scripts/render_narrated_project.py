"""Render one existing project with caption narration and background music.

Uses the configured speech provider (paid). Existing video clips and cached speech are reused.
"""

import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.api.db import ConceptPreset, Project, RenderJob, RenderOutput, Session, Storyboard, now
from apps.api.narration import require_narration
from apps.api.services import active_job, save_board
from apps.api.worker import process_job
from sqlalchemy import select

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("project_id")
args = parser.parse_args()
with Session() as db:
    project = db.get(Project, args.project_id)
    record = db.get(Storyboard, args.project_id)
    if not project or not record:
        raise SystemExit("Project or storyboard not found.")
    if active_job(db, project.id):
        raise SystemExit("A job is already active for this project.")
    board = copy.deepcopy(record.data)
    board["style"].update(narration="ai", narrationSource="caption", ducking=True)
    if board["style"]["musicMood"] == "none":
        board["style"]["musicMood"] = "lofi"
    if board["style"]["volume"] == 0:
        board["style"]["volume"] = 0.25
    require_narration(board)
    preset = db.get(ConceptPreset, board["conceptId"])
    save_board(db, project.id, board)
    # Claim directly: the ordinary queue worker must not process this same job.
    job = RenderJob(
        project_id=project.id,
        kind="render",
        status="preparing",
        started_at=now(),
        payload={"board": board, "preset": copy.deepcopy(preset.data), "product": copy.deepcopy(project.info)},
    )
    db.add(job)
    project.status, project.updated_at = "preparing", now()
    db.commit()
    jid = job.id
print(json.dumps({"jobId": jid, "projectId": args.project_id, "stage": "narration and rendering"}), flush=True)
process_job(jid)
with Session() as db:
    job = db.get(RenderJob, jid)
    result = {"jobId": jid, "status": job.status, "error": job.error}
    if job.status == "completed":
        result["outputs"] = [
            {"files": o.files, "verification": o.verification}
            for o in db.scalars(select(RenderOutput).where(RenderOutput.job_id == jid))
        ]
    print(json.dumps(result, ensure_ascii=True), flush=True)
    if job.status != "completed":
        raise SystemExit(1)
