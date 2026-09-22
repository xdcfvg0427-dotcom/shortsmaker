const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULTS, validateSettings, publicSettings, readSettings, writeSettings } = require("../../apps/desktop/settings.cjs");
const previous = { ...DEFAULTS, outputDirectory: path.join(os.tmpdir(), "videos"), runwayApiKey: "private-key" };

test("partial updates retain saved keys, explicit empty values remove them", () => {
  assert.equal(validateSettings({ aiModel: "new-model" }, previous).runwayApiKey, "private-key");
  assert.equal(validateSettings({ runwayApiKey: "" }, previous).runwayApiKey, "");
});
test("renderer only sees key presence, never key material", () => {
  const result = publicSettings(previous);
  assert.equal(result.runwayApiKeySet, true);
  assert.equal(result.aiApiKeySet, false);
  assert.ok(!JSON.stringify(result).includes("private-key"));
  assert.ok(!("runwayApiKey" in result));
});
test("invalid settings cannot inject environment values or unusable connections", () => {
  for (const patch of [{ outputDirectory: "relative" }, { aiModel: "bad\nmodel" }, { aiProvider: "unknown" },
    { aiProvider: "anthropic" }, { ttsApiKey: "key" }, { DESKTOP_TOKEN: "changed" }, { runwayApiKey: 1 }]) {
    assert.throws(() => validateSettings(patch, previous));
  }
});
test("persistence encrypts secrets and refuses a plaintext fallback", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "paper-settings-"));
  const file = path.join(directory, "settings.json");
  // The desktop smoke test additionally verifies real Windows DPAPI persistence.
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value.split("").reverse().join("")),
    decryptString: (value) => value.toString().split("").reverse().join(""),
  };
  writeSettings(file, previous, storage);
  assert.ok(!fs.readFileSync(file, "utf8").includes("private-key"));
  assert.deepEqual(readSettings(file, storage, previous.outputDirectory), previous);
  assert.throws(() => writeSettings(file, previous, { isEncryptionAvailable: () => false }));
  fs.unlinkSync(file);
  fs.rmdirSync(directory);
});
