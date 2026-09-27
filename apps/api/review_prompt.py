"""Grounded default direction for hands-on stationery clips, without extra AI calls."""
import re


def hands_on_prompt(product):
    name = product.get("name", "").lower()
    # Containers take priority: a '펜 파우치' should not be used as a pen.
    if any(word in name for word in ("파우치", "필통", "펜케이스", "펜 케이스", "pouch", "pencil case", "pen case")):
        action = "한 손이 화면 밖에서 들어와 제품을 살짝 집어 책상 위에 가지런히 놓는다. 사진에서 확인되지 않는 지퍼나 수납 구조는 만들지 않는다."
    elif any(word in name for word in ("스티커", "마스킹", "테이프", "sticker", "tape")):
        action = "한 손이 화면 밖에서 들어와 사진에 보이는 제품의 한쪽 가장자리를 살짝 집어 디테일을 보여준다. 인쇄된 그림과 배열을 유지한다."
    elif any(word in name for word in ("볼펜", "연필", "샤프", "만년필", "형광펜", "사인펜", "싸인펜", "펜슬")) or re.search(r"(?:\b(?:pen|pencil|marker)\b|펜)", name):
        action = "한 손이 화면 밖에서 들어와 사진 속 필기구 한 자루를 자연스럽게 잡고 무지 종이에 짧은 선 하나를 천천히 긋는다. 손가락과 필기구가 자연스럽게 맞닿는다."
    elif "노트북" not in name and any(word in name for word in ("노트", "수첩", "다이어리", "플래너", "공책", "notebook", "journal", "planner")):
        action = "한 손이 화면 밖에서 들어와 사진 속 노트의 표지를 천천히 연다. 이미 펼쳐진 사진이라면 열린 페이지를 손끝으로 가볍게 짚는다."
    else:
        action = "한 손이 화면 밖에서 들어와 사진 속 제품을 가볍게 잡아 책상 위에 가지런히 놓는다. 사진에서 확인되지 않는 기능이나 구조를 새로 만들지 않는다."
    return (
        "자연광이 들어오는 책상 위, 첨부 사진의 제품을 사람이 실제로 사용하는 듯한 클로즈업 리뷰 영상. "
        + action + " "
        "한 컷에 단순한 동작 하나만 담는다. 카메라는 위에서 내려다보며 거의 고정되어 있다. "
        "제품의 색상, 크기 비율, 형태와 기존 인쇄 디자인을 유지한다. 기존 글자를 다시 쓰거나 새 글자를 만들지 않는다. "
        "자연스럽고 차분한 움직임과 부드러운 그림자. 손 하나만 보이고 얼굴, 추가 자막, 추가 로고는 등장하지 않는다."
    )
