# 종이상점 · AI 문구 쇼츠 스튜디오

**Windows 설치형 프로그램:** 바탕화면 전용 창, 앱 내 API 키·저장 폴더 설정, MP4 저장을 지원합니다. 설치와 빌드 방법은 [DESKTOP.md](docs/DESKTOP.md)를 참고하세요. 개발 실행은 `start-desktop.ps1`, 설치 파일 생성은 `npm.cmd run desktop:dist`입니다.

상품 사진 1~12장으로 한국어 9:16 쇼츠를 만드는 **내부 단일 사용자 웹 앱**입니다. 사진에 줌·팬·자막·전환을 적용하거나, Runway로 사진 기반 AI 영상을 생성해 장면에 사용할 수 있습니다. 사진 편집 방식은 외부 API 키 없이도 실제 1080×1920 MP4를 생성합니다.

## 사진으로 AI 영상 생성

### 전체 사진으로 한 번에 완성하기

기본 영상 명령어는 **자연광이 드는 책상에서 한 손으로 제품을 사용하는 클로즈업 리뷰**입니다. 상품명을 기준으로 노트·다이어리는 표지 열기, 펜·연필은 짧은 선 긋기, 파우치와 기타 제품은 가볍게 집어 놓기로 동작을 정합니다. 카메라는 거의 고정하고 제품의 형태·인쇄를 유지하도록 요청합니다. 생성 전 **자동으로 들어가는 명령어 보기**에서 확인할 수 있고, 생성된 스토리보드의 움직임 설명에도 저장됩니다. 결과의 손과 제품 디테일은 확인해 주세요.

새 연출은 새 자동 제작 작업에 적용됩니다. 같은 사진·같은 명령어로 만든 클립만 재사용하므로 예전 카메라 이동 영상은 새 연출용으로 재생성됩니다. 기존 실패 작업의 **재시도**는 당시 명령어와 완료 영상을 유지합니다.

상품 정보와 사진을 저장한 뒤 **전체 사진으로 숏츠 완성하기 (유료)**를 누르면, 모든 사진의 AI 영상 생성부터 컷 길이·자막·배경음악 편집과 최종 MP4 렌더링까지 이어집니다. 상품 설정 화면과 스토리보드 화면에서 모두 시작할 수 있습니다. **자막을 읽는 AI 내레이션도 넣기**를 선택하면 유료 음성 생성도 포함합니다.

생성 전에는 새로 만들 사진 수와 재사용할 영상 수를 확인할 수 있고, 진행 중에는 사진별 상태를 보여줍니다. 사진은 대표 사진부터 업로드 순서대로 사용하며, 최대 12장 모두 최종 구성에 포함합니다. 기존 편집본은 새 구성으로 바뀌고 기존 완성 영상은 유지됩니다.

중간 실패·취소 후 **재시도**하면 완료한 클립을 재사용합니다. 외부 서비스에 이미 접수한 작업은 같은 작업을 조회하며, 접수 여부가 불명확하면 중복 결제 방지를 위해 멈추고 안내합니다. 마지막 편집 단계가 실패해도 사진 영상을 다시 생성하지 않습니다. 앱 창을 닫으면 작업이 중단될 수 있으므로 완료할 때까지 앱을 켜 두세요.

### 장면 하나씩 직접 생성하기

