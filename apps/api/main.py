import asyncio
import copy
import json
import logging
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.exc import IntegrityError
from .config import ROOT, settings
from .db import (
    Analysis,
    AppSetting,
    Asset,
    ConceptPreset,
    Project,
    RenderJob,
    RenderOutput,
    Scene,
    Session,
    Storyboard,
    now,
    session,
    uid,
)
from .schemas import AppDefaults, Board, Preset, Product
from .services import ACTIVE, active_job, fingerprint, images, invalidate, recommendations, save_board, seed_presets
from .storage import binary, remove_tree, safe_path, upload
from .video import MODEL
from .automation import photo_plan, public_plan
from .review_prompt import hands_on_prompt
from .narration import provider as narration_provider, require_narration

logger = logging.getLogger("paper-studio")


@asynccontextmanager
async def lifespan(_app):
    with Session() as db:
        seed_presets(db)
    yield


app = FastAPI(title="종이상점 쇼츠 스튜디오", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
DB = Annotated[DBSession, Depends(session)]
desktop_mutations = asyncio.Lock()


@app.middleware("http")
async def request_log(request: Request, call_next):
    request_id = uid()
    request.state.request_id = request_id
    started = time.monotonic()
    if request.method in ("POST", "PUT"):
        content_type = request.headers.get("content-type", "")
        content_length = request.headers.get("content-length")
        is_multipart = content_type.startswith("multipart/")
        limit = (settings.max_upload_mb + 1) * 1024 * 1024 if is_multipart else 2 * 1024 * 1024
        if is_multipart and content_length is None:
            return JSONResponse(
                {
                    "error": {
                        "code": "length_required",
                        "message": "파일 업로드에는 Content-Length가 필요합니다.",
                        "requestId": request_id,
                    }
                },
                status_code=411,
            )
        if content_length and (not content_length.isdigit() or int(content_length) > limit):
            return JSONResponse(
                {
                    "error": {
                        "code": "request_too_large",
                        "message": "요청 크기 제한을 초과했습니다.",
                        "requestId": request_id,
                    }
                },
                status_code=413,
            )
    # Reject cross-origin mutations even when an ordinary HTML form bypasses CORS.
    if request.method in ("POST", "PUT", "DELETE"):
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins.split(","):
            return JSONResponse(
                {"error": {"code": "origin", "message": "허용되지 않은 요청 출처입니다.", "requestId": request_id}},
                status_code=403,
            )
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    logger.info(
        json.dumps(
            {
                "requestId": request_id,
                "method": request.method,
                "status": response.status_code,
                "durationMs": round((time.monotonic() - started) * 1000),
            }
        )
    )
    return response


@app.middleware("http")
async def desktop_session(request: Request, call_next):
    if not settings.desktop_token:
        return await call_next(request)
    if not secrets.compare_digest(
        request.headers.get("x-paper-studio-token", "").encode(), settings.desktop_token.encode()
    ):
        return JSONResponse({"error": {"message": "프로그램에서 다시 접속해 주세요."}}, status_code=403)
    if request.method in ("GET", "HEAD"):
        return await call_next(request)
    # Drain any in-flight upload/enqueue before pausing; no job can slip into a restart.
    async with desktop_mutations:
        if getattr(app.state, "desktop_paused", False):
            return JSONResponse({"error": {"message": "설정을 적용하는 중입니다."}}, status_code=503)
        return await call_next(request)


@app.exception_handler(HTTPException)
async def http_error(request, error):
    return JSONResponse(
        {
            "error": {
                "code": str(error.status_code),
                "message": str(error.detail),
                "requestId": getattr(request.state, "request_id", ""),
            }
        },
        status_code=error.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
    fields = [".".join(str(x) for x in e["loc"]) for e in error.errors()]
    return JSONResponse(
        {
            "error": {
                "code": "validation",
                "message": "입력 값을 확인해 주세요: " + ", ".join(fields),
                "requestId": getattr(request.state, "request_id", ""),
            }
        },
        status_code=422,
    )


@app.exception_handler(Exception)
async def internal_error(request, error):
    logger.error(json.dumps({"requestId": getattr(request.state, "request_id", ""), "type": type(error).__name__}))
    return JSONResponse(
        {
            "error": {
                "code": "internal",
                "message": "처리 중 오류가 발생했습니다. 요청 ID와 함께 서버 로그를 확인해 주세요.",
                "requestId": getattr(request.state, "request_id", ""),
            }
        },
        status_code=500,
    )


@app.exception_handler(IntegrityError)
async def conflict_error(request, error):
    return JSONResponse(
        {
            "error": {
                "code": "conflict",
                "message": "이미 처리 중이거나 다른 요청과 충돌했습니다. 화면을 새로고침해 주세요.",
                "requestId": getattr(request.state, "request_id", ""),
            }
        },
        status_code=409,
    )


def get_project(db, pid, mutable=False):
    p = db.get(Project, pid)
    if not p:
        raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")
    if mutable and active_job(db, pid):
        raise HTTPException(409, "작업 중에는 변경할 수 없습니다. 완료를 기다리거나 취소해 주세요.")
    return p


def asset_view(a):
    return {
        k: getattr(a, k) for k in ("id", "kind", "filename", "mime", "size", "width", "height", "position", "primary")
    } | {"url": f"/api/projects/{a.project_id}/assets/{a.id}/file"}


def job_view(job):
    return {
        k: getattr(job, k)
        for k in (
            "id",
            "project_id",
            "kind",
            "status",
            "progress",
            "attempt",
            "error",
            "error_code",
            "created_at",
            "started_at",
            "ended_at",
            "cancel_requested",
        )
    } | ({"photos": public_plan(job.payload.get("items", [])), "phase": job.payload.get("phase", "planning")}
         if job.kind == "auto_video" else {})


def project_view(db, p, detail=False):
    assets = list(db.scalars(select(Asset).where(Asset.project_id == p.id).order_by(Asset.position)))
    result = {
        "id": p.id,
        "name": p.name,
        "info": p.info,
        "status": p.status,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "assets": [asset_view(a) for a in assets],
    }
    if detail:
        a, b = db.get(Analysis, p.id), db.get(Storyboard, p.id)
        result.update(
            analysis=a.data if a else None,
            board=b.data if b else None,
            revision=b.revision if b else 0,
            jobs=[
                job_view(j)
                for j in db.scalars(
                    select(RenderJob).where(RenderJob.project_id == p.id).order_by(RenderJob.created_at.desc())
                )
            ],
            outputs=[
                {
                    "id": o.id,
                    "variant": o.variant,
                    "jobId": o.job_id,
                    "verification": o.verification,
                    "downloads": {k: f"/api/projects/{p.id}/outputs/{o.id}/{k}" for k in o.files},
                }
                for o in db.scalars(select(RenderOutput).where(RenderOutput.project_id == p.id))
            ],
        )
    return result


@app.get("/api/health")
def health():
    return {
        "app": "paper-studio",
        "status": "ok",
        "mode": "ai" if settings.ai_provider == "anthropic" and settings.ai_api_key else "demo",
        "provider": settings.ai_provider,
        "model": settings.ai_model,
        "tts": bool(narration_provider()),
        "ttsProvider": narration_provider(),
        "video": {"enabled": bool(settings.runway_api_key), "provider": "runway", "model": MODEL},
    }


@app.get("/api/ready")
def ready(db: DB):
    db.execute(text("SELECT 1"))
    heartbeat = safe_path("worker-heartbeat.json")
    checks = {
        "database": True,
        "ffmpeg": Path(binary("ffmpeg")).is_file() or bool(shutil.which(binary("ffmpeg"))),
        "ffprobe": Path(binary("ffprobe")).is_file() or bool(shutil.which(binary("ffprobe"))),
        "worker": heartbeat.exists() and time.time() - heartbeat.stat().st_mtime < 120,
    }
    return JSONResponse({"checks": checks}, status_code=200 if all(checks.values()) else 503)


@app.post("/api/desktop/pause")
def desktop_pause(db: DB):
    if not settings.desktop_token:
        raise HTTPException(404)
    if db.scalar(select(RenderJob.id).where(RenderJob.status.in_(ACTIVE)).limit(1)):
        raise HTTPException(409, "진행 중인 작업이 끝난 뒤 설정을 저장해 주세요.")
    app.state.desktop_paused = True
    return {"paused": True}


@app.get("/api/desktop/status")
def desktop_status(db: DB):
    if not settings.desktop_token:
        raise HTTPException(404)
    return {"busy": bool(db.scalar(select(RenderJob.id).where(RenderJob.status.in_(ACTIVE)).limit(1)))}


@app.get("/api/projects")
def list_projects(db: DB, q: str = "", status: str = "", concept: str = "", date: str = ""):
    rows = db.scalars(select(Project).order_by(Project.updated_at.desc()))
    return [
        project_view(db, p)
        for p in rows
        if q.lower() in p.name.lower()
        and (not status or p.status == status)
        and (not concept or p.info["conceptId"] == concept)
        and (not date or p.created_at.startswith(date))
    ]


@app.post("/api/projects", status_code=201)
def create_project(data: Product, db: DB):
    if not db.get(ConceptPreset, data.conceptId):
        raise HTTPException(422, "컨셉을 찾을 수 없습니다.")
    p = Project(name=data.name, info=data.model_dump())
    db.add(p)
    db.flush()
    logo = db.get(AppSetting, "logo")
    if logo:
        source = logo.data
        db.add(upload(safe_path(source["original"]).read_bytes(), source["filename"], source["mime"], p.id, "logo"))
    db.commit()
    return project_view(db, p, True)


@app.post("/api/demo", status_code=201)
def create_demo(db: DB):
    p = Project(
        name="데일리 리프 노트",
        info=Product(
            name="데일리 리프 노트",
            price=3500,
            brand="PAPER STUDIO",
            features="세 가지 표지 색상\n나뭇잎 일러스트\n스프링 제본",
            audience="기록과 문구를 좋아하는 사람",
        ).model_dump(),
    )
    db.add(p)
    db.flush()
    try:
        for i, path in enumerate(sorted((ROOT / "samples").glob("*.jpg"))):
            db.add(upload(path.read_bytes(), path.name, "image/jpeg", p.id, position=i))
        db.commit()
    except Exception:
        db.rollback()
        remove_tree(f"projects/{p.id}")
        raise
    return project_view(db, p, True)


@app.get("/api/projects/{pid}")
def detail(pid: str, db: DB):
    return project_view(db, get_project(db, pid), True)


@app.put("/api/projects/{pid}")
def update_project(pid: str, data: Product, db: DB):
    p = get_project(db, pid, True)
    if not db.get(ConceptPreset, data.conceptId):
        raise HTTPException(422, "컨셉을 찾을 수 없습니다.")
    p.info, p.name = data.model_dump(), data.name
    board = db.get(Storyboard, pid)
    if board:
        current = copy.deepcopy(board.data)
        current["outro"]["productName"] = data.name
        current["outro"]["priceText"] = f"{data.price:,}원"
        save_board(db, pid, current)
    invalidate(db, p)
    db.commit()
    return project_view(db, p, True)


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, db: DB):
    p = get_project(db, pid, True)
    # Move to a reversible tombstone first; rollback restores it if DB commit fails.
    folder, trash = safe_path(f"projects/{pid}"), safe_path(f"trash/{uid()}")
    trash.parent.mkdir(exist_ok=True)
    moved = folder.exists()
    if moved:
        folder.rename(trash)
    try:
        db.delete(p)
        db.commit()
    except Exception:
        db.rollback()
        if moved:
            trash.rename(folder)
        raise
    if moved:
        remove_tree(str(trash.relative_to(settings.storage_dir.resolve())))
    return {"deleted": True}


@app.post("/api/projects/{pid}/duplicate", status_code=201)
def duplicate(pid: str, db: DB):
    source = get_project(db, pid, True)
    p = Project(name=(source.name + " (복사)")[:100], info=copy.deepcopy(source.info))
    p.info["name"] = p.name
    db.add(p)
    db.flush()
    mapping = {}
    try:
        for a in db.scalars(select(Asset).where(Asset.project_id == pid)):
            if a.kind == "video":
                aid = uid()
                relative = f"projects/{p.id}/assets/{aid}/video.mp4"
                target = safe_path(relative)
                target.parent.mkdir(parents=True)
                shutil.copyfile(safe_path(a.optimized), target)
                new = Asset(id=aid, project_id=p.id, kind="video", filename=a.filename, mime=a.mime,
                            size=a.size, width=a.width, height=a.height, sha256=a.sha256,
                            original=relative, optimized=relative, position=a.position)
            else:
                new = upload(safe_path(a.original).read_bytes(), a.filename, a.mime, p.id, a.kind, a.position)
            new.primary = a.primary
            mapping[a.id] = new.id
            db.add(new)
        source_board = db.get(Storyboard, pid)
        if source_board:
            data = copy.deepcopy(source_board.data)
            for s in data["scenes"]:
                s["assetId"] = mapping[s["assetId"]]
                if s.get("videoAssetId"):
                    s["videoAssetId"] = mapping[s["videoAssetId"]]
            data["outro"]["productName"] = p.name
            save_board(db, p.id, data, True)
            p.status = "ready"
        db.commit()
    except Exception:
        db.rollback()
        remove_tree(f"projects/{p.id}")
        raise
    return project_view(db, p, True)


@app.get("/api/projects/{pid}/assets")
def list_assets(pid: str, db: DB):
    get_project(db, pid)
    return [asset_view(a) for a in db.scalars(select(Asset).where(Asset.project_id == pid).order_by(Asset.position))]


@app.post("/api/projects/{pid}/assets", status_code=201)
def add_asset(pid: str, db: DB, file: Annotated[UploadFile, File()], kind: Literal["image", "logo", "audio"] = "image"):
    p = get_project(db, pid, True)
    existing = list(db.scalars(select(Asset).where(Asset.project_id == pid, Asset.kind == kind)))
    if len(existing) >= (12 if kind == "image" else 1):
        raise HTTPException(409, "사진은 최대 12장, 로고와 음원은 각 1개입니다. 기존 파일을 삭제한 후 올려 주세요.")
    data = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    asset = upload(data, file.filename or "upload", file.content_type, pid, kind, len(existing))
    try:
        db.add(asset)
        invalidate(db, p)
        db.commit()
    except Exception:
        db.rollback()
        remove_tree(f"projects/{pid}/assets/{asset.id}")
        raise
    return asset_view(asset)


class AssetOrder(BaseModel):
    ids: list[str] = Field(max_length=12)
    primaryId: str


@app.put("/api/projects/{pid}/assets/order")
def asset_order(pid: str, data: AssetOrder, db: DB):
    p = get_project(db, pid, True)
    rows = images(db, pid)
    if set(data.ids) != {a.id for a in rows} or len(data.ids) != len(rows) or data.primaryId not in data.ids:
        raise HTTPException(422, "사진 목록 또는 대표 사진이 올바르지 않습니다.")
    for a in rows:
        a.position, a.primary = data.ids.index(a.id), a.id == data.primaryId
    invalidate(db, p)
    db.commit()
    return {"saved": True}


@app.delete("/api/projects/{pid}/assets/{aid}")
def delete_asset(pid: str, aid: str, db: DB):
    p = get_project(db, pid, True)
    a = db.get(Asset, aid)
    if not a or a.project_id != pid:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    b = db.get(Storyboard, pid)
    remaining = [x for x in images(db, pid) if x.id != aid]
    if b and a.kind == "video":
        for attr in ("data", "initial"):
            data = copy.deepcopy(getattr(b, attr))
            for s in data["scenes"]:
                if s.get("videoAssetId") == aid:
                    s["videoAssetId"] = None
            setattr(b, attr, data)
        save_board(db, pid, b.data)
    if b and any(s["assetId"] == aid for s in b.data["scenes"]):
        if not remaining:
            raise HTTPException(409, "스토리보드에 사용 중인 마지막 사진은 삭제할 수 없습니다.")
        for attr in ("data", "initial"):
            data = copy.deepcopy(getattr(b, attr))
            for s in data["scenes"]:
                if s["assetId"] == aid:
                    s["assetId"] = remaining[0].id
                    s["videoAssetId"] = None
            setattr(b, attr, data)
        save_board(db, pid, b.data)
    was_primary = a.primary
    db.delete(a)
    if remaining and was_primary:
        remaining[0].primary = True
    invalidate(db, p)
    db.commit()
    remove_tree(f"projects/{pid}/assets/{aid}")
    return {"deleted": True}


@app.get("/api/projects/{pid}/assets/{aid}/file")
def asset_file(pid: str, aid: str, db: DB):
    a = db.get(Asset, aid)
    if not a or a.project_id != pid:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(
        safe_path(a.optimized),
        media_type="image/png" if a.kind == "logo" else ("image/jpeg" if a.kind == "image" else a.mime),
    )


@app.delete("/api/projects/{pid}/assets")
def delete_all_images(pid: str, db: DB):
    p = get_project(db, pid, True)
    rows = images(db, pid)
    board = db.get(Storyboard, pid)
    if board:
        db.delete(board)
    db.execute(delete(Scene).where(Scene.project_id == pid))
    for a in rows:
        db.delete(a)
    invalidate(db, p)
    p.status = "draft"
    db.commit()
    for a in rows:
        remove_tree(f"projects/{pid}/assets/{a.id}")
    return {"deleted": len(rows)}


@app.get("/api/projects/{pid}/analysis")
def analysis_result(pid: str, db: DB):
    get_project(db, pid)
    result = db.get(Analysis, pid)
    return result.data if result else None


@app.get("/api/projects/{pid}/recommendations")
def recommend(pid: str, db: DB, different: bool = False):
    p = get_project(db, pid)
    presets = [x.data for x in db.scalars(select(ConceptPreset).where(ConceptPreset.active.is_(True)))]
    return recommendations(p.info, presets, p.info["conceptId"] if different else "")


def enqueue(db, p, kind):
    if active_job(db, p.id):
        raise HTTPException(409, "이미 진행 중인 작업이 있습니다.")
    if not images(db, p.id):
        raise HTTPException(422, "제품 사진을 한 장 이상 올려 주세요.")
    payload = {}
    if kind == "render":
        b = db.get(Storyboard, p.id)
        if not b:
            raise HTTPException(409, "먼저 스토리보드를 생성해 주세요.")
        try:
            require_narration(b.data)
        except ValueError as error:
            raise HTTPException(409, str(error)) from None
        preset = db.get(ConceptPreset, b.data["conceptId"])
        if not preset:
            raise HTTPException(409, "스토리보드의 컨셉이 삭제되었습니다. 다른 컨셉을 적용하세요.")
        payload = {
            "board": copy.deepcopy(b.data),
            "preset": copy.deepcopy(preset.data),
            "product": copy.deepcopy(p.info),
        }
        payload["board"]["outro"]["productName"] = p.name
        payload["board"]["outro"]["priceText"] = f"{p.info['price']:,}원"
    job = RenderJob(project_id=p.id, kind=kind, payload=payload)
    db.add(job)
    p.status = "queued"
    p.updated_at = now()
    db.commit()
    return job_view(job)


@app.post("/api/projects/{pid}/analyze", status_code=202)
def start_analysis(pid: str, db: DB):
    return enqueue(db, get_project(db, pid), "analysis")


@app.post("/api/projects/{pid}/storyboard/generate", status_code=202)
def generate(pid: str, db: DB):
    return enqueue(db, get_project(db, pid), "storyboard")


@app.get("/api/projects/{pid}/storyboard")
def get_board(pid: str, db: DB):
    get_project(db, pid)
    b = db.get(Storyboard, pid)
    return {"data": b.data, "revision": b.revision} if b else None


class BoardUpdate(BaseModel):
    data: Board
    revision: int


@app.put("/api/projects/{pid}/storyboard")
def update_board(pid: str, value: BoardUpdate, db: DB):
    p = get_project(db, pid, True)
    b = db.get(Storyboard, pid)
    if not b or b.revision != value.revision:
        raise HTTPException(409, "다른 화면에서 변경되었습니다. 새로고침 후 다시 편집해 주세요.")
    board = value.data.model_dump()
    if not db.get(ConceptPreset, board["conceptId"]):
        raise HTTPException(422, "컨셉을 찾을 수 없습니다.")
    if any(s["assetId"] not in {a.id for a in images(db, pid)} for s in board["scenes"]):
        raise HTTPException(422, "프로젝트에 없는 사진을 사용할 수 없습니다.")
    video_ids = set(db.scalars(select(Asset.id).where(Asset.project_id == pid, Asset.kind == "video")))
    if any(s.get("videoAssetId") and s["videoAssetId"] not in video_ids for s in board["scenes"]):
        raise HTTPException(422, "프로젝트에 없는 영상을 사용할 수 없습니다.")
    board["outro"]["priceText"] = f"{p.info['price']:,}원"
    board["outro"]["productName"] = p.name
    record = save_board(db, pid, board)
    p.updated_at = now()
    db.commit()
    return {"data": record.data, "revision": record.revision}


@app.post("/api/projects/{pid}/storyboard/reset")
def reset_board(pid: str, db: DB):
    get_project(db, pid, True)
    b = db.get(Storyboard, pid)
    if not b:
        raise HTTPException(404, "스토리보드가 없습니다.")
    b = save_board(db, pid, copy.deepcopy(b.initial))
    db.commit()
    return {"data": b.data, "revision": b.revision}


@app.post("/api/projects/{pid}/renders", status_code=202)
def render(pid: str, db: DB):
    return enqueue(db, get_project(db, pid), "render")


class AutoVideoRequest(BaseModel):
    revision: int = Field(ge=0)
    narration: bool = False
    useCurrentEdit: bool = False


@app.get("/api/projects/{pid}/auto-video/plan")
def auto_video_plan(pid: str, db: DB):
    p = get_project(db, pid)
    return {"photos": public_plan(photo_plan(db, pid, images(db, pid), p.info)),
            "prompt": hands_on_prompt(p.info)}


def enqueue_auto_video(db, p, value, previous=None):
    if active_job(db, p.id):
        raise HTTPException(409, "이미 진행 중인 작업이 있습니다.")
    if not settings.runway_api_key:
        raise HTTPException(409, "스튜디오 설정에서 AI 영상 생성 연결을 먼저 설정해 주세요.")
    photos = images(db, p.id)
    if not photos:
        raise HTTPException(422, "제품 사진을 한 장 이상 올려 주세요.")
    board = db.get(Storyboard, p.id)
    if value.revision != (board.revision if board else 0):
        raise HTTPException(409, "편집 내용이 변경되었습니다. 새로고침한 뒤 다시 시작해 주세요.")
    product = copy.deepcopy(p.info)
    if board and value.useCurrentEdit:
        product.update(style=copy.deepcopy(board.data["style"]), duration=board.data["durationSec"],
                       conceptId=board.data["conceptId"])
    preset = db.get(ConceptPreset, product["conceptId"])
    if not preset:
        raise HTTPException(409, "컨셉을 다시 선택해 주세요.")
    if previous:
        if previous["inputHash"] != fingerprint(p, photos) or previous.get("revision", 0) != value.revision:
            raise HTTPException(409, "사진이나 편집 내용이 변경되었습니다. 전체 사진으로 숏츠 완성하기를 다시 눌러 주세요.")
        payload = copy.deepcopy(previous)
    else:
        payload = {"items": photo_plan(db, p.id, photos, product), "product": product,
                   "preset": copy.deepcopy(preset.data), "inputHash": fingerprint(p, photos),
                   "revision": value.revision, "narration": value.narration, "phase": "planning"}
    if value.narration and not narration_provider():
        raise HTTPException(409, "자동 내레이션 연결을 먼저 설정해 주세요.")
    job = RenderJob(project_id=p.id, kind="auto_video", payload=payload)
    db.add(job)
    p.status, p.updated_at = "queued", now()
    db.commit()
    return job_view(job)


@app.post("/api/projects/{pid}/auto-video", status_code=202)
def start_auto_video(pid: str, value: AutoVideoRequest, db: DB):
    return enqueue_auto_video(db, get_project(db, pid), value)


class VideoRequest(BaseModel):
    revision: int = Field(ge=1)


def enqueue_video(db, p, scene_id, revision, previous=None):
    if active_job(db, p.id):
        raise HTTPException(409, "이미 진행 중인 작업이 있습니다.")
    if not settings.runway_api_key:
        raise HTTPException(409, ".env에 RUNWAY_API_KEY를 설정하고 API와 worker를 재시작해 주세요.")
    board = db.get(Storyboard, p.id)
    if not board or board.revision != revision:
        raise HTTPException(409, "스토리보드를 저장하고 새로고침한 뒤 다시 시도해 주세요.")
    scene = next((s for s in board.data["scenes"] if s["id"] == scene_id), None)
    if not scene:
        raise HTTPException(404, "장면을 찾을 수 없습니다.")
    prompt = scene.get("videoPrompt", "").strip()
    if len(prompt.encode("utf-16-le")) // 2 > 1000:
        raise HTTPException(422, "움직임 설명은 1000자 이내로 줄여 주세요.")
    payload = {"sceneId": scene_id, "assetId": scene["assetId"], "prompt": prompt, "model": MODEL}
    if previous:
        if any(payload[k] != previous.get(k) for k in ("assetId", "prompt")):
            raise HTTPException(409, "사진이나 설명이 변경되었습니다. 장면에서 새로 생성해 주세요.")
        payload.update({k: previous[k] for k in ("taskId", "submissionStarted", "failedTaskId", "failureCategory") if k in previous})
    job = RenderJob(project_id=p.id, kind="video", payload=payload)
    db.add(job)
    p.status, p.updated_at = "queued", now()
    db.commit()
    return job_view(job)


@app.post("/api/projects/{pid}/scenes/{scene_id}/video", status_code=202)
def start_video(pid: str, scene_id: str, value: VideoRequest, db: DB):
    return enqueue_video(db, get_project(db, pid), scene_id, value.revision)


@app.get("/api/jobs/{jid}")
def get_job(jid: str, db: DB):
    j = db.get(RenderJob, jid)
    if not j:
        raise HTTPException(404, "작업을 찾을 수 없습니다.")
    return job_view(j)


@app.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: str, db: DB):
    j = db.get(RenderJob, jid)
    if not j or j.status not in ACTIVE:
        raise HTTPException(409, "진행 중인 작업이 아닙니다.")
    j.cancel_requested = True
    if j.status == "queued":
        j.status, j.ended_at = "cancelled", now()
        db.get(Project, j.project_id).status = "ready" if db.get(Storyboard, j.project_id) else "draft"
    db.commit()
    return job_view(j)


