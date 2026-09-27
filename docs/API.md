# API 사용

기본 주소 `http://127.0.0.1:8000`, OpenAPI UI `/docs`, 계약 `/openapi.json`.
성공 시 리소스 JSON 또는 목록을 반환합니다. 오류 형식:

```json
{"error":{"code":"409","message":"이미 진행 중인 작업이 있습니다.","requestId":"..."}}
```

응답 헤더에도 `X-Request-ID`를 제공합니다. 서버 경로나 파일명은 요청 식별자로 사용하지 않습니다.

## 빠른 예 (PowerShell)

```powershell
$base = 'http://127.0.0.1:8000/api'
$p = Invoke-RestMethod "$base/demo" -Method Post
$job = Invoke-RestMethod "$base/projects/$($p.id)/storyboard/generate" -Method Post
Invoke-RestMethod "$base/jobs/$($job.id)"
# completed 후 실행
$render = Invoke-RestMethod "$base/projects/$($p.id)/renders" -Method Post
Invoke-RestMethod "$base/projects/$($p.id)"
```

프로젝트 상세의 `outputs[].downloads`가 다운로드 URL입니다.

## 라우트

| 메서드 | 경로 (`/api` 이후) | 동작 |
|---|---|---|
| GET | `/health`, `/ready` | 모드 정보 / DB·FFmpeg·worker 검사 |
| GET, POST | `/projects` | 검색 목록 / 생성 |
| GET, PUT, DELETE | `/projects/{id}` | 상세 / 상품 저장 / 전체 삭제 |
| POST | `/demo` | 자체 제작 샘플 프로젝트 생성 |
| POST | `/projects/{id}/duplicate` | 사진·현재 장면 복사; 기존 렌더는 복제하지 않음 |
| GET, POST, DELETE | `/projects/{id}/assets` | 목록 / 파일 하나 업로드 / 상품 사진·장면 전체 삭제 |
| PUT | `/projects/{id}/assets/order` | `{ids: [...], primaryId: "..."}` |
| DELETE | `/projects/{id}/assets/{assetId}` | 개별 삭제; 장면 참조를 대체 사진으로 변경 |
| GET | `/projects/{id}/assets/{assetId}/file` | 검증된 최적화 파일 |
| POST | `/projects/{id}/analyze` | 분석 작업 202 |
| GET | `/projects/{id}/analysis` | 분석 결과 또는 null |
| GET | `/projects/{id}/recommendations?different=true` | 현재 컨셉과 다른 후보 |
| POST | `/projects/{id}/storyboard/generate` | 분석 + 장면 생성 작업 202 |
| GET, PUT | `/projects/{id}/storyboard` | `{data: Board, revision: number}` 조회·수정 |
| POST | `/projects/{id}/storyboard/reset` | 초기 구성 복원 |
| POST | `/projects/{id}/renders` | 렌더 작업 202, 생성 개수는 저장된 board.style.variants |
| GET | `/jobs/{id}` | 단계·진행률·시도·오류 |
| POST | `/jobs/{id}/cancel`, `/jobs/{id}/retry` | 취소 요청 / 새 작업으로 재시도 |
| GET | `/projects/{id}/outputs/{outputId}/{kind}` | video, thumbnail, subtitles, script, metadata |
| GET, POST | `/presets` | 전체 활성 목록 / 사용자 프리셋 생성 |
| PUT, DELETE | `/presets/{id}` | 사용자 프리셋 수정·삭제 |
| POST | `/presets/{id}/duplicate` | 기본/사용자 프리셋 복제 |
| POST | `/presets/import` | JSON 배열, 1~100개, 새 ID로 가져오기 |
| GET | `/presets/export/json` | 사용자 프리셋 JSON 배열 |
| GET, PUT | `/settings` | 환경 안내 / 브랜드 기본값·보관 기간 |
| POST, DELETE | `/settings/logo` | 기본 로고 업로드 / 삭제 |
| GET | `/settings/logo/file` | 기본 로고 표시 |

업로드는 multipart의 `file` 필드와 `?kind=image|logo|audio`를 사용합니다. 음원은 MP3/WAV/M4A/OGG, 최대 10분입니다. 로고와 음악은 프로젝트당 각 1개입니다.

