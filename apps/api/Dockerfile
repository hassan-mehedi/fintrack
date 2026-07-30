# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine

WORKDIR /repo

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN npm install --no-audit --no-fund -w apps/api --include-workspace-root=false

COPY packages ./packages
COPY apps/api ./apps/api

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start", "-w", "apps/api"]