@app.post("/api/jobs/{jid}/retry", status_code=202)
def retry_job(jid: str, db: DB):
    j = db.get(RenderJob, jid)
    if not j or j.status not in ("failed", "cancelled"):
        raise HTTPException(409, "실패 또는 취소된 작업만 재시도할 수 있습니다.")
    if j.kind == "auto_video":
        b = db.get(Storyboard, j.project_id)
        result = enqueue_auto_video(db, get_project(db, j.project_id), AutoVideoRequest(
            revision=b.revision if b else 0, narration=j.payload["narration"]), j.payload)
    elif j.kind == "video":
        b = db.get(Storyboard, j.project_id)
        result = enqueue_video(db, get_project(db, j.project_id), j.payload["sceneId"],
                               b.revision if b else 0, j.payload)
    else:
        result = enqueue(db, get_project(db, j.project_id), j.kind)
    new = db.get(RenderJob, result["id"])
    new.attempt = j.attempt + 1
    db.commit()
    return job_view(new)


@app.get("/api/projects/{pid}/outputs/{oid}/{kind}")
def output_file(pid: str, oid: str, kind: Literal["video", "thumbnail", "subtitles", "script", "metadata"], db: DB):
    o = db.get(RenderOutput, oid)
    if not o or o.project_id != pid or kind not in o.files:
        raise HTTPException(404, "결과 파일을 찾을 수 없습니다.")
    path = safe_path(o.files[kind])
    if not path.is_file():
        raise HTTPException(404, "결과 파일이 삭제되었습니다.")
    return FileResponse(
        path,
        filename=f"paper-studio-{o.variant}-{kind}{path.suffix}",
        content_disposition_type="inline" if kind in ("video", "thumbnail") else "attachment",
    )


