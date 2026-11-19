# Test + web build run on the build machine's own arch (no QEMU); only the runtime stage targets
# TARGETARCH (linux/arm64 for k3s) and installs its own native deps (esbuild).
FROM --platform=$BUILDPLATFORM node:24-trixie-slim AS build
RUN npm i -g pnpm@10
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
# Suites that drive Chromium (web, worker, player e2e) run in dev, not here.
RUN pnpm typecheck && pnpm vitest run packages/core packages/server packages/cli
RUN pnpm --filter @flowmotion/web build

FROM node:24-trixie-slim
# Chromium + ffmpeg: stills, previews and video export (render worker).
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation \
    && rm -rf /var/lib/apt/lists/* && npm i -g pnpm@10
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium PORT=3000
WORKDIR /app
COPY . .
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /src/packages/web/dist packages/web/dist
USER node
EXPOSE 3000
CMD ["node", "packages/server/src/main.ts"]
