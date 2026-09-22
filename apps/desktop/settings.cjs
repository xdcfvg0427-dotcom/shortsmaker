const fs = require("node:fs");
const path = require("node:path");
const SECRET_FIELDS = ["runwayApiKey", "aiApiKey", "ttsApiKey"];
const DEFAULTS = {
  aiProvider: "demo",
  aiModel: "claude-sonnet-4-20250514",
  ttsVoiceId: "",
  runwayApiKey: "",
  aiApiKey: "",
  ttsApiKey: "",
};

function validateSettings(input, previous) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("설정 값을 확인해 주세요.");
  const next = { ...previous };
  for (const key of Object.keys(input)) {
    if (![...Object.keys(DEFAULTS), "outputDirectory"].includes(key)) throw new Error("지원하지 않는 설정입니다.");
    if (typeof input[key] !== "string" || input[key].length > 4096 || /[\r\n\0]/.test(input[key])) {
      throw new Error("설정 값의 길이와 줄바꿈을 확인해 주세요.");
    }
    next[key] = input[key].trim();
  }
  if (!["demo", "anthropic"].includes(next.aiProvider)) throw new Error("AI 공급자를 확인해 주세요.");
  if (!next.aiModel) throw new Error("AI 모델 이름을 입력해 주세요.");
  if (!path.isAbsolute(next.outputDirectory)) throw new Error("저장 폴더는 전체 경로로 지정해 주세요.");
  if (next.aiProvider === "anthropic" && !next.aiApiKey) throw new Error("AI 분석에 사용할 API 키를 입력해 주세요.");
  if (Boolean(next.ttsApiKey) !== Boolean(next.ttsVoiceId)) throw new Error("ElevenLabs API 키와 음성 ID를 함께 입력해 주세요.");
  return next;
}

function publicSettings(value) {
  const result = { ...value };
  for (const key of SECRET_FIELDS) {
    result[`${key}Set`] = Boolean(value[key]);
    delete result[key];
  }
  return result;
}

function readSettings(file, safeStorage, outputDirectory) {
  const result = { ...DEFAULTS, outputDirectory };
  if (!fs.existsSync(file)) return result;
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(result, saved);
  for (const key of SECRET_FIELDS) {
    result[key] = saved[key] ? safeStorage.decryptString(Buffer.from(saved[key], "base64")) : "";
  }
  return validateSettings(result, result);
}

function writeSettings(file, value, safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 보안 저장소를 사용할 수 없습니다.");
  const saved = { ...value };
  for (const key of SECRET_FIELDS) {
    saved[key] = value[key] ? safeStorage.encryptString(value[key]).toString("base64") : "";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { DEFAULTS, SECRET_FIELDS, validateSettings, publicSettings, readSettings, writeSettings };
