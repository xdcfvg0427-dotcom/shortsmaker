"""Narration selection and persistent per-project speech cache."""

import hashlib
import json
import math
import shutil

from .ai import tts
from .config import settings
from .storage import probe, quota, safe_path
from .video import generate_media

RUNWAY_VOICE = "Rachel"


def provider():
    if settings.tts_api_key and settings.tts_voice_id:
        return "elevenlabs"
    if settings.runway_api_key:
        return "runway"
    return None


def narration_text(scene, style):
    return scene.get("caption" if style.get("narrationSource", "script") == "caption" else "voiceover", "").strip()


def require_narration(board):
    if board["style"]["narration"] != "ai":
        return
    if not provider():
        raise ValueError(
            "자동 내레이션을 사용하려면 RUNWAY_API_KEY 또는 ElevenLabs의 TTS_API_KEY·TTS_VOICE_ID를 설정해 주세요."
        )
    if not any(narration_text(scene, board["style"]) for scene in board["scenes"]):
        raise ValueError("읽을 내용이 없습니다. 자막을 입력하거나 내레이션 원고를 작성해 주세요.")


def speech(text, target, project_id, is_cancelled):
    selected = provider()
    if not selected:
        raise ValueError("음성 생성 API가 연결되어 있지 않습니다.")
    voice = settings.tts_voice_id if selected == "elevenlabs" else RUNWAY_VOICE
    model = settings.tts_model if selected == "elevenlabs" else "eleven_multilingual_v2"
    digest = hashlib.sha256(json.dumps([selected, model, voice, text], ensure_ascii=False).encode()).hexdigest()
    folder = safe_path(f"projects/{project_id}/speech/{digest}")
    folder.mkdir(parents=True, exist_ok=True)
    cached = folder / "audio.mp3"
    if cached.is_file():
        shutil.copyfile(cached, target)
        return
    quota(20 * 1024 * 1024)
    state_path = folder / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}

    def persist(values):
        state.update(values)
        temporary = folder / "state.tmp"
        temporary.write_text(json.dumps(state), encoding="utf-8")
        temporary.replace(state_path)

    pending = folder / "pending.mp3"
    try:
        if selected == "runway":
            generate_media(
                "text_to_speech",
                lambda: {
                    "model": model,
                    "promptText": text,
                    "voice": {"type": "runway-preset", "presetId": voice},
                },
                pending,
                state,
                persist,
                is_cancelled,
                lambda _: None,
                required_credits=max(1, math.ceil(len(text.encode("utf-16-le")) / 2 / 50)),
                label="내레이션",
                max_bytes=20 * 1024 * 1024,
            )
        elif not tts(text, pending):
            raise ValueError("음성을 생성하지 못했습니다. 음성 연결 설정을 확인해 주세요.")
        metadata = probe(pending)
        if (
            not any(s["codec_type"] == "audio" for s in metadata["streams"])
            or float(metadata["format"]["duration"]) <= 0
        ):
            raise ValueError("생성된 내레이션에 유효한 오디오가 없습니다.")
        pending.replace(cached)
        shutil.copyfile(cached, target)
    finally:
        pending.unlink(missing_ok=True)
