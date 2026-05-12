FROM node:22-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g npm@11.13.0

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
WORKDIR /app

ENV NODE_ENV=production
ARG NODE_OPTIONS=--max-old-space-size=1024
ENV NODE_OPTIONS=$NODE_OPTIONS

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
