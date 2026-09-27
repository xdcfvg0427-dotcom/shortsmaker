import copy
import json
import shutil
import subprocess

import httpx
import pytest

from apps.api import video, worker
from apps.api.config import ROOT, settings
from apps.api.db import RenderJob, Session
from apps.api.storage import binary, probe, safe_path
from test_studio import finish_job


def mock_client(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(
        video.httpx, "Client", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(settings, "runway_api_key", "test-secret")
    monkeypatch.setattr(video.time, "sleep", lambda _: None)


def test_provider_request_poll_download_and_resume(monkeypatch, tmp_path):
    calls, state = [], {}

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/v1/organization":
            return httpx.Response(200, json={"creditBalance": 100})
        if request.method == "POST":
            body = json.loads(request.content)
            assert body["promptImage"].startswith("data:image/jpeg;base64,")
            assert body["ratio"] == "720:1280" and body["duration"] == 5
            assert body["model"] == "gen4_turbo"
            assert request.headers["x-runway-version"] == "2024-11-06"
            return httpx.Response(200, json={"id": "test-task"})
        if request.url.host == "output.example":
            assert "authorization" not in request.headers
            return httpx.Response(200, content=b"fake-video")
        return httpx.Response(200, json={"status": "SUCCEEDED", "output": ["https://output.example/clip.mp4"]})

    mock_client(monkeypatch, handler)
    args = (
        ROOT / "samples/notebook-1.jpg",
        "camera movement",
        tmp_path / "clip.mp4",
        state,
        state.update,
        lambda: False,
        lambda _: None,
    )
    video.generate_video(*args)
    video.generate_video(*args)
    assert sum(method == "POST" for method, _ in calls) == 1
    assert state["taskId"] == "test-task"
    assert (tmp_path / "clip.mp4").read_bytes() == b"fake-video"


def test_provider_cancellation_deletes_remote_task(monkeypatch, tmp_path):
    calls, state = [], {"taskId": "existing"}

    def handler(request):
        calls.append(request.method)
        return httpx.Response(204)

    mock_client(monkeypatch, handler)
    with pytest.raises(video.VideoCancelled):
        video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: True, lambda _: None)
    assert calls == ["DELETE"]
    assert state["taskId"] is None


def test_provider_ambiguous_submission_is_not_repeated(monkeypatch, tmp_path):
    calls, state = [], {}

    def handler(request):
        if request.url.path == "/v1/organization":
            return httpx.Response(200, json={"creditBalance": 100})
        calls.append(request.method)
        raise httpx.ReadTimeout("test", request=request)

    mock_client(monkeypatch, handler)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            video.generate_video(
                ROOT / "samples/notebook-1.jpg", "", tmp_path / "x", state, state.update, lambda: False, lambda _: None
            )
    assert calls == ["POST"]


@pytest.mark.parametrize("balance", [0, 24.9])
def test_insufficient_credits_prevents_submission(monkeypatch, tmp_path, balance):
    calls, state = [], {}

    def handler(request):
        calls.append((request.method, request.url.path))
        return httpx.Response(200, json={"creditBalance": balance})

    mock_client(monkeypatch, handler)
    with pytest.raises(RuntimeError, match="Billing"):
        video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: False, lambda _: None)
    assert calls == [("GET", "/v1/organization")]
    assert not state.get("submissionStarted")


def test_credit_error_400_has_actionable_message():
    with pytest.raises(RuntimeError, match="25크레딧"):
        video.checked(httpx.Response(400, json={"error": "You do not have enough credits to run this task."}))


def test_validation_400_does_not_expose_provider_payload():
    with pytest.raises(RuntimeError, match="Request History") as error:
        video.checked(httpx.Response(400, json={"error": "invalid input", "promptImage": "private-image-data"}))
    assert "private-image-data" not in str(error.value)


@pytest.mark.parametrize("status", [401, 402, 429, 500])
def test_provider_errors_hide_response_secrets(monkeypatch, tmp_path, status):
    mock_client(monkeypatch, lambda _: httpx.Response(status, json={"error": "test-secret"}))
    with pytest.raises(RuntimeError) as error:
        video.generate_video(
            ROOT / "samples/notebook-1.jpg", "", tmp_path / "x", {}, lambda _: None, lambda: False, lambda _: None
        )
    assert "test-secret" not in str(error.value)


def test_provider_failed_task_and_timeout(monkeypatch, tmp_path):
    state = {"taskId": "existing"}
    mock_client(monkeypatch, lambda _: httpx.Response(200, json={"status": "FAILED"}))
    with pytest.raises(RuntimeError):
        video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: False, lambda _: None)
    assert state["taskId"] is None
    assert state["failedTaskId"] == "existing"
    assert state["failureCategory"] == "unknown"
    state["taskId"] = "still-running"
    monkeypatch.setattr(settings, "video_timeout", -1)
    with pytest.raises(TimeoutError):
        video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: False, lambda _: None)
    assert state["taskId"] == "still-running"


