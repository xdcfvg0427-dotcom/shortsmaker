import hashlib
import io
import json
import os
import shutil
import subprocess
import warnings
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from .config import ROOT, settings
from .db import Asset, uid

Image.MAX_IMAGE_PIXELS = settings.max_image_pixels


def safe_path(relative):
    root = settings.storage_dir.resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or path == root:
        raise HTTPException(400, "허용되지 않는 파일 경로입니다.")
    return path


def remove_tree(relative):
    path = safe_path(relative)
    if path.is_dir():
        shutil.rmtree(path)


def quota(extra=0):
    size = sum(p.stat().st_size for p in settings.storage_dir.rglob("*") if p.is_file())
    if size + extra > settings.storage_limit_mb * 1024 * 1024:
        raise HTTPException(413, "저장 공간 한도를 초과했습니다. 이전 프로젝트를 정리해 주세요.")


def binary(name):
    configured = getattr(settings, f"{name}_path")
    if configured:
        return configured
    if shutil.which(name):
        return shutil.which(name)
    if name == "ffmpeg":
        path = ROOT / "node_modules/ffmpeg-static" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    else:
        platform = "win32" if os.name == "nt" else ("darwin" if os.sys.platform == "darwin" else "linux")
        import platform as plat

        arch = "arm64" if plat.machine().lower() in ("arm64", "aarch64") else "x64"
        path = (
            ROOT
            / "node_modules/ffprobe-static/bin"
            / platform
            / arch
            / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
        )
    return str(path)


def probe(path):
    result = subprocess.run(
        [binary("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        timeout=30,
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    return json.loads(result.stdout)


def upload(data, filename, mime, project_id, kind="image", position=0):
    quota(len(data) * 2)
    if len(data) > settings.max_upload_mb * 1024 * 1024 or not data:
        raise HTTPException(413, f"파일은 1바이트~{settings.max_upload_mb}MB까지 업로드할 수 있습니다.")
    suffix = Path(filename).suffix.lower()
    asset_id = uid()
    folder = f"projects/{project_id}/assets/{asset_id}"
    path = safe_path(folder)
    width = height = 0
    if kind in ("image", "logo"):
        allowed = {
            ".jpg": ("JPEG", "image/jpeg"),
            ".jpeg": ("JPEG", "image/jpeg"),
            ".png": ("PNG", "image/png"),
            ".webp": ("WEBP", "image/webp"),
        }
        if suffix not in allowed:
            raise HTTPException(415, "JPG, PNG, WebP만 지원합니다. HEIC는 JPG로 변환한 뒤 올려 주세요.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as img:
                    if (img.format, mime) != allowed[suffix]:
                        raise ValueError("확장자·MIME·파일 내용이 일치하지 않습니다.")
                    img.verify()
                with Image.open(io.BytesIO(data)) as src:
                    if src.width * src.height > settings.max_image_pixels:
                        raise ValueError("이미지 픽셀 수가 너무 큽니다.")
                    img = ImageOps.exif_transpose(src).convert("RGBA" if kind == "logo" else "RGB")
                    width, height = img.size
                    if min(width, height) < 32:
                        raise ValueError("이미지는 가로·세로 32픽셀 이상이어야 합니다.")
                    img.thumbnail((1920, 1920))
                    path.mkdir(parents=True)
                    output = "optimized.png" if kind == "logo" else "optimized.jpg"
                    img.save(path / output)
        except (
            ValueError,
            UnidentifiedImageError,
            OSError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ) as e:
            if path.exists():
                remove_tree(folder)
            raise HTTPException(415, f"이미지를 읽을 수 없습니다: {str(e)[:120]}") from None
    else:
        if suffix not in (".mp3", ".wav", ".m4a", ".ogg") or mime not in (
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/mp4",
            "audio/ogg",
            "audio/x-m4a",
        ):
            raise HTTPException(415, "MP3, WAV, M4A, OGG 음원만 지원합니다.")
        path.mkdir(parents=True)
        output = "original" + suffix
        (path / output).write_bytes(data)
        try:
            info = probe(path / output)
            if not any(s["codec_type"] == "audio" for s in info["streams"]) or any(
                s["codec_type"] == "video" for s in info["streams"]
            ):
                raise ValueError()
            if not 0 < float(info["format"]["duration"]) <= 600:
                raise ValueError()
        except Exception:
            remove_tree(folder)
            raise HTTPException(415, "손상되었거나 10분을 초과하는 음원입니다.") from None
    original = "original" + suffix
    (path / original).write_bytes(data)
    return Asset(
        id=asset_id,
        project_id=project_id,
        kind=kind,
        filename=Path(filename).name[:255],
        mime=mime,
        size=len(data),
        width=width,
        height=height,
        sha256=hashlib.sha256(data).hexdigest(),
        original=f"{folder}/{original}",
        optimized=f"{folder}/{output}",
        position=position,
        primary=position == 0 and kind == "image",
    )
