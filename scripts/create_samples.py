"""Create original, unbranded sample product illustrations and editable preset data."""

import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PRESETS = [
    (
        "cute_stationery",
        "귀여운 문구점",
        "engagement",
        "#D87182",
        "#FBE8D8",
        "rounded",
        "fast",
        "책상 위에 작은 설렘",
        "friendly_playful",
    ),
    (
        "journal",
        "감성 다꾸",
        "emotion",
        "#786557",
        "#E7DDD1",
        "handwritten",
        "slow",
        "오늘의 기록을 더 특별하게",
        "gentle",
    ),
    (
        "minimal",
        "미니멀 제품 광고",
        "sales",
        "#273E36",
        "#E8EEE9",
        "clean",
        "slow",
        "좋아하는 것만 남긴 책상",
        "concise",
    ),
    (
        "japan_shop",
        "일본 문구샵 느낌",
        "emotion",
        "#B95537",
        "#F2E8D2",
        "magazine",
        "normal",
        "작은 문구 가게에서 발견한 취향",
        "editorial",
    ),
    (
        "trendy",
        "트렌디 SNS",
        "awareness",
        "#7453C4",
        "#DFE6FF",
        "bold",
        "fast",
        "잠깐, 이 문구 보고 가세요",
        "energetic",
    ),
    (
        "new_release",
        "신제품 출시",
        "awareness",
        "#356CB2",
        "#E2EDFA",
        "bold",
        "normal",
        "오늘 처음 소개하는 문구",
        "announcement",
    ),
    (
        "sale",
        "할인·특가",
        "sales",
        "#B84232",
        "#FFECC9",
        "bold",
        "fast",
        "눈여겨본 문구, 가격도 확인해요",
        "price_focused",
    ),
    (
        "features",
        "제품 기능 설명",
        "information",
        "#2B6F70",
        "#DFEEEA",
        "clean",
        "normal",
        "사진과 함께 하나씩 살펴봐요",
        "clear",
    ),
    ("asmr", "ASMR 분위기", "emotion", "#6B7161", "#EEEDE2", "clean", "slow", "잠깐의 여유, 문구 한 장면", "quiet"),
    (
        "unboxing",
        "언박싱 스타일",
        "information",
        "#A57042",
        "#F8E9D3",
        "rounded",
        "normal",
        "어떤 모습일지 같이 볼까요?",
        "curious",
    ),
    ("premium", "고급 브랜드형", "sales", "#30333D", "#E6D9BC", "magazine", "slow", "취향이 머무는 책상", "refined"),
    (
        "retro",
        "레트로 문구점",
        "emotion",
        "#9B4F36",
        "#E6D29D",
        "magazine",
        "normal",
        "그 시절 문구점이 생각나는 순간",
        "nostalgic",
    ),
    ("y2k", "Y2K", "fun", "#AB36C0", "#D4F2DF", "bold", "fast", "내 책상 무드 업데이트", "playful"),
    (
        "character",
        "캐릭터 중심",
        "engagement",
        "#985E90",
        "#F5DFEF",
        "rounded",
        "normal",
        "자꾸만 눈이 가는 이 모습",
        "affectionate",
    ),
    (
        "students",
        "학생 추천템",
        "sales",
        "#3B7C99",
        "#E6F3DA",
        "rounded",
        "fast",
        "새 학기 책상에 놓고 싶은 문구",
        "friendly",
    ),
    (
        "office",
        "직장인 추천템",
        "sales",
        "#4F5E7C",
        "#E8EAF0",
        "clean",
        "normal",
        "일하는 책상에도 나의 취향을",
        "practical",
    ),
    (
        "top3",
        "TOP 3 장점형",
        "information",
        "#366E56",
        "#E2EBDD",
        "bold",
        "fast",
        "이 문구를 살펴보는 세 가지 포인트",
        "numbered",
    ),
    (
        "solution",
        "문제→해결형",
        "information",
        "#5268AC",
        "#E3E7F6",
        "bold",
        "normal",
        "책상이 심심할 때, 이런 문구 어때요?",
        "question_answer",
    ),
    ("humor", "밈·유머형", "fun", "#A14F1F", "#FBE39C", "bold", "fast", "문구 구경만 하러 왔는데…", "humorous"),
    (
        "daily",
        "오늘의 문구 추천",
        "engagement",
        "#527357",
        "#F0EBD9",
        "rounded",
        "normal",
        "오늘의 문구 취향을 골라보세요",
        "friendly",
    ),
]


