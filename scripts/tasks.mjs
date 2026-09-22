import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const win = process.platform === "win32";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const apiPort = process.env.API_PORT || "8000";
const localPython = path.join(
  root,
  ".venv",
  win ? "Scripts/python.exe" : "bin/python",
);
const python = fs.existsSync(localPython)
  ? localPython
  : win
    ? "py"
    : "python3";
process.env.PATH =
  path.dirname(process.execPath) + path.delimiter + process.env.PATH;
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
};
const py = (...args) =>
  run(fs.existsSync(localPython) ? localPython : python, args);
const task = process.argv[2];
if (task === "setup") {
  if (!fs.existsSync(localPython)) run("uv", ["venv", "--python", "3.12"]);
  run("uv", ["sync", "--frozen"]);
  run(process.execPath, [
    process.env.npm_execpath ||
      path.resolve(
        path.dirname(process.execPath),
        win
          ? "node_modules/npm/bin/npm-cli.js"
          : "../lib/node_modules/npm/bin/npm-cli.js",
      ),
    "ci",
  ]);
  py("scripts/create_samples.py");
  py("-m", "alembic", "upgrade", "head");
  console.log("Setup complete. Run npm run dev.");
} else if (task === "migrate") py("-m", "alembic", "upgrade", "head");
else if (task === "lint")
  py("-m", "ruff", "check", "apps/api", "scripts", "tests/backend");
else if (task === "test") py("-m", "pytest", "-q");
else if (task === "demo") py("scripts/demo_render.py");
else if (task === "cleanup") py("scripts/cleanup.py", ...process.argv.slice(3));
else if (task === "dev") {
  py("-m", "alembic", "upgrade", "head");
  const processes = [
    spawn(
      python,
      [
        "-m",
        "uvicorn",
        "apps.api.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        apiPort,
      ],
      { stdio: "inherit" },
    ),
    spawn(python, ["-m", "apps.api.worker"], { stdio: "inherit" }),
    spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--config",
        "apps/web/vite.config.ts",
        "apps/web",
      ],
      { stdio: "inherit" },
    ),
  ];
  let exiting = false;
  const stop = () => {
    if (exiting) return;
    exiting = true;
    for (const child of processes) {
      if (win)
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
    }
    process.exit();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  for (const child of processes)
    child.on("exit", () => {
      if (!exiting) stop();
    });
} else throw new Error("Unknown task: " + task);
