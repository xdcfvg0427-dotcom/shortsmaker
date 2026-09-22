import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureBrowser } from "@remotion/renderer";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Build on Windows x64.");
const stage = path.resolve(root, "dist/desktop-runtime");
// Only this generated directory is ever replaced; user data and .env are never copied.
if (stage !== path.join(root, "dist", "desktop-runtime") || !stage.startsWith(root + path.sep)) throw new Error("Unsafe output path");
console.log("Preparing runtime:", stage);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const run = (exe, args, cwd = root) => {
  const result = spawnSync(exe, args, {
    cwd, stdio: "inherit", windowsHide: true,
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, UV_CACHE_DIR: path.join(root, ".tools/uv-cache") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed (${result.status}): ${path.basename(exe)}`);
};
const copy = (relative) => fs.cpSync(path.join(root, relative), path.join(stage, relative), {
  recursive: true, filter: (source) => !source.split(path.sep).some((part) => ["__pycache__", ".pytest_cache"].includes(part)),
});
const npm = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
run(process.execPath, [npm, "run", "build"]);
for (const file of [
  "package.json", "package-lock.json", ".npmrc", "tsconfig.json", "alembic.ini",
  "apps/api", "apps/renderer", "apps/web/package.json", "apps/web/dist",
  "packages/shared-schema", "packages/concept-presets", "samples", "docs/DESKTOP.md", "docs/THIRD_PARTY_NOTICES.md", "docs/licenses",
]) copy(file);
run(process.execPath, [npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--cache", path.join(root, ".tools/npm-cache")], stage);
// npm creates absolute Windows junctions for workspaces. Materialize them so the
// installer never depends on the build machine's directories.
for (const [name, relative] of [["web", "apps/web"], ["renderer", "apps/renderer"], ["schema", "packages/shared-schema"]]) {
  const link = path.join(stage, "node_modules/@paper", name);
  if (!fs.lstatSync(link).isSymbolicLink() || fs.realpathSync(link) !== path.join(stage, relative)) throw new Error("Unexpected workspace link");
  fs.unlinkSync(link);
  fs.cpSync(path.join(stage, relative), link, { recursive: true, dereference: true });
}
// ffmpeg-static's install script downloads a binary. Reuse the already installed, pinned binary.
for (const file of ["ffmpeg.exe", "ffmpeg.LICENSE", "ffmpeg.README"]) {
  const source = path.join(root, "node_modules/ffmpeg-static", file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(stage, "node_modules/ffmpeg-static", file));
}
const nodeDir = path.join(stage, ".tools/node-v22.16.0-win-x64");
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(process.execPath, path.join(nodeDir, "node.exe"));
fs.copyFileSync(path.join(path.dirname(process.execPath), "LICENSE"), path.join(nodeDir, "LICENSE"));

const basePython = process.env.DESKTOP_PYTHON_HOME || path.join(root, ".tools/python/cpython-3.12.10-windows-x86_64-none");
if (!fs.existsSync(path.join(basePython, "python.exe"))) throw new Error("Set DESKTOP_PYTHON_HOME to a portable Python 3.12 x64 distribution.");
const pythonDir = path.join(stage, "python");
fs.cpSync(basePython, pythonDir, {
  recursive: true,
  filter: (source) => !path.relative(basePython, source).split(path.sep).some((part) => ["site-packages", "__pycache__", "test", "tests", "Scripts", "include", "libs"].includes(part)),
});
const requirements = path.join(root, "dist/desktop-requirements.txt");
run("uv", ["export", "--frozen", "--no-dev", "--format", "requirements-txt", "--output-file", requirements]);
run("uv", ["pip", "install", "--python", path.join(pythonDir, "python.exe"), "--target", path.join(pythonDir, "Lib/site-packages"), "--require-hashes", "-r", requirements]);
const browser = await ensureBrowser({ logLevel: "info" });
if (!("path" in browser)) throw new Error("The render browser could not be bundled.");
fs.cpSync(path.dirname(browser.path), path.join(stage, "browser/chrome-headless-shell-win64"), { recursive: true });
for (const file of [
  "python/python.exe", ".tools/node-v22.16.0-win-x64/node.exe",
  "node_modules/ffmpeg-static/ffmpeg.exe", "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
  "browser/chrome-headless-shell-win64/chrome-headless-shell.exe", "apps/web/dist/index.html",
]) if (!fs.existsSync(path.join(stage, file))) throw new Error(`Missing runtime: ${file}`);
if (fs.existsSync(path.join(stage, ".env")) || fs.existsSync(path.join(stage, "storage"))) throw new Error("Private data in runtime");
console.log("Desktop runtime ready. No API keys or project data were bundled.");
