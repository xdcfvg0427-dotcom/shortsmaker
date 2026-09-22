from pathlib import Path
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")
    database_url: str = "sqlite:///storage/studio.db"
    storage_dir: Path = ROOT / "storage"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"
    ai_provider: str = "demo"
    ai_model: str = "claude-sonnet-4-20250514"
    ai_api_key: str = ""
    ai_base_url: str = "https://api.anthropic.com"
    ai_timeout: int = 90
    tts_api_key: str = ""
    tts_voice_id: str = ""
    tts_model: str = "eleven_multilingual_v2"
    runway_api_key: str = ""
    video_timeout: int = 900
    storage_limit_mb: int = 10240
    max_upload_mb: int = 20
    max_image_pixels: int = 40000000
    render_timeout: int = 1800
    render_concurrency: int = 2
    browser_executable: str = ""
    ffmpeg_path: str = ""
    ffprobe_path: str = ""
    desktop_token: str = ""


settings = Settings(_env_file=None) if os.environ.get("DESKTOP_TOKEN") else Settings()
settings.storage_dir = (ROOT / settings.storage_dir).resolve()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
