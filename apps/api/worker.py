import base64
import copy
import hashlib
import json
import logging
import math
import os
import shutil
import signal
import struct
import subprocess
import threading
import time
import wave
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import select, update
from .ai import ai_board, analyze
from .narration import narration_text, speech, require_narration, provider as narration_provider
from .config import ROOT, settings
from .db import Analysis, Asset, Project, RenderJob, RenderOutput, Session, Storyboard, ConceptPreset, now, uid
from .schemas import Board
from .services import ACTIVE, fingerprint, make_board, save_board, srt, transition
from .storage import binary, probe, quota, remove_tree, safe_path
from .video import generate_video, VideoCancelled, MAX_VIDEO_BYTES

log = logging.getLogger("paper-worker")


class Cancelled(Exception):
    pass


def cancelled(jid):
    with Session() as db:
        job = db.get(RenderJob, jid)
        return not job or job.cancel_requested


def report(jid, status, progress):
    if cancelled(jid):
        raise Cancelled()
    with Session() as db:
        job = db.get(RenderJob, jid)
        if job.kind == "auto_video":
            if job.payload.get("phase") == "clips":
                items = job.payload["items"]
                done = sum(bool(item.get("videoId")) for item in items)
                progress = 10 + 60 * (done + progress / 100) / len(items)
                status = "images"
            elif job.payload.get("phase") == "render":
                progress = 70 + progress * 0.29
        transition(job, status, progress)
        db.get(Project, job.project_id).status = status
        db.commit()


def node_binary():
    local = ROOT / ".tools/node-v22.16.0-win-x64/node.exe"
    return str(local) if local.exists() else (shutil.which("node") or "node")


def browser_binary():
    if settings.browser_executable:
        return settings.browser_executable
    windows = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    return str(windows) if windows.exists() else (shutil.which("chromium") or shutil.which("google-chrome") or "")


