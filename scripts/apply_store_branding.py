"""Apply advertiser information to one existing project and future defaults."""

import argparse
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.db import AppSetting, Project, Session, Storyboard, now
from apps.api.schemas import AppDefaults, Product
from apps.api.services import active_job, save_board
from apps.api.storage import safe_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_id")
    parser.add_argument("--name", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--color", default="#51466D")
    args = parser.parse_args()
    branding = dict(storeName=args.name, storeUrl=args.url, cta=f"{args.name}에서 만나보세요")
    with Session() as db:
        project = db.get(Project, args.project_id)
        record = db.get(Storyboard, args.project_id)
        if not project or not record:
            raise SystemExit("Project or storyboard not found.")
        if active_job(db, project.id):
            raise SystemExit("A job is already active for this project.")
        settings = db.get(AppSetting, "app")
        defaults = AppDefaults.model_validate({**(settings.data if settings else {}), **branding, "brandColor": args.color})
        product = Product.model_validate({**project.info, **branding})
        product.style.brandColor = defaults.brandColor
        backup = safe_path(f"projects/{project.id}/before-store-branding.json")
        if not backup.exists():
            backup.write_text(json.dumps({"product": project.info, "board": record.data, "defaults": settings.data if settings else None}, ensure_ascii=False, indent=2), encoding="utf-8")
        project.info = product.model_dump()
        project.updated_at = now()
        if settings:
            settings.data = defaults.model_dump()
        else:
            db.add(AppSetting(id="app", data=defaults.model_dump()))
        board = copy.deepcopy(record.data)
        board["style"]["brandColor"] = defaults.brandColor
        board["outro"]["cta"] = branding["cta"]
        board["scenes"][-1].update(layout="endcard", caption=branding["cta"], voiceover=branding["cta"])
        save_board(db, project.id, board)
        db.commit()
        print(json.dumps({"projectId": project.id, **branding, "revision": record.revision}, ensure_ascii=True))


if __name__ == "__main__":
    main()