def main():
    folder = ROOT / "packages/concept-presets"
    folder.mkdir(parents=True, exist_ok=True)
    for i, (pid, name, goal, color, bg, font, pace, hook, tone) in enumerate(PRESETS):
        data = dict(
            version=1,
            id=pid,
            name=name,
            description=f"{name}에 어울리는 색상, 자막과 리듬으로 상품을 소개합니다.",
            marketingGoal=goal,
            targetAudience=["stationery_fans", "students" if pid == "students" else "all"],
            palette=[color, bg, "#FFFFFF"],
            fontStyle=font,
            captionStyle=["bubble", "editorial", "minimal", "banner"][i % 4],
            pace=pace,
            transitionSet=["fade", "soft_zoom"] if pace == "slow" else ["pop", "slide", "fade"],
            motionSet=["zoom_in", "pan_left", "zoom_out", "pan_right"],
            overlaySet=[["sparkle", "sticker"], ["grain"], ["highlight"], ["grid"]][i % 4],
            musicMood="lofi" if pace == "slow" else "bright_cute",
            copyTone=tone,
            hookPatterns=[hook, f"{name}, 나만의 취향을 찾아요", "오늘은 어떤 문구를 고를까요?"],
            outroPattern="마음에 드는 문구를 만나보세요",
            seasonTags=["신학기"] if pid == "students" else [],
        )
        (folder / f"{pid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    samples = ROOT / "samples"
    samples.mkdir(exist_ok=True)
    for n, bg in enumerate(["#E9E8DB", "#E7DEDA", "#DCE6DF"]):
        im = Image.new("RGB", (1200, 1500), bg)
        d = ImageDraw.Draw(im)
        # Original vector-like notebook and pencil still life; no third-party artwork.
        d.rounded_rectangle((228, 265, 973, 1230), radius=32, fill="#B9BBB0")
        d.rounded_rectangle((200, 230, 940, 1190), radius=32, fill=["#7C967D", "#CA907D", "#819CAA"][n])
        d.rounded_rectangle((245, 285, 895, 1130), radius=16, outline="#EBE9D4", width=4)
        for y in range(300, 1120, 60):
            d.ellipse((180, y, 215, y + 20), fill="#EEEBD8", outline="#758073", width=2)
        d.rounded_rectangle((385, 470, 770, 720), radius=8, fill="#F6F2E7")
        d.text((450, 535), "P A P E R", fill="#435E4E", font_size=42)
        d.text((435, 601), "A little everyday", fill="#64705C", font_size=24)
        d.line((540, 795, 620, 925), fill="#E9E4C7", width=9)
        for x, y in [(545, 820), (574, 855), (595, 891)]:
            d.ellipse((x - 50, y - 30, x + 5, y + 5), fill="#DFE6C3")
            d.ellipse((x + 3, y - 20, x + 57, y + 15), fill="#DFE6C3")
        d.rounded_rectangle((975, 465, 1010, 1180), radius=12, fill="#DFC28B")
        d.polygon([(975, 1180), (1010, 1180), (993, 1240)], fill="#795B3D")
        im.save(samples / f"notebook-{n + 1}.jpg", quality=94)
    (samples / "LICENSE.txt").write_text(
        "Sample notebook illustrations were created programmatically for this project. CC0-1.0: you may use, modify and redistribute them. No third-party brands or characters. Demo music is synthesized by this application; no downloaded recordings.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