@app.get("/api/presets")
def presets(db: DB):
    return [
        p.data | {"builtin": p.builtin} for p in db.scalars(select(ConceptPreset).where(ConceptPreset.active.is_(True)))
    ]


@app.post("/api/presets", status_code=201)
def add_preset(data: Preset, db: DB):
    if db.get(ConceptPreset, data.id):
        raise HTTPException(409, "이미 사용 중인 프리셋 ID입니다.")
    db.add(ConceptPreset(id=data.id, data=data.model_dump()))
    db.commit()
    return data.model_dump() | {"builtin": False}


@app.put("/api/presets/{pid}")
def edit_preset(pid: str, data: Preset, db: DB):
    p = db.get(ConceptPreset, pid)
    if not p:
        raise HTTPException(404, "프리셋을 찾을 수 없습니다.")
    if p.builtin or data.id != pid:
        raise HTTPException(409, "기본 프리셋은 복제 후 편집하세요. ID는 변경할 수 없습니다.")
    p.data = data.model_dump()
    db.commit()
    return p.data | {"builtin": False}


@app.delete("/api/presets/{pid}")
def delete_preset(pid: str, db: DB):
    p = db.get(ConceptPreset, pid)
    if not p or p.builtin:
        raise HTTPException(409, "기본 프리셋은 삭제할 수 없습니다.")
    if any(x.info["conceptId"] == pid for x in db.scalars(select(Project))) or any(
        x.data["conceptId"] == pid for x in db.scalars(select(Storyboard))
    ):
        raise HTTPException(409, "프로젝트에서 사용 중인 프리셋입니다. 먼저 컨셉을 변경하세요.")
    db.delete(p)
    db.commit()
    return {"deleted": True}


