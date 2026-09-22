# 이미지·폰트·음악·렌더러

- **샘플 이미지**: `scripts/create_samples.py`가 그린 자체 노트·연필 일러스트입니다. 제3자 브랜드·캐릭터를 포함하지 않습니다. 샘플은 CC0-1.0으로 사용할 수 있습니다. `samples/LICENSE.txt` 참고.
- **데모 음악**: worker가 코드로 합성한 사인파 기반 짧은 패턴입니다. 외부 녹음이나 불명확한 음원을 다운로드하지 않습니다. 사용자가 업로드하는 음원은 사용자가 권한을 확인해야 합니다.
- **Noto Sans KR**: `@fontsource/noto-sans-kr`에 포함된 SIL Open Font License 1.1 폰트를 웹과 렌더 번들에서 사용합니다. 라이선스 사본은 `docs/licenses/NotoSansKR-OFL.txt`에 있습니다. 원본 패키지에서도 확인할 수 있습니다.
- **이모지**: Windows에서는 시스템 폰트, Docker에서는 배포판의 Noto Color Emoji를 사용합니다. 시스템 폰트를 저장소에 무단 복사하지 않습니다.
- **Remotion**: 별도의 회사 사용 조건이 있습니다. 조직에 맞는 [공식 라이선스와 조건](https://www.remotion.dev/docs/license)을 확인하세요.
- **FFmpeg/ffprobe**: 시스템 바이너리 또는 npm 배포 바이너리를 사용합니다. 실행 파일을 재배포할 때 해당 빌드의 라이선스·소스 제공 조건을 확인하세요.

공식 구현 참고: [Remotion renderMedia](https://www.remotion.dev/docs/renderer/render-media), [Anthropic 이미지 입력](https://platform.claude.com/docs/en/build-with-claude/vision), [ElevenLabs 음성 생성](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
