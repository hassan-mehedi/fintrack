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

# Runs pending Drizzle migrations against DATABASE_URL before the server starts.
# Only this image migrates so the web and API deploys never race.
CMD ["sh", "-c", "npm run db:migrate -w packages/db && npm run start -w apps/api"]
