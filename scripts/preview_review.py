"""Render a local review sample from the bundled product photos without external AI calls."""
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps.api.config import ROOT
from apps.api.services import make_board
from apps.api.worker import browser_binary, data_url, node_binary

folder = ROOT / "storage/verification/review"
folder.mkdir(parents=True, exist_ok=True)
preset = json.loads((ROOT / "packages/concept-presets/review.json").read_text(encoding="utf-8"))
fixture = json.loads((ROOT / "tests/fixtures/board.json").read_text(encoding="utf-8"))
info = dict(name="오늘의 노트", price=3500, features="", cta="마음에 들면 위시리스트에 저장", duration=15,
            style={**fixture["style"], "pace": "fast", "captionStyle": "bold"})
assets = [SimpleNamespace(id=f"photo-{i}", primary=i == 1, width=1200, height=1500) for i in range(1, 4)]
board = make_board(SimpleNamespace(info=info), assets, preset, {"mode": "demo", "hooks": ["a", "b", "c"]})
manifest = folder / "manifest.json"
manifest.write_text(json.dumps({
    "inputProps": {"board": board, "preset": preset, "assets": {
        a.id: {"src": data_url(ROOT / f"samples/notebook-{i}.jpg", "image/jpeg"), "width": a.width, "height": a.height}
        for i, a in enumerate(assets, 1)
    }}, "outputDir": str(folder), "browserExecutable": browser_binary(), "stillOnly": "--video" not in sys.argv,
}), encoding="utf-8")
subprocess.run([node_binary(), str(ROOT / "apps/renderer/render.mjs"), str(manifest)], cwd=ROOT, check=True)
print(folder)
