# syntax=docker/dockerfile:1
# BullMQ worker + Playwright. Built from the monorepo ROOT context:
#   docker build -f apps/worker/Dockerfile .
# Base image already bundles Chromium + all system deps at /ms-playwright,
# and its Playwright version must match the `playwright` npm dep (1.50.x).

FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS base
# Install pnpm directly (this base image's bundled corepack is too old to verify
# recent pnpm release signatures — "Cannot find matching keyid").
RUN npm i -g pnpm@11.17.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json         apps/web/package.json
COPY apps/worker/package.json      apps/worker/package.json
COPY packages/shared/package.json  packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
# Browsers already live in the base image; never re-download at runtime.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker
# Compose overrides nothing needed — start without the dev --env-file flag.
CMD ["node", "src/index.js"]
