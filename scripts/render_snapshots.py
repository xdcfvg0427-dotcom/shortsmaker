import copy
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image, ImageChops, ImageStat
from apps.api.config import ROOT
from apps.api.worker import browser_binary, data_url, node_binary

folder = ROOT / "storage/verification/renderer"
folder.mkdir(parents=True, exist_ok=True)
board = json.loads((ROOT / "tests/fixtures/board.json").read_text(encoding="utf-8"))
for concept in ("cute_stationery", "minimal"):
    target = folder / concept
    target.mkdir(exist_ok=True)
    preset = json.loads((ROOT / f"packages/concept-presets/{concept}.json").read_text(encoding="utf-8"))
    b = copy.deepcopy(board)
    b["conceptId"] = concept
    b["style"]["captionStyle"] = preset["fontStyle"]
    props = {
        "board": b,
        "preset": preset,
        "assets": {
            "fixture": {"src": data_url(ROOT / "samples/notebook-1.jpg", "image/jpeg"), "width": 1200, "height": 1500}
        },
    }
    manifest = target / "manifest.json"
    manifest.write_text(
        json.dumps(
            {"inputProps": props, "outputDir": str(target), "browserExecutable": browser_binary(), "stillOnly": True}
        ),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["PATH"] = str(Path(node_binary()).parent) + os.pathsep + env.get("PATH", "")
    subprocess.run(
        [node_binary(), str(ROOT / "apps/renderer/render.mjs"), str(manifest)],
        cwd=ROOT,
        env=env,
        check=True,
        timeout=180,
    )
    manifest.unlink()
first = Image.open(folder / "cute_stationery/thumbnail.png").convert("RGB")
second = Image.open(folder / "minimal/thumbnail.png").convert("RGB")
mean = sum(ImageStat.Stat(ImageChops.difference(first, second)).mean) / 3
assert mean > 5, f"Concept difference too small: {mean}"
(folder / "comparison.json").write_text(
    json.dumps({"meanAbsolutePixelDifference": mean, "size": first.size, "passed": True}, indent=2)
)
print(f"Two actual Remotion frames differ: mean pixel difference = {mean:.2f}/255")
