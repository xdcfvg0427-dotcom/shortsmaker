from apps.api.config import settings
from apps.api.main import app
from apps.api.db import RenderJob, Session


def test_desktop_requires_token_for_reads_and_writes(client, monkeypatch):
    monkeypatch.setattr(settings, "desktop_token", "test-private-token")
    assert client.get("/api/health").status_code == 403
    assert client.post("/api/demo").status_code == 403
    assert client.get("/api/health", headers={"X-Paper-Studio-Token": "wrong"}).status_code == 403
    result = client.get("/api/health", headers={"X-Paper-Studio-Token": "test-private-token"})
    assert result.status_code == 200
    assert "test-private-token" not in result.text


def test_desktop_routes_hidden_on_web(client):
    assert client.get("/api/desktop/status").status_code == 404
    assert client.post("/api/desktop/pause").status_code == 404


def test_reconfigure_is_blocked_while_job_active(client, demo, monkeypatch):
    with Session() as db:
        db.add(RenderJob(project_id=demo["id"], kind="storyboard", status="queued", payload={}))
        db.commit()
    monkeypatch.setattr(settings, "desktop_token", "test-token")
    headers = {"X-Paper-Studio-Token": "test-token"}
    assert client.get("/api/desktop/status", headers=headers).json()["busy"]
    assert client.post("/api/desktop/pause", headers=headers).status_code == 409


def test_pause_rejects_new_mutations(client, monkeypatch):
    monkeypatch.setattr(settings, "desktop_token", "test-token")
    monkeypatch.setattr(app.state, "desktop_paused", False, raising=False)
    headers = {"X-Paper-Studio-Token": "test-token"}
    assert client.post("/api/desktop/pause", headers=headers).status_code == 200
    assert client.post("/api/demo", headers=headers).status_code == 503
    assert client.get("/api/health", headers=headers).status_code == 200
