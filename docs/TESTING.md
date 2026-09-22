# 테스트와 실제 검증

## Windows 데스크톱 추가 검증

- 2026-09-22: 최종 NSIS 설치 파일로 현재 Windows 사용자 계정에 설치를 완료했습니다(종료 코드 0). `C:/Users/HB/AppData/Local/Programs/Paper Studio/Paper Studio.exe`와 바탕화면의 `종이상점 쇼츠 스튜디오.lnk` 연결을 확인했습니다. 설치 파일 해시와 경로는 `release/install-verification.json`에 기록했습니다.
- 실제 설치본에서도 개발용 Python/Node 경로를 제외하고 키 암호화·저장 폴더·작업 중 종료 취소·MP4 생성과 저장·강제 종료 없는 정상 종료·재실행 복원을 통과했습니다. 기록: `storage/desktop-smoke-1790037061915/verification.json`, 영상: 같은 폴더의 `완성 영상/검증 영상.mp4`.

- TypeScript, ESLint/Ruff, Vite 빌드 통과. 백엔드 35개, 프런트/공용 계약 9개, 데스크톱 설정 4개 테스트 통과.
- `node scripts/verify_desktop.mjs`: 별도 사용자 프로필로 실제 전용 창 실행, Windows DPAPI 암호화, 저장된 키 비노출·삭제, 네이티브 폴더 선택, 렌더 중 설정 적용 거부, 실제 MP4 저장과 재실행 후 프로젝트/설정 복원을 확인했습니다.
- `node scripts/verify_desktop.mjs "release/win-unpacked/Paper Studio.exe"`: 개발 도구를 PATH에서 제외한 배포 실행 파일에서도 위 흐름을 통과했습니다. 작업 중 종료를 취소하면 앱과 작업이 계속 유지되며, 다운로드 저장 창의 기본 위치가 선택한 폴더인지 확인합니다.
- 실제 결과는 1080×1920 H.264/AAC MP4입니다. `storage/desktop-smoke-1789973792452/verification.json`과 `완성 영상/검증 영상.mp4`에 배포 앱 검증 기록이 있습니다.
- 패키징 후 Python·Node·FFmpeg·ffprobe·Remotion·렌더 브라우저·웹 화면이 모두 포함됐는지 검사합니다. `.env`와 기존 프로젝트 저장소가 들어가면 빌드가 실패합니다.
- 이번 데스크톱 검증에서 외부 유료 AI 호출은 실행하지 않았습니다. 별도 물리 PC에서의 실행은 아직 확인하지 않았습니다.

## 자막 내레이션·음악 추가 검증

- 전체 백엔드 31개, 프런트/공용 계약 9개 통과. 새 음성 검증은 Runway TTS 요청 형식·한국어 입력·캐시 재사용·수정 원고 재생성·작업 재개, 자막과 별도 원고 선택, 연결 누락 차단, 실제 FFmpeg 시간 정렬 및 공백 장면 무음, 음성 실패 전파를 포함합니다.
- 실제 Runway API로 한국어 자막 5개(65자)의 음성을 생성하고 음악과 합성했습니다. 15.0초, 1080×1920, 30fps, H.264/AAC 출력과 오디오 신호를 확인했습니다. 검증 생성물은 해당 프로젝트의 완성 영상 목록에 추가되어 있습니다.
- `scripts/render_narrated_project.py <projectId>`는 지정한 프로젝트에 자막 내레이션·음악을 설정하고 실제 렌더를 실행합니다. 유료 음성 API를 사용하며 기존 AI 영상과 캐시된 음성은 재사용합니다.
- 프런트 편집 미리보기는 무음이며, 오디오는 완성 파일에서 검증합니다.

## 사진 기반 AI 영상 추가 검증

- 백엔드 전체 21개, 프런트/공용 계약 9개 통과. 새 검증은 Runway 요청 형식, 인증 정보 비노출, 결과 다운로드, 기존 작업 재사용, 중복 제출 방지, 취소, 공급자 오류·시간 초과, 장면 잠금·revision·프로젝트 경계, 실제 클립 저장·5초 규격 변환, 영상 포함 프로젝트 복제·삭제를 포함합니다.
- `scripts/verify_video.py`: 별도 `storage/video-verification` DB에서 합성 동영상으로 공급자 응답을 대체하고, 실제 worker → FFmpeg → Remotion → 최종 MP4를 실행합니다. 유료 API는 호출하지 않습니다. 7초 장면에 5초 클립을 넣어 반복 재생도 확인합니다. 결과: 15초, 1080×1920, 30fps, H.264/AAC. 결과 경로는 `storage/video-verification/result.json`입니다.
- `scripts/verify_video_ui.mjs`: 위 저장소를 사용하는 API를 8013 포트에서 실행한 후 호출합니다. 브라우저에서 생성·저장 요청을 가로채어 API 키 미설정 안내, 클립 재생, 생성 전 자동 저장, 진행 상태 조회, 완료 후 영상 자동 적용, 태블릿 가로 넘침을 검사합니다. 실제 유료 생성 요청은 보내지 않습니다.
- ESLint/Ruff, TypeScript, Vite 빌드 통과. 실제 Runway 유료 생성 및 생성 품질은 키·크레딧 연결 후 별도 확인이 필요합니다.

```powershell
.venv\Scripts\python.exe scripts/verify_video.py
# 별도 터미널에서 검증용 API 실행
$env:STORAGE_DIR = "$PWD\storage\video-verification"
$env:DATABASE_URL = 'sqlite:///' + ($env:STORAGE_DIR.Replace('\','/') + '/studio.db')
.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8013
# API 실행 후 다른 터미널
node scripts/verify_video_ui.mjs
```

