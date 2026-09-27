import json
from types import SimpleNamespace

import pytest

from apps.api.config import ROOT
from apps.api.schemas import Board
from apps.api.services import make_board


@pytest.mark.parametrize("duration", [15, 20, 30])
@pytest.mark.parametrize("pace", ["slow", "normal", "fast"])
def test_review_preserves_timing_facts_and_cta(duration, pace):
    fixture = json.loads((ROOT / "tests/fixtures/board.json").read_text(encoding="utf-8"))
    preset = json.loads((ROOT / "packages/concept-presets/review.json").read_text(encoding="utf-8"))
    info = dict(name="테스트 노트", price=3500, features="격자 내지", cta="상품 보러 가기", duration=duration,
                style={**fixture["style"], "pace": pace})
    assets = [SimpleNamespace(id="photo", primary=True, width=1200, height=1500)]
    for variant in range(4):
        board = Board.model_validate(make_board(SimpleNamespace(info=info), assets, preset,
                                                {"mode": "demo", "hooks": ["a", "b", "c"]}, variant))
        assert sum(scene.durationFrames for scene in board.scenes) == duration * 30
        assert board.scenes[-1].startFrame + board.scenes[-1].durationFrames == duration * 30
        assert board.scenes[-1].caption == info["cta"]
        assert board.outro.priceText == "3,500원"
        assert all(scene.transitionOut == "none" for scene in board.scenes)
        assert "써봤" not in " ".join(scene.voiceover for scene in board.scenes)
