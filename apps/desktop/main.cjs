const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { publicSettings, readSettings, validateSettings, writeSettings } = require("./settings.cjs");

// The smoke test uses an isolated profile, never a customer's profile or keys.
if (process.env.PAPER_STUDIO_TEST_PROFILE) app.setPath("userData", process.env.PAPER_STUDIO_TEST_PROFILE);
app.setName("Paper Studio");
const root = app.isPackaged ? path.join(process.resourcesPath, "studio") : path.resolve(__dirname, "../..");
const python = app.isPackaged ? path.join(root, "python/python.exe") : path.join(root, ".venv/Scripts/python.exe");
let window, backend, origin, configuration, configurationFile;
let quitting = false;
let saving = false;
const token = crypto.randomBytes(32).toString("hex");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function environment(config) {
  const storage = path.join(app.getPath("userData"), "storage");
  fs.mkdirSync(storage, { recursive: true });
  const env = {
    ...process.env,
    PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1",
    DESKTOP_TOKEN: token,
    STORAGE_DIR: storage,
    DATABASE_URL: `sqlite:///${path.join(storage, "studio.db").replaceAll("\\", "/")}`,
    AI_PROVIDER: config.aiProvider, AI_MODEL: config.aiModel, AI_API_KEY: config.aiApiKey,
    AI_BASE_URL: "https://api.anthropic.com",
    RUNWAY_API_KEY: config.runwayApiKey, TTS_API_KEY: config.ttsApiKey,
    TTS_VOICE_ID: config.ttsVoiceId, TTS_MODEL: "eleven_multilingual_v2",
    PATH: `${path.join(root, ".tools/node-v22.16.0-win-x64")}${path.delimiter}${process.env.PATH || ""}`,
    FFMPEG_PATH: path.join(root, "node_modules/ffmpeg-static/ffmpeg.exe"),
    FFPROBE_PATH: path.join(root, "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"),
  };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.ELECTRON_RUN_AS_NODE;
  if (app.isPackaged) env.BROWSER_EXECUTABLE = path.join(root, "browser/chrome-headless-shell-win64/chrome-headless-shell.exe");
  return env;
}

async function backendRequest(route, method = "GET") {
  const response = await fetch(origin + route, {
    method,
    headers: { "X-Paper-Studio-Token": token },
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "프로그램 연결을 확인해 주세요.");
  return body;
}

async function startBackend(config) {
  const log = fs.openSync(path.join(app.getPath("userData"), "backend.log"), "a");
  const child = spawn(python, ["-m", "apps.api.desktop_host"], {
    cwd: root, env: environment(config), windowsHide: true, stdio: ["pipe", "pipe", log],
  });
  fs.closeSync(log);
  const state = { child, expected: false, failed: false };
  backend = state;
  child.on("error", () => { state.failed = true; });
  child.stdin.on("error", () => {});
  child.once("exit", () => {
    state.failed = true;
    if (!state.expected && window && !quitting && origin && !saving) {
      dialog.showErrorBox("실행 오류", "영상 처리 연결이 종료되었습니다. 프로그램을 다시 실행해 주세요.\n로그: " + path.join(app.getPath("userData"), "backend.log"));
      app.quit();
    }
  });
  let buffer = "";
  let port;
  child.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      try {
        const value = JSON.parse(line);
        if (Number.isInteger(value.port) && value.port > 0 && value.port < 65536) port = value.port;
      } catch { /* Other stdout cannot select a backend URL. */ }
    }
  });
  for (let attempt = 0; attempt < 240; attempt++) {
    if (state.failed) throw new Error("내부 실행 도구를 시작하지 못했습니다. backend.log를 확인해 주세요.");
    if (port) {
      origin = `http://127.0.0.1:${port}`;
      try {
        const ready = await backendRequest("/api/ready");
        if (Object.values(ready.checks).every(Boolean)) return;
      } catch { /* Wait for migrations, API and worker startup. */ }
    }
    await delay(250);
  }
  throw new Error("프로그램 준비 시간이 초과되었습니다. backend.log를 확인해 주세요.");
}

async function stopBackend() {
  const state = backend;
  if (!state) return;
  state.expected = true;
  state.child.stdin.end();
  for (let attempt = 0; attempt < 60 && state.child.exitCode === null && !state.failed; attempt++) await delay(200);
  if (state.child.exitCode === null && !state.failed) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(state.child.pid), "/T", "/F"], { windowsHide: true });
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
  }
  if (backend === state) backend = undefined;
}

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== origin) throw new Error("허용되지 않은 창입니다.");
}

