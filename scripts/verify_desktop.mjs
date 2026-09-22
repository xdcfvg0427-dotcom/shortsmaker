import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const profile = path.join(root, "storage", `desktop-smoke-${Date.now()}`);
const outputDirectory = path.join(profile, "완성 영상");
const executablePath = process.argv[2];
const env = { ...process.env, PAPER_STUDIO_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
if (executablePath) {
  // Prove the installed application does not find developer Python/Node on PATH.
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") delete env[key];
  env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
}
let desktop;
let backendUrl;
const log = (message) => console.log(`[desktop] ${message}`);
async function closeDesktop(requireGraceful = false) {
  if (!desktop) return;
  const process = desktop.process();
  let timer;
  try {
    const closed = await Promise.race([
      desktop.close().then(() => true).catch(() => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), 15000); }),
    ]);
    if (!closed && process.exitCode === null) spawnSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { windowsHide: true });
    if (requireGraceful) assert.equal(closed, true, "Application must shut down without forced termination");
  } finally { clearTimeout(timer); desktop = undefined; }
}
try {
  desktop = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath), args: [] } : { args: [path.join(root, "apps/desktop")] }),
    env, timeout: 90000,
  });
  const page = await desktop.firstWindow();
  await page.waitForURL(/http:\/\/127\.0\.0\.1:/, { timeout: 90000 });
  await page.getByRole("link", { name: "스튜디오 설정" }).click();
  await page.getByRole("heading", { name: "프로그램 연결과 저장 폴더" }).waitFor();
  backendUrl = new URL(page.url()).origin;
  assert.equal((await fetch(`${backendUrl}/api/health`)).status, 403);
  log("Dedicated window ready; unauthenticated local access rejected.");
  const api = (route, method = "GET", body) => page.evaluate(async ({ route, method, body }) => {
    const result = await fetch(`/api${route}`, {
      method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await result.json();
    if (!result.ok) throw new Error(JSON.stringify(data));
    return data;
  }, { route, method, body });
  await desktop.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, outputDirectory);
  await page.getByRole("button", { name: "저장 폴더 선택", exact: true }).click();
  await page.getByLabel("Runway API 키 · AI 영상·내레이션").fill("desktop-smoke-fake-key");
  await page.getByRole("button", { name: "연결·저장 폴더 적용" }).click();
  await page.waitForURL((url) => url.origin !== backendUrl && url.protocol === "http:", { timeout: 90000 });
  backendUrl = new URL(page.url()).origin;
  await page.getByRole("link", { name: "스튜디오 설정" }).click();
  await page.getByRole("heading", { name: "프로그램 연결과 저장 폴더" }).waitFor();
  const settings = await page.evaluate(() => window.paperDesktop.settings());
  assert.equal(settings.runwayApiKeySet, true);
  assert.equal(settings.outputDirectory, outputDirectory);
  assert.ok(!JSON.stringify(settings).includes("desktop-smoke-fake-key"));
  assert.ok(!fs.readFileSync(path.join(profile, "desktop-settings.json"), "utf8").includes("desktop-smoke-fake-key"));
  await page.screenshot({ path: path.join(profile, "settings.png"), fullPage: true });
  log("Native folder selection and encrypted key save verified.");
  await page.getByRole("button", { name: "저장된 키 삭제", exact: true }).click();
  await page.getByRole("button", { name: "연결·저장 폴더 적용" }).click();
  await page.waitForURL((url) => url.origin !== backendUrl && url.protocol === "http:", { timeout: 90000 });
  backendUrl = new URL(page.url()).origin;
  assert.equal((await page.evaluate(() => window.paperDesktop.settings())).runwayApiKeySet, false);
  const project = await api("/demo", "POST");
  const waitJob = async (id) => {
    for (let attempt = 0; attempt < 600; attempt++) {
      const job = await api(`/jobs/${id}`);
      if (job.status === "completed") return job;
      if (["failed", "cancelled"].includes(job.status)) throw new Error(JSON.stringify(job));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Render timed out");
  };
  await waitJob((await api(`/projects/${project.id}/storyboard/generate`, "POST")).id);
  const board = await api(`/projects/${project.id}/storyboard`);
  board.data.style.narration = "none";
  board.data.style.musicMood = "lofi";
  board.data.style.variants = 1;
  await api(`/projects/${project.id}/storyboard`, "PUT", board);
  const render = await api(`/projects/${project.id}/renders`, "POST");
  const blocked = await page.evaluate(async () => {
    try { await window.paperDesktop.saveSettings({ aiModel: "unused-change" }); return false; }
    catch { return true; }
  });
  assert.equal(blocked, true);
  await desktop.evaluate(({ app, dialog }) => {
    globalThis.__paperCloseAsked = false;
    dialog.showMessageBox = async () => { globalThis.__paperCloseAsked = true; return { response: 0 }; };
    app.quit();
  });
  for (let attempt = 0; attempt < 25; attempt++) {
    if (await desktop.evaluate(() => globalThis.__paperCloseAsked)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(await desktop.evaluate(() => globalThis.__paperCloseAsked), true);
  assert.equal((await api("/health")).status, "ok");
  log("Active render prevents connection restarts. Rendering an actual MP4…");
  await waitJob(render.id);
  const result = await api(`/projects/${project.id}`);
  const output = result.outputs[0];
  assert.ok(output.downloads.video);
  const exported = path.join(outputDirectory, "검증 영상.mp4");
  await desktop.evaluate(({ BrowserWindow }, savePath) => {
    globalThis.__paperDownload = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Download timed out")), 30000);
      BrowserWindow.getAllWindows()[0].webContents.session.once("will-download", (_event, item) => {
        const defaults = item.getSaveDialogOptions();
        item.setSavePath(savePath);
        item.once("done", (_event, state) => { clearTimeout(timer); resolve({ state, defaults }); });
      });
    });
  }, exported);
  await page.evaluate((url) => {
    const link = document.createElement("a"); link.href = url; link.download = "검증 영상.mp4";
    document.body.append(link); link.click(); link.remove();
  }, output.downloads.video);
  const download = await desktop.evaluate(() => globalThis.__paperDownload);
  assert.equal(download.state, "completed");
  assert.equal(path.dirname(download.defaults.defaultPath), outputDirectory);
  assert.ok(fs.statSync(exported).size > 10000);
  const probe = spawnSync(path.join(root, "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"), ["-v", "error", "-show_streams", "-of", "json", exported], { encoding: "utf8" });
  assert.equal(probe.status, 0);
  const streams = JSON.parse(probe.stdout).streams;
  assert.ok(streams.some((stream) => stream.codec_name === "h264" && stream.width === 1080 && stream.height === 1920));
  assert.ok(streams.some((stream) => stream.codec_name === "aac"));
  log("1080×1920 H.264/AAC MP4 rendered and saved to the selected folder.");
  await closeDesktop(true);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await assert.rejects(fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(2000) }));
  desktop = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath), args: [] } : { args: [path.join(root, "apps/desktop")] }), env, timeout: 90000,
  });
  const reopened = await desktop.firstWindow();
  await reopened.waitForURL(/http:\/\/127\.0\.0\.1:/, { timeout: 90000 });
  const persisted = await reopened.evaluate(async () => (await fetch("/api/projects")).json());
  assert.ok(persisted.some((value) => value.id === project.id));
  assert.equal((await reopened.evaluate(() => window.paperDesktop.settings())).outputDirectory, outputDirectory);
  log("Clean shutdown and project/settings persistence after relaunch verified.");
  fs.writeFileSync(path.join(profile, "verification.json"), JSON.stringify({ executablePath: executablePath || "development", exported, projectId: project.id, passed: true }, null, 2));
  console.log(`Verification artifacts: ${profile}`);
} finally { await closeDesktop(); }
