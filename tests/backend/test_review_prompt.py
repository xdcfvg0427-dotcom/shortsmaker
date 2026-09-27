import pytest

from apps.api.review_prompt import hands_on_prompt


@pytest.mark.parametrize("name,action", [
    ("스프링 노트", "표지를 천천히 연다"),
    ("2027 다이어리", "표지를 천천히 연다"),
    ("젤 볼펜", "짧은 선 하나"),
    ("색연필", "짧은 선 하나"),
    ("Gel pen", "짧은 선 하나"),
    ("펜 파우치", "가지런히 놓는다"),
    ("pencil case", "가지런히 놓는다"),
    ("스티커북", "한쪽 가장자리"),
    ("문구 세트", "가지런히 놓는다"),
    ("노트북 거치대", "가지런히 놓는다"),
])
def test_product_action_and_common_direction(name, action):
    prompt = hands_on_prompt({"name": name})
    assert action in prompt
    assert "자연광" in prompt and "손 하나만" in prompt
    assert "카메라는 위에서 내려다보며 거의 고정" in prompt
    assert "기존 인쇄 디자인을 유지" in prompt
    assert len(prompt.encode("utf-16-le")) // 2 <= 1000
    if "펜" in name or "pen" in name:
        assert "표지를 천천히 연다" not in prompt