@app.post("/api/presets/{pid}/duplicate")
def duplicate_preset(pid: str, db: DB):
    p = db.get(ConceptPreset, pid)
    if not p:
        raise HTTPException(404, "프리셋을 찾을 수 없습니다.")
    data = p.data | {"id": "custom_" + uid()[:12], "name": p.data["name"] + " 복사"}
    return add_preset(Preset.model_validate(data), db)


@app.post("/api/presets/import")
def import_presets(data: list[Preset], db: DB):
    if not 1 <= len(data) <= 100:
        raise HTTPException(422, "1~100개 프리셋을 가져올 수 있습니다.")
    results = []
    for item in data:
        value = item.model_dump() | {"id": "custom_" + uid()[:12]}
        db.add(ConceptPreset(id=value["id"], data=value))
        results.append(value)
    db.commit()
    return results


@app.get("/api/presets/export/json")
def export_presets(db: DB):
    return JSONResponse(
        [p.data for p in db.scalars(select(ConceptPreset).where(ConceptPreset.builtin.is_(False)))],
        headers={"Content-Disposition": 'attachment; filename="paper-presets.json"'},
    )


@app.get("/api/settings")
def get_settings(db: DB):
    s = db.get(AppSetting, "app")
    logo = db.get(AppSetting, "logo")
    return {
        "defaults": s.data if s else AppDefaults().model_dump(),
        "logoUrl": "/api/settings/logo/file?v=" + logo.data["id"] if logo else None,
        "storagePath": str(settings.storage_dir),
        "storageLimitMb": settings.storage_limit_mb,
        "provider": health(),
    }


