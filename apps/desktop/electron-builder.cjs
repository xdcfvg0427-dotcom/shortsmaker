const fs = require("node:fs");
const path = require("node:path");
// Avoid the packager's default ultra compression for the bundled video tools.
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= "3";

module.exports = {
  appId: "com.paperstudio.shorts",
  productName: "Paper Studio",
  directories: { app: "apps/desktop", output: "release", buildResources: "apps/desktop" },
  files: ["main.cjs", "preload.cjs", "settings.cjs", "loading.html", "icon.ico", "package.json", "!node_modules/**/*"],
  extraResources: [
    { from: "dist/desktop-runtime", to: "studio", filter: ["**/*", "!**/__pycache__/**", "!**/*.pyc"] },
    // electron-builder excludes a root node_modules directory from generic file copies.
    { from: "dist/desktop-runtime/node_modules", to: "studio/node_modules", filter: [
      "**/*", "!ffprobe-static/bin/darwin/**/*", "!ffprobe-static/bin/linux/**/*", "!ffprobe-static/bin/win32/ia32/**/*",
    ] },
  ],
  afterPack: async (context) => {
    const studio = path.join(context.appOutDir, "resources/studio");
    for (const file of [
      "python/python.exe", ".tools/node-v22.16.0-win-x64/node.exe",
      "node_modules/ffmpeg-static/ffmpeg.exe", "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
      "node_modules/@remotion/bundler/package.json", "node_modules/@remotion/renderer/package.json",
      "browser/chrome-headless-shell-win64/chrome-headless-shell.exe", "apps/web/dist/index.html",
    ]) if (!fs.existsSync(path.join(studio, file))) throw new Error(`Missing packaged runtime: ${file}`);
    if (fs.existsSync(path.join(studio, ".env")) || fs.existsSync(path.join(studio, "storage"))) throw new Error("Private data in package");
    for (const name of ["web", "renderer", "schema"]) {
      if (fs.lstatSync(path.join(studio, "node_modules/@paper", name)).isSymbolicLink()) throw new Error("Workspace junction in package");
    }
  },
  asar: true,
  npmRebuild: false,
  win: { target: [{ target: "nsis", arch: ["x64"] }], icon: "apps/desktop/icon.ico", signExecutable: false },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true,
    shortcutName: "종이상점 쇼츠 스튜디오", installerLanguages: ["ko_KR", "en_US"],
    language: "1042", deleteAppDataOnUninstall: false, runAfterFinish: false,
    differentialPackage: false,
    artifactName: "Paper-Studio-Setup-${version}.${ext}",
  },
};
