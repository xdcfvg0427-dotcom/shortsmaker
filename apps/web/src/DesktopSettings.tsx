import { useEffect, useState } from "react";

type DesktopSettingsValue = {
  aiProvider: "demo" | "anthropic";
  aiModel: string;
  ttsVoiceId: string;
  outputDirectory: string;
  runwayApiKeySet: boolean;
  aiApiKeySet: boolean;
  ttsApiKeySet: boolean;
};
type SecretKey = "runwayApiKey" | "aiApiKey" | "ttsApiKey";
type SettingsPatch = Partial<Pick<DesktopSettingsValue, "aiProvider" | "aiModel" | "ttsVoiceId" | "outputDirectory">> & Partial<Record<SecretKey, string>>;
declare global {
  interface Window {
    paperDesktop?: {
      settings: () => Promise<DesktopSettingsValue>;
      saveSettings: (value: SettingsPatch) => Promise<DesktopSettingsValue>;
      chooseFolder: () => Promise<string | null>;
      openFolder: () => Promise<void>;
    };
  }
}

export function DesktopSettings() {
  const desktop = window.paperDesktop;
  const [value, setValue] = useState<DesktopSettingsValue>();
  const [keys, setKeys] = useState<Partial<Record<SecretKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void desktop?.settings().then(setValue).catch((e: Error) => setError(e.message));
  }, [desktop]);
  if (!desktop) return null;
  const keyField = (key: SecretKey, label: string) => (
    <label>
      {label} {value?.[`${key}Set`] && <span className="help">· 저장됨</span>}
      <input
        type="password" autoComplete="new-password" spellCheck={false} maxLength={4096}
        value={keys[key] || ""}
        placeholder={value?.[`${key}Set`] ? "변경할 때만 새 키를 입력하세요" : "API 키 입력"}
        onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
      />
      {value?.[`${key}Set`] && (
        <span className="actions">
          <button type="button" onClick={() => setKeys({ ...keys, [key]: "" })}>저장된 키 삭제</button>
          {keys[key] === "" && <small>저장 시 삭제됩니다.</small>}
          {keys[key] !== undefined && <button type="button" onClick={() => setKeys((current) => {
            const next = { ...current }; delete next[key]; return next;
          })}>변경 취소</button>}
        </span>
      )}
    </label>
  );
  return (
    <section className="panel desktop-settings">
      <h2>프로그램 연결과 저장 폴더</h2>
      <p className="help">API 키는 이 PC의 Windows 계정으로 암호화해 보관합니다. 저장된 키는 화면에 다시 표시하지 않습니다.</p>
      {error && <p role="alert" className="desktop-error">{error}</p>}
      {!value ? <p>설정을 불러오는 중…</p> : (
        <form onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError("");
          try {
            await desktop.saveSettings({
              aiProvider: value.aiProvider, aiModel: value.aiModel,
              ttsVoiceId: value.ttsVoiceId, outputDirectory: value.outputDirectory, ...keys,
            });
          } catch (e) { setError((e as Error).message); setBusy(false); }
        }}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {keyField("runwayApiKey", "Runway API 키 · AI 영상·내레이션")}
              <label>상품 분석 방식
                <select value={value.aiProvider} onChange={(e) => setValue({ ...value, aiProvider: e.target.value as DesktopSettingsValue["aiProvider"] })}>
                  <option value="demo">기본 분석 · API 키 없이 사용</option>
                  <option value="anthropic">Anthropic AI 분석</option>
                </select>
              </label>
              {keyField("aiApiKey", "Anthropic API 키")}
              <label>Anthropic 모델 이름
                <input value={value.aiModel} maxLength={200} onChange={(e) => setValue({ ...value, aiModel: e.target.value })} />
              </label>
              {keyField("ttsApiKey", "ElevenLabs API 키 · 선택 사항")}
              <label>ElevenLabs 음성 ID
                <input value={value.ttsVoiceId} maxLength={200} onChange={(e) => setValue({ ...value, ttsVoiceId: e.target.value })} />
              </label>
              <div className="full">
                <label>완성 영상 저장 폴더
                  <input readOnly value={value.outputDirectory} />
                </label>
                <div className="actions">
                  <button type="button" onClick={async () => {
                    try { const folder = await desktop.chooseFolder(); if (folder) setValue({ ...value, outputDirectory: folder }); }
                    catch (e) { setError((e as Error).message); }
                  }}>저장 폴더 선택</button>
                  <button type="button" onClick={() => { void desktop.openFolder().catch((e: Error) => setError(e.message)); }}>현재 저장 폴더 열기</button>
                </div>
                <p className="help">완성 영상에서 ‘MP4 영상’을 누르면 이 폴더를 기본 위치로 저장 창이 열립니다. 프로젝트 작업 데이터는 별도로 자동 보관합니다.</p>
              </div>
            </div>
            <p className="help">Runway 키로 영상과 내레이션을 생성할 수 있습니다. ElevenLabs를 직접 연결하려면 API 키와 음성 ID를 함께 입력하세요. 외부 AI 생성에는 인터넷과 해당 서비스의 크레딧이 필요합니다.</p>
            <button className="primary" type="submit">{busy ? "설정을 적용하고 있어요…" : "연결·저장 폴더 적용"}</button>
            <p className="help" role="status">{busy ? "잠시 후 화면이 다시 열립니다." : "진행 중인 작업이 끝난 뒤 적용하세요. 저장하면 연결을 다시 시작합니다."}</p>
          </fieldset>
        </form>
      )}
    </section>
  );
}
