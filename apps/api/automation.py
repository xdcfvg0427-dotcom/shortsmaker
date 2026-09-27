"""Plans for an all-photo edit; provider checkpoints stay private in job payloads."""
import copy

from sqlalchemy import select

from .db import Asset, RenderJob
from .storage import safe_path
from .video import MODEL
from .review_prompt import hands_on_prompt


def photo_plan(db, project_id, photos, product):
    jobs = list(db.scalars(select(RenderJob).where(
        RenderJob.project_id == project_id, RenderJob.kind.in_(["auto_video", "video"])
    ).order_by(RenderJob.created_at.desc())))
    items = []
    prompt = hands_on_prompt(product)
    for photo in sorted(photos, key=lambda a: not a.primary):
        item = {"assetId": photo.id, "sourceHash": photo.sha256, "filename": photo.filename,
                "prompt": prompt, "model": MODEL}
        for job in jobs:
            candidates = job.payload.get("items", []) if job.kind == "auto_video" else [job.payload]
            match = next((p for p in candidates if p.get("assetId") == photo.id
                          and p.get("sourceHash", photo.sha256) == photo.sha256
                          and p.get("model") == MODEL and p.get("prompt", "") == prompt), None)
            if match:
                item.update({k: copy.deepcopy(match[k]) for k in
                             ("videoId", "taskId", "submissionStarted", "failedTaskId", "failureCategory") if k in match})
                clip = db.get(Asset, item.get("videoId")) if item.get("videoId") else None
                if not clip or clip.project_id != project_id or clip.kind != "video" or not safe_path(clip.optimized).is_file():
                    item.pop("videoId", None)
                break
        items.append(item)
    return items


def public_plan(items):
    def state(item):
        if item.get("videoId"):
            return "completed"
        if item.get("failureCategory"):
            return "failed"
        if item.get("taskId"):
            return "processing"
        if item.get("submissionStarted"):
            return "checking"
        return "pending"
    return [{"assetId": item["assetId"], "filename": item["filename"], "status": state(item)} for item in items]
