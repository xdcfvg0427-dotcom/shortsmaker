"""Runway image-to-video. Submission is never retried automatically."""

import base64
import io
import json
import time
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps

from .config import settings

MODEL = "gen4_turbo"
DEFAULT_PROMPT = (
    "Slow, gentle camera push toward the stationery product. Soft natural light moves subtly. "
    "The product stays still and retains its original shape, colors and printed details."
)
MAX_VIDEO_BYTES = 100 * 1024 * 1024
CLIP_CREDITS = 25  # Gen-4 Turbo: 5 credits/second, 5-second clip.
CREDIT_NOTICE = (
    "Runway API 크레딧이 부족합니다. dev.runwayml.com의 Billing에서 충전해 주세요. 5초 생성에 25크레딧이 필요합니다."
)


class VideoCancelled(Exception):
    pass


def image_input(path):
    # Pad to the output ratio so the provider does not crop the product.
    with Image.open(path) as source:
        canvas = ImageOps.pad(source.convert("RGB"), (720, 1280), color="#f5f3ee")
        data = io.BytesIO()
        canvas.save(data, format="JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(data.getvalue()).decode()


def credit_notice(required=CLIP_CREDITS):
    return f"Runway API 크레딧이 부족합니다. dev.runwayml.com의 Billing에서 충전해 주세요. 이번 생성에 최소 {required}크레딧이 필요합니다."


def checked(response, required_credits=CLIP_CREDITS):
    if response.is_error:
        try:
            body = response.json()
        except ValueError:
            body = {}
        # Classify provider diagnostics without exposing echoed prompts, images, or credentials.
        diagnostic = json.dumps(body, ensure_ascii=False).lower()
        if response.status_code in (400, 402) and (
            response.status_code == 402
            or (
                "credit" in diagnostic
                and any(word in diagnostic for word in ("insufficient", "enough", "balance", "purchase"))
            )
        ):
            raise RuntimeError(credit_notice(required_credits))
        messages = {
            401: "Runway API 키를 확인해 주세요.",
            403: "Runway API 사용 권한을 확인해 주세요.",
            400: "Runway가 입력을 거부했습니다 (400). 개발자 콘솔의 Manage → Request History에서 실패한 요청의 상세 원인을 확인해 주세요.",
            402: CREDIT_NOTICE,
            429: "Runway 요청 한도에 도달했습니다. 잠시 후 재시도하세요.",
        }
        raise RuntimeError(messages.get(response.status_code, f"Runway 요청 실패 ({response.status_code})."))
    return response.json()


def check_credits(client, required=CLIP_CREDITS):
    organization = checked(client.get("organization"), required)
    balance = organization.get("creditBalance") if isinstance(organization, dict) else None
    if isinstance(balance, (int, float)) and not isinstance(balance, bool) and balance < required:
        raise RuntimeError(credit_notice(required))


def generate_video(image_path, prompt, destination, state, persist, is_cancelled, progress):
    generate_media(
        "image_to_video",
        lambda: {
            "model": MODEL,
            "promptImage": image_input(image_path),
            "promptText": prompt or DEFAULT_PROMPT,
            "ratio": "720:1280",
            "duration": 5,
        },
        destination,
        state,
        persist,
        is_cancelled,
        progress,
        required_credits=CLIP_CREDITS,
        label="영상",
        max_bytes=MAX_VIDEO_BYTES,
    )


def generate_media(
    endpoint, request_body, destination, state, persist, is_cancelled, progress, *, required_credits, label, max_bytes
):
    if not settings.runway_api_key:
        raise RuntimeError(".env에 RUNWAY_API_KEY를 설정하고 API와 worker를 재시작해 주세요.")
    headers = {"Authorization": f"Bearer {settings.runway_api_key}", "X-Runway-Version": "2024-11-06"}
    task_id = state.get("taskId")
    started = time.monotonic()
    with httpx.Client(base_url="https://api.dev.runwayml.com/v1/", headers=headers, timeout=30) as client:
        try:
            if is_cancelled():
                raise VideoCancelled()
            if not task_id:
                if state.get("submissionStarted"):
                    raise RuntimeError(
                        "생성 요청의 접수 여부를 확인할 수 없습니다. Runway 사용 내역을 확인한 뒤 새로 생성하세요."
                    )
                check_credits(client, required_credits)
                payload = request_body()
                persist({"submissionStarted": True})
                response = client.post(endpoint, json=payload)
                # A definitive rejection allows a user-initiated retry. Ambiguous failures do not.
                if 400 <= response.status_code < 500:
                    persist({"submissionStarted": False})
                task_id = checked(response, required_credits).get("id")
                if not isinstance(task_id, str) or not task_id or "/" in task_id:
                    raise RuntimeError("Runway 생성 작업 ID를 받지 못했습니다.")
                persist({"taskId": task_id})
            while True:
                if is_cancelled():
                    raise VideoCancelled()
                if time.monotonic() - started > settings.video_timeout:
                    raise TimeoutError(
                        f"AI {label} 생성 대기 시간이 초과되었습니다. 재시도하면 기존 작업을 다시 확인합니다."
                    )
                try:
                    response = client.get(f"tasks/{task_id}")
                    if response.status_code == 429 or response.status_code >= 500:
                        result = {}
                    else:
                        result = checked(response, required_credits)
                except httpx.TransportError:
                    result = {}
                status = result.get("status")
                if status == "SUCCEEDED":
                    output = result.get("output", [])
                    if not output or not isinstance(output[0], str):
                        raise RuntimeError(f"생성된 {label} 주소가 없습니다.")
                    url = output[0]
                    break
                if status in ("FAILED", "CANCELED", "CANCELLED"):
                    persist({"taskId": None, "submissionStarted": False})
                    raise RuntimeError(f"Runway가 {label} 생성을 완료하지 못했습니다. 입력 내용을 확인해 주세요.")
                progress(min(80, 10 + (time.monotonic() - started) / 10))
                for _ in range(10):
                    if is_cancelled():
                        raise VideoCancelled()
                    time.sleep(0.5)
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username:
                raise RuntimeError(f"{label} 다운로드 주소가 올바르지 않습니다.")
            # Separate client: never forward the API credential to an output host.
            with httpx.Client(timeout=30, follow_redirects=True) as download:
                with download.stream("GET", url) as response:
                    if response.is_error:
                        raise RuntimeError(f"{label} 다운로드에 실패했습니다. 재시도하면 기존 결과를 다시 받습니다.")
                    size = 0
                    with destination.open("wb") as target:
                        for chunk in response.iter_bytes(65536):
                            if is_cancelled():
                                raise VideoCancelled()
                            if time.monotonic() - started > settings.video_timeout:
                                raise TimeoutError(f"{label} 다운로드 시간이 초과되었습니다.")
                            size += len(chunk)
                            if size > max_bytes:
                                raise RuntimeError(f"생성 {label}이 파일 크기 제한을 초과했습니다.")
                            target.write(chunk)
            if not destination.stat().st_size:
                raise RuntimeError(f"생성 {label} 파일이 비어 있습니다.")
        except VideoCancelled:
            if task_id:
                try:
                    client.delete(f"tasks/{task_id}")
                except httpx.HTTPError:
                    pass
            persist({"taskId": None, "submissionStarted": False})
            raise
        except httpx.HTTPError:
            raise RuntimeError("Runway 연결에 실패했습니다. API 키와 네트워크를 확인해 주세요.") from None