아래 실행 기록 중 백엔드 11개는 AI 영상 기능 추가 전의 기존 검증 내역입니다.

## 자동 검사

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

- **백엔드 11개**: 20개 프리셋과 사용자 CRUD/import/export, 파일 MIME·손상·수·EXIF 검증, 파일 경로/프로젝트 경계, 분석 폴백, 장면 시간·SRT·4개 변형, 자동 저장 revision, 분석부터 렌더 요청까지 API 흐름, 취소·재시도 요청, 상태 전이·재시작 복구, 프로젝트 복제·삭제, 외부 Origin 거부, 기본 로고 상속, 사진 전체 초기화, 요청 크기 제한, 가격 보존, 활성 job 고유 제약.
- **프런트/공용 계약 9개**: 제품 폼 입력 제약, 컨셉 검색·선택, 스타일 편집, 타임라인 재계산과 선택한 길이 보존, Pydantic/Zod 공통 fixture, 잘못된 장면 거부, 결정론적 프레임 스타일 차이, 렌더 상태·취소 버튼.
- **브라우저 E2E 2개**: 샘플 → 스토리보드 → 자막 자동 저장 → 실제 MP4와 SRT 검증; 사용자 프리셋 폼 생성·수정·삭제 → 설정 화면 → 태블릿 가로 넘침 검사. 별도로 각각 실행해 통과했습니다.

Python 테스트는 별도 임시 SQLite DB를 사용합니다. 실제 프로젝트 DB를 비우지 않습니다. Starlette 테스트 클라이언트에서 AnyIO 별칭에 대한 deprecation warning 1개가 있으며 테스트 실패는 아닙니다.

## 실행 검증

```powershell
.venv\Scripts\python.exe scripts/verify_migrations.py
.venv\Scripts\python.exe scripts/validate_compose.py
.venv\Scripts\python.exe scripts/render_snapshots.py
$env:TEST_BASE_URL='http://127.0.0.1:8001'
npm run e2e
.venv\Scripts\python.exe scripts/verify_variants.py
.venv\Scripts\python.exe scripts/verify_active_cancel.py
```

Linux에서는 `.venv/bin/python`을 사용합니다. 기본 테스트 주소는 8000입니다. 현재 작업 환경의 API는 8001입니다. 실제 API와 worker가 실행 중이어야 E2E/변형 검사가 동작합니다.

| 검증 | 실제 결과 |
|---|---|
| ESLint + Ruff | 통과 |
| TypeScript | 통과 |
| 프런트/백엔드 단위·통합 | 9 + 11 통과 |
| Vite production build | 통과 |
| 빈 DB → Alembic 0002 | 모든 테이블·활성 작업 인덱스 생성, 반복 upgrade 통과 |
| Docker Compose | YAML·서비스 의존성·공유 볼륨·설정 파일 정적 검사 통과 |
| 최초 실제 데모 MP4 | 1080×1920, 30fps, 15.0초, H.264/AAC |
| 브라우저 전체 제작 흐름 | 통과, 자막 변경이 SRT에 반영됨 |
| 4개 실제 영상 | 모두 규격 검증 통과; 후킹 4개와 파일 SHA-256 4개가 서로 다름 |
| 취소·재시도 | 활성 렌더 취소 후 attempt 2로 재시도, 4개 영상 완성 |
| 서로 다른 컨셉 실제 PNG | 두 Remotion 프레임 평균 픽셀 차이 약 6.44/255; 한글 포함 |
| npm 의존성 감사 | 마지막 설치 검사에서 알려진 취약점 0개 |

실제 결과 파일:

- `storage/demo-result.json`: 최초 데모 프로젝트 메타데이터
- `storage/verification/variants.json`: 취소·재시도·4개 MP4의 검증값·후킹·파일 해시
- `storage/verification/active-cancel.json`: 프레임 렌더 시작 후 취소 검증
- `storage/verification/renderer/`: 두 컨셉 PNG와 픽셀 비교 결과
- `storage/ui-check/`: 별도로 실행한 UI E2E 결과
- `test-results/`: 브라우저 화면 이미지; 다음 Playwright 실행 시 교체될 수 있음

## 확인한 결함과 수정

타입 오류와 의존성 취약점을 수정하고 버전을 갱신했습니다. 타임라인 재저장으로 길이가 달라지는 문제는 정규화의 안정성을 보장하도록 수정했습니다. 동시 렌더 요청은 DB 부분 고유 인덱스로 막습니다. 취소 전에 Remotion 번들이 만들어지는 경우와 실제 렌더가 시작된 경우를 구분해 취소 신호를 전달하며, 직접 생성한 브라우저는 DevTools를 통해 닫습니다.

프리셋 UI 테스트 중 textarea의 label 텍스트에 초기값이 합쳐지는 선택자 문제가 있어 접근성 role/name 기준으로 검증하도록 수정했습니다. 빌드와 브라우저 테스트는 순서대로 실행해야 합니다. 빌드 도중 이전 해시의 JS를 읽은 테스트는 취소하고 완료된 빌드에서 다시 실행했습니다.

## 미검증 환경

Docker 실행 도구가 설치되지 않아 이미지 빌드·컨테이너 기동은 실행하지 않았습니다. PostgreSQL 서버와 외부 Anthropic/ElevenLabs 키가 없어 해당 실제 서비스 연결은 검증하지 않았습니다. 어댑터, 스키마 검증, 재시도·폴백 코드는 구현되어 있으며 키 없는 전체 흐름은 실제로 검증했습니다.
