from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


MotionName = Literal["zoom_in", "zoom_out", "pan_left", "pan_right", "still"]
Transition = Literal["fade", "pop", "slide", "soft_zoom", "none"]
Layout = Literal["full_bleed", "blur_contain", "split", "product_card", "features", "endcard"]


class Style(Strict):
    pace: Literal["slow", "normal", "fast"] = "normal"
    captionStyle: Literal["clean", "bold", "rounded", "handwritten", "magazine"] = "rounded"
    musicMood: Literal["none", "bright_cute", "lofi", "trendy", "premium", "retro"] = "none"
    narration: Literal["none", "ai", "script"] = "script"
    narrationSource: Literal["caption", "script"] = "script"
    priceDisplay: Literal["hidden", "middle", "last", "always"] = "last"
    brandColor: str = Field(default="#496D59", pattern=r"^#[0-9a-fA-F]{6}$")
    volume: float = Field(default=0.25, ge=0, le=1)
    fadeSec: float = Field(default=1, ge=0, le=5)
    ducking: bool = True
    variants: int = Field(default=1, ge=1, le=4)


class Product(Strict):
    name: str = Field(min_length=1, max_length=100)
    price: int = Field(ge=0, le=999999999)
    brand: str = Field(default="", max_length=80)
    storeName: str = Field(default="", max_length=80)
    storeUrl: str = Field(default="", max_length=300, pattern=r"^(https?://[^\s]+)?$")
    features: str = Field(default="", max_length=1500)
    audience: str = Field(default="", max_length=200)
    cta: str = Field(default="오늘의 문구를 만나보세요", max_length=80)
    duration: Literal[15, 20, 30] = 15
    conceptId: str = Field(default="cute_stationery", max_length=80)
    style: Style = Field(default_factory=Style)


class Preset(Strict):
    version: Literal[1] = 1
    id: str = Field(pattern=r"^[a-z0-9_-]{1,80}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(max_length=300)
    marketingGoal: Literal["sales", "awareness", "information", "emotion", "fun", "engagement"]
    targetAudience: list[str] = Field(max_length=10)
    palette: list[str] = Field(min_length=3, max_length=6)
    fontStyle: Literal["clean", "bold", "rounded", "handwritten", "magazine"]
    captionStyle: Literal["bubble", "minimal", "banner", "editorial"]
    pace: Literal["slow", "normal", "fast"]
    transitionSet: list[Transition] = Field(min_length=1, max_length=5)
    motionSet: list[MotionName] = Field(min_length=1, max_length=5)
    overlaySet: list[Literal["sparkle", "sticker", "highlight", "grid", "grain"]] = Field(max_length=5)
    musicMood: str = Field(max_length=40)
    copyTone: str = Field(max_length=80)
    hookPatterns: list[str] = Field(min_length=1, max_length=10)
    outroPattern: str = Field(max_length=100)
    seasonTags: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def colors(self):
        import re

        if any(not re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in self.palette):
            raise ValueError("팔레트는 #RRGGBB 형식입니다.")
        return self


class Point(Strict):
    x: float = Field(default=0.5, ge=0, le=1)
    y: float = Field(default=0.5, ge=0, le=1)


class Motion(Strict):
    type: MotionName = "zoom_in"
    strength: float = Field(default=0.04, ge=0, le=0.12)


class SceneData(Strict):
    id: str = Field(min_length=1, max_length=60)
    assetId: str = Field(min_length=1, max_length=40)
    videoAssetId: str | None = Field(default=None, min_length=1, max_length=40)
    videoPrompt: str = Field(default="", max_length=1000)
    startFrame: int = Field(ge=0)
    durationFrames: int = Field(ge=30, le=900)
    layout: Layout = "blur_contain"
    fit: Literal["contain", "cover"] = "contain"
    focalPoint: Point = Field(default_factory=Point)
    motion: Motion = Field(default_factory=Motion)
    transitionIn: Transition = "fade"
    transitionOut: Transition = "fade"
    caption: str = Field(max_length=120)
    captionEmphasis: list[str] = Field(default_factory=list, max_length=5)
    voiceover: str = Field(default="", max_length=300)


class Outro(Strict):
    productName: str = Field(max_length=100)
    priceText: str = Field(max_length=30)
    cta: str = Field(max_length=80)


class Board(Strict):
    version: Literal[1] = 1
    durationSec: Literal[15, 20, 30]
    fps: Literal[30] = 30
    conceptId: str = Field(max_length=80)
    hook: str = Field(max_length=120)
    hookCandidates: list[str] = Field(min_length=3, max_length=4)
    scenes: list[SceneData] = Field(min_length=2, max_length=12)
    outro: Outro
    style: Style

    @model_validator(mode="after")
    def timeline(self):
        total = self.durationSec * self.fps
        weights = [s.durationFrames for s in self.scenes]
        available = total - len(weights) * 30
        allocated = weights[:] if sum(weights) == total else [30 + int(available * w / sum(weights)) for w in weights]
        allocated[-1] += total - sum(allocated)
        pos = 0
        ids = set()
        for scene, length in zip(self.scenes, allocated):
            if scene.id in ids:
                raise ValueError("장면 ID가 중복되었습니다.")
            ids.add(scene.id)
            scene.startFrame = pos
            scene.durationFrames = length
            pos += length
        return self


class PhotoAnalysis(Strict):
    assetId: str
    role: str = Field(max_length=100)
    quality: int = Field(ge=0, le=100)
    observations: list[str] = Field(max_length=10)


class Recommendation(Strict):
    conceptId: str
    score: int = Field(ge=0, le=100)
    reason: str = Field(max_length=200)


class AnalysisData(Strict):
    version: Literal[1] = 1
    category: str = Field(max_length=100)
    verifiedFeatures: list[str] = Field(max_length=20)
    userFeatures: list[str] = Field(max_length=20)
    uncertainClaims: list[str] = Field(max_length=20)
    photos: list[PhotoAnalysis] = Field(min_length=1, max_length=12)
    recommendations: list[Recommendation] = Field(min_length=3, max_length=3)
    hooks: list[str] = Field(min_length=3, max_length=3)
    thumbnailTitles: list[str] = Field(min_length=1, max_length=3)
    mode: Literal["demo", "ai", "fallback"] = "demo"
    notice: str = Field(default="", max_length=300)


class AppDefaults(Strict):
    brand: str = Field(default="", max_length=80)
    storeName: str = Field(default="", max_length=80)
    storeUrl: str = Field(default="", max_length=300, pattern=r"^(https?://[^\s]+)?$")
    cta: str = Field(default="오늘의 문구를 만나보세요", max_length=80)
    brandColor: str = Field(default="#496D59", pattern=r"^#[0-9a-fA-F]{6}$")
    retentionDays: int = Field(default=30, ge=1, le=3650)
