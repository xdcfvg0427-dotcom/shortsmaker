"""Cancel after frames have actually rendered, keeping earlier published outputs."""

import json
import os
import time
from pathlib import Path
import httpx

base = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")
client = httpx.Client(base_url=base, timeout=20)
previous = json.loads(Path("storage/verification/variants.json").read_text(encoding="utf-8"))
pid = previous["projectId"]
job = client.post(f"/api/projects/{pid}/renders").json()
started = time.monotonic()
while time.monotonic() - started < 120:
    status = client.get("/api/jobs/" + job["id"]).json()
    if status["status"] == "rendering" and status["progress"] > 9:
        break
    assert status["status"] not in ("failed", "completed", "cancelled"), status
    time.sleep(0.7)
else:
    raise TimeoutError("No rendered frames in 120 seconds")
progress = status["progress"]
response = client.post("/api/jobs/" + job["id"] + "/cancel")
response.raise_for_status()
started = time.monotonic()
while time.monotonic() - started < 40:
    status = client.get("/api/jobs/" + job["id"]).json()
    if status["status"] == "cancelled":
        break
    assert status["status"] != "failed", status
    time.sleep(0.5)
else:
    raise TimeoutError("Cancellation did not settle")
project = client.get("/api/projects/" + pid).json()
assert len(project["outputs"]) == 4
result = {
    "jobId": job["id"],
    "progressWhenCancelled": progress,
    "elapsedSec": round(time.monotonic() - started, 2),
    "publishedOutputsKept": 4,
    "passed": True,
}
Path("storage/verification/active-cancel.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result), flush=True)
