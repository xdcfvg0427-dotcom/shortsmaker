from array import array
import copy
import json
import shutil
import subprocess
import wave

import httpx
import pytest

from apps.api import narration, video, worker
from apps.api.config import ROOT, settings
from apps.api.db import RenderJob, Session
from apps.api.storage import binary, safe_path
from test_studio import finish_job


@pytest.fixture
def audio_fixture(tmp_path):
    target = tmp_path / "speech.mp3"
    subprocess.run(
        [
            binary("ffmpeg"),
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3",
            "-c:a",
            "libmp3lame",
            str(target),
        ],
        check=True,
        capture_output=True,
    )
    return target


def test_caption_narration_uses_edited_caption_and_preserves_custom_script():
    scene = {"caption": "새로 고친 자막", "voiceover": "이전 원고"}
    assert narration.narration_text(scene, {"narrationSource": "caption"}) == "새로 고친 자막"
    assert narration.narration_text(scene, {"narrationSource": "script"}) == "이전 원고"
    assert narration.narration_text(scene, {}) == "이전 원고"


def test_runway_speech_contract_and_cache(monkeypatch, audio_fixture, tmp_path):
    monkeypatch.setattr(settings, "runway_api_key", "secret-key")
    requests = []
    original = httpx.Client

    def handler(request):
        requests.append((request.method, request.url.path))
        if request.url.path == "/v1/organization":
            return httpx.Response(200, json={"creditBalance": 10})
        if request.method == "POST":
            assert request.url.path == "/v1/text_to_speech"
            body = json.loads(request.content)
            assert body["model"] == "eleven_multilingual_v2"
            assert body["promptText"] in ("한글 자막", "수정한 자막")
            assert body["voice"] == {"type": "runway-preset", "presetId": "Rachel"}
            assert "promptImage" not in body
            return httpx.Response(200, json={"id": "speech-task"})
        if request.url.host == "audio.example":
            assert "authorization" not in request.headers
            return httpx.Response(200, content=audio_fixture.read_bytes())
        return httpx.Response(200, json={"status": "SUCCEEDED", "output": ["https://audio.example/voice.mp3"]})

    monkeypatch.setattr(
        video.httpx, "Client", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler))
    )
    for text in ("한글 자막", "한글 자막", "수정한 자막"):
        narration.speech(text, tmp_path / "out.mp3", "cache-contract", lambda: False)
    assert sum(method == "POST" for method, _ in requests) == 2
    assert (tmp_path / "out.mp3").read_bytes() == audio_fixture.read_bytes()


def test_speech_retry_resumes_saved_task(monkeypatch, audio_fixture, tmp_path):
    monkeypatch.setattr(settings, "runway_api_key", "test-key")
    states = []

    def generate(_endpoint, _body, target, state, persist, *_args, **_kwargs):
        states.append(copy.deepcopy(state))
        if not state.get("taskId"):
            persist({"taskId": "existing-task", "submissionStarted": True})
            target.write_bytes(b"partial")
            raise TimeoutError("test timeout")
        shutil.copyfile(audio_fixture, target)

    monkeypatch.setattr(narration, "generate_media", generate)
    with pytest.raises(TimeoutError):
        narration.speech("이어 읽기", tmp_path / "x.mp3", "speech-retry", lambda: False)
    narration.speech("이어 읽기", tmp_path / "x.mp3", "speech-retry", lambda: False)
    assert states == [{}, {"taskId": "existing-task", "submissionStarted": True}]
    assert not list(safe_path("projects/speech-retry/speech").rglob("pending.mp3"))


def test_missing_connection_blocks_render_before_silent_success(client, demo):
    pid = demo["id"]
    finish_job(client, f"/api/projects/{pid}/storyboard/generate")
    board = client.get(f"/api/projects/{pid}/storyboard").json()
    board["data"]["style"].update(narration="ai", narrationSource="caption")
    assert client.put(f"/api/projects/{pid}/storyboard", json=board).status_code == 200
    result = client.post(f"/api/projects/{pid}/renders")
    assert result.status_code == 409
    assert "RUNWAY_API_KEY" in result.json()["error"]["message"]


def test_audio_preparation_fits_speech_and_music_to_timeline(client, demo, monkeypatch, audio_fixture, tmp_path):
    monkeypatch.setattr(settings, "runway_api_key", "test-key")
    pid = demo["id"]
    finish_job(client, f"/api/projects/{pid}/storyboard/generate")
    board = client.get(f"/api/projects/{pid}/storyboard").json()["data"]
    board["style"].update(narration="ai", narrationSource="caption", musicMood="lofi")
    board["scenes"][0]["caption"] = "바뀐 자막"
    board["scenes"][0]["voiceover"] = "읽으면 안 되는 이전 원고"
    board["scenes"][1]["caption"] = ""
    with Session() as db:
        job = RenderJob(project_id=pid, kind="render")
        db.add(job)
        db.commit()
        jid = job.id
    spoken = []

    def speech(text, target, project_id, _cancel):
        assert project_id == pid
        spoken.append(text)
        shutil.copyfile(audio_fixture, target)

    monkeypatch.setattr(worker, "speech", speech)
    music, voice, has_voice = worker.prepare_audio(board, [], tmp_path, jid)
    assert has_voice
    assert spoken[0] == "바뀐 자막"
    assert "읽으면 안 되는 이전 원고" not in spoken
    assert "" not in spoken
    for path in (music, voice):
        with wave.open(str(path), "rb") as wav:
            assert wav.getnframes() == 15 * 24000
            samples = array("h", wav.readframes(wav.getnframes()))
            assert max(abs(n) for n in samples) > 100
    with wave.open(str(voice), "rb") as wav:
        blank = board["scenes"][1]
        wav.setpos(blank["startFrame"] * 800)
        assert set(wav.readframes(blank["durationFrames"] * 800)) == {0}


def test_narration_failure_is_not_replaced_with_silence(client, demo, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "runway_api_key", "test-key")
    board = json.loads((ROOT / "tests/fixtures/board.json").read_text(encoding="utf-8"))
    board["style"].update(narration="ai", narrationSource="caption")
    with Session() as db:
        job = RenderJob(project_id=demo["id"], kind="render")
        db.add(job)
        db.commit()
        jid = job.id

    def fail(*_args):
        raise RuntimeError("speech service failed")

    monkeypatch.setattr(worker, "speech", fail)
    with pytest.raises(RuntimeError, match="speech service failed"):
        worker.prepare_audio(board, [], tmp_path, jid)
