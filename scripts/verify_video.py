"""Offline integration verification: synthetic moving clip -> worker -> real MP4."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
folder = ROOT / "storage/video-verification"
folder.mkdir(parents=True, exist_ok=True)
os.environ["STORAGE_DIR"] = str(folder)
os.environ["DATABASE_URL"] = "sqlite:///" + (folder / "studio.db").as_posix()
os.environ["AI_PROVIDER"] = "demo"
os.environ["AI_API_KEY"] = ""
os.environ["TTS_API_KEY"] = ""
os.environ["RUNWAY_API_KEY"] = ""

from fastapi.testclient import TestClient
from apps.api import worker
from apps.api.config import settings
from apps.api.db import Base, engine
from apps.api.main import app
from apps.api.storage import binary

Base.metadata.create_all(engine)
fixture = folder / "synthetic-motion.mp4"
subprocess.run(
    [
        binary("ffmpeg"),
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=360x640:rate=30",
        "-t",
        "5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(fixture),
    ],
    check=True,
    capture_output=True,
)


def generated(_image, _prompt, target, _state, persist, _cancel, progress):
    persist({"taskId": "offline-verification"})
    progress(50)
    shutil.copyfile(fixture, target)


worker.generate_video = generated
with TestClient(app) as client:
    p = client.post("/api/demo").json()
    pid = p["id"]

    def finish(response):
        assert response.status_code == 202, response.text
        jid = response.json()["id"]
        worker.process_job(jid)
        result = client.get(f"/api/jobs/{jid}").json()
        assert result["status"] == "completed", result

    finish(client.post(f"/api/projects/{pid}/storyboard/generate"))
    p = client.get(f"/api/projects/{pid}").json()
    # Set first scene to 7 seconds to exercise looping beyond the 5-second clip.
    p["board"]["scenes"][0]["durationFrames"] = 210
    for s in p["board"]["scenes"][1:]:
        s["durationFrames"] = 60
    p["board"]["scenes"][0]["layout"] = "blur_contain"
    update = client.put(f"/api/projects/{pid}/storyboard", json={"data": p["board"], "revision": p["revision"]})
    assert update.status_code == 200, update.text
    settings.runway_api_key = "offline-test-only"
    finish(
        client.post(
            f"/api/projects/{pid}/scenes/{p['board']['scenes'][0]['id']}/video",
            json={"revision": update.json()["revision"]},
        )
    )
    settings.runway_api_key = ""
    print("Synthetic clip saved; rendering final 15-second MP4.", flush=True)
    finish(client.post(f"/api/projects/{pid}/renders"))
    p = client.get(f"/api/projects/{pid}").json()
    (folder / "result.json").write_text(
        json.dumps({"projectId": pid, "outputs": p["outputs"]}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"projectId": pid, "verification": p["outputs"][0]["verification"]}), flush=True)
