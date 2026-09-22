import copy
import hashlib
import json
import re
from sqlalchemy import delete, select
from .config import ROOT
from .db import Analysis, Asset, ConceptPreset, RenderJob, Scene, Storyboard, now
from .schemas import Board, Preset, SceneData

ACTIVE = ["queued", "preparing", "images", "audio", "rendering", "verifying", "analyzing", "storyboarding"]
TERMINAL = ["completed", "cancelled", "failed"]


def seed_presets(db):
    for path in sorted((ROOT / "packages/concept-presets").glob("*.json")):
        preset = Preset.model_validate_json(path.read_text(encoding="utf-8"))
        if not db.get(ConceptPreset, preset.id):
            db.add(ConceptPreset(id=preset.id, data=preset.model_dump(), builtin=True))
    db.commit()


def images(db, pid):
    return list(
        db.scalars(select(Asset).where(Asset.project_id == pid, Asset.kind == "image").order_by(Asset.position))
    )


def fingerprint(project, assets):
    return hashlib.sha256(
        json.dumps([project.info, [(a.id, a.sha256, a.primary) for a in assets]], sort_keys=True).encode()
    ).hexdigest()


def recommendations(product, presets, exclude=""):
    hints = product["name"] + " " + product["features"] + " " + product["audience"]
    words = {
        "journal": ["다꾸", "다이어리", "스티커"],
        "students": ["학생", "학교", "학기"],
        "office": ["직장", "업무", "사무"],
        "character": ["캐릭터", "귀여"],
        "premium": ["고급"],
        "features": ["기능"],
        "minimal": ["노트", "심플", "미니멀"],
    }
    old = next((p for p in presets if p["id"] == exclude), None)
    ranked = []
    for p in presets:
        score = 65 + int(hashlib.sha256((hints + p["id"]).encode()).hexdigest()[:2], 16) % 13
        matches = [w for w in words.get(p["id"], []) if w in hints]
        score += 12 * bool(matches)
        if old:
            score += 10 * (p["fontStyle"] != old["fontStyle"]) + 8 * (p["marketingGoal"] != old["marketingGoal"])
            if p["id"] == exclude:
                continue
        ranked.append(
            dict(
                conceptId=p["id"],
                score=min(98, score),
                reason=(
                    f"입력한 “{matches[0]}”와 어울리는 구성입니다."
                    if matches
                    else f"{p['name']}의 {p['pace']} 템포로 상품 사진을 소개합니다."
                ),
            )
        )
    return sorted(ranked, key=lambda x: (-x["score"], x["conceptId"]))[:3]


def make_board(project, assets, preset, analysis, variant=0):
    info = project.info
    hooks = (
        analysis["hooks"][:3] if analysis["mode"] == "ai" else [preset["hookPatterns"][0], *analysis["hooks"][:2]]
    ) + [f"{info['name']}, 내 책상에 놓는다면?"]
    ordered = sorted(assets, key=lambda a: not a.primary)
    if variant:
        ordered = ordered[variant % len(ordered) :] + ordered[: variant % len(ordered)]
        if variant == 2:
            ordered.reverse()
    pace = info["style"]["pace"]
    count = {"slow": 4, "normal": 5, "fast": 6}[pace]
    count = min(count, info["duration"] // 2)
    features = [s.strip() for s in re.split(r"[\n;]", info["features"]) if s.strip()]
    fallback = [info["name"], "사진으로 살펴보는 디테일", "내 책상에 어울리는 취향"]
    copies = (features + fallback) if variant % 2 == 0 else (fallback + features)
    scenes = []
    layout_options = ["product_card", "blur_contain", "split", "features", "full_bleed"]
    for i in range(count):
        asset = ordered[i % len(ordered)]
        caption = hooks[variant] if i == 0 else (info["cta"] if i == count - 1 else copies[(i - 1) % len(copies)])
        layout = "endcard" if i == count - 1 else layout_options[(i + variant) % len(layout_options)]
        if min(asset.width, asset.height) < 600 and layout == "full_bleed":
            layout = "blur_contain"
        scenes.append(
            SceneData(
                id=f"scene-{i + 1}",
                assetId=asset.id,
                startFrame=0,
                durationFrames=60 if i == 0 else 100,
                layout=layout,
                caption=caption[:120],
                voiceover=caption[:300],
                motion={"type": preset["motionSet"][(i + variant) % len(preset["motionSet"])], "strength": 0.04},
                transitionIn=preset["transitionSet"][i % len(preset["transitionSet"])],
                transitionOut="fade",
            )
        )
    remaining = info["duration"] * 30 - 60
    for scene in scenes[1:]:
        scene.durationFrames = remaining // (count - 1)
    scenes[-1].durationFrames += remaining % (count - 1)
    return Board(
        durationSec=info["duration"],
        conceptId=preset["id"],
        hook=hooks[variant],
        hookCandidates=hooks,
        scenes=scenes,
        outro={"productName": info["name"], "priceText": f"{info['price']:,}원", "cta": info["cta"]},
        style=info["style"],
    ).model_dump()


def save_board(db, pid, data, initial=False):
    board = Board.model_validate(data).model_dump()
    record = db.get(Storyboard, pid)
    if not record:
        record = Storyboard(project_id=pid, data=board, initial=copy.deepcopy(board))
        db.add(record)
    else:
        record.data = board
        record.revision += 1
        if initial:
            record.initial = copy.deepcopy(board)
    db.execute(delete(Scene).where(Scene.project_id == pid))
    for i, scene in enumerate(board["scenes"]):
        db.add(Scene(id=f"{pid}:{scene['id']}", project_id=pid, position=i, data=scene))
    return record


def srt(board):
    def timestamp(frame):
        ms = round(frame / board["fps"] * 1000)
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

    return (
        "\n\n".join(
            f"{i + 1}\n{timestamp(s['startFrame'])} --> {timestamp(s['startFrame'] + s['durationFrames'])}\n{s['caption']}"
            for i, s in enumerate(board["scenes"])
        )
        + "\n"
    )


def transition(job, state, progress):
    if job.status in TERMINAL:
        raise ValueError("완료된 작업은 상태를 변경할 수 없습니다.")
    if state not in ACTIVE + TERMINAL:
        raise ValueError("알 수 없는 상태입니다.")
    job.status = state
    job.progress = max(job.progress, min(100, progress))
    if state in TERMINAL:
        job.ended_at = now()


def invalidate(db, project):
    analysis = db.get(Analysis, project.id)
    if analysis:
        db.delete(analysis)
    project.updated_at = now()


def active_job(db, pid):
    return db.scalar(select(RenderJob).where(RenderJob.project_id == pid, RenderJob.status.in_(ACTIVE)))