def data_url(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def run_process(args, jid, folder, progress_base=0, progress_span=0):
    env = os.environ.copy()
    env["PATH"] = str(Path(node_binary()).parent) + os.pathsep + env.get("PATH", "")
    with (folder / "process.log").open("wb") as output:
        process = subprocess.Popen(
            args,
            cwd=ROOT,
            stdout=output,
            stderr=subprocess.STDOUT,
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        start = time.monotonic()
        try:
            while process.poll() is None:
                if cancelled(jid) or time.monotonic() - start > settings.render_timeout:
                    (folder / "cancel").touch()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
                    if cancelled(jid):
                        raise Cancelled()
                    raise TimeoutError("렌더 시간 제한을 초과했습니다.")
                if progress_span:
                    try:
                        value = json.loads((folder / "progress.json").read_text())["progress"]
                        report(jid, "rendering", progress_base + progress_span * value / 100)
                    except (OSError, ValueError, KeyError):
                        pass
                time.sleep(0.6)
            if process.returncode:
                if cancelled(jid):
                    raise Cancelled()
                raise RuntimeError("영상 처리에 실패했습니다. FFmpeg·브라우저 설치 및 작업 로그를 확인하세요.")
        finally:
            if process.poll() is None:
                (folder/'cancel').touch()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)


def synth_music(path, seconds, mood):
    rates = {
        "bright_cute": (104, [523.25, 659.25, 783.99, 659.25]),
        "lofi": (68, [261.63, 329.63, 392, 293.66]),
        "trendy": (120, [220, 261.63, 329.63, 293.66]),
        "premium": (62, [196, 246.94, 293.66, 369.99]),
        "retro": (100, [440, 523.25, 659.25, 523.25]),
    }
    bpm, notes = rates.get(mood, rates["lofi"])
    rate = 24000
    frames = bytearray()
    beat = 60 / bpm
    for i in range(seconds * rate):
        t = i / rate
        note = notes[int(t / beat) % len(notes)]
        envelope = min(1, (t % beat) * 35) * math.exp(-3 * (t % beat) / beat)
        val = (
            0.12 * envelope * (math.sin(2 * math.pi * note * t) + 0.3 * math.sin(2 * math.pi * note / 2 * t))
            if mood != "none"
            else 0
        )
        frames.extend(struct.pack("<h", int(val * 32767)))
    with wave.open(str(path), "wb") as out:
        out.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        out.writeframes(frames)


def prepare_audio(board, assets, folder, jid):
    require_narration(board)
    duration = board["durationSec"]
    music_asset = next((a for a in assets if a.kind == "audio"), None)
    music = safe_path(music_asset.optimized) if music_asset else folder / "music.wav"
    if not music_asset:
        synth_music(music, duration, board["style"]["musicMood"])
    voice = folder / "voice.wav"
    synth_music(voice, duration, "none")
    has_voice = False
    if board["style"]["narration"] == "ai":
        with Session() as db:
            project_id = db.get(RenderJob, jid).project_id
        lines = []
        for i, scene in enumerate(board["scenes"]):
            if cancelled(jid):
                raise Cancelled()
            source, fitted = folder / f"voice-{i}.mp3", folder / f"voice-{i}.wav"
            text = narration_text(scene, board["style"])
            if not text:
                synth_music(fitted, math.ceil(scene["durationFrames"] / 30), "none")
            else:
                try:
                    speech(text, source, project_id, lambda: cancelled(jid))
                except VideoCancelled:
                    raise Cancelled() from None
                has_voice = True
                length = float(probe(source)["format"]["duration"])
                target = scene["durationFrames"] / 30
                rate = max(1, length / target)
                filters = []
                while rate > 2:
                    filters.append("atempo=2")
                    rate /= 2
                filters += [f"atempo={rate}", "loudnorm=I=-16:TP=-2:LRA=11", "apad", f"atrim=0:{target}"]
                run_process(
                    [
                        binary("ffmpeg"),
                        "-y",
                        "-i",
                        str(source),
                        "-af",
                        ",".join(filters),
                        "-ar",
                        "24000",
                        "-ac",
                        "1",
                        str(fitted),
                    ],
                    jid,
                    folder,
                )
            lines.append((fitted, scene["durationFrames"] / 30))
        with wave.open(str(voice), "wb") as out:
            out.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
            for part, seconds in lines:
                with wave.open(str(part), "rb") as src:
                    data = src.readframes(round(seconds * 24000))
                    out.writeframes(data.ljust(round(seconds * 24000) * 2, b"\0"))
    return music, voice, has_voice


def verify_video(path, duration):
    metadata = probe(path)
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    audio = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
    actual = float(metadata["format"]["duration"])
    if (
        (video["width"], video["height"], video["codec_name"], audio["codec_name"]) != (1080, 1920, "h264", "aac")
        or abs(actual - duration) > 0.15
        or video["r_frame_rate"] != "30/1"
    ):
        raise ValueError("완성 영상이 출력 규격에 맞지 않습니다.")
    return {
        "width": 1080,
        "height": 1920,
        "videoCodec": "h264",
        "audioCodec": "aac",
        "fps": 30,
        "duration": actual,
        "bytes": path.stat().st_size,
    }


def variant_board(board, variant):
    board = copy.deepcopy(board)
    if variant:
        board["hook"] = board["hookCandidates"][variant % len(board["hookCandidates"])]
        body, end = board["scenes"][:-1], board["scenes"][-1:]
        if len(body) > 1:
            offset = variant % len(body)
            body = body[offset:] + body[:offset]
        board["scenes"] = body + end
        board["scenes"][0]["caption"] = board["hook"]
        board["scenes"][0]["voiceover"] = board["hook"]
        for i, scene in enumerate(board["scenes"]):
            scene["motion"]["type"] = ["zoom_in", "pan_left", "zoom_out", "pan_right"][(i + variant) % 4]
    return Board.model_validate(board).model_dump()


def render_job(job, assets):
    parent = safe_path(f"projects/{job.project_id}/jobs/{job.id}")
    parent.mkdir(parents=True, exist_ok=True)
    board = job.payload["board"]
    outputs = []
    quota(250 * 1024 * 1024 * board["style"]["variants"])
    for variant in range(board["style"]["variants"]):
        base = 5 + variant * 90 / board["style"]["variants"]
        span = 90 / board["style"]["variants"]
        report(job.id, "images", base)
        b = variant_board(board, variant)
        folder = parent / f"variant-{variant + 1}"
        folder.mkdir(exist_ok=True)
        props = {
            "board": b,
            "preset": job.payload["preset"],
            "brand": job.payload["product"]["brand"],
            "storeName": job.payload["product"].get("storeName", ""),
            "storeUrl": job.payload["product"].get("storeUrl", ""),
            "assets": {
                a.id: {"src": data_url(safe_path(a.optimized), "image/jpeg"), "width": a.width, "height": a.height}
                for a in assets
                if a.kind == "image"
            },
        }
        media = folder / "media" / "clips"
        media.mkdir(parents=True)
        props["videos"] = {}
        used_videos = {s.get("videoAssetId") for s in b["scenes"]} - {None}
        for aid in used_videos:
            asset = next((a for a in assets if a.id == aid and a.kind == "video"), None)
            if not asset or not safe_path(asset.optimized).is_file():
                raise ValueError("장면에 사용된 AI 영상이 없습니다. 영상을 다시 선택해 주세요.")
            shutil.copyfile(safe_path(asset.optimized), media / f"{aid}.mp4")
            props["videos"][aid] = {"src": f"clips/{aid}.mp4"}
        logo = next((a for a in assets if a.kind == "logo"), None)
        if logo:
            props["logo"] = data_url(safe_path(logo.optimized), "image/png")
        manifest = folder / "manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "inputProps": props,
                    "outputDir": str(folder),
                    "browserExecutable": browser_binary(),
                    "concurrency": settings.render_concurrency,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        report(job.id, "audio", base + span * 0.03)
        music, voice, has_voice = prepare_audio(b, assets, folder, job.id)
        report(job.id, "rendering", base + span * 0.08)
        run_process(
            [node_binary(), str(ROOT / "apps/renderer/render.mjs"), str(manifest)],
            job.id,
            folder,
            base + span * 0.08,
            span * 0.8,
        )
        duration, fade, volume = b["durationSec"], b["style"]["fadeSec"], b["style"]["volume"]
        audiofilter = (
            f"[1:a]volume={volume},afade=t=in:d={fade},afade=t=out:st={max(0, duration - fade)}:d={fade}[music];"
        )
        if b["style"]["ducking"] and has_voice:
            audiofilter += "[2:a]asplit=2[voice][side];[music][side]sidechaincompress=threshold=0.015:ratio=6:attack=30:release=300[duck];[duck][voice]amix=inputs=2:normalize=0[a]"
        else:
            audiofilter += "[music][2:a]amix=inputs=2:normalize=0[a]"
        run_process(
            [
                binary("ffmpeg"),
                "-y",
                "-i",
                str(folder / "silent.mp4"),
                "-stream_loop",
                "-1",
                "-i",
                str(music),
                "-i",
                str(voice),
                "-filter_complex",
                audiofilter,
                "-map",
                "0:v:0",
                "-map",
                "[a]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-t",
                str(duration),
                "-movflags",
                "+faststart",
                str(folder / "video.mp4"),
            ],
            job.id,
            folder,
        )
        report(job.id, "verifying", base + span * 0.95)
        verification = verify_video(folder / "video.mp4", duration)
        verification["narration"] = "ai" if has_voice else b["style"]["narration"]
        verification["narrationSource"] = b["style"].get("narrationSource", "script")
        verification["ttsProvider"] = narration_provider() if has_voice else None
        verification["music"] = "uploaded" if any(a.kind == "audio" for a in assets) else b["style"]["musicMood"]
        verification["musicVolume"] = b["style"]["volume"]
        (folder / "subtitles.srt").write_text(srt(b), encoding="utf-8-sig")
        (folder / "script.txt").write_text("\n\n".join(narration_text(s, b["style"]) for s in b["scenes"]), encoding="utf-8")
        (folder / "metadata.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "product": job.payload["product"],
                    "preset": job.payload["preset"],
                    "board": b,
                    "verification": verification,
                    "variant": variant + 1,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        filenames = {
            "video": "video.mp4",
            "thumbnail": "thumbnail.png",
            "subtitles": "subtitles.srt",
            "script": "script.txt",
            "metadata": "metadata.json",
        }
        final = safe_path(f"projects/{job.project_id}/outputs/{job.id}-{variant + 1}")
        final.parent.mkdir(exist_ok=True)
        final.mkdir()
        for name in filenames.values():
            (folder / name).replace(final / name)
        outputs.append(
            RenderOutput(
                project_id=job.project_id,
                job_id=job.id,
                variant=variant + 1,
                files={k: str((final / v).relative_to(settings.storage_dir.resolve())) for k, v in filenames.items()},
                verification=verification,
            )
        )
        remove_tree(str(folder.relative_to(settings.storage_dir.resolve())))
    return outputs


def video_job(job, db, item_index=None):
    report(job.id, "images", 5)
    quota(MAX_VIDEO_BYTES * 2)
    folder = safe_path(f"projects/{job.project_id}/jobs/{job.id}" +
                       (f"/clip-{item_index}" if item_index is not None else ""))
    folder.mkdir(parents=True, exist_ok=True)
    source = db.get(Asset, job.payload["assetId"])
    if not source or source.project_id != job.project_id or source.kind != "image":
        raise ValueError("원본 사진이 없습니다. 장면에서 사진을 다시 선택하세요.")

    def persist(values):
        with Session() as state_db:
            record = state_db.get(RenderJob, job.id)
            payload = copy.deepcopy(record.payload)
            if item_index is None:
                payload.update(values)
            else:
                payload["items"][item_index].update(values)
            record.payload = payload
            state_db.commit()

    def progress(value):
        try:
            report(job.id, "images", value)
        except Cancelled:
            raise VideoCancelled() from None

    try:
        try:
            generate_video(safe_path(source.optimized), job.payload["prompt"], folder / "source.mp4",
                           job.payload, persist, lambda: cancelled(job.id), progress)
        except (RuntimeError, TimeoutError) as error:
            if item_index is not None:
                raise type(error)(f"사진 {item_index + 1} 생성 실패: {error}") from None
            raise
    except VideoCancelled:
        raise Cancelled() from None
    metadata = probe(folder / "source.mp4")
    video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), None)
    if not video or not 1 <= float(metadata["format"]["duration"]) <= 15:
        raise ValueError("생성 영상의 형식 또는 길이가 올바르지 않습니다.")
    report(job.id, "verifying", 90)
    # Consistent 5-second muted H.264 clips for preview and frame-accurate rendering.
    run_process([binary("ffmpeg"), "-y", "-i", str(folder / "source.mp4"), "-an",
                 "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30,tpad=stop_mode=clone:stop_duration=5",
                 "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                 str(folder / "video.mp4")], job.id, folder)
    if cancelled(job.id):
        raise Cancelled()
    board = db.get(Storyboard, job.project_id)
    data = copy.deepcopy(board.data) if board else None
    scene = next((s for s in data["scenes"] if s["id"] == job.payload["sceneId"]), None) if data else None
    if not scene or scene["assetId"] != source.id:
        raise ValueError("장면이 변경되었습니다. 사진과 구성을 다시 확인하세요.")
    aid = uid()
    relative = f"projects/{job.project_id}/assets/{aid}/video.mp4"
    destination = safe_path(relative)
    destination.parent.mkdir(parents=True)
    try:
        shutil.copyfile(folder / "video.mp4", destination)
        db.add(Asset(id=aid, project_id=job.project_id, kind="video", filename=f"AI-{job.payload['sceneId']}.mp4",
                     mime="video/mp4", size=destination.stat().st_size, width=720, height=1280,
                     sha256=hashlib.sha256(destination.read_bytes()).hexdigest(), original=relative, optimized=relative))
        scene["videoAssetId"] = aid
        if item_index is not None:
            for s in data["scenes"]:
                if s["assetId"] == source.id:
                    s["videoAssetId"] = aid
        saved = save_board(db, job.project_id, data)
        record = db.get(RenderJob, job.id)
        db.refresh(record)
        payload = copy.deepcopy(record.payload)
        if item_index is None:
            payload["videoId"] = aid
        else:
            payload["items"][item_index]["videoId"] = aid
            payload["revision"] = saved.revision
            payload["board"] = copy.deepcopy(saved.data)
        record.payload = payload
        db.flush()
    except Exception:
        remove_tree(str(destination.parent.relative_to(settings.storage_dir)))
        raise
    return destination.parent


def auto_video_job(job, db, project, photos):
    if not job.payload.get("board"):
        report(job.id, "analyzing", 2)
        preset = job.payload["preset"]
        presets = [p.data for p in db.scalars(select(ConceptPreset).where(ConceptPreset.active.is_(True)))]
        analysis = analyze(job.payload["product"], photos, presets)
        report(job.id, "storyboarding", 6)
        default = make_board(SimpleNamespace(info=job.payload["product"]), photos, preset, analysis, all_photos=True)
        edited = ai_board(default, job.payload["product"], photos)
        # Keep every uploaded photo in the final edit, even if AI omitted a scene.
        board = edited if len(edited["scenes"]) == len(default["scenes"]) else default
        for scene, original in zip(board["scenes"], default["scenes"]):
            scene.update(assetId=original["assetId"], videoAssetId=None, videoPrompt="",
                         durationFrames=original["durationFrames"], startFrame=original["startFrame"])
        board["scenes"][-1].update(layout="endcard", caption=project.info["cta"], voiceover=project.info["cta"])
        board["style"]["narration"] = "ai" if job.payload["narration"] else "script"
        board["style"]["narrationSource"] = "caption"
        if board["style"]["musicMood"] == "none":
            board["style"]["musicMood"] = preset["musicMood"]
        board = Board.model_validate(board).model_dump()
        payload = copy.deepcopy(job.payload)
        for item in payload["items"]:
            item["sceneId"] = next(s["id"] for s in board["scenes"] if s["assetId"] == item["assetId"])
            for s in board["scenes"]:
                if s["assetId"] == item["assetId"]:
                    s["videoAssetId"] = item.get("videoId")
                    s["videoPrompt"] = item["prompt"]
        saved = save_board(db, project.id, board, True)
        payload.update(board=board, revision=saved.revision, phase="clips")
        job.payload = payload
        db.commit()
    else:
        job.payload = {**job.payload, "phase": "clips"}
        db.commit()
    for index in range(len(job.payload["items"])):
        if cancelled(job.id):
            raise Cancelled()
        item = copy.deepcopy(job.payload["items"][index])
        if item.get("videoId"):
            clip = db.get(Asset, item["videoId"])
            if not clip or not safe_path(clip.optimized).is_file():
                raise ValueError("완료된 영상 파일이 없습니다. 전체 사진으로 숏츠 완성하기를 다시 눌러 주세요.")
            continue
        video_job(SimpleNamespace(id=job.id, project_id=job.project_id, payload=item), db, index)
        # Save each paid result before starting the next photo, so failures never discard it.
        db.commit()
        db.refresh(job)
    job.payload = {**job.payload, "phase": "render"}
    db.commit()
    assets = list(db.scalars(select(Asset).where(Asset.project_id == project.id).order_by(Asset.position)))
    outputs = render_job(job, assets)
    if cancelled(job.id):
        raise Cancelled()
    db.add_all(outputs)


def process_job(jid):
    video_folder = None
    succeeded = False
    try:
        with Session() as db:
            j = db.get(RenderJob, jid)
            p = db.get(Project, j.project_id)
            assets = list(db.scalars(select(Asset).where(Asset.project_id == p.id).order_by(Asset.position)))
            photos = [a for a in assets if a.kind == "image"]
            if j.kind in ("analysis", "storyboard"):
                report(jid, "analyzing", 10)
                presets = [x.data for x in db.scalars(select(ConceptPreset).where(ConceptPreset.active.is_(True)))]
                hashed = fingerprint(p, photos)
                record = db.get(Analysis, p.id)
                if record and record.input_hash == hashed:
                    data = record.data
                else:
                    data = analyze(p.info, photos, presets)
                    if record:
                        record.data, record.input_hash, record.model = data, hashed, settings.ai_model
                    else:
                        db.add(
                            Analysis(
                                project_id=p.id,
                                data=data,
                                input_hash=hashed,
                                model=settings.ai_model if data["mode"] == "ai" else data["mode"],
                            )
                        )
                if j.kind == "storyboard":
                    report(jid, "storyboarding", 65)
                    preset = db.get(ConceptPreset, p.info["conceptId"]).data
                    board = make_board(p, photos, preset, data)
                    board = ai_board(board, p.info, photos)
                    save_board(db, p.id, board, True)
                if cancelled(jid):
                    raise Cancelled()
            elif j.kind == "auto_video":
                auto_video_job(j, db, p, photos)
            elif j.kind == "video":
                video_folder = video_job(j, db)
                if cancelled(jid):
                    raise Cancelled()
            else:
                outputs = render_job(j, assets)
                if cancelled(jid):
                    raise Cancelled()
                db.add_all(outputs)
            j.status, j.progress, j.ended_at = "completed", 100, now()
            p.status = "completed" if j.kind in ("render", "auto_video") else "ready"
            p.updated_at = now()
            db.commit()
            succeeded = True
    except Exception as error:
        with Session() as db:
            j = db.get(RenderJob, jid)
            if j:
                stage = j.status
                j.status = "cancelled" if isinstance(error, Cancelled) else "failed"
                j.error_code = None if isinstance(error, Cancelled) else f"{stage}:{type(error).__name__}"
                j.error = (
                    None
                    if isinstance(error, Cancelled)
                    else (
                        str(error)[:300]
                        if isinstance(error, (ValueError, RuntimeError, TimeoutError, PermissionError))
                        else "작업을 완료하지 못했습니다. 설치 및 저장 공간을 확인한 후 재시도하세요."
                    )
                )
                j.ended_at = now()
                db.get(Project, j.project_id).status = "ready" if db.get(Storyboard, j.project_id) else "draft"
                db.commit()
                for folder in safe_path(f"projects/{j.project_id}/outputs").glob(f"{jid}-*"):
                    remove_tree(str(folder.relative_to(settings.storage_dir.resolve())))
        log.error(json.dumps({"jobId": jid, "type": type(error).__name__}))
    finally:
        if video_folder and not succeeded:
            remove_tree(str(video_folder.relative_to(settings.storage_dir)))
        with Session() as db:
            j = db.get(RenderJob, jid)
            if j:
                remove_tree(f"projects/{j.project_id}/jobs/{jid}")


@contextmanager
def worker_lock():
    path = safe_path("worker.lock")
    with path.open("a+b") as handle:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            if path.stat().st_size == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def recover():
    with Session() as db:
        for job in db.scalars(select(RenderJob).where(RenderJob.status.in_([x for x in ACTIVE if x != "queued"]))):
            job.status, job.error_code, job.error, job.ended_at = (
                "failed",
                "worker_restarted",
                "작업 중 서버가 재시작되었습니다. 재시도해 주세요.",
                now(),
            )
            db.get(Project, job.project_id).status = "ready" if db.get(Storyboard, job.project_id) else "draft"
            remove_tree(f"projects/{job.project_id}/jobs/{job.id}")
            for folder in safe_path(f"projects/{job.project_id}/outputs").glob(f"{job.id}-*"):
                remove_tree(str(folder.relative_to(settings.storage_dir.resolve())))
        db.commit()


def main():
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())

    def heartbeat():
        while not stopping.is_set():
            safe_path("worker-heartbeat.json").write_text(json.dumps({"pid": os.getpid(), "time": now()}))
            stopping.wait(10)

    with worker_lock():
        recover()
        threading.Thread(target=heartbeat, daemon=True).start()
        try:
            while not stopping.is_set():
                with Session() as db:
                    job = db.scalar(
                        select(RenderJob).where(RenderJob.status == "queued").order_by(RenderJob.created_at).limit(1)
                    )
                    jid = job.id if job else None
                    if job:
                        claimed = db.execute(
                            update(RenderJob)
                            .where(RenderJob.id == jid, RenderJob.status == "queued")
                            .values(status="preparing", started_at=now())
                        )
                        db.commit()
                        if not claimed.rowcount:
                            jid = None
                if jid:
                    process_job(jid)
                else:
                    stopping.wait(0.8)
        finally:
            stopping.set()
            safe_path("worker-heartbeat.json").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
