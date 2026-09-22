import copy
import io
import json
import pytest
from PIL import Image
from apps.api.ai import AnthropicProvider, analyze
from apps.api.config import ROOT, settings
from apps.api.db import Asset, Project, RenderJob, Session, now
from apps.api.schemas import Board, Preset
from apps.api.services import images, srt, transition
from apps.api.storage import safe_path
from apps.api.worker import process_job, recover, variant_board


def finish_job(client, endpoint):
    result = client.post(endpoint)
    assert result.status_code == 202, result.text
    jid = result.json()["id"]
    with Session() as db:
        job = db.get(RenderJob, jid)
        job.status, job.started_at = "preparing", now()
        db.commit()
    process_job(jid)
    result = client.get("/api/jobs/" + jid).json()
    assert result["status"] == "completed", result
    return jid


def test_presets_and_custom_crud(client):
    data = client.get("/api/presets").json()
    assert len(data) == 20
    for path in (ROOT / "packages/concept-presets").glob("*.json"):
        Preset.model_validate_json(path.read_text(encoding="utf-8"))
    default = {k: v for k, v in data[0].items() if k != "builtin"}
    assert client.put("/api/presets/" + default["id"], json=default).status_code == 409
    clone = client.post("/api/presets/" + default["id"] + "/duplicate").json()
    clone.pop("builtin")
    clone["name"] = "나의 컨셉"
    assert client.put("/api/presets/" + clone["id"], json=clone).status_code == 200
    exported = client.get("/api/presets/export/json").json()
    assert len(exported) == 1
    assert client.post("/api/presets/import", json=exported).status_code == 200
    assert client.delete("/api/presets/" + clone["id"]).status_code == 200
    invalid = clone | {"id": "bad", "palette": ["red", "green", "blue"]}
    assert client.post("/api/presets", json=invalid).status_code == 422


def test_upload_validation_and_ownership(client, demo):
    pid = demo["id"]
    endpoint = f"/api/projects/{pid}/assets"
    for name, data, mime in [
        ("fake.jpg", b"not an image", "image/jpeg"),
        ("bad.heic", b"heic", "image/heic"),
        ("bad.jpg", (ROOT / "samples/notebook-1.jpg").read_bytes(), "image/png"),
    ]:
        assert client.post(endpoint, files={"file": (name, data, mime)}).status_code == 415
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), "red").save(buffer, format="PNG")
    upload = client.post(endpoint, files={"file": ("../../photo.png", buffer.getvalue(), "image/png")})
    assert upload.status_code == 201
    aid = upload.json()["id"]
    assert client.get(f"/api/projects/wrong/assets/{aid}/file").status_code == 404
    assert client.get(f"/api/projects/{pid}/assets/{aid}/file").status_code == 200
    assert client.get(f"/api/projects/{pid}/outputs/unknown/video").status_code == 404
    with pytest.raises(Exception):
        safe_path("../../outside")
    for _ in range(8):
        assert client.post(endpoint, files={"file": ("a.png", buffer.getvalue(), "image/png")}).status_code == 201
    assert client.post(endpoint, files={"file": ("a.png", buffer.getvalue(), "image/png")}).status_code == 409


def test_image_orientation_and_safe_storage(client, demo):
    im = Image.new("RGB", (80, 40), "green")
    exif = im.getexif()
    exif[274] = 6
    out = io.BytesIO()
    im.save(out, format="JPEG", exif=exif)
    result = client.post(
        f"/api/projects/{demo['id']}/assets", files={"file": ("turned.jpg", out.getvalue(), "image/jpeg")}
    )
    assert result.status_code == 201
    with Session() as db:
        a = db.get(Asset, result.json()["id"])
        assert (a.width, a.height) == (40, 80)
        assert safe_path(a.original).read_bytes() == out.getvalue()
        with Image.open(safe_path(a.optimized)) as optimized:
            assert optimized.size == (40, 80)


def test_end_to_end_api_through_render_request(client, demo):
    pid = demo["id"]
    finish_job(client, f"/api/projects/{pid}/analyze")
    a = client.get(f"/api/projects/{pid}/analysis").json()
    assert len(a["recommendations"]) == 3
    assert a["mode"] == "demo"
    finish_job(client, f"/api/projects/{pid}/storyboard/generate")
    board = client.get(f"/api/projects/{pid}/storyboard").json()
    board["data"]["scenes"][0]["caption"] = "수정한 자막"
    saved = client.put(f"/api/projects/{pid}/storyboard", json=board)
    assert saved.status_code == 200
    assert saved.json()["data"]["scenes"][0]["caption"] == "수정한 자막"
    assert client.put(f"/api/projects/{pid}/storyboard", json=board).status_code == 409
    j = client.post(f"/api/projects/{pid}/renders")
    assert j.status_code == 202
    assert client.post(f"/api/projects/{pid}/renders").status_code == 409
    assert client.delete("/api/projects/" + pid).status_code == 409
    jid = j.json()["id"]
    assert client.post("/api/jobs/" + jid + "/cancel").json()["status"] == "cancelled"
    assert client.post("/api/jobs/" + jid + "/retry").status_code == 202
    assert client.get(f"/api/projects/{pid}").json()["jobs"][0]["attempt"] == 2