1. [Runway 개발자 콘솔](https://dev.runwayml.com/)에서 API 키와 크레딧을 준비합니다. 일반 영상 서비스 구독과 API 크레딧은 별도로 확인하세요.
2. 서버 `.env`에 `RUNWAY_API_KEY=발급받은키`를 설정하고 API와 worker를 재시작합니다. 키를 브라우저나 소스 코드에 넣지 않습니다.
3. 스토리보드를 만든 뒤 **장면 편집 → 사진으로 AI 영상 만들기**에서 움직임을 입력하고 **AI 영상 생성 (유료)**을 누릅니다. 비워두면 부드러운 카메라 이동을 적용합니다.
4. 생성 결과가 해당 장면에 자동 적용됩니다. 클립을 미리보고, 필요하면 재생성하거나 저장된 다른 영상 또는 **사진 편집 사용**을 선택합니다.
5. **영상 렌더링**으로 자막·음성·음악을 합성한 최종 쇼츠를 만듭니다. 저장된 AI 영상은 재생성하지 않습니다. 자동 내레이션을 켜면 아직 생성하지 않은 원고의 음성 생성 비용이 발생합니다.

현재 연결은 **Runway Gen-4 Turbo / 720×1280 / 5초**입니다. 최종 출력은 기존 1080×1920 규격이며 5초보다 긴 장면은 클립을 반복합니다. 원본 사진은 세로 비율에 여백을 추가해 전송하고, 생성 영상의 오디오는 제거합니다. 상품 모양·인쇄 문구가 달라질 수 있으므로 결과를 확인하세요. 자막·가격·로고는 기존 합성 기능으로 적용합니다.

생성 요청 시 사진과 설명이 Runway로 전송되며 생성·재생성에 크레딧이 사용됩니다. `VIDEO_TIMEOUT`은 작업 대기 제한(기본 900초)입니다. 키가 없으면 생성 버튼이 비활성화됩니다. 실패를 사진 영상으로 바꿔 성공 처리하지 않습니다. 저장된 외부 작업 ID가 있으면 재시도 시 기존 작업부터 조회합니다. 접수 여부가 불명확한 요청은 자동 재전송하지 않으며, 사용 내역을 확인한 뒤 새로 생성해야 합니다. 취소는 외부 서비스에도 요청하지만 이미 사용된 크레딧의 환불을 보장하지 않습니다.

구현 참고: [Runway API](https://docs.dev.runwayml.com/guides/using-the-api/). 실제 유료 서비스의 생성 품질·계정 권한 검증에는 유효한 키와 크레딧이 필요합니다.

## 배경음악 + 자막 자동 내레이션

스토리보드 상단 **음악과 자동 내레이션 → 음악 + 자막 내레이션 켜기**를 누른 뒤 **영상 렌더링**을 실행하세요. 현재 자막을 장면별로 읽고, 장면 길이에 맞춘 음성과 배경음악을 합성합니다. 자막을 수정하면 다음 렌더의 읽는 내용도 바뀝니다. 별도 원고를 읽으려면 **자동 내레이션 → 별도 원고 읽기**를 선택합니다.

- 기존 `RUNWAY_API_KEY`로 Runway의 ElevenLabs Multilingual v2 / Rachel 음성을 생성합니다. 자막이 음성 서비스에 전송되며 Runway 크레딧이 사용됩니다. `TTS_API_KEY`와 `TTS_VOICE_ID`가 모두 있으면 기존 ElevenLabs 직접 연결을 우선 사용합니다.
- 생성 음성은 프로젝트에 저장합니다. 같은 내용·모델·목소리의 음성은 다시 렌더하거나 변형을 만들 때 재사용하고, 수정한 원고만 새로 생성합니다. Runway 작업 대기·다운로드 실패 후 재시도도 저장된 작업 ID로 이어갑니다.
- 배경음악은 앱의 기본 합성 음악 또는 업로드한 음원을 사용합니다. 업로드한 음원이 있으면 우선 적용됩니다. 음량·페이드·내레이션 중 음악 줄이기는 스타일 설정에서 조정할 수 있습니다.
- 편집 화면의 미리보기와 AI 원본 클립은 무음입니다. **완성 영상**에서 음악과 내레이션을 확인하세요. 기존 완성 파일은 유지되며 오디오 설정 변경 후 다시 렌더해야 합니다.
- 음성 연결이 없거나 생성에 실패하면 이유를 표시하고 중단합니다. 자동 내레이션을 선택했는데 무음 결과를 성공으로 제공하지 않습니다.

## 판매처 광고 표시

상품 정보의 **광고 판매처 이름 / 판매처 주소**에 상호와 구매 주소를 입력하면, 영상 전체에 판매처 이름과 `상품 광고` 표시가 나오고 마지막 장면에 구매 주소·상품명·가격·안내 문구가 표시됩니다. 상품 브랜드와 판매처는 별도로 저장합니다. 업로드한 프로젝트 로고는 판매처 이름 옆에 크게 표시됩니다.

**스튜디오 설정**에 판매처 이름·주소와 기본 CTA(예: `주아상사에서 만나보세요`)를 저장하면 새 프로젝트에도 적용됩니다. 자동 내레이션을 `자막 읽기`로 설정하면 마지막 안내 문구도 읽습니다. 로고는 설정의 **기본 브랜드 로고**에 등록하거나 기존 프로젝트의 **로고 업로드**로 넣을 수 있습니다. 기존 영상에 반영하려면 다시 렌더하세요.

## 지금 이 작업 폴더에서 실행

프로젝트 폴더의 PowerShell 터미널에서 아래 명령을 실행하세요. 코드 블록의 `powershell`은 언어 표시이며 입력하는 명령이 아닙니다. `PS ...>` 또는 `>>`도 복사하지 마세요. `>>`가 표시되면 Ctrl+C로 취소한 뒤 다시 입력하세요.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

다른 폴더에 있다면 먼저 `Set-Location -LiteralPath '프로젝트를 저장한 실제 경로'`로 이동하세요. 개발 서버가 시작되면 터미널에 표시되는 웹 개발 주소(기본 **http://127.0.0.1:5173**)를 여세요. 이미 실행 중인 앱이 있으면 스크립트가 해당 주소를 안내합니다. 전역 실행 정책을 바꿀 필요는 없습니다.

브라우저 대신 데스크톱 앱 창으로 최신 소스를 실행하려면 `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`을 사용하세요. 소스에서 실행할 때는 exe 재설치가 필요 없습니다.

1. 대시보드에서 **샘플로 시작하기** 또는 **새 쇼츠 만들기**를 선택합니다.
2. 상품 정보·사진·컨셉을 저장합니다. 사진 순서와 대표 사진을 지정할 수 있습니다.
3. **상품 분석·컨셉 추천**으로 추천과 관찰 결과를 보고, **스토리보드 만들기**를 누릅니다.
4. 장면별 자막·사진·길이·초점·전환·내레이션을 편집합니다. 변경은 자동 저장됩니다.
5. 생성 개수를 1~4개로 정하고 **영상 렌더링**을 누릅니다.
6. 완성 영상에서 MP4, PNG, SRT, TXT, 프로젝트 JSON을 내려받습니다.

렌더 중에는 프로젝트 변경을 잠그며, 취소와 실패 작업의 재시도가 가능합니다. 앱을 다시 열어도 프로젝트와 결과가 남습니다.

## 새 PC에서 가장 빠른 설치

필수: **Python 3.12+, Node.js 22+, uv**, Chrome/Chromium. 최초 패키지 설치에는 인터넷이 필요합니다. FFmpeg/ffprobe는 시스템 설치가 없으면 npm의 플랫폼별 실행 파일을 사용합니다.

Windows PowerShell / Linux 공통:

```bash
npm run setup
npm run dev
```

`setup`은 고정된 npm/Python 의존성 설치, 자체 제작 샘플 생성, Alembic 마이그레이션을 실행합니다. `dev`는 API(기본 8000, `API_PORT`로 변경), worker, Vite(5173)를 시작합니다. Ctrl+C로 함께 종료합니다. 이 작업 환경의 `.env`는 기존 테스트 서버와 분리하도록 API 8001, `storage/current`를 사용합니다.

Windows의 이 폴더에 포함된 로컬 Node를 터미널에서 사용하려면:

```powershell
$env:PATH = "$PWD\.tools\node-v22.16.0-win-x64;$env:PATH"
npm run dev
```

Linux에서 Chrome이 없으면 Chromium을 설치하거나 `BROWSER_EXECUTABLE`을 지정합니다. Remotion이 자체 브라우저를 다운로드하도록 빈 값으로 둘 수도 있습니다. Linux에는 `fonts-noto-color-emoji`를 권장합니다. 한글 폰트는 앱 번들에 포함됩니다.

### 화면 없이 데모 영상 생성

worker가 실행 중이지 않을 때:

```bash
npm run migrate
npm run demo-render
```

이 명령은 실제 API → 분석 → 장면 생성 → Remotion → FFmpeg → ffprobe를 실행합니다. 결과 안내는 `storage/demo-result.json`에 기록됩니다. 이미 worker가 실행 중이면 파일 잠금으로 중복 worker 실행을 거부하므로 웹 화면의 샘플 기능을 사용하세요.

## 주요 기능

- 20개 JSON 컨셉, 목적·이름·시즌 검색, 상위 3개 추천, 다른 느낌 추천
- 사용자 프리셋 생성·복제·일반 폼 편집·삭제·JSON 가져오기/내보내기
- JPG/PNG/WebP 검증, EXIF 방향 보정, 원본/최적화본 분리, 사진 정렬·대표·삭제
- 6개 영상 레이아웃, 원본 비율 보존, 작은 이미지 확대 제한, 안전 영역 자막
- 15/20/30초, 1~4개 서로 다른 후킹·장면 순서·움직임의 변형
- 브라우저 Remotion 미리보기, 자동 저장, 충돌 감지, 초기 구성 복원
- DB 작업 큐, 진행률 폴링, 취소, 재시도, worker 재시작 복구
- 기본 로고·브랜드 색상·CTA, 프로젝트별 로고와 보유 음원 업로드
- 직접 합성한 데모 배경음, 볼륨·페이드, AI 음성 덕킹
- 실제 Anthropic 이미지 분석/구조화 시나리오 어댑터, ElevenLabs TTS 어댑터
- 결과 재생 및 MP4·PNG·SRT·TXT·JSON 다운로드

## 시스템 구조

```text
apps/web                  React · TypeScript · Vite · TanStack Query · RHF/Zod
apps/api                  FastAPI · SQLAlchemy · Alembic · Pydantic
apps/api/worker.py         DB 큐 소비, 오디오 처리, 검증, 정리
apps/renderer             Remotion 컴포지션과 Node 렌더 실행기
packages/shared-schema    버전 1 TypeScript/Zod 계약
packages/concept-presets  기본 컨셉 20개 JSON
samples                   자체 제작 노트 이미지와 CC0 안내
scripts                   설정, 실행, 데모, 정리, 정적 검증, 프레임 비교
tests                     백엔드·프런트·계약·브라우저 E2E
storage                   로컬 DB·업로드·작업 임시 파일·결과 (Git 제외)
```

데이터 흐름과 작업 상태는 [ARCHITECTURE.md](docs/ARCHITECTURE.md), API 예시는 [API.md](docs/API.md)를 참고하세요.

## Docker Compose

Docker Desktop(Linux 컨테이너) 또는 Linux Docker Engine과 Compose v2가 필요합니다.

```bash
docker compose config
docker compose up --build -d
```

**http://127.0.0.1:8080** 에 접속합니다. `migrate`가 DB를 준비한 후 `api`, `renderer`, `web`이 시작됩니다. Chromium·FFmpeg·한글/이모지 폰트를 이미지에 설치합니다. 데이터는 `studio-data` 볼륨에 남습니다.

```bash
docker compose logs -f api renderer
docker compose down
```

기본 포트는 로컬 인터페이스에만 공개합니다. 컨테이너 간에 파일 경로가 일치하도록 `/app/storage`를 공유합니다. Docker의 DB는 호스트 경로가 섞이지 않도록 `DOCKER_DATABASE_URL`을 따로 사용합니다. PostgreSQL로 운영할 때 이 변수에 URL을 설정하세요.

**이 개발 환경에는 Docker가 없어 실제 이미지 빌드·기동은 검증하지 못했습니다.** Compose YAML, 서비스 참조, 볼륨, 빌드 대상, 설정 파일을 정적 검사했고 로컬에서는 전체 앱과 렌더링을 실행했습니다.

## 설정과 실제 AI 연결

`.env.example`을 `.env`로 복사합니다. `.env`는 Git에서 제외됩니다.

```dotenv
AI_PROVIDER=anthropic
AI_API_KEY=
AI_MODEL=claude-sonnet-4-20250514
```

키에는 본인의 값을 넣고 API와 worker를 재시작합니다. `AI_BASE_URL`은 Anthropic Messages API와 호환되는 서버 주소입니다. 이미지가 외부 공급자로 전송되는 기능은 키가 있고 해당 공급자를 선택한 경우에만 사용됩니다. 분석은 실제 이미지와 상품 입력을 전달하고, 강제 도구 호출의 JSON을 Pydantic으로 검증합니다. 3회 실패하면 데모 규칙으로 폴백합니다. 분석 폴백은 화면에 표시됩니다. 장면 생성 응답 검증 실패 시 안전한 기본 장면으로 대체합니다.

AI 음성은 `RUNWAY_API_KEY`만으로 사용할 수 있습니다. ElevenLabs에 직접 연결하려면 `TTS_API_KEY`, `TTS_VOICE_ID`, 필요 시 `TTS_MODEL`을 설정합니다. 장면별 자막 또는 원고를 음성으로 만들고 장면 길이에 맞춰 정렬합니다. 자동 내레이션을 선택한 상태에서 연결이 없거나 생성에 실패하면 오류를 표시합니다. Runway를 통한 실제 한국어 음성 생성 및 음악과의 최종 MP4 합성을 검증했습니다.

### 환경변수

| 키 | 기본값 / 역할 |
|---|---|
| `API_PORT` | 로컬 실행 포트, 기본 8000; 이 환경은 8001 |
| `DATABASE_URL` | `sqlite:///storage/studio.db`; PostgreSQL은 `postgresql+psycopg://...` |
| `DOCKER_DATABASE_URL` | Docker의 `/app/storage/studio.db` 또는 PostgreSQL URL |
| `STORAGE_DIR` | 프로젝트의 `storage`; 상대 경로는 저장소 루트 기준 |
| `CORS_ORIGINS` | 허용할 웹 주소의 쉼표 구분 목록 |
| `AI_PROVIDER` | `demo` 또는 `anthropic` |
| `AI_MODEL` | `claude-sonnet-4-20250514`; 접근 가능한 이미지 지원 모델명 |
| `AI_API_KEY` | 서버 전용 AI 키; 빈 값이면 데모 |
| `AI_BASE_URL` | `https://api.anthropic.com` |
| `AI_TIMEOUT` | 요청당 90초, 최대 3회 및 지수 백오프 |
| `TTS_API_KEY`, `TTS_VOICE_ID` | ElevenLabs 키와 음성 식별자 |
| `TTS_MODEL` | `eleven_multilingual_v2` |
| `STORAGE_LIMIT_MB` | 10240MiB; 업로드/렌더 시작 전 검사 |
| `MAX_UPLOAD_MB` | 파일당 20MiB |
| `MAX_IMAGE_PIXELS` | 40,000,000픽셀 |
| `RENDER_TIMEOUT` | 렌더 subprocess당 1800초 |
| `RENDER_CONCURRENCY` | Chromium 동시 프레임 수 2 |
| `BROWSER_EXECUTABLE` | 빈 값이면 Chrome/Chromium 탐색 또는 Remotion 다운로드 |
| `FFMPEG_PATH`, `FFPROBE_PATH` | 빈 값이면 PATH → npm 정적 바이너리 |

브랜드 기본값과 보관 기간은 설정 화면에서 DB에 저장합니다. 보관 정리는 기본적으로 미리보기만 수행합니다.

```bash
npm run cleanup
npm run cleanup -- --apply
```

`--apply`는 설정된 기간 동안 수정하지 않은 프로젝트를 삭제합니다. 활성 작업이 있는 프로젝트는 제외합니다. 자동 삭제 스케줄은 등록하지 않습니다.

## DB·테스트·빌드

```bash
npm run migrate
npm run typecheck
npm run lint
npm test
npm run build
```

API와 worker를 실행한 상태에서 브라우저 전체 제작 흐름 검사:

```bash
npm run e2e
```

현재 환경의 8001 포트에서는 PowerShell에 `$env:TEST_BASE_URL='http://127.0.0.1:8001'`을 먼저 지정하세요. Linux는 `TEST_BASE_URL=http://127.0.0.1:8001 npm run e2e`로 실행합니다.

추가 검사(Windows; Linux는 `.venv/bin/python`):

```powershell
.venv\Scripts\python.exe scripts/validate_compose.py
.venv\Scripts\python.exe scripts/verify_migrations.py
.venv\Scripts\python.exe scripts/render_snapshots.py
.venv\Scripts\python.exe scripts/verify_variants.py
```

검증 범위와 실제 결과는 [TESTING.md](docs/TESTING.md)에 있습니다. `package-lock.json`과 `uv.lock`으로 의존성 전체를 고정했습니다. npm 10의 선택적 peer 처리 오류를 피하기 위한 `.npmrc` 설정이 포함되어 있습니다.

## 프리셋과 영상 수정

일반 사용자는 **컨셉 라이브러리 → 복제 → 폼 편집 → 저장**으로 컨셉을 추가합니다. JSON은 고급 설정에서만 필요합니다. 기본 컨셉 추가는 [PRESETS.md](docs/PRESETS.md)를 참고하세요.

영상 디자인은 `apps/renderer/src/Video.tsx`에서 수정합니다. `useCurrentFrame()`과 `interpolate()`로 프레임 단위 효과를 계산하며, 웹 미리보기와 렌더러가 같은 컴포넌트를 사용합니다. 영상 안에는 CSS 시간 애니메이션을 쓰지 않습니다. 스키마 변경 시 Pydantic과 Zod를 함께 변경하고 계약 테스트를 실행하세요.

## 파일 위치

```text
storage/studio.db
storage/projects/{projectId}/assets/{assetId}/original.{ext}
storage/projects/{projectId}/assets/{assetId}/optimized.jpg (로고는 PNG)
storage/projects/{projectId}/jobs/{jobId}/             # 임시, 종료 시 정리
storage/projects/{projectId}/outputs/{jobId}-{variant}/
  video.mp4 · thumbnail.png · subtitles.srt · script.txt · metadata.json
```

브라우저는 저장소 경로 대신 DB 식별자로 파일을 요청합니다. 결과 JSON에는 서버 비밀키와 이미지 바이너리를 담지 않습니다.

이 작업 환경에서는 위 `storage` 대신 **`storage/current`** 가 활성 저장소입니다. 이전 개발 검증 결과는 `storage/projects`에 남겨 두었습니다.

## 문제 해결

| 증상 | 확인 사항 |
|---|---|
| 작업이 대기에서 멈춤 | worker가 실행 중인지 `/api/ready` 확인. `npm run dev`는 함께 실행합니다. |
| FFmpeg 오류 | `npm ci` 재실행 또는 실행 파일의 절대 경로를 환경변수로 설정 |
| Chrome 실행 실패 | Chrome 설치, `BROWSER_EXECUTABLE` 확인. Docker는 기본 Chromium 사용 |
| 한글/이모지 누락 | Noto Sans KR 패키지 설치 확인, Linux `fonts-noto-color-emoji` 설치 |
| 저장 실패/권한 오류 | `storage` 쓰기 권한·공간 확인. worker는 동일 경로를 사용해야 합니다. |
| AI 연결 실패 | 키·모델 접근 권한·URL·네트워크 확인. 키를 프런트에 입력하지 않습니다. |
| 음성이 너무 빠름 | 원고를 줄이거나 장면 길이를 늘립니다. 긴 음성은 길이에 맞춰 가속됩니다. |
| 자동 저장 충돌 | 다른 탭의 편집을 끝내고 새로고침. 저장 실패 메시지를 먼저 확인하세요. |
| worker 잠금 오류 | 실행 중인 worker가 하나인지 확인. 파일 삭제로 잠금을 우회하지 마세요. |
| HEIC 업로드 오류 | 사진 앱에서 JPG/PNG로 내보내기. 이 버전은 HEIC를 지원하지 않습니다. |

## 배포 전 확인

현재 버전은 **인증 없는 내부 단일 사용자 앱**입니다. 로컬 주소 또는 신뢰할 수 있는 사내망에서 사용하세요. 외부 공개 전에는 SSO/세션 인증, 프로젝트·파일 단위 권한 검사, HTTPS, CSRF, 요청 제한, 프록시 업로드 제한, 백업, 비밀 관리, 감사 로그를 추가해야 합니다. PostgreSQL 설정은 구현되어 있지만 이 환경에서는 SQLite만 실행 검증했습니다.

Remotion의 회사 사용에는 조직 규모·용도에 따른 라이선스 조건이 적용됩니다. 도입 전에 [공식 라이선스](https://www.remotion.dev/docs/license)를 확인하세요. 폰트와 샘플의 배포 조건은 [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md)에 정리했습니다.

### 현재 범위

- 데모 분석은 사진 크기·입력 특징을 사용합니다. 실제 시각적 분류는 AI 연결 시 수행합니다.
- 배경음은 간단한 자체 합성 데모 음악입니다. 음악 라이브러리 서비스는 아닙니다.
- 미리보기는 영상 디자인용이며 최종 오디오 믹스는 완성 MP4에서 확인합니다.
- 손글씨 스타일은 기본 한글 폰트의 기울임·배치로 표현합니다.
- 단일 worker가 프로젝트를 순차 처리합니다. 4개 변형도 차례로 렌더링합니다.
- 작업 취소는 렌더 단계에서 신속히 반영되며 외부 AI/TTS 호출 중에는 응답 또는 timeout 후 반영됩니다.
- 사방넷은 문서화된 API를 받은 뒤 `ProductSourceAdapter`를 구현하는 확장 지점만 제공합니다. SNS 업로드와 생성형 상품 변형은 범위에 포함하지 않습니다.