function registerHandlers() {
  const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => { trusted(event); return fn(...args); });
  handle("desktop:settings", () => publicSettings(configuration));
  handle("desktop:choose-folder", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "완성 영상 저장 폴더", defaultPath: configuration.outputDirectory,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("desktop:open-folder", async () => {
    fs.mkdirSync(configuration.outputDirectory, { recursive: true });
    const error = await shell.openPath(configuration.outputDirectory);
    if (error) throw new Error("저장 폴더를 열지 못했습니다.");
  });
  handle("desktop:save-settings", async (input) => {
    if (saving) throw new Error("설정을 적용하는 중입니다.");
    const next = validateSettings(input, configuration);
    fs.mkdirSync(next.outputDirectory, { recursive: true });
    fs.accessSync(next.outputDirectory, fs.constants.W_OK);
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 보안 저장소를 사용할 수 없습니다.");
    saving = true;
    let paused = false;
    try {
      await backendRequest("/api/desktop/pause", "POST");
      paused = true;
      await stopBackend();
      await startBackend(next);
      writeSettings(configurationFile, next, safeStorage);
      configuration = next;
      setTimeout(() => { if (!quitting) void window.loadURL(origin); }, 150);
      return publicSettings(next);
    } catch (error) {
      if (paused) {
        await stopBackend();
        await startBackend(configuration);
        setTimeout(() => { if (!quitting) void window.loadURL(origin); }, 1500);
      }
      throw error;
    } finally { saving = false; }
  });
}

async function launch() {
  await app.whenReady();
  app.setAppUserModelId("com.paperstudio.shorts");
  configurationFile = path.join(app.getPath("userData"), "desktop-settings.json");
  configuration = readSettings(configurationFile, safeStorage, path.join(app.getPath("videos"), "Paper Studio"));
  window = new BrowserWindow({
    title: "종이상점 · 쇼츠 스튜디오", width: 1440, height: 960, minWidth: 1024, minHeight: 720,
    backgroundColor: "#f8f7f4", autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.setMenu(null);
  window.on("close", (event) => { if (!quitting) { event.preventDefault(); app.quit(); } });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (origin && url === `${origin}/api/ready`) {
      void backendRequest("/api/ready").then((result) => dialog.showMessageBox(window, {
        title: "실행 상태", message: Object.values(result.checks).every(Boolean) ? "모든 실행 도구가 준비되었습니다." : "실행 도구를 확인해 주세요.",
      })).catch(() => {});
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!origin || new URL(url).origin !== origin) event.preventDefault();
  });
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (origin && details.url.startsWith(origin + "/") && details.webContentsId === window.webContents.id) {
      details.requestHeaders["X-Paper-Studio-Token"] = token;
    }
    callback({ requestHeaders: details.requestHeaders });
  });
  session.on("will-download", (event, item, contents) => {
    if (contents !== window.webContents || !item.getURL().startsWith(origin + "/api/")) { event.preventDefault(); return; }
    fs.mkdirSync(configuration.outputDirectory, { recursive: true });
    item.setSaveDialogOptions({
      title: "완성 파일을 PC에 저장", defaultPath: path.join(configuration.outputDirectory, path.basename(item.getFilename())),
    });
    item.once("done", (_event, state) => {
      if (state === "interrupted") dialog.showErrorBox("저장 실패", "파일을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.");
    });
  });
  registerHandlers();
  await window.loadFile(path.join(__dirname, "loading.html"));
  await startBackend(configuration);
  await window.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on("window-all-closed", () => app.quit());
  let closing = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    if (closing || saving) return;
    closing = true;
    void (async () => {
      const status = origin ? await backendRequest("/api/desktop/status").catch(() => ({ busy: false })) : { busy: false };
      if (status.busy && window && !window.isDestroyed()) {
        const result = await dialog.showMessageBox(window, {
          type: "question", title: "영상 작업 진행 중", message: "진행 중인 작업을 중단하고 종료할까요?",
          detail: "외부 AI 서비스에 이미 접수된 작업은 계속 처리될 수 있습니다. 다음 실행 시 작업 상태를 확인해 주세요.",
          buttons: ["계속 작업", "종료"], defaultId: 0, cancelId: 0,
        });
        if (result.response === 0) { closing = false; return; }
      }
      quitting = true;
      await stopBackend();
      app.quit();
    })();
  });
  void launch().catch(async (error) => {
    dialog.showErrorBox("종이상점 실행 오류", error.message + "\n설정과 로그: " + app.getPath("userData"));
    quitting = true;
    await stopBackend();
    app.quit();
  });
}
