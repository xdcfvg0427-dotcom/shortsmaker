FROM node:22.16.0-bookworm-slim AS node
FROM python:3.12.10-slim-bookworm AS runtime
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium fonts-noto-cjk fonts-noto-color-emoji tini \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv==0.12.9
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev \
    && npm ci \
    && .venv/bin/python scripts/create_samples.py \
    && npm run build \
    && useradd --uid 10001 --create-home studio \
    && mkdir -p storage && chown -R studio:studio /app
ENV PATH="/app/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
    BROWSER_EXECUTABLE=/usr/bin/chromium \
    FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe \
    PYTHONUNBUFFERED=1 PYTHONUTF8=1
USER studio
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM nginx:1.28.0-alpine AS web
COPY --from=runtime /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
