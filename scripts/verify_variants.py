"""Live API smoke: cancel an active render, retry, verify four distinct real outputs."""

import hashlib
import json
import os
import time
from pathlib import Path
import httpx

client = httpx.Client(base_url=os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000"), timeout=30)


def call(method, url, **kwargs):
    response = client.request(method, "/api" + url, **kwargs)
    response.raise_for_status()
    return response.json()


def wait(jid, stages, timeout=900):
    started = time.monotonic()
    previous = ""
    while time.monotonic() - started < timeout:
        job = call("GET", "/jobs/" + jid)
        if job["status"] != previous:
            print(f"{jid[:8]} {job['status']} {job['progress']:.0f}%", flush=True)
            previous = job["status"]
        if job["status"] in stages:
            return job
        if job["status"] in ("failed", "cancelled"):
            raise RuntimeError(job)
        time.sleep(1)
    raise TimeoutError(jid)


def main():
    p = call("POST", "/demo")
    info = p["info"]
    info["name"] = "데일리 리프 노트 · 4가지 이야기"
    info["conceptId"] = "minimal"
    info["style"].update(variants=4, musicMood="lofi", narration="ai", priceDisplay="always")
    call("PUT", "/projects/" + p["id"], json=info)
    job = call("POST", "/projects/" + p["id"] + "/storyboard/generate")
    wait(job["id"], ["completed"])
    job = call("POST", "/projects/" + p["id"] + "/renders")
    wait(job["id"], ["rendering"])
    call("POST", "/jobs/" + job["id"] + "/cancel")
    cancelled = wait(job["id"], ["cancelled"])
    assert cancelled["status"] == "cancelled"
    retry = call("POST", "/jobs/" + job["id"] + "/retry")
    assert retry["attempt"] == 2
    wait(retry["id"], ["completed"], timeout=1800)
    result = call("GET", "/projects/" + p["id"])
    outputs = [o for o in result["outputs"] if o["jobId"] == retry["id"]]
    assert len(outputs) == 4
    hashes, hooks = set(), set()
    for output in outputs:
        verification = output["verification"]
        assert (verification["width"], verification["height"], verification["fps"]) == (1080, 1920, 30)
        assert verification["videoCodec"] == "h264" and verification["audioCodec"] == "aac"
        assert abs(verification["duration"] - 15) < 0.15
        metadata = client.get(output["downloads"]["metadata"]).json()
        hooks.add(metadata["board"]["scenes"][0]["caption"])
        video = client.get(output["downloads"]["video"])
        video.raise_for_status()
        hashes.add(hashlib.sha256(video.content).hexdigest())
        for kind in ("thumbnail", "subtitles", "script"):
            assert client.get(output["downloads"][kind]).status_code == 200
    assert len(hooks) == 4 and len(hashes) == 4
    folder = Path("storage/verification")
    folder.mkdir(exist_ok=True)
    (folder / "variants.json").write_text(
        json.dumps(
            {
                "projectId": p["id"],
                "cancelledJob": job["id"],
                "retriedJob": retry["id"],
                "outputs": outputs,
                "distinctHooks": list(hooks),
                "distinctVideoHashes": list(hashes),
                "passed": True,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print("PASS: active cancellation, retry attempt 2, four distinct verified MP4 files and all downloads.", flush=True)


if __name__ == "__main__":
    main()
