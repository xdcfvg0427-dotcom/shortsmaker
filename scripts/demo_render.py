"""Exercise the API and real worker without requiring a running web server."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.db import RenderJob, Session, now
from apps.api.worker import process_job, worker_lock


def execute(client, endpoint):
    result = client.post(endpoint)
    result.raise_for_status()
    job = result.json()
    with Session() as db:
        record = db.get(RenderJob, job["id"])
        record.status, record.started_at = "preparing", now()
        db.commit()
    process_job(job["id"])
    status = client.get("/api/jobs/" + job["id"]).json()
    print(json.dumps(status, ensure_ascii=False), flush=True)
    if status["status"] != "completed":
        raise RuntimeError(status["error"])


def main():
    with worker_lock(), TestClient(app) as client:
        p = client.post("/api/demo").json()
        print("Demo project: " + p["id"], flush=True)
        execute(client, f"/api/projects/{p['id']}/storyboard/generate")
        execute(client, f"/api/projects/{p['id']}/renders")
        result = client.get("/api/projects/" + p["id"]).json()
        target = Path("storage/demo-result.json")
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Verified MP4 and metadata: " + str(target.resolve()), flush=True)


if __name__ == "__main__":
    main()