@app.put("/api/settings")
def set_settings(data: AppDefaults, db: DB):
    s = db.get(AppSetting, "app")
    if not s:
        s = AppSetting(id="app", data=data.model_dump())
        db.add(s)
    else:
        s.data = data.model_dump()
    db.commit()
    return get_settings(db)


@app.post("/api/settings/logo")
def set_logo(db: DB, file: Annotated[UploadFile, File()]):
    asset = upload(
        file.file.read(settings.max_upload_mb * 1024 * 1024 + 1),
        file.filename or "logo",
        file.content_type,
        "brand-defaults",
        "logo",
    )
    record = db.get(AppSetting, "logo")
    old_id = record.data["id"] if record else None
    data = {k: getattr(asset, k) for k in ("id", "original", "optimized", "filename", "mime")}
    if record:
        record.data = data
    else:
        db.add(AppSetting(id="logo", data=data))
    db.commit()
    if old_id:
        remove_tree(f"projects/brand-defaults/assets/{old_id}")
    return get_settings(db)


@app.get("/api/settings/logo/file")
def logo_file(db: DB):
    record = db.get(AppSetting, "logo")
    if not record:
        raise HTTPException(404, "기본 로고가 없습니다.")
    return FileResponse(safe_path(record.data["optimized"]), media_type="image/png")


@app.delete("/api/settings/logo")
def delete_logo(db: DB):
    record = db.get(AppSetting, "logo")
    if record:
        aid = record.data["id"]
        db.delete(record)
        db.commit()
        remove_tree(f"projects/brand-defaults/assets/{aid}")
    return {"deleted": True}


WEB = ROOT / "apps/web/dist"
if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
