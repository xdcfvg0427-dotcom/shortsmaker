import copy
import io
import shutil
import subprocess

import pytest
from PIL import Image

from apps.api import worker
from apps.api.config import settings
from apps.api.db import Asset, RenderJob, Session
from apps.api.storage import binary


@pytest.fixture
def automated(client, demo, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "runway_api_key", "test-key")
    fixture = tmp_path / "clip.mp4"
    subprocess.run([binary("ffmpeg"), "-y", "-f", "lavfi", "-i", "color=c=green:s=90x160:r=30",
                    "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(fixture)],
                   check=True, capture_output=True)
    calls = []

    def generate(source, prompt, target, state, persist, cancel, progress):
        assert prompt == state["prompt"]
        assert "자연광" in prompt and "손 하나만" in prompt
        calls.append(state["assetId"])
        persist({"taskId": "task-" + state["assetId"], "submissionStarted": True})
        progress(50)
        shutil.copyfile(fixture, target)

    renders = []

    def render(job, assets):
        renders.append(copy.deepcopy(job.payload["board"]))
        assert all(s["videoAssetId"] in {a.id for a in assets if a.kind == "video"}
                   for s in job.payload["board"]["scenes"])
        worker.report(job.id, "rendering", 50)
        return []

    monkeypatch.setattr(worker, "generate_video", generate)
    monkeypatch.setattr(worker, "render_job", render)
    return demo["id"], calls, renders, generate


def start(client, pid, narration=False, use_current_edit=False):
    project = client.get(f"/api/projects/{pid}").json()
    response = client.post(f"/api/projects/{pid}/auto-video", json={"revision": project["revision"], "narration": narration,
                                                                "useCurrentEdit": use_current_edit})
    assert response.status_code == 202, response.text
    return response.json()["id"]


def test_all_photos_generated_attached_and_rendered(client, automated):
    pid, calls, renders, _ = automated
    jid = start(client, pid)
    worker.process_job(jid)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["status"] == "completed", job.get("error")
    project = client.get(f"/api/projects/{pid}").json()
    photos = {a["id"] for a in project["assets"] if a["kind"] == "image"}
    assert set(calls) == photos and len(calls) == len(photos)
    assert {s["assetId"] for s in renders[0]["scenes"]} == photos
    assert renders[0]["style"]["narration"] == "script"
    plan = client.get(f"/api/projects/{pid}/auto-video/plan").json()
    assert "자연광" in plan["prompt"]
    assert all(s["videoPrompt"] == plan["prompt"] for s in renders[0]["scenes"])
    assert all(p["status"] == "completed" for p in job["photos"])
    assert "taskId" not in str(job) and "test-key" not in str(job)
    # Starting a fresh edit reuses all paid clips.
    again = start(client, pid, narration=True)
    worker.process_job(again)
    assert client.get(f"/api/jobs/{again}").json()["status"] == "completed"
    assert len(calls) == len(photos)
    assert renders[-1]["style"]["narration"] == "ai"


def test_partial_failure_retry_keeps_clips_and_provider_task(client, automated, monkeypatch):
    pid, calls, renders, generate = automated
    failed = []

    def fail_second(source, prompt, target, state, persist, cancel, progress):
        if len(calls) == 1 and not failed:
            failed.append(state["assetId"])
            persist({"taskId": "already-paid", "submissionStarted": True})
            raise TimeoutError("download timeout")
        if state["assetId"] in failed:
            assert state["taskId"] == "already-paid"
        generate(source, prompt, target, state, persist, cancel, progress)

    monkeypatch.setattr(worker, "generate_video", fail_second)
    jid = start(client, pid)
    worker.process_job(jid)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["status"] == "failed", job
    assert sum(p["status"] == "completed" for p in job["photos"]) == 1
    assert not renders
    retried = client.post(f"/api/jobs/{jid}/retry")
    assert retried.status_code == 202, retried.text
    worker.process_job(retried.json()["id"])
    assert client.get(f"/api/jobs/{retried.json()['id']}").json()["status"] == "completed"
    assert len(calls) == len(set(calls))
    assert len(renders) == 1


def test_twelve_photos_fit_short_timeline(client, automated):
    pid, calls, renders, _ = automated
    for i in range(9):
        content = io.BytesIO()
        Image.new("RGB", (40, 40), (i * 20, 30, 50)).save(content, format="PNG")
        response = client.post(f"/api/projects/{pid}/assets", files={"file": (f"photo-{i}.png", content.getvalue(), "image/png")})
        assert response.status_code == 201, response.text
    project = client.get(f"/api/projects/{pid}").json()
    info = {**project["info"], "conceptId": "review", "duration": 15}
    info["style"] = {**info["style"], "pace": "fast"}
    assert client.put(f"/api/projects/{pid}", json=info).status_code == 200
    jid = start(client, pid)
    worker.process_job(jid)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["status"] == "completed", job
    assert len(calls) == 12
    scenes = renders[0]["scenes"]
    assert len(scenes) == 12 and len({s["assetId"] for s in scenes}) == 12
    assert sum(s["durationFrames"] for s in scenes) == 450
    assert all(s["durationFrames"] >= 30 for s in scenes)


def test_api_gates_and_cancel_before_generation(client, automated, monkeypatch):
    pid, calls, renders, _ = automated
    endpoint = f"/api/projects/{pid}/auto-video"
    monkeypatch.setattr(settings, "runway_api_key", "")
    assert client.post(endpoint, json={"revision": 0}).status_code == 409
    monkeypatch.setattr(settings, "runway_api_key", "test-key")
    assert client.post(endpoint, json={"revision": 999}).status_code == 409
    jid = start(client, pid)
    assert client.post(endpoint, json={"revision": 0}).status_code == 409
    assert client.post(f"/api/jobs/{jid}/cancel").status_code == 200
    assert not calls and not renders
    retry = client.post(f"/api/jobs/{jid}/retry")
    assert retry.status_code == 202


def test_render_failure_reuses_all_clips(client, automated, monkeypatch):
    pid, calls, renders, _ = automated
    render = worker.render_job
    monkeypatch.setattr(worker, "render_job", lambda *_: (_ for _ in ()).throw(RuntimeError("render failed")))
    jid = start(client, pid)
    worker.process_job(jid)
    assert client.get(f"/api/jobs/{jid}").json()["status"] == "failed"
    total = len(calls)
    monkeypatch.setattr(worker, "render_job", render)
    retry = client.post(f"/api/jobs/{jid}/retry").json()
    worker.process_job(retry["id"])
    assert client.get(f"/api/jobs/{retry['id']}").json()["status"] == "completed"
    assert len(calls) == total and len(renders) == 1


def test_ambiguous_submission_survives_new_start(client, automated, monkeypatch):
    pid, _, _, _ = automated
    states = []

    def ambiguous(source, prompt, target, state, persist, cancel, progress):
        states.append(copy.deepcopy(state))
        persist({"submissionStarted": True})
        raise RuntimeError("접수 여부 확인 필요")

    monkeypatch.setattr(worker, "generate_video", ambiguous)
    jid = start(client, pid)
    worker.process_job(jid)
    again = start(client, pid)
    worker.process_job(again)
    assert states[-1]["submissionStarted"] is True
    with Session() as db:
        assert db.get(RenderJob, again).status == "failed"
        assert not list(db.query(Asset).filter_by(project_id=pid, kind="video"))


def test_cancel_during_second_clip_preserves_first(client, automated, monkeypatch):
    pid, calls, renders, generate = automated

    def cancel_second(source, prompt, target, state, persist, cancel, progress):
        if len(calls) == 1:
            persist({"taskId": None, "submissionStarted": False})
            raise worker.VideoCancelled()
        generate(source, prompt, target, state, persist, cancel, progress)

    monkeypatch.setattr(worker, "generate_video", cancel_second)
    jid = start(client, pid)
    worker.process_job(jid)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["status"] == "cancelled"
    assert sum(p["status"] == "completed" for p in job["photos"]) == 1
    monkeypatch.setattr(worker, "generate_video", generate)
    retry = client.post(f"/api/jobs/{jid}/retry")
    assert retry.status_code == 202
    worker.process_job(retry.json()["id"])
    assert client.get(f"/api/jobs/{retry.json()['id']}").json()["status"] == "completed"
    assert len(calls) == len(set(calls))


def test_retry_rejects_changed_edit_and_new_start_keeps_style(client, automated, monkeypatch):
    pid, calls, renders, generate = automated
    monkeypatch.setattr(worker, "render_job", lambda *_: (_ for _ in ()).throw(RuntimeError("render failed")))
    jid = start(client, pid)
    worker.process_job(jid)
    project = client.get(f"/api/projects/{pid}").json()
    board = project["board"]
    board["style"]["pace"] = "slow"
    board["style"]["musicMood"] = "lofi"
    assert client.put(f"/api/projects/{pid}/storyboard", json={"data": board, "revision": project["revision"]}).status_code == 200
    assert client.post(f"/api/jobs/{jid}/retry").status_code == 409
    again = start(client, pid, use_current_edit=True)
    with Session() as db:
        payload = db.get(RenderJob, again).payload
        assert payload["product"]["style"]["pace"] == "slow"
        assert payload["product"]["style"]["musicMood"] == "lofi"
        assert all(item.get("videoId") for item in payload["items"])


def test_new_direction_does_not_reuse_camera_only_clips(client, automated):
    pid, _, _, _ = automated
    jid = start(client, pid)
    worker.process_job(jid)
    with Session() as db:
        job = db.get(RenderJob, jid)
        payload = copy.deepcopy(job.payload)
        for item in payload["items"]:
            item["prompt"] = ""
        job.payload = payload
        db.commit()
    plan = client.get(f"/api/projects/{pid}/auto-video/plan").json()
    assert all(photo["status"] == "pending" for photo in plan["photos"])
    # The old assets remain stored; only their eligibility for the new direction changes.
    project = client.get(f"/api/projects/{pid}").json()
    assert len([a for a in project["assets"] if a["kind"] == "video"]) == len(plan["photos"])
