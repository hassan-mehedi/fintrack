# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN npm install --no-audit --no-fund

FROM base AS builder
WORKDIR /repo

ENV NODE_ENV=production
ARG NODE_OPTIONS=--max-old-space-size=1024
ENV NODE_OPTIONS=$NODE_OPTIONS

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

RUN npm run build -w apps/web

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