@pytest.mark.parametrize("code,category,phrase", [
    ("SAFETY.INPUT.IMAGE", "safety", "콘텐츠 검사"),
    ("INPUT_PREPROCESSING.SAFETY.TEXT", "safety", "콘텐츠 검사"),
    ("INTERNAL.BAD_OUTPUT.01", "quality", "품질 검사"),
    ("ASSET.INVALID", "invalid_asset", "입력 파일"),
    ("INTERNAL", "provider", "처리 오류"),
    (None, "unknown", "Request History"),
])
def test_task_failure_diagnostics_and_safe_retry(monkeypatch, tmp_path, code, category, phrase):
    calls = []
    state = {"taskId": "failed-task"}

    def handler(request):
        calls.append(request.method)
        return httpx.Response(200, json={"status": "FAILED", "failureCode": code,
                                        "failure": "private-image-data test-secret"})

    mock_client(monkeypatch, handler)
    with pytest.raises(RuntimeError, match=phrase) as error:
        video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: False, lambda _: None)
    assert "test-secret" not in str(error.value)
    assert "private-image-data" not in str(error.value)
    assert state["failedTaskId"] == "failed-task"
    assert state["failureCategory"] == category
    if category in ("safety", "invalid_asset"):
        with pytest.raises(RuntimeError, match="재전송하지 않았습니다"):
            video.generate_video(None, "", tmp_path / "x", state, state.update, lambda: False, lambda _: None)
        assert calls == ["GET"]


def test_video_api_worker_lifecycle(client, demo, monkeypatch, tmp_path):
    pid = demo["id"]
    finish_job(client, f"/api/projects/{pid}/storyboard/generate")
    p = client.get(f"/api/projects/{pid}").json()
    scene = p["board"]["scenes"][0]
    endpoint = f"/api/projects/{pid}/scenes/{scene['id']}/video"
    monkeypatch.setattr(settings, "runway_api_key", "")
    assert client.post(endpoint, json={"revision": p["revision"]}).status_code == 409
    monkeypatch.setattr(settings, "runway_api_key", "test-secret")
    assert "test-secret" not in client.get("/api/health").text
    assert client.post(endpoint, json={"revision": 999}).status_code == 409
    response = client.post(endpoint, json={"revision": p["revision"]})
    assert response.status_code == 202
    jid = response.json()["id"]
    assert client.post(endpoint, json={"revision": p["revision"]}).status_code == 409
    assert (
        client.put(f"/api/projects/{pid}/storyboard", json={"data": p["board"], "revision": p["revision"]}).status_code
        == 409
    )

    fixture = tmp_path / "generated.mp4"
    subprocess.run(
        [
            binary("ffmpeg"),
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=180x320:rate=30",
            "-t",
            "1",
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
        persist({"taskId": "provider-task"})
        progress(50)
        shutil.copyfile(fixture, target)

    monkeypatch.setattr(worker, "generate_video", generated)
    worker.process_job(jid)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["status"] == "completed", job
    updated = client.get(f"/api/projects/{pid}").json()
    aid = updated["board"]["scenes"][0]["videoAssetId"]
    clip = next(a for a in updated["assets"] if a["id"] == aid)
    assert clip["kind"] == "video"
    with Session() as db:
        assert db.get(RenderJob, jid).payload["taskId"] == "provider-task"
    metadata = probe(safe_path(f"projects/{pid}/assets/{aid}/video.mp4"))
    assert float(metadata["format"]["duration"]) == 5
    assert metadata["streams"][0]["codec_name"] == "h264"
    assert client.get(clip["url"], headers={"Range": "bytes=0-100"}).status_code == 206
    other = client.post("/api/demo").json()
    assert client.get(f"/api/projects/{other['id']}/assets/{aid}/file").status_code == 404
    invalid = copy.deepcopy(updated["board"])
    invalid["scenes"][0]["videoAssetId"] = scene["assetId"]
    assert (
        client.put(
            f"/api/projects/{pid}/storyboard", json={"data": invalid, "revision": updated["revision"]}
        ).status_code
        == 422
    )
    duplicate = client.post(f"/api/projects/{pid}/duplicate")
    assert duplicate.status_code == 201, duplicate.text
    copied = duplicate.json()
    assert copied["board"]["scenes"][0]["videoAssetId"] != aid
    assert any(a["kind"] == "video" for a in copied["assets"])
    assert client.delete(f"/api/projects/{pid}/assets/{aid}").status_code == 200
    assert client.get(f"/api/projects/{pid}").json()["board"]["scenes"][0]["videoAssetId"] is None


def test_video_retry_preserves_task_and_rejects_changed_inputs(client, demo, monkeypatch):
    monkeypatch.setattr(settings, "runway_api_key", "test-secret")
    pid = demo["id"]
    finish_job(client, f"/api/projects/{pid}/storyboard/generate")
    p = client.get(f"/api/projects/{pid}").json()
    endpoint = f"/api/projects/{pid}/scenes/{p['board']['scenes'][0]['id']}/video"
    job = client.post(endpoint, json={"revision": p["revision"]}).json()
    with Session() as db:
        record = db.get(RenderJob, job["id"])
        record.status = "failed"
        record.payload = {**record.payload, "taskId": "existing", "submissionStarted": True}
        db.commit()
    retry = client.post(f"/api/jobs/{job['id']}/retry")
    assert retry.status_code == 202
    with Session() as db:
        record = db.get(RenderJob, retry.json()["id"])
        assert record.payload["taskId"] == "existing"
        record.status = "failed"
        db.commit()
    p["board"]["scenes"][0]["videoPrompt"] = "different movement"
    assert (
        client.put(f"/api/projects/{pid}/storyboard", json={"data": p["board"], "revision": p["revision"]}).status_code
        == 200
    )
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 409