목록 검색은 `q`, `status`, `concept`, `date=YYYY-MM-DD`입니다. 임의의 프로젝트 ID를 통한 다른 프로젝트 파일 접근은 404입니다. **단일 사용자 모드에서 ID는 인증 수단이 아닙니다.** 외부 서비스에 배포하려면 사용자 소유권 검사를 추가해야 합니다.

## 스토리보드 수정

GET으로 받은 `{data, revision}`을 수정해 PUT합니다. 장면 시간은 정수 프레임이며 서버가 전체 길이로 정규화합니다. 사용 가능한 asset ID와 preset ID를 검증합니다. 가격·상품명은 프로젝트의 입력 값으로 강제합니다. revision이 오래된 경우 409이므로 재조회 후 병합해야 합니다.

요청 전문과 API 키는 로그에 남기지 않습니다. 400/415/422는 입력 오류, 409는 작업·버전 충돌, 413은 크기/저장 공간, 500은 내부 오류입니다.
# 사진 기반 AI 영상

`GET /api/projects/{pid}/auto-video/plan`은 전체 사진의 재사용/대기/기존 작업 확인 상태를 반환합니다. `POST /api/projects/{pid}/auto-video`에 `{ "revision": 0, "narration": false }`를 보내면 전체 사진 영상화 → 자동 장면 구성·자막·음악 합성 → 최종 렌더를 수행하는 `kind: "auto_video"` 작업을 반환합니다(202). 스토리보드가 있으면 최신 revision을 전달합니다. `narration: true`는 유료 AI 음성을 포함합니다.

이 작업은 기존 편집본을 모든 사진이 포함된 새 구성으로 바꿉니다. 상품 설정의 컨셉·길이·스타일을 사용하며, 요청에 `useCurrentEdit: true`를 추가하면 현재 편집본의 설정을 사용합니다. 기존 완성 영상은 유지합니다. 진행 응답에는 `phase`와 사진별 `photos: [{assetId, filename, status}]`가 포함됩니다. 사진 상태는 `pending`, `checking`, `processing`, `completed`입니다. 클립마다 저장하므로 취소·실패 후 `/jobs/{jid}/retry`로 재개할 때 완료된 클립은 재생성하지 않습니다. 사진·상품·편집본이 변경되면 재시도는 409이며 새 자동 제작 요청에서 호환되는 기존 클립과 외부 작업을 재사용합니다.

`POST /api/projects/{pid}/scenes/{sceneId}/video`에 `{ "revision": 1 }`을 보내면 `kind: "video"` 작업을 반환합니다(202). 장면의 `assetId` 사진과 `videoPrompt` 설명으로 Runway Gen-4 Turbo 5초 영상을 생성합니다. 먼저 스토리보드를 저장하고 최신 revision을 전달하세요. API 키 미설정·작업 중·revision 충돌은 409, 없는 장면은 404입니다.

기존 `/api/jobs/{jid}` 조회, `/cancel`, `/retry`를 사용합니다. 영상 작업은 `queued → images → verifying → completed` 순서로 처리되며 완료 시 `kind: "video"` Asset을 추가하고 장면의 `videoAssetId`를 설정합니다. GET 프로젝트를 다시 조회해 새 revision과 장면을 반영하세요. Asset 파일 API는 `video/mp4` 및 Range 요청을 지원합니다.

장면의 `videoAssetId: null`은 사진 편집, 영상 Asset ID는 저장된 클립 사용입니다. `videoPrompt`는 최대 1000자이며 비워두면 기본 카메라 이동을 사용합니다. 같은 프로젝트의 영상만 참조할 수 있습니다. 생성 요청과 최종 렌더 요청은 분리되어 있으며 렌더 요청은 외부 영상을 새로 생성하지 않습니다. `/api/health`의 `video`는 `enabled`, `provider`, `model`만 반환합니다.

재시도는 저장된 외부 작업 ID가 있으면 해당 작업을 조회합니다. 사진·설명이 변경되었으면 재시도 대신 장면에서 새 작업을 생성해야 합니다. 접수 여부가 불명확한 요청은 재전송하지 않습니다. 외부 작업 ID·API 키·임시 결과 URL은 클라이언트 응답에 노출하지 않습니다.
