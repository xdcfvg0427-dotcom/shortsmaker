import os
import tempfile
from pathlib import Path
import pytest

TEST_STORAGE = Path(tempfile.mkdtemp(prefix="paper-studio-test-"))
os.environ["STORAGE_DIR"] = str(TEST_STORAGE)
os.environ["DATABASE_URL"] = "sqlite:///" + str(TEST_STORAGE / "test.db").replace("\\", "/")
os.environ["AI_PROVIDER"] = "demo"
os.environ["AI_API_KEY"] = ""
os.environ["RUNWAY_API_KEY"] = ""
os.environ["TTS_API_KEY"] = ""
os.environ["TTS_VOICE_ID"] = ""
from apps.api.db import Base, engine
from apps.api.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def demo(client):
    response = client.post("/api/demo")
    assert response.status_code == 201, response.text
    return response.json()