def test_board_timing_srt_and_variants(client, demo):
    finish_job(client, f"/api/projects/{demo['id']}/storyboard/generate")
    b = client.get(f"/api/projects/{demo['id']}/storyboard").json()["data"]
    assert b["scenes"][0]["durationFrames"] == 60
    assert sum(s["durationFrames"] for s in b["scenes"]) == 450
    assert Board.model_validate(b).model_dump() == b
    for a, c in zip(b["scenes"], b["scenes"][1:]):
        assert a["startFrame"] + a["durationFrames"] == c["startFrame"]
    assert "00:00:00,000 --> 00:00:02,000" in srt(b)
    assert "00:00:15,000" in srt(b)
    variants = [variant_board(b, i) for i in range(4)]
    assert len({v["scenes"][0]["caption"] for v in variants}) == 4
    modified = copy.deepcopy(b)
    modified["scenes"][1]["durationFrames"] = 301
    normalized = Board.model_validate(modified)
    assert sum(s.durationFrames for s in normalized.scenes) == 450


def test_ai_fallback_and_invalid_response(client, demo, monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    monkeypatch.setattr(settings, "ai_api_key", "test-placeholder")

    def invalid(*_args, **_kwargs):
        raise ValueError("invalid output")

    monkeypatch.setattr(AnthropicProvider, "generate", invalid)
    with Session() as db:
        p = db.get(Project, demo["id"])
        result = analyze(p.info, images(db, p.id), client.get("/api/presets").json())
        assert result["mode"] == "fallback"
        assert result["verifiedFeatures"] == []


def test_state_transitions_and_recovery(client, demo):
    job = RenderJob(project_id=demo["id"], status="queued", progress=0)
    transition(job, "preparing", 5)
    transition(job, "rendering", 70)
    transition(job, "rendering", 60)
    assert job.progress == 70
    transition(job, "completed", 100)
    with pytest.raises(ValueError):
        transition(job, "rendering", 10)
    result = client.post(f"/api/projects/{demo['id']}/analyze").json()
    with Session() as db:
        j = db.get(RenderJob, result["id"])
        j.status = "analyzing"
        db.commit()
    recover()
    assert client.get("/api/jobs/" + result["id"]).json()["error_code"] == "worker_restarted"


def test_copy_delete_and_cross_origin(client, demo):
    pid = demo["id"]
    copied = client.post(f"/api/projects/{pid}/duplicate")
    assert copied.status_code == 201
    new = copied.json()
    assert len(new["assets"]) == 3
    assert {a["id"] for a in new["assets"]}.isdisjoint({a["id"] for a in demo["assets"]})
    assert (
        client.delete("/api/projects/" + new["id"], headers={"origin": "https://untrusted.example"}).status_code == 403
    )
    assert client.delete("/api/projects/" + new["id"]).status_code == 200
    assert client.get("/api/projects/" + new["id"]).status_code == 404
    assert not safe_path("projects/" + new["id"]).exists()


def test_contract_fixture(client, demo):
    finish_job(client, f"/api/projects/{demo['id']}/storyboard/generate")
    b = client.get(f"/api/projects/{demo['id']}/storyboard").json()["data"]
    fixture = ROOT / "tests/fixtures/board.json"
    reference = json.loads(fixture.read_text(encoding="utf-8"))
    assert set(b) == set(reference)
    assert set(b["scenes"][0]) == set(reference["scenes"][0])
    assert Board.model_validate(reference).fps == 30


def test_default_logo_and_image_reset(client, demo):
    buffer = io.BytesIO()
    Image.new("RGBA", (64, 64), (50, 100, 80, 255)).save(buffer, format="PNG")
    logo = client.post("/api/settings/logo", files={"file": ("logo.png", buffer.getvalue(), "image/png")})
    assert logo.status_code == 200
    assert client.get(logo.json()["logoUrl"]).status_code == 200
    p = client.post("/api/projects", json=demo["info"]).json()
    assert len(p["assets"]) == 1 and p["assets"][0]["kind"] == "logo"
    assert client.delete("/api/settings/logo").status_code == 200
    assert client.get(p["assets"][0]["url"]).status_code == 200
    finish_job(client, f"/api/projects/{demo['id']}/storyboard/generate")
    assert client.delete(f"/api/projects/{demo['id']}/assets").status_code == 200
    result = client.get("/api/projects/" + demo["id"]).json()
    assert result["board"] is None and result["analysis"] is None and result["assets"] == []


def test_body_limit_price_integrity_and_unique_queue(client, demo):
    from sqlalchemy.exc import IntegrityError

    endpoint = f"/api/projects/{demo['id']}"
    assert (
        client.post(
            endpoint + "/assets",
            headers={"content-type": "multipart/form-data; boundary=x", "content-length": str(100 * 1024 * 1024)},
            content=b"x",
        ).status_code
        == 413
    )
    finish_job(client, endpoint + "/storyboard/generate")
    data = demo["info"] | {"price": 12345}
    assert client.put(endpoint, json=data).status_code == 200
    current = client.get(endpoint + "/storyboard").json()
    assert current["data"]["outro"]["priceText"] == "12,345원"
    job = client.post(endpoint + "/renders")
    assert job.status_code == 202
    with Session() as db:
        db.add(RenderJob(project_id=demo["id"], kind="render"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
