# 컨셉 프리셋

`packages/concept-presets/*.json`의 20개 기본 프리셋은 API 시작 시 Pydantic으로 검증되어 DB에 등록됩니다. 기본 프리셋은 UI/API에서 직접 수정·삭제할 수 없습니다. **복제**해서 사용자 버전을 만드세요.

## 코딩 없이 추가

컨셉 라이브러리 → 새 프리셋 또는 기존 프리셋 복제 → 이름·목적·색상·글자·속도·후킹·시즌 태그 편집 → 저장. 여러 개를 내보내고 다른 설치에 가져올 수 있습니다. 가져오기는 원래 ID 충돌을 피하기 위해 새 사용자 ID를 만듭니다. 프로젝트가 참조하는 사용자 프리셋은 삭제할 수 없습니다.

## 계약

전체 예시는 `cute_stationery.json`을 참고합니다.

| 필드 | 형식 |
|---|---|
| `version` | 1 |
| `id` | 영문 소문자·숫자·`_`·`-`, 최대 80자 |
| `name`, `description` | 이름 80자, 설명 300자 |
| `marketingGoal` | sales, awareness, information, emotion, fun, engagement |
| `targetAudience` | 문자열 배열 |
| `palette` | `#RRGGBB` 3~6개; 강조색·배경색·보조색 순 |
| `fontStyle` | clean, bold, rounded, handwritten, magazine |
| `captionStyle` | bubble, minimal, banner, editorial |
| `pace` | slow, normal, fast |
| `transitionSet` | fade, pop, slide, soft_zoom, none 중 1개 이상 |
| `motionSet` | zoom_in, zoom_out, pan_left, pan_right, still 중 1개 이상 |
| `overlaySet` | sparkle, sticker, highlight, grid, grain 배열 |
| `musicMood`, `copyTone` | 편집·추천용 의미 토큰 |
| `hookPatterns` | 문구 후보 1개 이상; 데모 첫 후킹에 실제 사용 |
| `outroPattern` | 마지막 문구 패턴 |
| `seasonTags` | 예: 신학기, 여름, 크리스마스 |

사용자의 스타일 선택이 기본 프리셋보다 우선합니다. 특히 음악은 사용자가 직접 선택하며 프리셋 선택만으로 자동 재생되지 않습니다. 사용자가 입력한 CTA가 아웃트로 패턴보다 우선합니다.

## 저장소에 기본 프리셋 추가

1. 기존 JSON을 새 ID로 복사하고 위 규칙에 맞게 수정합니다.
2. `npm test` 또는 Python `Preset.model_validate_json`으로 검증합니다.
3. API를 재시작하면 새 ID가 기본 프리셋으로 등록됩니다.

기존 ID는 DB의 사용자 작업을 보호하기 위해 시작 시 덮어쓰지 않습니다. 배포된 기본 프리셋을 갱신할 때는 새 ID를 쓰거나 명시적 데이터 마이그레이션을 추가하세요. 기본 프리셋 수 테스트도 의도한 수로 함께 갱신합니다.

`scripts/create_samples.py`는 배포 샘플과 기본 프리셋의 원본 생성기입니다. 기존 프리셋 파일을 직접 변경한 상태에서 이 생성기를 다시 실행하면 해당 기본 파일은 생성기 정의로 덮어써집니다. 배포 기본값을 수정할 때 생성기 정의도 함께 수정하세요.
