# Windows 설치형 쇼츠 스튜디오

Windows x64용 설치 프로그램은 `release/Paper-Studio-Setup-1.0.0.exe`입니다.
설치 후 바탕화면이나 시작 메뉴의 **종이상점 쇼츠 스튜디오**를 실행합니다.
Python, Node.js, Chrome, FFmpeg를 따로 설치할 필요가 없습니다.
내장 영상 도구를 푸는 과정 때문에 최초 설치에는 시간이 걸릴 수 있습니다.

## 사용

1. **스튜디오 설정 → 프로그램 연결과 저장 폴더**에서 API 키와 완성 영상 저장 폴더를 지정하고 **연결·저장 폴더 적용**을 누릅니다.
2. **새 쇼츠 만들기**에서 상품 사진과 정보를 등록합니다. **샘플로 시작하기**로 체험할 수도 있습니다.
3. 스토리보드를 만들고 자막·음악·내레이션을 설정합니다. Runway 연결 시 사진으로 AI 영상도 생성할 수 있습니다.
4. **영상 렌더링** 후 **MP4 영상**을 누르면 선택한 폴더를 기본 위치로 저장 창이 열립니다. 파일 이름과 위치를 확인해 저장합니다.

사진 애니메이션·자막·기본 배경음악 합성에는 외부 API 키가 필요 없습니다.
외부 AI 분석·영상·음성 생성에는 인터넷과 해당 서비스의 API 사용 권한/크레딧이 필요합니다.
Runway 키 하나로 영상과 내레이션을 연결할 수 있으며, ElevenLabs 직접 연결은 API 키와 음성 ID를 함께 입력합니다.
API 키 저장은 유효성·잔액을 확인하는 유료 생성 요청을 실행하지 않습니다.

## 저장과 종료

- 프로젝트·원본 사진·렌더 결과: `%APPDATA%/Paper Studio/storage` (개발 실행 시 앱 패키지 이름에 따른 폴더).
- 연결 설정: 같은 사용자 데이터 폴더의 `desktop-settings.json`. API 키는 Windows DPAPI를 사용하는 Electron `safeStorage`로 암호화합니다. 다른 Windows 계정으로 복사한 암호화 키는 복원할 수 없으므로 다시 입력합니다.
- 완성 파일 기본 저장 위치: Windows 동영상 폴더의 `Paper Studio`. 설정에서 변경해도 기존 프로젝트와 기존에 저장한 영상은 이동하지 않습니다.
- 실행 로그: 사용자 데이터 폴더의 `backend.log`.
- 연결 설정 적용은 진행 중인 작업이 없을 때 가능합니다. 창을 닫으면 내부 서버와 영상 도구도 종료됩니다. 진행 중인 작업이 있으면 종료 여부를 묻습니다.
- 프로그램 제거 시 사용자 작업 데이터는 보존합니다. 기존 개발 웹 앱의 `storage/current` 데이터와 `.env`는 자동으로 가져오지 않습니다.

## 개발과 빌드

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
# 또는 로컬 Node가 PATH에 있을 때
npm.cmd run desktop
npm.cmd run desktop:test
npm.cmd run desktop:dist
```

개발 실행은 프로젝트의 `.venv`와 `.tools/node-v22.16.0-win-x64`를 사용합니다.
설치 파일 생성은 Windows x64에서 수행합니다. 최초 빌드는 의존성과 렌더 브라우저 다운로드를 위해 인터넷이 필요합니다.
빌드용 `uv`가 PATH에 있어야 하며 기본 Python 원본은 `.tools/python/cpython-3.12.10-windows-x86_64-none`입니다.
다른 위치의 이동 가능한 Python 3.12 x64 배포판을 사용할 때는 `DESKTOP_PYTHON_HOME`을 지정합니다.
개인 키와 프로젝트 데이터는 패키징 입력에 포함하지 않습니다.

`npm.cmd run desktop:pack`은 설치 전 실행 폴더만 생성합니다.
설치 파일에는 서명이 포함되지 않습니다. 배포용 코드 서명 인증서를 연결하지 않은 빌드이므로 Windows에서 게시자를 확인할 수 없다는 안내가 표시될 수 있습니다.

실제 실행 검증:

```powershell
node scripts/verify_desktop.mjs
node scripts/verify_desktop.mjs "release/win-unpacked/Paper Studio.exe"
# 현재 사용자 계정에 실제 설치하고 바탕화면 바로가기를 검사합니다.
powershell -ExecutionPolicy Bypass -File .\scripts\verify_desktop_install.ps1
```

검증은 `storage/desktop-smoke-*`에 별도 프로필을 만들고, 실제 Windows 키 암호화·폴더 선택·키 삭제·작업 중 설정 변경 거부·1080×1920 H.264/AAC MP4 생성과 저장·재실행 후 복원을 확인합니다. 유료 AI 호출은 하지 않습니다.

구현 참고: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request), [electron-builder NSIS](https://www.electron.build/nsis/).
