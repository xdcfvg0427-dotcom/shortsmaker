"""Private desktop backend. Stdin EOF shuts down the server and its worker tree."""
import json
import os
import socket
import subprocess
import sys
import threading

import uvicorn
from alembic import command
from alembic.config import Config

from .config import ROOT, settings


def main():
    if not settings.desktop_token:
        raise RuntimeError("Desktop authentication is required")
    os.chdir(ROOT)
    migration = Config(str(ROOT / "alembic.ini"))
    migration.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
    command.upgrade(migration, "head")
    # Bind before announcing the port; never attach to an unrelated local server.
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    settings.cors_origins = f"http://127.0.0.1:{port}"
    server = uvicorn.Server(uvicorn.Config(
        "apps.api.main:app", log_level="warning", access_log=False, timeout_graceful_shutdown=5
    ))
    worker = subprocess.Popen(
        [sys.executable, "-m", "apps.api.worker"],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=sys.stderr,
        stderr=sys.stderr,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )

    def parent_watch():
        sys.stdin.buffer.read()
        server.should_exit = True

    def worker_watch():
        worker.wait()
        server.should_exit = True

    threading.Thread(target=parent_watch, daemon=True).start()
    threading.Thread(target=worker_watch, daemon=True).start()
    print(json.dumps({"port": port}), flush=True)
    try:
        server.run(sockets=[sock])
    finally:
        sock.close()
        if worker.poll() is None:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(worker.pid), "/T", "/F"],
                    capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW,
                )
            else:
                worker.terminate()
            worker.wait(timeout=15)


if __name__ == "__main__":
    main()
